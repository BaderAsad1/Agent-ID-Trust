/**
 * CLI script: Reconcile an on-chain handle with the DB.
 *
 * Usage:
 *   npx tsx artifacts/api-server/scripts/reconcile-handle.ts <handle>
 *
 * Required env vars (same as the API server):
 *   DATABASE_URL          — Postgres connection string
 *   ONCHAIN_MINTING_ENABLED=true
 *   BASE_RPC_URL          — Base (or Base Sepolia) RPC endpoint
 *   BASE_AGENTID_REGISTRAR — Registrar proxy contract address
 *   BASE_ERC8004_REGISTRY  — ERC-8004 registry address (optional, for metadata)
 *
 * Running against production:
 *   Set the above env vars to production values, then run the command. The script
 *   is idempotent: running it twice on the same handle updates chain-related fields
 *   without creating duplicates or overwriting unrelated data.
 *
 * Example:
 *   DATABASE_URL="postgres://..." \
 *   ONCHAIN_MINTING_ENABLED=true \
 *   BASE_RPC_URL="https://mainnet.base.org" \
 *   BASE_AGENTID_REGISTRAR="0x..." \
 *   npx tsx artifacts/api-server/scripts/reconcile-handle.ts launchsmoke20260403
 */
import { reconcileOnChainHandle } from "../src/services/reconcile-handle";

async function main() {
  const handle = process.argv[2];
  if (!handle) {
    console.error("Usage: npx tsx reconcile-handle.ts <handle>");
    console.error("Example: npx tsx reconcile-handle.ts launchsmoke20260403");
    process.exit(1);
  }

  console.log(`Reconciling handle: "${handle}" ...`);

  try {
    const result = await reconcileOnChainHandle(handle);
    console.log("\nReconciliation result:");
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nAction taken: ${result.action}`);
    console.log(`Agent ID (DB): ${result.agentId}`);
    console.log(`On-chain agentId: ${result.onChainAgentId}`);
    console.log(`On-chain owner: ${result.onChainOwner}`);
    console.log(`Active: ${result.active}, Expired: ${result.expired}`);
    console.log("\nReconciliation complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nReconciliation failed: ${message}`);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
