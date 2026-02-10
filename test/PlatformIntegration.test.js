const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("Platform Integration (GameToken + DiceGame + Lottery)", function () {
  async function deployPlatformFixture() {
    const [owner, player1, player2, player3] = await ethers.getSigners();

    const GameToken = await ethers.getContractFactory("GameToken");
    const gameToken = await GameToken.deploy("GameToken", "GT");
    await gameToken.waitForDeployment();

    const VRFCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    const vrfCoordinator = await VRFCoordinatorV2Mock.deploy();
    await vrfCoordinator.waitForDeployment();

    const keyHash = ethers.keccak256(ethers.toUtf8Bytes("integration-test-key"));
    const subscriptionId = 1;

    const DiceGame = await ethers.getContractFactory("DiceGame");
    const diceGame = await DiceGame.deploy(
      await vrfCoordinator.getAddress(),
      await gameToken.getAddress(),
      keyHash,
      subscriptionId
    );
    await diceGame.waitForDeployment();

    const Lottery = await ethers.getContractFactory("Lottery");
    const lottery = await Lottery.deploy(
      await vrfCoordinator.getAddress(),
      await gameToken.getAddress(),
      keyHash,
      subscriptionId
    );
    await lottery.waitForDeployment();

    const mintAmount = ethers.parseEther("1000");
    await gameToken.mint(player1.address, mintAmount);
    await gameToken.mint(player2.address, mintAmount);
    await gameToken.mint(player3.address, mintAmount);

    return {
      owner,
      player1,
      player2,
      player3,
      gameToken,
      vrfCoordinator,
      diceGame,
      lottery,
      mintAmount,
    };
  }

  it("Should allow token to participate in both Dice and Lottery simultaneously, and VRF callbacks should be completed on both sides", async function () {
    const { gameToken, vrfCoordinator, diceGame, lottery, player1, player2, player3 } =
      await loadFixture(deployPlatformFixture);

    const diceBet = ethers.parseEther("1");
    const ticketPrice = await lottery.ticketPrice();

    await gameToken.connect(player1).approve(await diceGame.getAddress(), diceBet * 2n);
    await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);

    // 先发起一局 gameId=0（该实现中 requestId->gameId 为 0 会在回调被判 invalid）
    await diceGame.connect(player1).startGame(diceBet, 40);
    // 再发起一局 gameId=1，用于验证完整回调流程
    await diceGame.connect(player1).startGame(diceBet, 60);

    await lottery.connect(player1).purchaseTickets(1);
    await lottery.connect(player2).purchaseTickets(1);
    await lottery.connect(player3).purchaseTickets(1);

    const lastRequestId = (await vrfCoordinator.getRequestIdCounter()) - 1n;

    // 请求顺序：dice(0), dice(1), lottery(1)，因此最后一个是 lottery
    await vrfCoordinator.fulfillRandomWords(lastRequestId);
    await vrfCoordinator.fulfillRandomWords(lastRequestId - 1n);

    const lottery1 = await lottery.getLotteryInfo(1);
    expect(lottery1.isDrawn).to.equal(true);
    expect(lottery1.winner).to.not.equal(ethers.ZeroAddress);
    expect(await lottery.currentLotteryId()).to.equal(2);

    const completedGame = await diceGame.getGame(1);
    expect(completedGame.player).to.equal(player1.address);
    expect(completedGame.isCompleted).to.equal(true);
    expect(completedGame.rollResult).to.be.greaterThanOrEqual(1);
    expect(completedGame.rollResult).to.be.lessThanOrEqual(100);
  });

  it("Should correctly accumulate historical records and counts after cross-contract operations by the same player", async function () {
    const { gameToken, diceGame, lottery, player1, player2, player3 } =
      await loadFixture(deployPlatformFixture);

    const diceBet = ethers.parseEther("0.5");
    const ticketPrice = await lottery.ticketPrice();

    await gameToken.connect(player1).approve(await diceGame.getAddress(), diceBet * 3n);
    await diceGame.connect(player1).startGame(diceBet, 55);
    await diceGame.connect(player1).startGame(diceBet, 65);
    await diceGame.connect(player1).startGame(diceBet, 75);

    await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
    await lottery.connect(player1).purchaseTickets(1);
    await lottery.connect(player2).purchaseTickets(1);
    await lottery.connect(player3).purchaseTickets(1);

    const player1DiceGames = await diceGame.getPlayerGames(player1.address);
    const player1Lotteries = await lottery.getPlayerLotteries(player1.address);

    expect(await diceGame.gameIdCounter()).to.equal(3);
    expect(player1DiceGames.length).to.equal(3);
    expect(player1Lotteries.length).to.equal(1);
  });

  it("Should verify the linkage between token approvals, deductions, and prize pool growth in the platform", async function () {
    const { gameToken, diceGame, lottery, player1, player2, mintAmount } =
      await loadFixture(deployPlatformFixture);

    const diceBet = ethers.parseEther("2");
    const ticketPrice = await lottery.ticketPrice();

    await gameToken.connect(player1).approve(await diceGame.getAddress(), diceBet);
    await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice * 2n);

    const player1Before = await gameToken.balanceOf(player1.address);
    const player2Before = await gameToken.balanceOf(player2.address);

    await diceGame.connect(player1).startGame(diceBet, 50);
    await lottery.connect(player2).purchaseTickets(2);

    const player1After = await gameToken.balanceOf(player1.address);
    const player2After = await gameToken.balanceOf(player2.address);

    expect(player1Before - player1After).to.equal(diceBet);
    expect(player2Before - player2After).to.equal(ticketPrice * 2n);

    const lotteryInfo = await lottery.getLotteryInfo(1);
    expect(lotteryInfo.prizePool).to.equal(ticketPrice * 2n);
    expect(lotteryInfo.totalTickets).to.equal(2);

    expect(player1After).to.equal(mintAmount - diceBet);
    expect(player2After).to.equal(mintAmount - ticketPrice * 2n);
  });

  it("Should allow platform owner to separately withdraw retained funds from Dice and Lottery contracts", async function () {
    const { owner, gameToken, diceGame, lottery, player1, player2, player3 } =
      await loadFixture(deployPlatformFixture);

    const diceBet = ethers.parseEther("1");
    const ticketPrice = await lottery.ticketPrice();

    await gameToken.connect(player1).approve(await diceGame.getAddress(), diceBet);
    await diceGame.connect(player1).startGame(diceBet, 50);

    await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
    await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
    await lottery.connect(player1).purchaseTickets(1);
    await lottery.connect(player2).purchaseTickets(1);
    await lottery.connect(player3).purchaseTickets(1);

    const ownerBefore = await gameToken.balanceOf(owner.address);
    const diceBalance = await gameToken.balanceOf(await diceGame.getAddress());
    const lotteryBalance = await gameToken.balanceOf(await lottery.getAddress());

    expect(diceBalance).to.be.greaterThan(0);
    expect(lotteryBalance).to.be.greaterThan(0);

    await diceGame.withdrawHouseEdge();
    await lottery.withdrawHouseEdge();

    const ownerAfter = await gameToken.balanceOf(owner.address);
    expect(ownerAfter - ownerBefore).to.equal(diceBalance + lotteryBalance);

    expect(await gameToken.balanceOf(await diceGame.getAddress())).to.equal(0);
    expect(await gameToken.balanceOf(await lottery.getAddress())).to.equal(0);
  });
});
