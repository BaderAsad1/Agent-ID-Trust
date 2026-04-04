import { createPrivateKey } from "crypto";
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

function normalizePemKey(raw: string | undefined): string | undefined {
  if (!raw) return raw;

  // Step 1: ensure real newlines
  let pem = raw;
  if (!pem.includes("\n")) {
    if (pem.includes("\\n")) {
      pem = pem.replace(/\\n/g, "\n");
    } else {
      // Replit collapsed line breaks to spaces — reconstruct PEM
      const headerMatch = pem.match(/^(-----BEGIN [^-]+-+)\s*/);
      const footerMatch = pem.match(/\s*(-----END [^-]+-+)$/);
      if (headerMatch && footerMatch) {
        const header = headerMatch[1].trimEnd().replace(/-*$/, "-----");
        const footer = footerMatch[1].trimStart().replace(/^-*/, "-----");
        const body = pem
          .slice(headerMatch[0].length, pem.length - footerMatch[1].length)
          .replace(/\s+/g, "");
        const lines = body.match(/.{1,64}/g) ?? [];
        pem = `${header}\n${lines.join("\n")}\n${footer}\n`;
      }
    }
  }

  // Step 2: CDP SDK uses jose's importPKCS8 which needs "-----BEGIN PRIVATE KEY-----"
  // (PKCS#8). The CDP portal exports SEC1 format ("-----BEGIN EC PRIVATE KEY-----").
  // Convert automatically using Node's built-in crypto module.
  if (pem.includes("BEGIN EC PRIVATE KEY")) {
    try {
      const key = createPrivateKey(pem);
      pem = key.export({ type: "pkcs8", format: "pem" }) as string;
    } catch {
      // leave as-is; SDK will surface a clearer error
    }
  }

  return pem;
}

export function getCdpClient(): CdpClient {
  // Always create a fresh client — never cache, so env var changes (deploys)
  // are picked up immediately and stale credentials can't get stuck.
  return new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: normalizePemKey(process.env.CDP_API_KEY_SECRET),
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
