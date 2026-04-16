const { ethers } = require("hardhat");

async function deployFresh(initialPrice, threshold) {
  const MockToken = await ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy("Mock USD", "mUSD", 18);
  await token.waitForDeployment();

  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy(hre.ethers.parseEther("2000"));
  await oracle.waitForDeployment();

  const TrustX = await ethers.getContractFactory("TrustX");
  const trustX = await TrustX.deploy(await token.getAddress(), await oracle.getAddress(), threshold);
  await trustX.waitForDeployment();

  return { token, oracle, trustX };
}

async function runScenario(label, borrowAmountStr) {
  const [deployer, borrower] = await ethers.getSigners();

  const initialPrice = ethers.parseEther("2000");
  const threshold = ethers.parseEther("1.5");

  const { oracle, trustX } = await deployFresh(initialPrice, threshold);

  const depositAmount = ethers.parseEther("1");
  const borrowAmount = ethers.parseEther(borrowAmountStr);

  await trustX.connect(borrower).deposit({ value: depositAmount });
  await trustX.connect(borrower).borrow(borrowAmount);

  const prices = ["2000", "1800", "1500", "1200", "1000", "800"];

  for (const p of prices) {
    await oracle.connect(deployer).setPrice(ethers.parseEther(p));

    const hf = await trustX.getHealthFactor(borrower.address);
    const liquidatable = await trustX.isLiquidatable(borrower.address);

    console.log(
      `${label},${p},${borrowAmountStr},${Number(ethers.formatEther(hf)).toFixed(3)},${liquidatable}`
    );
  }
}

async function main() {
  console.log("scenario,price,borrowAmount,healthFactor,liquidatable");

  await runScenario("A_800", "800");
  await runScenario("B_1000", "1000");
  await runScenario("C_1200", "1200");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});