const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy("Mock USD", "mUSD", 18);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const MockOracle = await hre.ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy(hre.ethers.parseEther("2000"));
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();

  const TrustX = await hre.ethers.getContractFactory("TrustX");
  const threshold = ethers.parseEther("1.5");
  // const trustX = await TrustX.deploy(tokenAddress, oracleAddress, threshold);
  const trustX = await TrustX.deploy(await token.getAddress(), await oracle.getAddress(), threshold);
  await trustX.waitForDeployment();
  const trustXAddress = await trustX.getAddress();

  console.log("Token:", tokenAddress);
  console.log("Oracle:", oracleAddress);
  console.log("TrustX:", trustXAddress);

  const deployment = {
    network: hre.network.name,
    token: await token.getAddress(),
    oracle: await oracle.getAddress(),
    trustX: await trustX.getAddress(),
    deployedAt: new Date().toISOString(),    
    deployer: deployer.address
  };

  console.log("Deployment summary:");
  console.table(deployment);

  const outputDir = path.join(__dirname, "..", "frontend", "src");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(outputDir, "deployment.json"),
    JSON.stringify(deployment, null, 2),
    "utf8"
  );

  console.log("Saved frontend/src/deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
