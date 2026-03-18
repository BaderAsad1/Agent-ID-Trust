import { CdpClient } from "@coinbase/cdp-sdk";

export const NETWORK_ID = process.env.CDP_NETWORK_ID || "base-mainnet";
export const IS_TESTNET = NETWORK_ID.includes("testnet") || NETWORK_ID.includes("sepolia");

export function getCdpNetworkId(): "base" | "base-sepolia" {
  if (IS_TESTNET) return "base-sepolia";
  return "base";
}

export const USDC_CONTRACT_ADDRESS = IS_TESTNET
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const BASE_EXPLORER_URL = IS_TESTNET
  ? "https://sepolia.basescan.org"
  : "https://basescan.org";

export function getCdpClient(): CdpClient {
  // Always create a fresh client — never cache, so env var changes (deploys)
  // are picked up immediately and stale credentials can't get stuck.
  return new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET || undefined,
  });
}

export function isCdpConfigured(): boolean {
  return !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
}

export function getPlatformTreasuryAddress(): string | null {
  const addr = process.env.PLATFORM_TREASURY_ADDRESS || process.env.AGENTID_USDC_ADDRESS;
  if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
  return null;
}
