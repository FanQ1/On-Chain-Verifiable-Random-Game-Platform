const hre = require("hardhat");
const fs = require("fs");

/**
 * Load deployment information from file
 * @returns {Object} Deployment information
 */
function loadDeploymentInfo() {
  try {
    return JSON.parse(fs.readFileSync("./deployment-info.json", "utf8"));
  } catch (error) {
    console.error("Error loading deployment info:", error);
    throw new Error("Please deploy contracts first using: npx hardhat run scripts/deploy.js");
  }
}

/**
 * Get contract instance by name
 * @param {string} contractName - Name of the contract
 * @param {string} contractAddress - Address of the contract
 * @returns {Promise<Contract>} Contract instance
 */
async function getContract(contractName, contractAddress) {
  return await hre.ethers.getContractAt(contractName, contractAddress);
}

/**
 * Format ether value to string
 * @param {BigNumber} value - Ether value
 * @param {number} decimals - Number of decimals (default: 18)
 * @returns {string} Formatted value
 */
function formatEther(value, decimals = 18) {
  return hre.ethers.formatUnits(value, decimals);
}

/**
 * Parse ether string to BigNumber
 * @param {string} value - Ether string
 * @returns {BigNumber} Parsed value
 */
function parseEther(value) {
  return hre.ethers.parseEther(value);
}

/**
 * Wait for transaction to be mined
 * @param {TransactionResponse} tx - Transaction to wait for
 * @param {number} confirmations - Number of confirmations to wait for
 * @returns {Promise<TransactionReceipt>} Transaction receipt
 */
async function waitForTransaction(tx, confirmations = 1) {
  return await tx.wait(confirmations);
}

/**
 * Get current timestamp
 * @returns {Promise<number>} Current timestamp
 */
async function getCurrentTimestamp() {
  const block = await hre.ethers.provider.getBlock("latest");
  return block.timestamp;
}

/**
 * Get account balance
 * @param {string} address - Address to check
 * @returns {Promise<BigNumber>} Account balance
 */
async function getBalance(address) {
  return await hre.ethers.provider.getBalance(address);
}

/**
 * Estimate gas for transaction
 * @param {Transaction} tx - Transaction to estimate
 * @returns {Promise<BigNumber>} Estimated gas
 */
async function estimateGas(tx) {
  return await hre.ethers.provider.estimateGas(tx);
}

/**
 * Get network information
 * @returns {Promise<Object>} Network information
 */
async function getNetworkInfo() {
  const network = await hre.ethers.provider.getNetwork();
  return {
    name: network.name,
    chainId: network.chainId.toString()
  };
}

module.exports = {
  loadDeploymentInfo,
  getContract,
  formatEther,
  parseEther,
  waitForTransaction,
  getCurrentTimestamp,
  getBalance,
  estimateGas,
  getNetworkInfo
};
