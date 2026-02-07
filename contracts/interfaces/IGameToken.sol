// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGameToken {
    /**
     * @notice Mint tokens to an address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external;

    /**
     * @notice Burn tokens from an address
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external;

    /**
     * @notice Transfer tokens from one address to another
     * @param from The address to transfer tokens from
     * @param to The address to transfer tokens to
     * @param amount The amount of tokens to transfer
     * @return success Whether the transfer was successful
     */
    // function transferFrom(
    //     address from,
    //     address to,
    //     uint256 amount
    // ) external returns (bool success);

    /**
     * @notice Get the balance of an address
     * @param account The address to get the balance of
     * @return balance The balance of the address
     */
    // function balanceOf(address account) external view returns (uint256 balance);

    /**
     * @notice Approve an address to spend tokens
     * @param spender The address to approve
     * @param amount The amount of tokens to approve
     * @return success Whether the approval was successful
     */
    // function approve(address spender, uint256 amount) external returns (bool success);

    /**
     * @notice Get the allowance of an address
     * @param owner The owner of the tokens
     * @param spender The address to check the allowance of
     * @return allowance The allowance of the address
     */
    // function allowance(address owner, address spender) external view returns (uint256 allowance);

    /**
     * @notice Transfer tokens to an address
     * @param to The address to transfer tokens to
     * @param amount The amount of tokens to transfer
     * @return success Whether the transfer was successful
     */
    // function transfer(address to, uint256 amount) external returns (bool success);
}
