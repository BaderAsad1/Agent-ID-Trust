import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentOwsWalletAccountsTable } from "@workspace/db/schema";

interface ParsedCaip10 {
  caip10: string;
  namespace: string;
  chainReference: string;
  address: string;
  addressLower: string;
}

function parseCaip10(account: string): ParsedCaip10 | null {
  if (typeof account !== "string") return null;
  const parts = account.split(":");
  if (parts.length !== 3) return null;
  const [namespace, chainReference, address] = parts;
  if (!namespace || !chainReference || !address) return null;
  return {
    caip10: account,
    namespace,
    chainReference,
    address,
    addressLower: address.toLowerCase(),
  };
}

/**
 * Sync the normalized agent_ows_wallet_accounts table for a single OWS wallet.
 * Replaces the wallet's prior rows with one row per valid CAIP-10 account string.
 * Non-CAIP-10 entries (e.g. raw addresses from legacy provisionOwsWallet) are
 * silently skipped.
 *
 * Wrapped in a transaction so partial failures cannot leave stale rows behind.
 */
export async function syncOwsWalletAccounts(
  agentId: string,
  owsWalletId: string,
  accounts: readonly string[],
): Promise<{ inserted: number }> {
  const parsed = accounts
    .map(parseCaip10)
    .filter((p): p is ParsedCaip10 => p !== null);

  // Deduplicate within this call by caip10 (the unique-index key alongside agent_id).
  const seen = new Set<string>();
  const unique = parsed.filter((p) => {
    if (seen.has(p.caip10)) return false;
    seen.add(p.caip10);
    return true;
  });

  await db.transaction(async (tx) => {
    await tx
      .delete(agentOwsWalletAccountsTable)
      .where(eq(agentOwsWalletAccountsTable.owsWalletId, owsWalletId));

    if (unique.length === 0) return;

    await tx.insert(agentOwsWalletAccountsTable).values(
      unique.map((p) => ({
        agentId,
        owsWalletId,
        caip10: p.caip10,
        namespace: p.namespace,
        chainReference: p.chainReference,
        address: p.address,
        addressLower: p.addressLower,
      })),
    );
  });

  return { inserted: unique.length };
}
