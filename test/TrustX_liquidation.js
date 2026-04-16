const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustX Liquidation Flow", function () {
  let deployer, user, other;
  let token, oracle, trustX;

  const initialPrice = ethers.parseEther("2000");
  const crashedPrice = ethers.parseEther("1200");
  const threshold = ethers.parseEther("1.5");

  beforeEach(async function () {
    [deployer, user, other] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy("Mock USD", "mUSD", 18);
    await token.waitForDeployment();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy(initialPrice);
    await oracle.waitForDeployment();

    const TrustX = await ethers.getContractFactory("TrustX");
    trustX = await TrustX.deploy(await token.getAddress(), await oracle.getAddress(), threshold);
    await trustX.waitForDeployment();
  });

  // belowing test
    it("should not allow liquidation when the position is still healthy", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");
    const repayAmount = ethers.parseEther("100");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await token.connect(other).faucetMint(other.address, repayAmount);
    await token.connect(user).approve(await trustX.getAddress(), repayAmount);

    await expect(
        trustX.connect(user).liquidate(user.address, repayAmount)
    ).to.be.revertedWith("Borrower is healthy");
    });

    it("should mark a position as liquidatable after a price drop", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    const hfBefore = await trustX.getHealthFactor(user.address);
    expect(hfBefore).to.be.gte(threshold);

    await oracle.connect(deployer).setPrice(crashedPrice);

    const hfAfter = await trustX.getHealthFactor(user.address);
    expect(hfAfter).to.be.lt(threshold);

    expect(await trustX.isLiquidatable(user.address)).to.equal(true);
    });

    it("should allow a liquidator to repay debt and seize collateral", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");
    const repayAmount = ethers.parseEther("500");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await oracle.connect(deployer).setPrice(crashedPrice);

    expect(await trustX.isLiquidatable(user.address)).to.equal(true);

    await token.connect(other).faucetMint(other.address, repayAmount);
    await token.connect(other).approve(await trustX.getAddress(), repayAmount);

    const userDebtBefore = await trustX.borrowBalance(user.address);
    const userCollateralBefore = await trustX.collateralBalance(user.address);
    const otherCollateralBefore = await trustX.collateralBalance(other.address);

    await expect(
        trustX.connect(other).liquidate(user.address, repayAmount)
    ).to.emit(trustX, "Liquidated");

    const userDebtAfter = await trustX.borrowBalance(user.address);
    const userCollateralAfter = await trustX.collateralBalance(user.address);
    const otherCollateralAfter = await trustX.collateralBalance(other.address);

    expect(userDebtAfter).to.equal(userDebtBefore - repayAmount);
    expect(userCollateralAfter).to.be.lt(userCollateralBefore);
    //expect(otherCollateralAfter).to.be.gt(otherCollateralBefore);
    });

    it("should revert if liquidation repay amount exceeds borrower debt", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");
    const repayAmount = ethers.parseEther("1200");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await oracle.connect(deployer).setPrice(crashedPrice);

    await token.connect(other).faucetMint(other.address, repayAmount);
    await token.connect(other).approve(await trustX.getAddress(), repayAmount);

    await expect(
        trustX.connect(other).liquidate(user.address, repayAmount)
    ).to.be.revertedWith("Repay exceeds borrower debt");
    });



});