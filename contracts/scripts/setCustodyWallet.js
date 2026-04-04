const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = process.env.REGISTRAR_PROXY_ADDRESS || "0x_PASTE_YOUR_PROXY_ADDRESS";
  const CUSTODY_WALLET = process.env.CUSTODY_WALLET_ADDRESS || "0x_PASTE_YOUR_CUSTODY_WALLET_ADDRESS";
  const APPROVED = (process.env.CUSTODY_APPROVED || "true").toLowerCase() === "true";

  if (PROXY_ADDRESS.startsWith("0x_")) {
    console.error("❌ Set REGISTRAR_PROXY_ADDRESS in .env or in this script");
    process.exit(1);
  }
  if (CUSTODY_WALLET.startsWith("0x_")) {
    console.error("❌ Set CUSTODY_WALLET_ADDRESS in .env or in this script");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const registrar = await ethers.getContractAt("AgentIDRegistrar", PROXY_ADDRESS);

  console.log("═══════════════════════════════════════════════");
  console.log("  Update Custody Wallet Status");
  console.log("═══════════════════════════════════════════════");
  console.log("  Admin signer:    ", signer.address);
  console.log("  Registrar:       ", PROXY_ADDRESS);
  console.log("  Custody wallet:  ", CUSTODY_WALLET);
  console.log("  Approved:        ", APPROVED);

  const tx = await registrar.setCustodyWallet(CUSTODY_WALLET, APPROVED);
  const receipt = await tx.wait();

  console.log("\n✅ Updated custody wallet status");
  console.log("  TX:", receipt.hash);
  console.log("  isCustodyWallet():", await registrar.isCustodyWallet(CUSTODY_WALLET));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
