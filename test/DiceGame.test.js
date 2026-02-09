const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("DiceGame", function () {
  async function deployContractsFixture() {
    const [owner, player1, player2] = await ethers.getSigners();

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

    // Deploy DiceGame
    const DiceGame = await ethers.getContractFactory("DiceGame");
    const diceGame = await DiceGame.deploy(
      await vrfCoordinator.getAddress(),
      await gameToken.getAddress(),
      keyHash,
      subscriptionId
    );
    await diceGame.waitForDeployment();

    // Mint tokens to players
    const mintAmount = ethers.parseEther("10000");
    await gameToken.mint(player1.address, mintAmount);
    await gameToken.mint(player2.address, mintAmount);

    return { diceGame, gameToken, vrfCoordinator, owner, player1, player2, keyHash, subscriptionId };
  }

  describe("Deployment", function () {
    it("Should deploy correctly", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);
      expect(await diceGame.MIN_BET()).to.equal(ethers.parseEther("0.001"));
      expect(await diceGame.MAX_BET()).to.equal(ethers.parseEther("10"));
      expect(await diceGame.HOUSE_EDGE()).to.equal(3);
      expect(await diceGame.DICE_SIDES()).to.equal(100);
    });

    it("Should have correct game counters", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);
      expect(await diceGame.gameIdCounter()).to.equal(0);
    });
  });

  describe("Start Game", function () {
    it("Should allow starting a game", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");
      const prediction = 50;

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);

      await expect(diceGame.connect(player1).startGame(betAmount, prediction))
        .to.emit(diceGame, "GameStarted");

      expect(await diceGame.gameIdCounter()).to.equal(1);
    });

    it("Should not allow starting game without approval", async function () {
      const { diceGame, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");
      const prediction = 50;

      await expect(diceGame.connect(player1).startGame(betAmount, prediction))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should not allow bet below minimum", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const minBet = await diceGame.MIN_BET();
      const prediction = 50;

      await gameToken.connect(player1).approve(await diceGame.getAddress(), minBet - BigInt(1));

      await expect(diceGame.connect(player1).startGame(minBet - BigInt(1), prediction))
        .to.be.revertedWith("DiceGame: Bet amount too low");
    });

    it("Should not allow bet above maximum", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const maxBet = await diceGame.MAX_BET();
      const prediction = 50;

      await gameToken.connect(player1).approve(await diceGame.getAddress(), maxBet + BigInt(1));

      await expect(diceGame.connect(player1).startGame(maxBet + BigInt(1), prediction))
        .to.be.revertedWith("DiceGame: Bet amount too high");
    });

    it("Should not allow prediction below 1", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);

      await expect(diceGame.connect(player1).startGame(betAmount, 0))
        .to.be.revertedWith("DiceGame: Invalid prediction");
    });

    it("Should not allow prediction above 100", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);

      await expect(diceGame.connect(player1).startGame(betAmount, 101))
        .to.be.revertedWith("DiceGame: Invalid prediction");
    });
  });

  describe("Game Outcome", function () {
    it("Should record game correctly", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");
      const prediction = 50;

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);
      await diceGame.connect(player1).startGame(betAmount, prediction);

      const game = await diceGame.getGame(0);
      expect(game.player).to.equal(player1.address);
      expect(game.betAmount).to.equal(betAmount);
      expect(game.prediction).to.equal(prediction);
      expect(game.isCompleted).to.equal(false); // VRF callback not called yet
    });

    it("Should track player games", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount * BigInt(3));
      await diceGame.connect(player1).startGame(betAmount, 50);
      await diceGame.connect(player1).startGame(betAmount, 60);
      await diceGame.connect(player1).startGame(betAmount, 70);

      const playerGames = await diceGame.getPlayerGames(player1.address);
      expect(playerGames.length).to.equal(3);
      expect(playerGames[0]).to.equal(0);
      expect(playerGames[1]).to.equal(1);
      expect(playerGames[2]).to.equal(2);
    });
  });

  describe("Payout Calculation", function () {
    it("Should calculate payout correctly for win", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");
      const prediction = 50;
      const houseEdge = await diceGame.HOUSE_EDGE();
      
      // Expected: (betAmount * 100 / prediction) * (100 - houseEdge) / 100
      const expectedPayout = (betAmount * BigInt(100) * (BigInt(100) - houseEdge)) / BigInt(prediction * 100);

      const payout = await diceGame.calculatePayout(betAmount, prediction);
      expect(payout).to.equal(expectedPayout);
    });

    it("Should calculate higher payout for lower prediction", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      const payoutHighPrediction = await diceGame.calculatePayout(betAmount, 80);
      const payoutLowPrediction = await diceGame.calculatePayout(betAmount, 20);

      // Lower prediction = higher payout
      expect(payoutLowPrediction).to.be.greaterThan(payoutHighPrediction);
    });

    it("Should return correct payout for prediction of 100", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");
      const prediction = 100;
      const houseEdge = await diceGame.HOUSE_EDGE();
      
      // Expected: (1 * 100 / 100) * 0.97 = 0.97
      const expectedPayout = (betAmount * BigInt(100) / BigInt(prediction) * (BigInt(100) - houseEdge)) / BigInt(100);

      const payout = await diceGame.calculatePayout(betAmount, prediction);
      expect(payout).to.equal(expectedPayout);
    });

    it("Should not allow invalid prediction in calculation", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await expect(diceGame.calculatePayout(betAmount, 0))
        .to.be.revertedWith("DiceGame: Invalid prediction");
      
      await expect(diceGame.calculatePayout(betAmount, 101))
        .to.be.revertedWith("DiceGame: Invalid prediction");
    });
  });

  describe("Game History", function () {
    it("Should show game history correctly", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount * BigInt(3));
      await diceGame.connect(player1).startGame(betAmount, 50);
      await diceGame.connect(player1).startGame(betAmount, 60);

      const games = await diceGame.getPlayerGames(player1.address);
      expect(games.length).to.equal(2);
    });

    it("Should return empty array for player with no games", async function () {
      const { diceGame, player1 } = await loadFixture(deployContractsFixture);

      const games = await diceGame.getPlayerGames(player1.address);
      expect(games.length).to.equal(0);
    });
  });

  describe("Update Functions", function () {
    it("Should allow owner to update bet limits", async function () {
      const { diceGame, owner } = await loadFixture(deployContractsFixture);

      const newMinBet = ethers.parseEther("0.01");
      const newMaxBet = ethers.parseEther("100");

      await diceGame.updateBetLimits(newMinBet, newMaxBet);

      expect(await diceGame.MIN_BET()).to.equal(newMinBet);
      expect(await diceGame.MAX_BET()).to.equal(newMaxBet);
    });

    // failed not enable access control for update bet limits
    it("Should not allow non-owner to update bet limits", async function () {
      const { diceGame, player1 } = await loadFixture(deployContractsFixture);

      const newMinBet = ethers.parseEther("0.01");
      const newMaxBet = ethers.parseEther("100");

      await expect(diceGame.connect(player1).updateBetLimits(newMinBet, newMaxBet))
        .to.be.revertedWith("AccessControl: account is missing role");
    });

    it("Should not allow min bet to be zero", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      await expect(diceGame.updateBetLimits(0, ethers.parseEther("10")))
        .to.be.revertedWith("DiceGame: Min bet must be greater than zero");
    });

    it("Should not allow max bet less than min bet", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      await expect(diceGame.updateBetLimits(ethers.parseEther("5"), ethers.parseEther("1")))
        .to.be.revertedWith("DiceGame: Max bet must be greater than min bet");
    });
  });

  describe("House Edge Withdrawal", function () {
    it("Should allow owner to withdraw house edge", async function () {
      const { diceGame, gameToken, owner, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("10");
      const prediction = 50;

      // Player loses (prediction too high, win chance 50%)
      // Roll will be between 51-100, player loses
      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);
      await diceGame.connect(player1).startGame(betAmount, prediction);

      // House edge (3%) goes to contract
      const houseEdge = (betAmount * BigInt(3)) / BigInt(100);
      const contractBalance = await gameToken.balanceOf(await diceGame.getAddress());

      const ownerInitialBalance = await gameToken.balanceOf(owner.address);

      await diceGame.withdrawHouseEdge();

      const ownerFinalBalance = await gameToken.balanceOf(owner.address);
      expect(ownerFinalBalance - ownerInitialBalance).to.equal(contractBalance);
    });

    it("Should not allow withdrawing when no balance", async function () {
      const { diceGame } = await loadFixture(deployContractsFixture);

      await expect(diceGame.withdrawHouseEdge())
        .to.be.revertedWith("DiceGame: No tokens to withdraw");
    });
  });

  describe("Multiple Games", function () {
    it("Should handle multiple games from same player", async function () {
      const { diceGame, gameToken, player1 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount * BigInt(5));
      
      // Play 5 games
      for (let i = 0; i < 5; i++) {
        await diceGame.connect(player1).startGame(betAmount, 50 + i * 5);
      }

      const playerGames = await diceGame.getPlayerGames(player1.address);
      expect(playerGames.length).to.equal(5);
      expect(await diceGame.gameIdCounter()).to.equal(5);
    });

    it("Should handle games from multiple players", async function () {
      const { diceGame, gameToken, player1, player2 } = await loadFixture(deployContractsFixture);

      const betAmount = ethers.parseEther("1");

      await gameToken.connect(player1).approve(await diceGame.getAddress(), betAmount);
      await gameToken.connect(player2).approve(await diceGame.getAddress(), betAmount);

      await diceGame.connect(player1).startGame(betAmount, 50);
      await diceGame.connect(player2).startGame(betAmount, 60);

      const player1Games = await diceGame.getPlayerGames(player1.address);
      const player2Games = await diceGame.getPlayerGames(player2.address);

      expect(player1Games.length).to.equal(1);
      expect(player2Games.length).to.equal(1);
      expect(await diceGame.gameIdCounter()).to.equal(2);
    });
  });
});
