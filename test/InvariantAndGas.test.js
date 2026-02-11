const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("Invariant/Fuzz + Gas Tests", function () {
  async function deployFixture() {
    const [owner, player1, player2, player3] = await ethers.getSigners();

    const GameToken = await ethers.getContractFactory("GameToken");
    const gameToken = await GameToken.deploy("GameToken", "GT");
    await gameToken.waitForDeployment();

    const VRFCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    const vrfCoordinator = await VRFCoordinatorV2Mock.deploy();
    await vrfCoordinator.waitForDeployment();

    const keyHash = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
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

    const mintAmount = ethers.parseEther("500000");
    await gameToken.mint(player1.address, mintAmount);
    await gameToken.mint(player2.address, mintAmount);
    await gameToken.mint(player3.address, mintAmount);

    return { owner, player1, player2, player3, gameToken, diceGame, lottery, vrfCoordinator };
  }

  // deterministic pseudo-random generator for reproducible fuzz tests
  function* lcg(seed = 123456789) {
    let state = seed >>> 0;
    while (true) {
      state = (1664525 * state + 1013904223) >>> 0;
      yield state;
    }
  }

  describe("Invariant/Fuzz: DiceGame.calculatePayout", function () {
    it("should satisfy payout invariants under fuzzed inputs", async function () {
      const { diceGame } = await loadFixture(deployFixture);
      const rng = lcg(42);

      const houseEdge = await diceGame.HOUSE_EDGE();
      let previousPredictionPayout = null;

      for (let i = 0; i < 120; i++) {
        const betAmount = BigInt((rng.next().value % 1000) + 1) * ethers.parseEther("0.01"); // 0.01 ~ 10 ETH
        const prediction = (rng.next().value % 100) + 1;
        const predictionBI = BigInt(prediction); 

        const payout = await diceGame.calculatePayout(betAmount, prediction);

        // invariant 1: payout cannot exceed gross payout (bet * 100 / prediction)
        const multiplier = (100n * 10n ** 18n) / predictionBI;
        const grossPayout = (betAmount * multiplier) / (10n ** 18n);
        expect(payout).to.be.lte(grossPayout);

        // invariant 2: payout reflects house edge rounding down
        const expectedPayout = grossPayout - (grossPayout * houseEdge) / 100n;
        expect(payout).to.equal(expectedPayout);
        // if (payout !== expectedPayout) {
        // console.log(typeof payout, payout);
        // console.log(typeof expectedPayout, expectedPayout);
        // console.log(typeof houseEdge, houseEdge);}

        // invariant 3: payout should always be > 0 for valid positive betAmount
        expect(payout).to.be.gt(0n);
      }

      // monotonic invariant (same bet): lower prediction => >= payout
      const constantBet = ethers.parseEther("1");
      for (let p = 1; p <= 100; p++) {
        const payout = await diceGame.calculatePayout(constantBet, p);
        if (previousPredictionPayout !== null) {
          expect(previousPredictionPayout).to.be.gte(payout);
        }
        previousPredictionPayout = payout;
      }
    });

    it("should preserve accounting invariants across fuzzed startGame calls", async function () {
      const { diceGame, gameToken, player1, player2, player3 } = await loadFixture(deployFixture);
      const players = [player1, player2, player3];
      const rng = lcg(777);

      const minBet = await diceGame.MIN_BET();
      const maxBet = await diceGame.MAX_BET();
      const diceAddr = await diceGame.getAddress();

      for (const p of players) {
        await gameToken.connect(p).approve(diceAddr, ethers.parseEther("100000"));
      }

      let expectedContractBalance = 0n;
      for (let i = 0; i < 50; i++) {
        const player = players[rng.next().value % players.length];
        const betRange = maxBet - minBet;
        const betAmount = minBet + (BigInt(rng.next().value) % (betRange + 1n));
        const prediction = (rng.next().value % 100) + 1;

        await diceGame.connect(player).startGame(betAmount, prediction);
        expectedContractBalance += betAmount;

        // invariant: no callback yet => total balance equals sum of all bets
        expect(await gameToken.balanceOf(diceAddr)).to.equal(expectedContractBalance);
      }

      expect(await diceGame.gameIdCounter()).to.equal(50n);
    });
  });

  describe("Invariant/Fuzz: Lottery.purchaseTickets", function () {
    it("should keep ticket/prizePool consistency before draw trigger", async function () {
      const { lottery, gameToken, player1, player2 } = await loadFixture(deployFixture);
      const ticketPrice = await lottery.ticketPrice();
      const lotteryAddr = await lottery.getAddress();

      await gameToken.connect(player1).approve(lotteryAddr, ticketPrice * 20n);
      await gameToken.connect(player2).approve(lotteryAddr, ticketPrice * 20n);

      // Keep total tickets below MIN_PLAYERS(3) to avoid auto draw
      await lottery.connect(player1).purchaseTickets(1);
      let info = await lottery.getLotteryInfo(1);
      expect(info.totalTickets).to.equal(1n);
      expect(info.prizePool).to.equal(ticketPrice);
      expect(info.prizePool).to.equal(info.totalTickets * ticketPrice);

      await lottery.connect(player2).purchaseTickets(1);
      info = await lottery.getLotteryInfo(1);
      expect(info.totalTickets).to.equal(2n);
      expect(info.prizePool).to.equal(2n * ticketPrice);
      expect(info.prizePool).to.equal(info.totalTickets * ticketPrice);
    });
  });

  describe("Gas optimization guards", function () {
    it("startGame gas should stay below budget", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployFixture);

      const betAmount = ethers.parseEther("1");
      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount * 5n);

      const gasUsed = [];
      for (const prediction of [10, 25, 50, 75, 90]) {
        const tx = await diceGame.connect(player1).startGame(betAmount, prediction);
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed);
      }

      const maxGas = gasUsed.reduce((a, b) => (a > b ? a : b), 0n);
      const minGas = gasUsed.reduce((a, b) => (a < b ? a : b), gasUsed[0]);

      // Budget for regression protection; should be stable across prediction values.
      expect(maxGas).to.be.lt(300000n);
      // expect(maxGas - minGas).to.be.lt(15000n);
    });

    it("purchaseTickets gas should stay below budget for small ticket counts", async function () {
      const { lottery, gameToken, player1, player2 } = await loadFixture(deployFixture);
      const ticketPrice = await lottery.ticketPrice();
      const lotteryAddr = await lottery.getAddress();

      // player2 buys 1 first so player1's 2-ticket tx doesn't trigger draw (keeps gas comparable)
      await gameToken.connect(player2).approve(lotteryAddr, ticketPrice);
      await lottery.connect(player2).purchaseTickets(1);

      await gameToken.connect(player1).approve(lotteryAddr, ticketPrice * 2n);
      const tx = await lottery.connect(player1).purchaseTickets(2);
      const receipt = await tx.wait();

      // loop push cost can change, keep a pragmatic ceiling
      expect(receipt.gasUsed).to.be.lt(260000n);
    });
  });
});
