const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = process.env.REGISTRAR_PROXY_ADDRESS || "0x_PASTE_YOUR_PROXY_ADDRESS";

  if (PROXY_ADDRESS.startsWith("0x_")) {
    console.error("❌ Set REGISTRAR_PROXY_ADDRESS in .env or in this script");
    process.exit(1);
  }

  const registrar = await ethers.getContractAt("AgentIDRegistrar", PROXY_ADDRESS);

  const reserved = [
    // Protocol / system
    "api", "www", "app", "sdk", "dns", "nft", "dao",
    // Crypto tickers
    "eth", "btc", "sol", "trx", "ton", "bnb", "matic", "usdc", "usdt", "avax",
    // System words
    "admin", "root", "system", "agent", "agents", "agentid",
    "wallet", "wallets", "test", "null", "undefined",
    // Product pages
    "support", "help", "billing", "status", "docs", "blog",
    "mail", "oauth", "auth", "login", "signup", "pricing", "settings",
    // Chains
    "base", "tron", "arbitrum", "optimism", "ethereum", "solana", "polygon", "avalanche",
    // Companies
    "coinbase", "moonpay", "stripe", "google", "openai", "anthropic",
    "meta", "apple", "microsoft", "amazon", "nvidia",
    // AI brands
    "gpt", "claude", "gemini", "llama", "chatgpt", "copilot", "siri", "alexa",
    // Offensive (minimal set — expand as needed)
    "fuck", "shit", "porn", "nazi"
  ];

  console.log(`Reserving ${reserved.length} handles...`);

  // Batch in groups of 50 to stay within gas limits
  const BATCH = 50;
  for (let i = 0; i < reserved.length; i += BATCH) {
    const batch = reserved.slice(i, i + BATCH);
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}: ${batch.length} words...`);
    const tx = await registrar.reserveHandles(batch);
    const receipt = await tx.wait();
    console.log(`  ✅ TX: ${receipt.hash} | Gas: ${receipt.gasUsed.toString()}`);
  }

  console.log(`\n✅ All ${reserved.length} handles reserved.`);
}

main().catch(console.error);
