const { ethers } = require("hardhat");

/**
 * THIS SCRIPT MUST BE RUN FROM EACH CUSTODY WALLET THAT WILL HOLD UNCLAIMED NFTS.
 *
 * It grants the AgentIDRegistrar permission to transfer NFTs
 * from the signing custody wallet (needed for transferToUser).
 *
 * Steps:
 *   1. Temporarily set DEPLOYER_PRIVATE_KEY in .env to the custody wallet private key
 *   2. Run this script
 *   3. IMMEDIATELY change DEPLOYER_PRIVATE_KEY back to your deployer key
 */
async function main() {
  const PROXY_ADDRESS = process.env.REGISTRAR_PROXY_ADDRESS || "0x_PASTE_YOUR_PROXY_ADDRESS";

  // ERC-8004 registry address
  // Testnet:
  const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
  // Mainnet (uncomment when ready):
  // const ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

  if (PROXY_ADDRESS.startsWith("0x_")) {
    console.error("❌ Set REGISTRAR_PROXY_ADDRESS");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("═══════════════════════════════════════════════");
  console.log("  Custody Wallet Approval");
  console.log("═══════════════════════════════════════════════");
  console.log("  Signer (custody wallet): ", signer.address);
  console.log("  Approving registrar:     ", PROXY_ADDRESS);
  console.log("  On ERC-8004 registry:    ", ERC8004_REGISTRY);

  // Call setApprovalForAll on the ERC-8004 registry
  const abi = ["function setApprovalForAll(address operator, bool approved) external"];
  const registry = new ethers.Contract(ERC8004_REGISTRY, abi, signer);

  console.log("\n📝 Calling setApprovalForAll...");
  const tx = await registry.setApprovalForAll(PROXY_ADDRESS, true);
  const receipt = await tx.wait();

  console.log("✅ Approved. TX:", receipt.hash);
  console.log("\nThe registrar can now transfer NFTs from this custody wallet.");
  console.log("If you rotate custody wallets later, run this script again from the new wallet.");
  console.log("\n⚠️  IMPORTANT: Change DEPLOYER_PRIVATE_KEY back to your deployer key NOW.");
}

main().catch(console.error);
