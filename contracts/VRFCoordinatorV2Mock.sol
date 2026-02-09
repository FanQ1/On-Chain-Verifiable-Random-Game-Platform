// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IVRFCoordinatorV2.sol";

/**
 * @title VRFCoordinatorV2Mock
 * @dev Mock implementation of Chainlink VRF Coordinator v2 for testing
 */
contract VRFCoordinatorV2Mock is IVRFCoordinatorV2 {
    uint256 private constant MOCK_FEE = 0.0001 ether;
    uint256 private requestIdCounter = 1;

    // Mapping to track requests
    mapping(uint256 => address) private requestToSender;
    mapping(uint256 => uint256) private requestToTimestamp;

    event RandomWordsRequested(uint256 indexed requestId, address indexed requester);
    event RandomWordsFulfilled(uint256 indexed requestId, uint256[] randomWords);

    /**
     * @notice Request randomness from Chainlink VRF
     * @param keyHash The key hash for the VRF
     * @param subId The subscription ID
     * @param minimumRequestConfirmations The minimum number of block confirmations
     * @param callbackGasLimit The gas limit for the callback
     * @param numWords The number of random values to request
     * @return requestId The request ID
     */
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external override returns (uint256 requestId) {
        requestId = requestIdCounter++;
        requestToSender[requestId] = msg.sender;
        requestToTimestamp[requestId] = block.timestamp;

        emit RandomWordsRequested(requestId, msg.sender);

        // Don't fulfill immediately - let it be done manually
        return requestId;
    }

    /**
     * @notice Manually fulfill a random words request
     * @param requestId The request ID to fulfill
     */
    function fulfillRandomWords(uint256 requestId) external {
        _fulfillRandomWords(requestId, 1);
    }

    /**
     * @notice Get the request fee
     * @return fee The request fee
     */
    function getFee(
        bytes32,
        uint64,
        uint32,
        uint32
    ) external pure override returns (uint256 fee) {
        return MOCK_FEE;
    }

    /**
     * @dev Internal function to fulfill random words request
     * @param requestId The request ID
     * @param numWords The number of random words to generate
     */
    function _fulfillRandomWords(uint256 requestId, uint32 numWords) internal {
        address requester = requestToSender[requestId];
        require(requester != address(0), "Invalid request ID");

        // Generate pseudo-random words
        uint256[] memory randomWords = new uint256[](numWords);
        for (uint32 i = 0; i < numWords; i++) {
            randomWords[i] = uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                requestId,
                i
            )));
        }

        // Call back to the requester
        (bool success, ) = requester.call(abi.encodeWithSignature(
            "rawFulfillRandomWords(uint256,uint256[])",
            requestId,
            randomWords
        ));

        require(success, "Callback failed");

        emit RandomWordsFulfilled(requestId, randomWords);
    }

    /**
     * @notice Get the timestamp of a request
     * @param requestId The request ID
     * @return timestamp The timestamp of the request
     */
    function getRequestTimestamp(uint256 requestId) external view returns (uint256 timestamp) {
        return requestToTimestamp[requestId];
    }

    /**
     * @notice Get the current request ID counter
     * @return counter The current counter value
     */
    function getRequestIdCounter() external view returns (uint256 counter) {
        return requestIdCounter;
    }
}
