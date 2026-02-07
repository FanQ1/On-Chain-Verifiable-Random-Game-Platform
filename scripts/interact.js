const hre = require("hardhat");
const fs = require("fs");

async function main() {
  // Load deployment info
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(fs.readFileSync("./deployment-info.json", "utf8"));
  } catch (error) {
    console.error("Error loading deployment info:", error);
    console.error("Please deploy contracts first using: npx hardhat run scripts/deploy.js");
    process.exit(1);
  }

  // Get contract addresses
  const gameTokenAddress = deploymentInfo.contracts.GameToken;
  const lotteryAddress = deploymentInfo.contracts.Lottery;
  const diceGameAddress = deploymentInfo.contracts.DiceGame;

  // Get signers
  const [player1, player2, player3] = await hre.ethers.getSigners();
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
  console.log("Player3 address:", player3.address);

  // Get contract instances
  const gameToken = await hre.ethers.getContractAt("GameToken", gameTokenAddress);
  const lottery = await hre.ethers.getContractAt("Lottery", lotteryAddress);
  const diceGame = await hre.ethers.getContractAt("DiceGame", diceGameAddress);

  // Mint tokens to players
  console.log("\nMinting tokens to players...");
  const mintAmount = hre.ethers.parseEther("1000");
  await gameToken.mint(player1.address, mintAmount);
  await gameToken.mint(player2.address, mintAmount);
  await gameToken.mint(player3.address, mintAmount);
  console.log("Tokens minted to players");

  // Approve tokens for games
  console.log("\nApproving tokens for games...");
  await gameToken.connect(player1).approve(lotteryAddress, mintAmount);
  await gameToken.connect(player1).approve(diceGameAddress, mintAmount);
  await gameToken.connect(player2).approve(lotteryAddress, mintAmount);
  await gameToken.connect(player2).approve(diceGameAddress, mintAmount);
  await gameToken.connect(player3).approve(lotteryAddress, mintAmount);
  await gameToken.connect(player3).approve(diceGameAddress, mintAmount);
  console.log("Tokens approved for games");

  // Play Lottery
  console.log("\n=== Playing Lottery ===");
  const ticketPrice = await lottery.ticketPrice();
  console.log("Ticket price:", hre.ethers.formatEther(ticketPrice), "GT");

  // Purchase tickets
  console.log("\nPlayer1 purchasing 5 tickets...");
  await lottery.connect(player1).purchaseTickets(5);
  console.log("Player2 purchasing 3 tickets...");
  await lottery.connect(player2).purchaseTickets(3);
  console.log("Player3 purchasing 4 tickets...");
  await lottery.connect(player3).purchaseTickets(4);

  // Get lottery info
  const currentLotteryId = await lottery.currentLotteryId();
  const lotteryInfo = await lottery.getLotteryInfo(currentLotteryId);
  console.log("\nLottery Info:");
  console.log("Lottery ID:", currentLotteryId.toString());
  console.log("Total Tickets:", lotteryInfo.totalTickets.toString());
  console.log("Prize Pool:", hre.ethers.formatEther(lotteryInfo.prizePool), "GT");
  console.log("Is Active:", lotteryInfo.isActive);
  console.log("Is Drawn:", lotteryInfo.isDrawn);

  // Play Dice Game
  console.log("\n=== Playing Dice Game ===");
  const minBet = await diceGame.MIN_BET();
  const maxBet = await diceGame.MAX_BET();
  console.log("Min Bet:", hre.ethers.formatEther(minBet), "GT");
  console.log("Max Bet:", hre.ethers.formatEther(maxBet), "GT");

  // Start games
  console.log("\nPlayer1 starting a dice game...");
  const betAmount1 = hre.ethers.parseEther("1");
  const prediction1 = 50;
  await diceGame.connect(player1).startGame(betAmount1, prediction1);
  console.log("Player1 bet:", hre.ethers.formatEther(betAmount1), "GT on prediction:", prediction1);

  console.log("\nPlayer2 starting a dice game...");
  const betAmount2 = hre.ethers.parseEther("0.5");
  const prediction2 = 30;
  await diceGame.connect(player2).startGame(betAmount2, prediction2);
  console.log("Player2 bet:", hre.ethers.formatEther(betAmount2), "GT on prediction:", prediction2);

  // Get game info
  const gameIdCounter = await diceGame.gameIdCounter();
  console.log("\nTotal games played:", gameIdCounter.toString());

  // Get player games
  const player1Games = await diceGame.getPlayerGames(player1.address);
  console.log("\nPlayer1 games:", player1Games.map(id => id.toString()));

  // Get game details
  if (player1Games.length > 0) {
    const gameInfo = await diceGame.getGame(player1Games[0]);
    console.log("\nGame Info:");
    console.log("Game ID:", player1Games[0].toString());
    console.log("Player:", gameInfo.player);
    console.log("Bet Amount:", hre.ethers.formatEther(gameInfo.betAmount), "GT");
    console.log("Prediction:", gameInfo.prediction.toString());
    console.log("Roll Result:", gameInfo.rollResult.toString());
    console.log("Is Completed:", gameInfo.isCompleted);
    console.log("Payout:", hre.ethers.formatEther(gameInfo.payout), "GT");
  }

  // Check player balances
  console.log("\n=== Player Balances ===");
  console.log("Player1 balance:", hre.ethers.formatEther(await gameToken.balanceOf(player1.address)), "GT");
  console.log("Player2 balance:", hre.ethers.formatEther(await gameToken.balanceOf(player2.address)), "GT");
  console.log("Player3 balance:", hre.ethers.formatEther(await gameToken.balanceOf(player3.address)), "GT");

  console.log("\nInteraction completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
