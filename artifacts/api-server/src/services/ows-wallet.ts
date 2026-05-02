import { createWallet, deleteWallet } from "@open-wallet-standard/core";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentOwsWalletsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { syncOwsWalletAccounts } from "./ows-wallet-accounts";
import path from "path";

const OWS_SDK_PACKAGE = "@open-wallet-standard/core";
const EVM_CHAIN_PREFIX = "eip155:";

function getEvmAddress(accounts: Array<{ chainId: string; address: string }>): string | undefined {
  const baseMainnet = accounts.find((a) => a.chainId === "eip155:8453");
  if (baseMainnet) return baseMainnet.address;
  const evm = accounts.find((a) => a.chainId.startsWith(EVM_CHAIN_PREFIX));
  return evm?.address;
}

function getVaultPath(agentId: string): string {
  const base = process.env.OWS_VAULT_PATH || ".ows-vault";
  return path.join(base, agentId);
}

export interface OwsWalletResult {
  walletId: string;
  address: string;
  network: string;
  accounts: string[];
  provisionedAt: Date;
}

export async function provisionOwsWallet(
  agentId: string,
  userId: string,
): Promise<OwsWalletResult | null> {
  const vaultPath = getVaultPath(agentId);
  const walletName = `aid-${agentId}`;

  logger.info({ agentId, vaultPath }, "[ows-wallet] provisioning OWS wallet");

  try {
    const existing = await db.query.agentOwsWalletsTable.findFirst({
      where: eq(agentOwsWalletsTable.agentId, agentId),
    });

    if (existing) {
      logger.info({ agentId, address: existing.address }, "[ows-wallet] wallet already exists, skipping");
      return {
        walletId: existing.walletId ?? existing.id,
        address: existing.address,
        network: existing.network,
        accounts: (existing.accounts as string[]) || [],
        provisionedAt: existing.provisionedAt ?? existing.createdAt,
      };
    }

    const walletInfo = createWallet(walletName, undefined, undefined, vaultPath);

    const address = getEvmAddress(walletInfo.accounts);
    if (!address) {
      logger.error({ agentId, accounts: walletInfo.accounts }, "[ows-wallet] no EVM account found in wallet");
      return null;
    }
    // Store accounts as CAIP-10 strings ("eip155:8453:0x...") so they can be
    // backfilled into the normalized agent_ows_wallet_accounts table by chain
    // namespace + lowercased address. Older rows that pre-date this change may
    // still contain raw addresses; the backfill step in scripts/post-merge.sh
    // skips those (they fail the 3-part CAIP-10 split).
    const accountCaip10s = walletInfo.accounts.map((a) => `${a.chainId}:${a.address}`);
    const now = new Date();

    const inserted = await db
      .insert(agentOwsWalletsTable)
      .values({
        agentId,
        userId,
        walletId: walletInfo.id,
        network: "base",
        address,
        accounts: accountCaip10s,
        isSelfCustodial: true,
        status: "active",
        provisionedAt: now,
      })
      .returning({ id: agentOwsWalletsTable.id });

    const owsWalletRowId = inserted[0]?.id;
    if (owsWalletRowId) {
      await syncOwsWalletAccounts(agentId, owsWalletRowId, accountCaip10s);
    }

    await db.update(agentsTable).set({
      walletAddress: address,
      walletNetwork: "base",
      walletIsSelfCustodial: true,
      walletProvisionedAt: now,
      updatedAt: now,
    }).where(eq(agentsTable.id, agentId));

    logger.info({ agentId, walletId: walletInfo.id, address }, "[ows-wallet] OWS wallet provisioned successfully");

    return {
      walletId: walletInfo.id,
      address,
      network: "base",
      accounts: accountCaip10s,
      provisionedAt: now,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, error: msg }, "[ows-wallet] failed to provision OWS wallet");
    throw err;
  }
}

export async function getOwsWallet(agentId: string): Promise<{
  registered: true;
  walletId: string;
  address: string;
  network: string;
  accounts: string[];
  standard: string;
  sdkPackage: string;
  registeredAt: Date;
} | { registered: false }> {
  const record = await db.query.agentOwsWalletsTable.findFirst({
    where: eq(agentOwsWalletsTable.agentId, agentId),
  });

  if (!record) {
    return { registered: false };
  }

  return {
    registered: true,
    walletId: record.walletId ?? record.id,
    address: record.address,
    network: record.network,
    accounts: (record.accounts as string[]) || [],
    standard: "OWS",
    sdkPackage: OWS_SDK_PACKAGE,
    registeredAt: record.provisionedAt ?? record.createdAt,
  };
}

export async function deleteOwsWallet(agentId: string): Promise<{ deleted: boolean }> {
  const record = await db.query.agentOwsWalletsTable.findFirst({
    where: eq(agentOwsWalletsTable.agentId, agentId),
  });

  if (!record) {
    return { deleted: false };
  }

  const vaultPath = getVaultPath(agentId);
  const walletName = `aid-${agentId}`;

  try {
    deleteWallet(walletName, vaultPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ agentId, walletName, error: msg }, "[ows-wallet] vault delete failed (may already be removed), continuing with DB cleanup");
  }

  await db.delete(agentOwsWalletsTable).where(eq(agentOwsWalletsTable.agentId, agentId));

  await db.update(agentsTable).set({
    walletAddress: null,
    walletNetwork: null,
    walletIsSelfCustodial: false,
    walletProvisionedAt: null,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  logger.info({ agentId }, "[ows-wallet] OWS wallet deleted");

  return { deleted: true };
}
