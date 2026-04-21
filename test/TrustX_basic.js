
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustX Basic Flow", function () {
  let token, oracle, trustX;
  let deployer, user, other;
  const initialPrice = ethers.parseEther("2000");
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

  it("should allow a user to deposit ETH as collateral", async function () {
    const amount = ethers.parseEther("1");

    await expect(
      trustX.connect(user).deposit({ value: amount })
    ).to.emit(trustX, "Deposited").withArgs(user.address, amount);

    expect(await trustX.collateralBalance(user.address)).to.equal(amount);
  });

  it("should allow a user to borrow tokens within safe collateral limits", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");

    await trustX.connect(user).deposit({ value: depositAmount });

    await expect(
      trustX.connect(user).borrow(borrowAmount)
    ).to.emit(trustX, "Borrowed").withArgs(user.address, borrowAmount);

    expect(await trustX.borrowBalance(user.address)).to.equal(borrowAmount);
    expect(await token.balanceOf(user.address)).to.equal(borrowAmount);

    const hf = await trustX.getHealthFactor(user.address);
    expect(hf).to.be.gte(threshold);
  });

  it("should allow a user to repay debt", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");
    const repayAmount = ethers.parseEther("400");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await token.connect(user).approve(await trustX.getAddress(), repayAmount);

    await expect(
      trustX.connect(user).repay(repayAmount)
    ).to.emit(trustX, "Repaid").withArgs(user.address, repayAmount);

    expect(await trustX.borrowBalance(user.address)).to.equal(
      ethers.parseEther("600")
    );
  });

  it("should allow a user to withdraw collateral if the account remains healthy", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("500");
    const withdrawAmount = ethers.parseEther("0.2");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await expect(
      trustX.connect(user).withdraw(withdrawAmount)
    ).to.emit(trustX, "Withdrawn").withArgs(user.address, withdrawAmount);

    expect(await trustX.collateralBalance(user.address)).to.equal(
      ethers.parseEther("1.5")
    );
  });

  it("should revert when borrowing exceeds safe collateral limits", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("2000");

    await trustX.connect(user).deposit({ value: depositAmount });

    await expect(
      trustX.connect(user).borrow(borrowAmount)
    ).to.be.revertedWith("Insufficient collateral");
  });

  it("should revert when withdrawal would make the account unsafe", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("1000");
    const withdrawAmount = ethers.parseEther("0.4");

    await trustX.connect(user).deposit({ value: depositAmount });
    await trustX.connect(user).borrow(borrowAmount);

    await expect(
      trustX.connect(user).withdraw(withdrawAmount)
    ).to.be.revertedWith("Withdrawal would make account unsafe");
  });


});
