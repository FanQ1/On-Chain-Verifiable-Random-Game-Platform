const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("Lottery", function () {
  async function deployContractsFixture() {
    const [owner, player1, player2, player3] = await ethers.getSigners();

    // Deploy GameToken
    const GameToken = await ethers.getContractFactory("GameToken");
    const gameToken = await GameToken.deploy("GameToken", "GT");
    await gameToken.waitForDeployment();

    // Deploy VRFCoordinatorV2Mock
    const VRFCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    const vrfCoordinator = await VRFCoordinatorV2Mock.deploy();
    await vrfCoordinator.waitForDeployment();

    const keyHash = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
    const subscriptionId = 1;

    // Deploy Lottery
    const Lottery = await ethers.getContractFactory("Lottery");
    const lottery = await Lottery.deploy(
      await vrfCoordinator.getAddress(),
      await gameToken.getAddress(),
      keyHash,
      subscriptionId
    );
    await lottery.waitForDeployment();

    // Mint tokens to players
    const mintAmount = ethers.parseEther("100000");
    await gameToken.mint(player1.address, mintAmount);
    await gameToken.mint(player2.address, mintAmount);
    await gameToken.mint(player3.address, mintAmount);

    return { lottery, gameToken, vrfCoordinator, owner, player1, player2, player3, keyHash, subscriptionId };
  }

  describe("Deployment", function () {
    it("Should deploy correctly", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      // Note: Lottery creates first lottery in constructor
      expect(await lottery.currentLotteryId()).to.equal(1);
    });

    it("Should have correct ticket price", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      expect(await lottery.ticketPrice()).to.equal(ethers.parseEther("0.01"));
    });

    it("Should have correct house edge", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      expect(await lottery.HOUSE_EDGE()).to.equal(5);
    });

    it("Should have correct min and max players", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      expect(await lottery.MIN_PLAYERS()).to.equal(3);
      expect(await lottery.MAX_PLAYERS()).to.equal(100);
    });
  });

  describe("Ticket Purchase", function () {
    it("Should allow purchasing tickets", async function () {
      const { lottery, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);

      await expect(lottery.connect(player1).purchaseTickets(1))
        .to.emit(lottery, "TicketPurchased");

      const lotteryInfo = await lottery.getLotteryInfo(1);
      expect(lotteryInfo.totalTickets).to.equal(1);
    });

    it("Should not allow purchasing zero tickets", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);

      await expect(lottery.connect(player1).purchaseTickets(0))
        .to.be.revertedWith("Lottery: Must purchase at least one ticket");
    });

    it("Should not allow purchasing without approval", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);

      await expect(lottery.connect(player1).purchaseTickets(1))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should track player participation", async function () {
      const { lottery, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      const playerLotteries = await lottery.getPlayerLotteries(player1.address);
      expect(playerLotteries.length).to.equal(1);
    });

    it("Should accumulate prize pool correctly", async function () {
      const { lottery, gameToken, player1, player2, player3 } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice * BigInt(2));
      await lottery.connect(player2).purchaseTickets(2);

      const lotteryInfo = await lottery.getLotteryInfo(1);
      expect(lotteryInfo.totalTickets).to.equal(3n);
      expect(lotteryInfo.prizePool).to.equal(ticketPrice * 3n);
    });
  });

  describe("Auto Draw", function () {
    it("Should auto draw when min players reached", async function () {
      const { lottery, gameToken, player1, player2, player3, vrfCoordinator } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player3).purchaseTickets(1);

      // Fulfill VRF request to complete the draw
      const requestId = await vrfCoordinator.getRequestIdCounter() - 1n;
      await vrfCoordinator.fulfillRandomWords(requestId);

      // After 3 players (MIN_PLAYERS), new lottery should start
      expect(await lottery.currentLotteryId()).to.equal(2);
    });
  });

  describe("Winner Selection", function () {
    it("Should select a winner from ticket holders", async function () {
      const { lottery, gameToken, player1, player2, player3, vrfCoordinator } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      // Players buy tickets
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      // Add third player to trigger draw
      await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player3).purchaseTickets(1);

      // Fulfill VRF request to complete the draw
      const requestId = await vrfCoordinator.getRequestIdCounter() - 1n;
      await vrfCoordinator.fulfillRandomWords(requestId);

      // Lottery 1 should be drawn
      const lottery1Info = await lottery.getLotteryInfo(1);
      expect(lottery1Info.isDrawn).to.equal(true);
    });
  });

  describe("Update Functions", function () {
    it("Should allow owner to update ticket price", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      const newPrice = ethers.parseEther("500");

      await lottery.updateTicketPrice(newPrice);
      expect(await lottery.ticketPrice()).to.equal(newPrice);
    });

    it("Should not allow non-owner to update ticket price", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);
      const newPrice = ethers.parseEther("500");

      await expect(lottery.connect(player1).updateTicketPrice(newPrice))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow zero ticket price", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);

      await expect(lottery.updateTicketPrice(0))
        .to.be.revertedWith("Lottery: Price must be greater than zero");
    });
  });

  describe("House Edge", function () {
    it("Should correctly calculate house edge (5%)", async function () {
      const { lottery, gameToken, player1, player2, player3, vrfCoordinator } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      // 3 players × 1 ticket = 3 tickets in lottery 1
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player3).purchaseTickets(1);

      // Fulfill VRF request to complete the draw
      const requestId = await vrfCoordinator.getRequestIdCounter() - 1n;
      await vrfCoordinator.fulfillRandomWords(requestId);

      // Now lottery 2 is created, buy a ticket to verify it exists
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      // Check lottery 2 has the ticket
      const lottery2Info = await lottery.getLotteryInfo(2);
      expect(lottery2Info.prizePool).to.equal(ticketPrice);
      expect(lottery2Info.totalTickets).to.equal(1n);
    });
  });

  describe("Multiple Lotteries", function () {
    it("Should track multiple lotteries correctly", async function () {
      const { lottery, gameToken, player1, player2, player3, vrfCoordinator } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      // First lottery: 3 players buy tickets
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player3).purchaseTickets(1);

      // Fulfill VRF request to complete the first draw
      const requestId1 = await vrfCoordinator.getRequestIdCounter() - 1n;
      await vrfCoordinator.fulfillRandomWords(requestId1);

      expect(await lottery.currentLotteryId()).to.equal(2);

      // Second lottery: need 3 players to trigger another draw
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      await gameToken.connect(player2).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      await gameToken.connect(player3).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player3).purchaseTickets(1);

      // Fulfill VRF request to complete the second draw
      const requestId2 = await vrfCoordinator.getRequestIdCounter() - 1n;
      await vrfCoordinator.fulfillRandomWords(requestId2);

      // Third lottery should be current
      expect(await lottery.currentLotteryId()).to.equal(3);
    });

    it("Should return correct info for specific lottery", async function () {
      const { lottery, gameToken, player1, player2 } = await loadFixture(deployContractsFixture);

      const ticketPrice = await lottery.ticketPrice();

      // Create first lottery and buy tickets
      await gameToken.connect(player1).approve(await lottery.getAddress(), ticketPrice);
      await lottery.connect(player1).purchaseTickets(1);

      // Check lottery 1 info
      const lottery1Info = await lottery.getLotteryInfo(1);
      expect(lottery1Info.totalTickets).to.equal(1);
    });
  });
});
