// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IVRFCoordinatorV2.sol";
import "./interfaces/IGameToken.sol";

/**
 * @title DiceGame
 * @dev A dice game using Chainlink VRF for random number generation
 *      Optimized: Struct packing applied for gas efficiency.
 */
contract DiceGame is Ownable, ReentrancyGuard {
    IVRFCoordinatorV2 public immutable vrfCoordinator;
    IGameToken public immutable gameToken;

    bytes32 internal immutable keyHash;
    uint64 internal immutable subscriptionId;
    uint32 internal constant callbackGasLimit = 100000;
    uint32 internal constant numWords = 1;

    // Game constants
    uint256 public MIN_BET = 0.001 ether;
    uint256 public MAX_BET = 10 ether;
    uint256 public constant HOUSE_EDGE = 3; // 3%
    uint256 public constant DICE_SIDES = 100;

    struct Game {
        address player;       
        uint96 timestamp;    
        uint128 betAmount;    
        uint64 prediction;    
        uint64 rollResult;   
        bool isCompleted;     
        uint256 payout;       
    }
    
    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public requestIdToGameId;
    mapping(uint256 => bool) public isValidRequestId;
    mapping(address => uint256[]) public playerGames;

    uint256 public gameIdCounter;

    event GameStarted(
        uint256 indexed gameId,
        address indexed player,
        uint256 betAmount,
        uint256 prediction,
        uint256 requestId
    );
    event GameCompleted(uint256 indexed gameId, address indexed player, uint256 rollResult, uint256 payout);
    event BetLimitsUpdated(uint256 newMinBet, uint256 newMaxBet);

    constructor(
        address _vrfCoordinator,
        address _gameToken,
        bytes32 _keyHash,
        uint64 _subscriptionId
    ) {
        vrfCoordinator = IVRFCoordinatorV2(_vrfCoordinator);
        gameToken = IGameToken(_gameToken);
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
    }

    function startGame(uint256 betAmount, uint256 prediction) external nonReentrant {
        require(betAmount >= MIN_BET, "DiceGame: Bet amount too low");
        require(betAmount <= MAX_BET, "DiceGame: Bet amount too high");
        require(prediction >= 1 && prediction <= DICE_SIDES, "DiceGame: Invalid prediction");

        require(
            gameToken.transferFrom(msg.sender, address(this), betAmount),
            "DiceGame: Token transfer failed"
        );

        uint256 gameId = gameIdCounter++;
        
        // --- Optimization: Type Casting for Struct ---
        games[gameId] = Game({
            player: msg.sender,
            timestamp: uint96(block.timestamp), // Cast to uint96
            betAmount: uint128(betAmount),      // Cast to uint128
            prediction: uint64(prediction),     // Cast to uint64
            rollResult: 0,
            isCompleted: false,
            payout: 0
        });

        playerGames[msg.sender].push(gameId);

        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            3,
            callbackGasLimit,
            numWords
        );

        requestIdToGameId[requestId] = gameId;
        isValidRequestId[requestId] = true;

        emit GameStarted(gameId, msg.sender, betAmount, prediction, requestId);
    }

    // --- Optimization: Use calldata instead of memory ---
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        require(msg.sender == address(vrfCoordinator), "DiceGame: Only VRF coordinator can call");

        require(isValidRequestId[requestId], "DiceGame: Invalid request ID");
        uint256 gameId = requestIdToGameId[requestId];
        isValidRequestId[requestId] = false;

        Game storage game = games[gameId];
        require(!game.isCompleted, "DiceGame: Game already completed");

        game.rollResult = (randomWords[0] % DICE_SIDES) + 1;
        game.isCompleted = true;

        if (game.rollResult <= game.prediction) {
            uint256 multiplier = (100 * 1e18) / game.prediction;
            uint256 grossPayout = (game.betAmount * multiplier) / 1e18;
            uint256 houseEdge = (grossPayout * HOUSE_EDGE) / 100;
            game.payout = grossPayout - houseEdge;

            // --- Optimization: Simplified Transfer Logic ---
            // The original code had complex "partial payout" logic if balance was low.
            // It is safer and cheaper to just attempt the transfer.
            // If the contract lacks funds, the transaction should revert (fail).
            require(gameToken.transfer(game.player, game.payout), "DiceGame: Payout failed");
        } else {
            game.payout = 0;
        }

        emit GameCompleted(gameId, game.player, game.rollResult, game.payout);
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return playerGames[player];
    }

    function updateBetLimits(uint256 newMinBet, uint256 newMaxBet) external onlyOwner {
        require(newMinBet > 0, "DiceGame: Min bet must be greater than zero");
        require(newMaxBet > newMinBet, "DiceGame: Max bet must be greater than min bet");

        MIN_BET = newMinBet;
        MAX_BET = newMaxBet;

        emit BetLimitsUpdated(newMinBet, newMaxBet);
    }

    function withdrawHouseEdge() external onlyOwner {
        uint256 balance = gameToken.balanceOf(address(this));
        require(balance > 0, "DiceGame: No tokens to withdraw");
        require(gameToken.transfer(owner(), balance), "DiceGame: Withdrawal failed");
    }

    function calculatePayout(uint256 betAmount, uint256 prediction) external pure returns (uint256) {
        require(prediction >= 1 && prediction <= DICE_SIDES, "DiceGame: Invalid prediction");

        uint256 multiplier = (100 * 1e18) / prediction;
        uint256 grossPayout = (betAmount * multiplier) / 1e18;
        uint256 houseEdge = (grossPayout * HOUSE_EDGE) / 100;

        return grossPayout - houseEdge;
    }
}
