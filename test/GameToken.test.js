const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Helper to convert BigInt to string for comparison
const toBigInt = (val) => BigInt(val);

describe("GameToken", function () {
  async function deployTokenFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    const GameToken = await ethers.getContractFactory("GameToken");
    const gameToken = await GameToken.deploy("GameToken", "GT");
    await gameToken.waitForDeployment();

    return { gameToken, owner, addr1, addr2 };
  }

  describe("Deployment", function () {
    it("Should deploy correctly", async function () {
      const { gameToken } = await loadFixture(deployTokenFixture);
      expect(await gameToken.name()).to.equal("GameToken");
      expect(await gameToken.symbol()).to.equal("GT");
    });

    it("Should mint initial supply to deployer", async function () {
      const { gameToken, owner } = await loadFixture(deployTokenFixture);
      const expectedSupply = ethers.parseEther("1000000");
      const balance = await gameToken.balanceOf(owner.address);
      expect(balance).to.equal(expectedSupply);
    });
  });

  describe("Mint by Owner", function () {
    it("Should allow owner to mint tokens", async function () {
      const { gameToken, owner, addr1 } = await loadFixture(deployTokenFixture);
      const mintAmount = ethers.parseEther("1000");
      await gameToken.mint(addr1.address, mintAmount);
      const balance = await gameToken.balanceOf(addr1.address);
      expect(balance).to.equal(mintAmount);
    });

    // failed we have not enable access control for minting
    it("Should not allow non-owner to mint tokens", async function () {
      const { gameToken, addr1 } = await loadFixture(deployTokenFixture);
      const mintAmount = ethers.parseEther("1000");
      try {
        await gameToken.connect(addr1).mint(addr1.address, mintAmount);
        expect(false).to.be.true; // Should not reach here
      } catch (e) {
        expect(e.message).to.include("AccessControl");
      }
    });
  });

  describe("Mint with ETH", function () {
    it("Should allow users to mint tokens with ETH", async function () {
      const { gameToken, addr1 } = await loadFixture(deployTokenFixture);
      const mintAmount = ethers.parseEther("1000");
      const fee = ethers.parseEther("0.01");
      await gameToken.connect(addr1).mintWithEth(mintAmount, { value: fee });
      const balance = await gameToken.balanceOf(addr1.address);
      expect(balance).to.equal(mintAmount);
    });

    it("Should not allow minting with insufficient fee", async function () {
      const { gameToken, addr1 } = await loadFixture(deployTokenFixture);
      const mintAmount = ethers.parseEther("1000");
      const insufficientFee = ethers.parseEther("0.005");
      try {
        await gameToken.connect(addr1).mintWithEth(mintAmount, { value: insufficientFee });
        expect(false).to.be.true;
      } catch (e) {
        expect(e.message).to.include("Insufficient fee");
      }
    });
  });

  describe("Transfer", function () {
    it("Should allow token transfers", async function () {
      const { gameToken, owner, addr1 } = await loadFixture(deployTokenFixture);
      const transferAmount = ethers.parseEther("100");
      await gameToken.transfer(addr1.address, transferAmount);
      const balance = await gameToken.balanceOf(addr1.address);
      expect(balance).to.equal(transferAmount);
    });

    it("Should allow approved transfers (transferFrom)", async function () {
      const { gameToken, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const transferAmount = ethers.parseEther("100");
      await gameToken.approve(addr1.address, transferAmount);
      await gameToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount);
      const balance = await gameToken.balanceOf(addr2.address);
      expect(balance).to.equal(transferAmount);
    });
  });

  describe("Allowance", function () {
    it("Should show correct allowance", async function () {
      const { gameToken, owner, addr1 } = await loadFixture(deployTokenFixture);
      const approveAmount = ethers.parseEther("500");
      await gameToken.approve(addr1.address, approveAmount);
      const allowance = await gameToken.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(approveAmount);
    });
  });
});
