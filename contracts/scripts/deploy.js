const { ethers, upgrades } = require("hardhat");

async function main() {
  // ═══════════════════════════════════════════════════
  // CONFIGURE THESE BEFORE RUNNING
  // ═══════════════════════════════════════════════════

  // ERC-8004 IdentityRegistry on the target network
  // Base Sepolia testnet:
  const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
  // Base mainnet (uncomment when deploying to mainnet):
  // const ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

  // Your wallet ADDRESSES (not private keys)
  const MINTER = process.env.MINTER_ADDRESS || "0x_PASTE_YOUR_MINTER_ADDRESS";
  const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || "0x_PASTE_YOUR_PLATFORM_WALLET_ADDRESS";

  // Agent card base URI
  const BASE_URI = "https://api.getagent.id/v1/agent-card/";

  // ═══════════════════════════════════════════════════

  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════");
  console.log("  Deploying AgentIDRegistrar (UUPS Proxy)");
  console.log("═══════════════════════════════════════════════");
  console.log("  Network:          ", (await ethers.provider.getNetwork()).name);
  console.log("  Chain ID:         ", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("  Deployer:         ", deployer.address);
  console.log("  Deployer balance: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("  ERC-8004 Registry:", ERC8004_REGISTRY);
  console.log("  Minter:           ", MINTER);
  console.log("  Platform Wallet:  ", PLATFORM_WALLET);
  console.log("  Agent Card URI:   ", BASE_URI);
  console.log("═══════════════════════════════════════════════\n");

  // Sanity checks
  if (MINTER.startsWith("0x_")) {
    console.error("❌ Set MINTER_ADDRESS in .env or in this script");
    process.exit(1);
  }
  if (PLATFORM_WALLET.startsWith("0x_")) {
    console.error("❌ Set PLATFORM_WALLET_ADDRESS in .env or in this script");
    process.exit(1);
  }

  // Deploy as UUPS proxy
  // This deploys TWO contracts:
  //   1. The implementation contract (your actual code)
  //   2. A proxy contract (the address everyone uses — never changes)
  console.log("📦 Deploying implementation + proxy...");

  const AgentIDRegistrar = await ethers.getContractFactory("AgentIDRegistrar");
  const proxy = await upgrades.deployProxy(
    AgentIDRegistrar,
    [ERC8004_REGISTRY, MINTER, PLATFORM_WALLET, BASE_URI],
    {
      initializer: "initialize",
      kind: "uups"
    }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ DEPLOYMENT SUCCESSFUL");
  console.log("═══════════════════════════════════════════════");
  console.log("  Proxy address (USE THIS):    ", proxyAddress);
  console.log("  Implementation address:       ", implAddress);
  console.log("  Owner:                        ", deployer.address);
  console.log("═══════════════════════════════════════════════");

  // Verify state
  console.log("\n🔍 Verifying deployment state...");
  const registrar = AgentIDRegistrar.attach(proxyAddress);
  console.log("  registry():        ", await registrar.registry());
  console.log("  minter():          ", await registrar.minter());
  console.log("  platformWallet():  ", await registrar.platformWallet());
  console.log("  isCustodyWallet(): ", await registrar.isCustodyWallet(PLATFORM_WALLET));
  console.log("  baseAgentCardURI():", await registrar.baseAgentCardURI());
  console.log("  version():         ", await registrar.version());
  console.log("  totalHandles():    ", (await registrar.totalHandles()).toString());

  console.log("\n📋 SAVE THESE VALUES:");
  console.log(`   REGISTRAR_PROXY_ADDRESS=${proxyAddress}`);
  console.log(`   REGISTRAR_IMPL_ADDRESS=${implAddress}`);
  console.log(`   → Set REGISTRAR_PROXY_ADDRESS as BASE_AGENTID_REGISTRAR in Replit`);

  console.log("\n📋 NEXT STEPS:");
  console.log("   1. npm run reserve:testnet   (reserve protected handles)");
  console.log("   2. npm run approve:testnet   (initial custody wallet approves registrar)");
  console.log("   3. Test registerHandle() on testnet");
  console.log("   4. If you add/remove custody wallets later: npm run custody:testnet");
  console.log("   5. When ready: repeat on mainnet\n");

  // Try to verify on Basescan
  console.log("🔍 Attempting Basescan verification...");
  try {
    await hre.run("verify:verify", {
      address: implAddress,
      constructorArguments: []
    });
    console.log("✅ Implementation verified on Basescan");
  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("✅ Already verified");
    } else {
      console.log("⚠️  Auto-verify failed:", err.message);
      console.log("   Verify manually at Basescan → Proxy → Write → verify");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
