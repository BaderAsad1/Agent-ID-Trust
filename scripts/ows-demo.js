#!/usr/bin/env node
/**
 * OWS Wallet End-to-End Demo Script
 *
 * Demonstrates the full OWS wallet lifecycle:
 *   1. Create wallet via SDK (createWallet)
 *   2. POST /api/v1/agents/:id/wallets/ows (register wallet for agent — mirrors EVM address)
 *   3. GET /api/v1/agents/:id/wallets/ows (wallet details)
 *   4. GET /api/v1/resolve/id/:id (public resolve — confirms wallet address mirrored)
 *   5. GET /api/v1/agents/whoami (bootstrap bundle — confirms ows_wallet field)
 *   6. DELETE /api/v1/agents/:id/wallets/ows (remove wallet)
 *
 * Usage:
 *   node scripts/ows-demo.js --sdk-only
 *   AGENT_API_KEY=agk_... AGENT_ID=<uuid> node scripts/ows-demo.js
 *
 * Environment variables:
 *   OWS_VAULT_PATH   Base path for wallet vault directories (default: .ows-vault)
 *   API_URL          API server base URL (default: http://localhost:3000)
 *   AGENT_API_KEY    Agent API key for authenticated calls (from /verify or /activate)
 *   AGENT_ID         Agent UUID
 *
 * Note: Must be run from the workspace root. The OWS SDK is resolved from
 * artifacts/api-server/node_modules via createRequire.
 */

import { createRequire } from "module";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(path.join(__dirname, "../artifacts/api-server/package.json"));
const { createWallet, getWallet, deleteWallet } = require("@open-wallet-standard/core");

const SDK_ONLY = process.argv.includes("--sdk-only");
const API_URL = process.env.API_URL || "http://localhost:3000";
const VAULT_BASE = process.env.OWS_VAULT_PATH || path.join(__dirname, "../.ows-vault");
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const AGENT_ID = process.env.AGENT_ID;

const EVM_PREFIX = "eip155:";
const BASE_MAINNET_CHAIN = "eip155:8453";
const OWS_SDK_PACKAGE = "@open-wallet-standard/core";

function log(step, msg, data) {
  const dataStr = data ? `\n  ${JSON.stringify(data, null, 2).split("\n").join("\n  ")}` : "";
  console.log(`\n[${step}] ${msg}${dataStr}`);
}

function logSkip(step, reason) {
  console.log(`\n[${step}] SKIP: ${reason}`);
}

function logError(step, msg, err) {
  console.error(`\n[${step}] ERROR: ${msg}`);
  if (err) console.error("  ", err?.message || String(err));
}

async function apiCall(method, urlPath, body, apiKey) {
  const url = `${API_URL}${urlPath}`;
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "OWS-Demo/1.0",
    ...(apiKey ? { "X-Agent-Key": apiKey } : {}),
  };
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  const demoId = randomBytes(4).toString("hex");
  const agentVaultPath = path.join(VAULT_BASE, `demo-${demoId}`);
  const walletName = `ows-demo-${demoId}`;

  console.log("=".repeat(60));
  console.log(" OWS Wallet End-to-End Demo");
  console.log("=".repeat(60));
  console.log(`  Demo ID:     ${demoId}`);
  console.log(`  Vault Path:  ${agentVaultPath}`);
  console.log(`  API URL:     ${API_URL}`);
  console.log(`  Mode:        ${SDK_ONLY ? "SDK only" : AGENT_API_KEY ? "Authenticated" : "Public (limited)"}`);

  let walletCreated = false;
  let walletAddress = null;
  let walletId = null;
  let caip10Accounts = [];
  const agentId = AGENT_ID || null;
  const apiKey = AGENT_API_KEY || null;

  try {
    // Step 1: Create wallet via OWS SDK
    log("1/6", "Creating OWS wallet via SDK", { walletName, vaultPath: agentVaultPath });
    const walletInfo = createWallet(walletName, undefined, undefined, agentVaultPath);
    walletCreated = true;
    walletId = walletInfo.id;

    const evmAccount = walletInfo.accounts.find((a) => a.chainId === BASE_MAINNET_CHAIN)
      ?? walletInfo.accounts.find((a) => a.chainId.startsWith(EVM_PREFIX));
    walletAddress = evmAccount?.address;

    if (!walletAddress) {
      throw new Error(`No EVM account found. Chains: ${walletInfo.accounts.map(a => a.chainId).join(", ")}`);
    }

    caip10Accounts = walletInfo.accounts.map((a) => `${a.chainId}:${a.address}`);

    log("1/6 OK", "OWS wallet created via SDK", {
      walletId: walletInfo.id,
      evmAddress: walletAddress,
      evmChain: evmAccount.chainId,
      totalAccounts: walletInfo.accounts.length,
      caip10Preview: caip10Accounts[0],
    });

    const verifyInfo = getWallet(walletName, agentVaultPath);
    log("1/6 VERIFIED", "Wallet confirmed in vault", { id: verifyInfo.id, name: verifyInfo.name });

    if (SDK_ONLY) {
      log("SDK-ONLY", "Skipping API calls (--sdk-only flag)");
      deleteWallet(walletName, agentVaultPath);
      walletCreated = false;
      log("1/6 CLEANUP", "Demo vault wallet removed");
      console.log("\n[DONE] SDK-only demo complete");
      return;
    }

    // Step 2: POST OWS wallet registration (requires agent auth)
    if (apiKey && agentId) {
      log("2/6", `POST /api/v1/agents/${agentId}/wallets/ows`);
      const postRes = await apiCall("POST", `/api/v1/agents/${agentId}/wallets/ows`, {
        walletId,
        accounts: caip10Accounts,
      }, apiKey);
      if (postRes.ok) {
        log("2/6 OK", "OWS wallet registered", postRes.data);
      } else {
        log("2/6 WARN", `POST returned ${postRes.status}`, postRes.data);
      }
    } else {
      logSkip("2/6 POST", "Requires AGENT_API_KEY + AGENT_ID");
      log("2/6 INFO", "To obtain credentials: POST /api/v1/programmatic/agents/register then POST /verify");
      log("2/6 INFO", "Then: AGENT_API_KEY=agk_... AGENT_ID=<uuid> node scripts/ows-demo.js");
    }

    // Step 3: GET OWS wallet details (requires agent auth)
    if (apiKey && agentId) {
      log("3/6", `GET /api/v1/agents/${agentId}/wallets/ows`);
      const getRes = await apiCall("GET", `/api/v1/agents/${agentId}/wallets/ows`, null, apiKey);
      if (getRes.ok) {
        log("3/6 OK", "OWS wallet details", getRes.data);
      } else {
        log("3/6 WARN", `GET returned ${getRes.status}`, getRes.data);
      }
    } else {
      logSkip("3/6 GET", "Requires AGENT_API_KEY + AGENT_ID");
    }

    // Step 4: Resolve agent identity (public endpoint)
    if (agentId) {
      log("4/6", `GET /api/v1/resolve/id/${agentId}`);
      const resolveRes = await apiCall("GET", `/api/v1/resolve/id/${agentId}`);
      if (resolveRes.ok) {
        log("4/6 OK", "Agent resolved", {
          agentId: resolveRes.data.agentId ?? resolveRes.data.id,
          walletAddress: resolveRes.data.walletAddress ?? resolveRes.data.wallet?.address ?? "(not yet provisioned)",
          walletNetwork: resolveRes.data.walletNetwork ?? resolveRes.data.wallet?.network ?? "base",
        });
      } else {
        log("4/6 WARN", `Resolve returned ${resolveRes.status}`, resolveRes.data);
      }
    } else {
      logSkip("4/6 RESOLVE", "No AGENT_ID set — set AGENT_ID env var");
    }

    // Step 5: Bootstrap bundle — includes ows_wallet field
    if (apiKey) {
      log("5/6", "GET /api/v1/agents/whoami (bootstrap with ows_wallet)");
      const bootstrapRes = await apiCall("GET", `/api/v1/agents/whoami`, null, apiKey);
      if (bootstrapRes.ok) {
        const owsWallet = bootstrapRes.data.ows_wallet;
        log("5/6 OK", "Bootstrap ows_wallet field", {
          standard: owsWallet?.standard ?? null,
          sdkPackage: owsWallet?.sdkPackage ?? null,
          address: owsWallet?.address ?? "(not yet provisioned)",
          network: owsWallet?.network ?? null,
          registeredAt: owsWallet?.registeredAt ?? null,
        });
      } else {
        log("5/6 WARN", `Bootstrap returned ${bootstrapRes.status}`, bootstrapRes.data);
      }
    } else {
      logSkip("5/6 BOOTSTRAP", "Requires AGENT_API_KEY");
    }

    // Step 6: DELETE OWS wallet
    if (apiKey && agentId) {
      log("6/6", `DELETE /api/v1/agents/${agentId}/wallets/ows`);
      const deleteRes = await apiCall("DELETE", `/api/v1/agents/${agentId}/wallets/ows`, null, apiKey);
      if (deleteRes.ok) {
        log("6/6 OK", "OWS wallet deleted via API", deleteRes.data);
      } else if (deleteRes.status === 404) {
        log("6/6 INFO", "No OWS wallet found (nothing to delete)");
      } else {
        log("6/6 WARN", `DELETE returned ${deleteRes.status}`, deleteRes.data);
      }
    } else {
      logSkip("6/6 DELETE", "Requires AGENT_API_KEY + AGENT_ID");
    }

  } catch (err) {
    logError("DEMO", "Unexpected error", err);
    process.exitCode = 1;
  } finally {
    if (walletCreated) {
      try {
        deleteWallet(walletName, agentVaultPath);
        log("CLEANUP", "Demo SDK vault wallet removed");
      } catch {
        log("CLEANUP WARN", "Could not remove demo vault wallet");
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(" OWS Demo Summary");
  console.log("=".repeat(60));
  console.log(`  SDK wallet created:  yes (cleaned up after demo)`);
  console.log(`  EVM Address:         ${walletAddress ?? "(none)"}`);
  console.log(`  Network:             Base Mainnet (eip155:8453)`);
  console.log(`  Wallet ID:           ${walletId ?? "(none)"}`);
  console.log(`  Agent ID:            ${agentId ?? "(not set)"}`);
  console.log(`  SDK Package:         ${OWS_SDK_PACKAGE}`);
  console.log(`  Vault Base:          ${VAULT_BASE}`);
  console.log("=".repeat(60));
  console.log("\nFor full authenticated demo:");
  console.log("  AGENT_API_KEY=agk_... AGENT_ID=<uuid> node scripts/ows-demo.js");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
