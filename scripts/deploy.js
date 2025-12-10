// scripts/deploy.js
require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function getDeployer() {
  try {
    const signers = await hre.ethers.getSigners();
    if (signers && signers.length > 0) return signers[0];
  } catch (e) {}
  if (!process.env.PRIVATE_KEY)
    throw new Error("No deployer available: set PRIVATE_KEY in .env.local or run a local node.");
  const provider = hre.ethers.provider;
  const { Wallet } = require("ethers");
  return new Wallet(process.env.PRIVATE_KEY, provider);
}

async function updateEnvLocal(key, value) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  let content = "";
  try {
    content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  } catch (err) {
    console.warn("Could not read .env.local:", err.message);
  }

  const quotedValue = value.includes(" ") ? `"${value}"` : `${value}`;
  const line = `${key}=${quotedValue}`;

  if (new RegExp(`^${key}=`, "m").test(content)) {
    // replace existing line
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    // append with newline
    if (content && !content.endsWith("\n")) content += "\n";
    content += line + "\n";
  }

  try {
    fs.writeFileSync(envPath, content, "utf8");
    console.log(`✅ .env.local updated: ${key} set`);
  } catch (err) {
    console.warn("⚠️ Failed to write .env.local:", err.message);
  }
}

async function deployMicrofinance() {
  console.log("🚀 Deploying Microfinance contract...");

  const deployer = await getDeployer();
  const deployerAddress =
    typeof deployer.getAddress === "function" ? await deployer.getAddress() : deployer.address;
  console.log("Deploying with:", deployerAddress, "on network:", hre.network.name);

  const Factory = await hre.ethers.getContractFactory("Microfinance", deployer);

  const contract = await Factory.deploy(deployerAddress);
  console.log("Tx hash:", contract.deployTransaction?.hash);
  if (typeof contract.waitForDeployment === "function") {
    await contract.waitForDeployment();
  } else if (contract.deployTransaction) {
    await contract.deployTransaction.wait();
  }

  const address =
    typeof contract.getAddress === "function"
      ? await contract.getAddress()
      : contract.address || contract.target;

  console.log("✅ Microfinance deployed to:", address);

  // write (update or append) NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local
  await updateEnvLocal("NEXT_PUBLIC_CONTRACT_ADDRESS", address);

  // Verify on Etherscan (only for non-local networks and when API key is present)
  if (
    hre.network.name !== "localhost" &&
    hre.network.name !== "hardhat" &&
    process.env.ETHERSCAN_API_KEY
  ) {
    try {
      console.log("🔍 Verifying contract on Etherscan...");
      await hre.run("verify:verify", {
        address,
        constructorArguments: [deployerAddress],
      });
      console.log("✅ Verification succeeded.");
    } catch (verifyErr) {
      console.warn("⚠️ Verification failed (you can retry manually):", verifyErr?.message || verifyErr);
    }
  }

  return address;
}

async function main() {
  const addr = await deployMicrofinance();
  console.log("🏁 Done. Contract address:", addr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
