// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IVRFCoordinatorV2.sol";
import "./interfaces/IGameToken.sol";

/**
 * @title Lottery
 * @dev A lottery game using Chainlink VRF for random number generation
 */
contract Lottery is Ownable, ReentrancyGuard {
    IVRFCoordinatorV2 public immutable vrfCoordinator;
    IGameToken public immutable gameToken;

    bytes32 internal immutable keyHash;
    uint64 internal immutable subscriptionId;
    uint32 internal constant callbackGasLimit = 100000;
    uint32 internal constant numWords = 1;

    // Lottery state
    uint256 public currentLotteryId;
    uint256 public ticketPrice = 0.01 ether;
    uint256 public constant HOUSE_EDGE = 5; // 5%
    uint256 public constant MIN_PLAYERS = 3;
    uint256 public constant MAX_PLAYERS = 100;
    uint256 public constant DRAW_INTERVAL = 1 days;

    struct LotteryInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint256 totalTickets;
        bool isActive;
        bool isDrawn;
        uint256 winningNumber;
        address winner;
        uint256[] tickets; // Array of player addresses
    }

    mapping(uint256 => LotteryInfo) public lotteries;
    mapping(uint256 => uint256) public requestIdToLotteryId;
    mapping(address => uint256[]) public playerLotteries; // Track lotteries a player has participated in

    event LotteryCreated(uint256 indexed lotteryId, uint256 startTime, uint256 endTime);
    event TicketPurchased(uint256 indexed lotteryId, address indexed player, uint256 ticketCount);
    event LotteryDrawRequested(uint256 indexed lotteryId, uint256 indexed requestId);
    event LotteryDrawn(uint256 indexed lotteryId, address indexed winner, uint256 winningNumber, uint256 prize);
    event PrizeClaimed(uint256 indexed lotteryId, address indexed winner, uint256 amount);
    event TicketPriceUpdated(uint256 newPrice);

    /**
     * @dev Constructor to initialize the lottery contract
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

        // Create first lottery
        _createNewLottery();
    }

    /**
     * @notice Create a new lottery
     */
    function _createNewLottery() internal {
        currentLotteryId++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + DRAW_INTERVAL;

        lotteries[currentLotteryId] = LotteryInfo({
            startTime: startTime,
            endTime: endTime,
            prizePool: 0,
            totalTickets: 0,
            isActive: true,
            isDrawn: false,
            winningNumber: 0,
            winner: address(0),
            tickets: new uint256[](0)
        });

        emit LotteryCreated(currentLotteryId, startTime, endTime);
    }

    /**
     * @notice Purchase tickets for the current lottery
     * @param ticketCount The number of tickets to purchase
     */
    function purchaseTickets(uint256 ticketCount) external nonReentrant {
        require(ticketCount > 0, "Lottery: Must purchase at least one ticket");
        LotteryInfo storage lottery = lotteries[currentLotteryId];
        require(lottery.isActive, "Lottery: Current lottery is not active");
        require(
            lottery.totalTickets + ticketCount <= MAX_PLAYERS,
            "Lottery: Maximum players reached"
        );

        uint256 totalCost = ticketPrice * ticketCount;

        // Transfer tokens from player to contract
        require(
            gameToken.transferFrom(msg.sender, address(this), totalCost),
            "Lottery: Token transfer failed"
        );

        // Add tickets to lottery
        for (uint256 i = 0; i < ticketCount; i++) {
            lottery.tickets.push(uint256(uint160(msg.sender)));
        }

        lottery.totalTickets += ticketCount;
        lottery.prizePool += totalCost;

        // Track player participation
        playerLotteries[msg.sender].push(currentLotteryId);

        emit TicketPurchased(currentLotteryId, msg.sender, ticketCount);

        // Check if lottery should be drawn
        if (lottery.totalTickets >= MIN_PLAYERS || block.timestamp >= lottery.endTime) {
            _requestRandomness(currentLotteryId);
        }
    }

    /**
     * @notice Request randomness for lottery draw
     * @param lotteryId The lottery ID
     */
    function _requestRandomness(uint256 lotteryId) internal {
        LotteryInfo storage lottery = lotteries[lotteryId];
        require(lottery.isActive && !lottery.isDrawn, "Lottery: Invalid lottery state");

        lottery.isActive = false;

        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            3,
            callbackGasLimit,
            numWords
        );

        requestIdToLotteryId[requestId] = lotteryId;

        emit LotteryDrawRequested(lotteryId, requestId);

        // Create new lottery
        _createNewLottery();
    }

    /**
     * @notice Callback function for VRF
     * @param requestId The request ID
     * @param randomWords The random words
     */
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == address(vrfCoordinator), "Lottery: Only VRF coordinator can call");

        uint256 lotteryId = requestIdToLotteryId[requestId];
        require(lotteryId != 0, "Lottery: Invalid request ID");

        LotteryInfo storage lottery = lotteries[lotteryId];
        require(!lottery.isDrawn, "Lottery: Already drawn");

        lottery.isDrawn = true;
        lottery.winningNumber = randomWords[0];

        // Calculate winner
        uint256 winningIndex = lottery.winningNumber % lottery.totalTickets;
        address winner = address(uint160(lottery.tickets[winningIndex]));
        lottery.winner = winner;

        // Calculate prize (with house edge)
        uint256 houseEdge = (lottery.prizePool * HOUSE_EDGE) / 100;
        uint256 prize = lottery.prizePool - houseEdge;

        // Transfer prize to winner
        require(
            gameToken.transfer(winner, prize),
            "Lottery: Prize transfer failed"
        );

        emit LotteryDrawn(lotteryId, winner, lottery.winningNumber, prize);
        emit PrizeClaimed(lotteryId, winner, prize);
    }

    /**
     * @notice Get lottery information
     * @param lotteryId The lottery ID
     * @return The lottery information
     */
    function getLotteryInfo(uint256 lotteryId) external view returns (LotteryInfo memory) {
        return lotteries[lotteryId];
    }

    /**
     * @notice Get player lotteries
     * @param player The player address
     * @return The list of lottery IDs the player has participated in
     */
    function getPlayerLotteries(address player) external view returns (uint256[] memory) {
        return playerLotteries[player];
    }

    /**
     * @notice Update ticket price
     * @param newPrice The new ticket price
     */
    function updateTicketPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Lottery: Price must be greater than zero");
        ticketPrice = newPrice;
        emit TicketPriceUpdated(newPrice);
    }

    /**
     * @notice Withdraw house edge
     */
    function withdrawHouseEdge() external onlyOwner {
        uint256 balance = gameToken.balanceOf(address(this));
        require(balance > 0, "Lottery: No tokens to withdraw");
        require(gameToken.transfer(owner(), balance), "Lottery: Withdrawal failed");
    }

    /**
     * @notice Handle no winner scenario
     * @param lotteryId The lottery ID
     */
    function handleNoWinner(uint256 lotteryId) external onlyOwner {
        LotteryInfo storage lottery = lotteries[lotteryId];
        require(lottery.isDrawn, "Lottery: Lottery not drawn yet");
        require(lottery.winner == address(0), "Lottery: Winner exists");

        // Refund all players
        for (uint256 i = 0; i < lottery.totalTickets; i++) {
            address player = address(uint160(lottery.tickets[i]));
            require(
                gameToken.transfer(player, ticketPrice),
                "Lottery: Refund failed"
            );
        }

        lottery.prizePool = 0;
    }
}
