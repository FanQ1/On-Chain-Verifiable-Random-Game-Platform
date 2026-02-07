// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVRFCoordinatorV2 {
    /**
     * @notice Request randomness from Chainlink VRF
     * @param keyHash The key hash for the VRF
     * @param subId The subscription ID
     * @param minimumRequestConfirmations The minimum number of block confirmations
     * @param callbackGasLimit The gas limit for the callback
     * @param numWords The number of random values to request
     * @param requestId The request ID
     */
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);

    /**
     * @notice Get the request fee
     * @param keyHash The key hash for the VRF
     * @param subId The subscription ID
     * @param callbackGasLimit The gas limit for the callback
     * @param numWords The number of random values to request
     * @return fee The request fee
     */
    function getFee(
        bytes32 keyHash,
        uint64 subId,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external view returns (uint256 fee);
}
