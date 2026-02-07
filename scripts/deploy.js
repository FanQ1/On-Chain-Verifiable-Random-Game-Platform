const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy GameToken
  console.log("\nDeploying GameToken...");
  const GameToken = await hre.ethers.getContractFactory("GameToken");
  const gameToken = await GameToken.deploy("GameToken", "GT");
  await gameToken.waitForDeployment();
  const gameTokenAddress = await gameToken.getAddress();
  console.log("GameToken deployed to:", gameTokenAddress);

  // Deploy VRFCoordinatorV2Mock (for local testing)
  console.log("\nDeploying VRFCoordinatorV2Mock...");
  const VRFCoordinatorV2Mock = await hre.ethers.getContractFactory("VRFCoordinatorV2Mock");
  const vrfCoordinator = await VRFCoordinatorV2Mock.deploy();
  await vrfCoordinator.waitForDeployment();
  const vrfCoordinatorAddress = await vrfCoordinator.getAddress();
  console.log("VRFCoordinatorV2Mock deployed to:", vrfCoordinatorAddress);

  // Get VRF parameters
  const keyHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-key"));
  const subscriptionId = 1;

  // Deploy Lottery
  console.log("\nDeploying Lottery...");
  const Lottery = await hre.ethers.getContractFactory("Lottery");
  const lottery = await Lottery.deploy(
    vrfCoordinatorAddress,
    gameTokenAddress,
    keyHash,
    subscriptionId
  );
  await lottery.waitForDeployment();
  const lotteryAddress = await lottery.getAddress();
  console.log("Lottery deployed to:", lotteryAddress);

  // Deploy DiceGame
  console.log("\nDeploying DiceGame...");
  const DiceGame = await hre.ethers.getContractFactory("DiceGame");
  const diceGame = await DiceGame.deploy(
    vrfCoordinatorAddress,
    gameTokenAddress,
    keyHash,
    subscriptionId
  );
  await diceGame.waitForDeployment();
  const diceGameAddress = await diceGame.getAddress();
  console.log("DiceGame deployed to:", diceGameAddress);

  // Mint tokens to games
  console.log("\nMinting tokens to games...");
  const mintAmount = hre.ethers.parseEther("1000000");
  await gameToken.mint(lotteryAddress, mintAmount);
  await gameToken.mint(diceGameAddress, mintAmount);
  console.log("Tokens minted to games");

  // Save deployment addresses
  const deploymentInfo = {
    network: (await hre.ethers.provider.getNetwork()).name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      GameToken: gameTokenAddress,
      VRFCoordinatorV2Mock: vrfCoordinatorAddress,
      Lottery: lotteryAddress,
      DiceGame: diceGameAddress
    },
    vrfConfig: {
      keyHash: keyHash,
      subscriptionId: subscriptionId.toString()
    }
  };

  const fs = require("fs");
  fs.writeFileSync(
    "./deployment-info.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployment-info.json");

  console.log("\nDeployment completed successfully!");
  console.log("\nContract addresses:");
  console.log("GameToken:", gameTokenAddress);
  console.log("VRFCoordinatorV2Mock:", vrfCoordinatorAddress);
  console.log("Lottery:", lotteryAddress);
  console.log("DiceGame:", diceGameAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
