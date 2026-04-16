const { ethers } = require("hardhat");

async function printState(trustX, oracle, borrower, label) {
  const price = await oracle.getPrice();
  const debt = await trustX.borrowBalance(borrower.address);
  const collateral = await trustX.collateralBalance(borrower.address);
  const hf = await trustX.getHealthFactor(borrower.address);
  const liquidatable = await trustX.isLiquidatable(borrower.address);

  console.log(`\n=== ${label} ===`);
  console.log("Price:", ethers.formatEther(price));
  console.log("Debt:", ethers.formatEther(debt));
  console.log("Collateral:", ethers.formatEther(collateral));
  console.log("Health Factor:", ethers.formatEther(hf));
  console.log("Liquidatable:", liquidatable);
}

async function main() {
  const [deployer, borrower, liquidator] = await ethers.getSigners();

  const deployment = require("../frontend/src/deployment.json");
  const trustX = await ethers.getContractAt("TrustX", deployment.trustX);
  const oracle = await ethers.getContractAt("MockOracle", deployment.oracle);
  const token = await ethers.getContractAt("MockToken", deployment.token);

  const depositAmount = ethers.parseEther("1");
  const borrowAmount = ethers.parseEther("1000");

  await trustX.connect(borrower).deposit({ value: depositAmount });
  await trustX.connect(borrower).borrow(borrowAmount);

  await printState(trustX, oracle, borrower, "Initial state");

  const prices = ["1800", "1500", "1200", "1000", "800"];

  for (const p of prices) {
    await oracle.connect(deployer).setPrice(ethers.parseEther(p));
    await printState(trustX, oracle, borrower, `After price drop to ${p}`);
  }

  const liquidatable = await trustX.isLiquidatable(borrower.address);

  if (liquidatable) {
    const repayAmount = ethers.parseEther("500");

    await token.connect(liquidator).faucetMint(liquidator.address, repayAmount);
    await token.connect(liquidator).approve(await trustX.getAddress(), repayAmount);

    console.log("\nTriggering liquidation...");
    await trustX.connect(liquidator).liquidate(borrower.address, repayAmount);

    await printState(trustX, oracle, borrower, "After liquidation");
  } else {
    console.log("\nPosition never became liquidatable.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});