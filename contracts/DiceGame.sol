// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IVRFCoordinatorV2.sol";
import "./interfaces/IGameToken.sol";

/**
 * @title DiceGame
 * @dev A dice game using Chainlink VRF for random number generation
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
        uint256 betAmount;
        uint256 prediction;
        uint256 rollResult;
        bool isCompleted;
        uint256 timestamp;
        uint256 payout;
    }

    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public requestIdToGameId;
    mapping(address => uint256[]) public playerGames;

    uint256 public gameIdCounter;

    event GameStarted(uint256 indexed gameId, address indexed player, uint256 betAmount, uint256 prediction);
    event GameCompleted(uint256 indexed gameId, address indexed player, uint256 rollResult, uint256 payout);
    event BetLimitsUpdated(uint256 newMinBet, uint256 newMaxBet);

    /**
     * @dev Constructor to initialize the dice game contract
     * @param _vrfCoordinator The address of the VRF coordinator
     * @param _gameToken The address of the game token
     * @param _keyHash The key hash for VRF
     * @param _subscriptionId The subscription ID for VRF
     */
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

    /**
     * @notice Start a new dice game
     * @param betAmount The amount to bet
     * @param prediction The predicted dice roll (1-100)
     */
    function startGame(uint256 betAmount, uint256 prediction) external nonReentrant {
        require(betAmount >= MIN_BET, "DiceGame: Bet amount too low");
        require(betAmount <= MAX_BET, "DiceGame: Bet amount too high");
        require(prediction >= 1 && prediction <= DICE_SIDES, "DiceGame: Invalid prediction");

        // Transfer bet from player to contract
        require(
            gameToken.transferFrom(msg.sender, address(this), betAmount),
            "DiceGame: Token transfer failed"
        );

        // Create game
        uint256 gameId = gameIdCounter++;
        games[gameId] = Game({
            player: msg.sender,
            betAmount: betAmount,
            prediction: prediction,
            rollResult: 0,
            isCompleted: false,
            timestamp: block.timestamp,
            payout: 0
        });

        // Track player games
        playerGames[msg.sender].push(gameId);

        // Request randomness
        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            3,
            callbackGasLimit,
            numWords
        );

        requestIdToGameId[requestId] = gameId;

        emit GameStarted(gameId, msg.sender, betAmount, prediction);
    }

    /**
     * @notice Callback function for VRF
     * @param requestId The request ID
     * @param randomWords The random words
     */
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == address(vrfCoordinator), "DiceGame: Only VRF coordinator can call");

        uint256 gameId = requestIdToGameId[requestId];
        require(gameId != 0, "DiceGame: Invalid request ID");

        Game storage game = games[gameId];
        require(!game.isCompleted, "DiceGame: Game already completed");

        // Calculate dice roll (1-100)
        game.rollResult = (randomWords[0] % DICE_SIDES) + 1;
        game.isCompleted = true;

        // Determine outcome
        if (game.rollResult <= game.prediction) {
            // Calculate multiplier (100 / prediction)
            uint256 multiplier = (100 * 1e18) / game.prediction;

            // Calculate payout (bet * multiplier - house edge)
            uint256 grossPayout = (game.betAmount * multiplier) / 1e18;
            uint256 houseEdge = (grossPayout * HOUSE_EDGE) / 100;
            game.payout = grossPayout - houseEdge;

            // Transfer payout to player
            require(
                gameToken.transfer(game.player, game.payout),
                "DiceGame: Payout transfer failed"
            );
        } else {
            game.payout = 0;
        }

        emit GameCompleted(gameId, game.player, game.rollResult, game.payout);
    }

    /**
     * @notice Get game information
     * @param gameId The game ID
     * @return The game information
     */
    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    /**
     * @notice Get player games
     * @param player The player address
     * @return The list of game IDs the player has played
     */
    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return playerGames[player];
    }

    /**
     * @notice Update bet limits
     * @param newMinBet The new minimum bet
     * @param newMaxBet The new maximum bet
     */
    function updateBetLimits(uint256 newMinBet, uint256 newMaxBet) external onlyOwner {
        require(newMinBet > 0, "DiceGame: Min bet must be greater than zero");
        require(newMaxBet > newMinBet, "DiceGame: Max bet must be greater than min bet");

        MIN_BET = newMinBet;
        MAX_BET = newMaxBet;

        emit BetLimitsUpdated(newMinBet, newMaxBet);
    }

    /**
     * @notice Withdraw house edge
     */
    function withdrawHouseEdge() external onlyOwner {
        uint256 balance = gameToken.balanceOf(address(this));
        require(balance > 0, "DiceGame: No tokens to withdraw");
        require(gameToken.transfer(owner(), balance), "DiceGame: Withdrawal failed");
    }

    /**
     * @notice Calculate potential payout
     * @param betAmount The bet amount
     * @param prediction The prediction
     * @return The potential payout
     */
    function calculatePayout(uint256 betAmount, uint256 prediction) external pure returns (uint256) {
        require(prediction >= 1 && prediction <= DICE_SIDES, "DiceGame: Invalid prediction");

        uint256 multiplier = (100 * 1e18) / prediction;
        uint256 grossPayout = (betAmount * multiplier) / 1e18;
        uint256 houseEdge = (grossPayout * HOUSE_EDGE) / 100;

        return grossPayout - houseEdge;
    }
}
