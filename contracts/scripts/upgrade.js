const { ethers, upgrades } = require("hardhat");

async function main() {
  // The proxy address from your initial deployment
  const PROXY_ADDRESS = process.env.REGISTRAR_PROXY_ADDRESS || "0x_PASTE_YOUR_PROXY_ADDRESS";

  if (PROXY_ADDRESS.startsWith("0x_")) {
    console.error("❌ Set REGISTRAR_PROXY_ADDRESS in .env or in this script");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════");
  console.log("  Upgrading AgentIDRegistrar");
  console.log("═══════════════════════════════════════════════");
  console.log("  Proxy:    ", PROXY_ADDRESS);
  console.log("  Deployer: ", deployer.address);

  const oldImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("  Old impl: ", oldImpl);

  // Deploy new implementation and upgrade proxy
  const AgentIDRegistrar = await ethers.getContractFactory("AgentIDRegistrar");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, AgentIDRegistrar, {
    kind: "uups"
  });

  await upgraded.waitForDeployment();
  const newImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  console.log("  New impl: ", newImpl);
  console.log("\n✅ UPGRADE SUCCESSFUL");
  console.log("  Proxy address unchanged:", PROXY_ADDRESS);
  console.log("  New version:", await upgraded.version());
  console.log("  All state preserved.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
