const hre = require("hardhat");
const deploymentInfo = require("../deployment-info.json");

async function main() {
  const [owner, player1, player2] = await hre.ethers.getSigners();

  const gameToken = await hre.ethers.getContractAt(
    "GameToken",
    deploymentInfo.contracts.GameToken
  );
  const lottery = await hre.ethers.getContractAt(
    "Lottery",
    deploymentInfo.contracts.Lottery
  );
  const vrf = await hre.ethers.getContractAt(
    "VRFCoordinatorV2Mock",
    deploymentInfo.contracts.VRFCoordinatorV2Mock
  );

  const mintAmount = hre.ethers.parseEther("10");
  await gameToken.mint(player1.address, mintAmount);
  await gameToken.mint(player2.address, mintAmount);

  const ticketPrice = await lottery.ticketPrice();
  await gameToken
    .connect(player1)
    .approve(await lottery.getAddress(), ticketPrice * 2n);
  await gameToken
    .connect(player2)
    .approve(await lottery.getAddress(), ticketPrice);

  console.log("Player1 buys 2 tickets...");
  await lottery.connect(player1).purchaseTickets(2);

  console.log("Player2 buys 1 ticket...");
  await lottery.connect(player2).purchaseTickets(1);

  const requestId = (await vrf.getRequestIdCounter()) - 1n;
  console.log("Fulfilling VRF request:", requestId.toString());
  await vrf.fulfillRandomWords(requestId);

  const lotteryInfo = await lottery.getLotteryInfo(1);
  console.log("Lottery #1 totalTickets:", lotteryInfo.totalTickets.toString());
  console.log("Lottery #1 prizePool:", hre.ethers.formatEther(lotteryInfo.prizePool), "GT");
  console.log("Lottery #1 isDrawn:", lotteryInfo.isDrawn);
  console.log("Lottery #1 winner:", lotteryInfo.winner);
  console.log("Current lottery id:", (await lottery.currentLotteryId()).toString());

  const winnerBalance = await gameToken.balanceOf(lotteryInfo.winner);
  console.log("Winner GT balance:", hre.ethers.formatEther(winnerBalance));
  console.log("Owner address:", owner.address);
  console.log("Player1 address:", player1.address);
  console.log("Player2 address:", player2.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
