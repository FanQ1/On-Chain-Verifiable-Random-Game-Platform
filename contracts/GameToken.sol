// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IGameToken.sol";

/**
 * @title GameToken
 * @dev ERC20 token for the gaming platform
 */
contract GameToken is ERC20, Ownable, IGameToken {
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18; // 100 million tokens
    uint256 public constant MINT_FEE = 0.01 ether; // Fee to mint tokens

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    /**
     * @dev Constructor to initialize the token
     * @param name The name of the token
     * @param symbol The symbol of the token
     */
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Mint initial supply to contract creator
        _mint(msg.sender, 1_000_000 * 10**18); // 1 million tokens
    }

    /**
     * @notice Mint tokens to an address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external override onlyOwner {
        require(to != address(0), "GameToken: Cannot mint to zero address");
        require(amount > 0, "GameToken: Amount must be greater than zero");
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "GameToken: Cannot exceed max supply"
        );

        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Mint tokens with ETH payment
     * @param amount The amount of tokens to mint
     */
    function mintWithEth(uint256 amount) external payable {
        require(msg.value >= MINT_FEE, "GameToken: Insufficient fee");
        require(amount > 0, "GameToken: Amount must be greater than zero");
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "GameToken: Cannot exceed max supply"
        );

        _mint(msg.sender, amount);
        emit TokensMinted(msg.sender, amount);

        // Refund excess ETH
        if (msg.value > MINT_FEE) {
            payable(msg.sender).transfer(msg.value - MINT_FEE);
        }
    }

    /**
     * @notice Burn tokens from an address
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external override onlyOwner {
        require(from != address(0), "GameToken: Cannot burn from zero address");
        require(amount > 0, "GameToken: Amount must be greater than zero");
        require(balanceOf(from) >= amount, "GameToken: Insufficient balance");

        _burn(from, amount);
        emit TokensBurned(from, amount);
    }

    /**
     * @notice Withdraw ETH from the contract
     */
    function withdrawEth() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "GameToken: No ETH to withdraw");
        payable(owner()).transfer(balance);
    }

    /**
     * @notice Update the mint fee
     * @param newFee The new mint fee
     */
    function updateMintFee(uint256 newFee) external onlyOwner {
        MINT_FEE = newFee;
    }
}
