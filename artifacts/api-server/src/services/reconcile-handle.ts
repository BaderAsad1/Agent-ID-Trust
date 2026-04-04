/**
 * On-Chain Handle Backfill & Reconciliation
 *
 * Reads on-chain state for a handle via the Base registrar and creates or updates
 * the corresponding DB agent row so public metadata routes work correctly.
 *
 * This is an admin-only operation intended for handles that were minted directly
 * on-chain outside the normal app purchase flow.
 */
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import { agentsTable, usersTable, nftAuditLogTable, agentOwsWalletsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { resolveOnChain, HandleNotRegisteredOnChainError } from "./chains/base";

const SYSTEM_USER_EMAIL = "platform-reconciliation@system.internal";
const SYSTEM_USER_PROVIDER = "system";
const SYSTEM_USER_PROVIDER_ID = "platform-reconciliation";

export interface ReconcileHandleResult {
  action: "created" | "updated" | "skipped";
  agentId: string;
  handle: string;
  onChainAgentId: string;
  onChainOwner: string;
  active: boolean;
  expired: boolean;
  tier: number;
  reconciledAt: string;
  userLinkage: "existing_user" | "system_user";
  linkedUserId: string;
}

/**
 * Attempt to find an existing user account whose wallet matches the on-chain owner.
 *
 * Lookup strategy (in priority order):
 *  1. agentOwsWalletsTable — platform-provisioned or self-custodial wallets linked to users
 *  2. agentsTable.onChainOwner — existing agents with a matching on-chain owner (any agent by that wallet)
 *
 * Returns null when no match is found.
 */
async function findUserByWalletAddress(walletAddress: string): Promise<string | null> {
  const normalizedWallet = walletAddress.toLowerCase();

  const owsWallet = await db.query.agentOwsWalletsTable.findFirst({
    where: sql`lower(${agentOwsWalletsTable.address}) = ${normalizedWallet}`,
    columns: { userId: true },
  });
  if (owsWallet?.userId) {
    logger.info({ wallet: normalizedWallet, userId: owsWallet.userId }, "[reconcile] Matched on-chain owner to user via OWS wallets");
    return owsWallet.userId;
  }

  const agentByOwner = await db.query.agentsTable.findFirst({
    where: sql`lower(${agentsTable.onChainOwner}) = ${normalizedWallet}`,
    columns: { userId: true, ownerUserId: true },
  });
  if (agentByOwner) {
    const userId = agentByOwner.ownerUserId ?? agentByOwner.userId;
    logger.info({ wallet: normalizedWallet, userId }, "[reconcile] Matched on-chain owner to user via existing agent onChainOwner");
    return userId;
  }

  return null;
}

/**
 * Look up or create the system "platform-reconciliation" user.
 * This user is used as the userId for agents whose on-chain owner has no
 * matching user account. It should never be used for real agent management.
 */
async function getOrCreateSystemUser(): Promise<string> {
  const existing = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.provider, SYSTEM_USER_PROVIDER), eq(usersTable.providerId, SYSTEM_USER_PROVIDER_ID)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db.insert(usersTable).values({
    provider: SYSTEM_USER_PROVIDER,
    providerId: SYSTEM_USER_PROVIDER_ID,
    email: SYSTEM_USER_EMAIL,
    emailVerified: false,
    displayName: "Platform Reconciliation (system)",
  }).returning({ id: usersTable.id });

  logger.info({ userId: created.id }, "[reconcile] Created system user for platform reconciliation");
  return created.id;
}

/**
 * Map on-chain numeric tier code to a handleTier string.
 * Tier codes: 1 → premium_3, 2 → premium_4, 3 → standard_5plus
 */
function mapOnChainTier(tierCode: number): string {
  switch (tierCode) {
    case 1: return "premium_3";
    case 2: return "premium_4";
    case 3: return "standard_5plus";
    default: return "standard_5plus";
  }
}

/**
 * Reconcile an on-chain handle with the DB.
 *
 * - If the handle does not exist in the DB: creates a new agent row with truthful
 *   on-chain data. First attempts to find an existing user whose wallet matches the
 *   on-chain owner; falls back to a system "platform-reconciliation" user when no match
 *   exists. No fake user linkage is introduced.
 * - If the handle already exists: updates ONLY chain-related fields (onChainOwner,
 *   nftStatus, erc8004*, chainRegistrations, handleIsOnchain, handleTier, handleStatus,
 *   metadata reconciliation markers). Does NOT overwrite status, isPublic, or any
 *   other unrelated good data on an existing row.
 * - In both cases: writes an NFT audit log entry for traceability.
 * - Idempotent: running reconciliation twice doesn't create duplicates or duplicate
 *   chainRegistrations entries.
 */
export async function reconcileOnChainHandle(handle: string): Promise<ReconcileHandleResult> {
  const normalizedHandle = handle.toLowerCase().trim();

  logger.info({ handle: normalizedHandle }, "[reconcile] Starting on-chain handle reconciliation");

  let onChain: Awaited<ReturnType<typeof resolveOnChain>>;
  try {
    onChain = await resolveOnChain(normalizedHandle);
  } catch (err) {
    if (err instanceof HandleNotRegisteredOnChainError) {
      throw new Error(
        `HANDLE_NOT_REGISTERED: Handle "${normalizedHandle}" is not registered on-chain. ` +
        "Verify the handle was minted on the correct network and registrar contract.",
      );
    }
    throw err;
  }

  if (!onChain) {
    throw new Error(
      `CHAIN_UNAVAILABLE: resolveOnChain returned null for handle "${normalizedHandle}". ` +
      "Ensure ONCHAIN_MINTING_ENABLED=true and the registrar is configured.",
    );
  }

  if (!onChain.active && !onChain.expired) {
    throw new Error(
      `HANDLE_NOT_REGISTERED: Handle "${normalizedHandle}" is not registered on-chain ` +
      `(agentId=${onChain.agentId}, active=${onChain.active}, expired=${onChain.expired}).`,
    );
  }

  const reconciledAt = new Date().toISOString();
  const tierString = mapOnChainTier(onChain.tier);
  const registryAddress = process.env.BASE_ERC8004_REGISTRY ?? null;
  const onChainOwnerNormalized = onChain.nftOwner.toLowerCase();

  const chainRegEntry = {
    chain: "base",
    agentId: onChain.agentId,
    txHash: null,
    contractAddress: process.env.BASE_AGENTID_REGISTRAR ?? null,
    registeredAt: reconciledAt,
    custodian: "external",
    reconciledAt,
  };

  const existing = await db.query.agentsTable.findFirst({
    where: sql`lower(${agentsTable.handle}) = ${normalizedHandle}`,
  });

  let agentId: string;
  let action: "created" | "updated";
  let userLinkage: "existing_user" | "system_user";
  let linkedUserId: string;

  if (!existing) {
    const matchedUserId = await findUserByWalletAddress(onChainOwnerNormalized);

    if (matchedUserId) {
      linkedUserId = matchedUserId;
      userLinkage = "existing_user";
    } else {
      linkedUserId = await getOrCreateSystemUser();
      userLinkage = "system_user";
    }

    agentId = uuidv4();

    await db.insert(agentsTable).values({
      id: agentId,
      userId: linkedUserId,
      handle: normalizedHandle,
      displayName: `${normalizedHandle}.agentid`,
      status: "active",
      isPublic: true,
      onChainOwner: onChainOwnerNormalized,
      nftStatus: "active",
      nftCustodian: "external",
      erc8004AgentId: onChain.agentId,
      erc8004Chain: "base",
      erc8004Registry: registryAddress,
      chainRegistrations: [chainRegEntry],
      handleIsOnchain: true,
      handleTier: tierString,
      handleRegisteredAt: new Date(),
      handleStatus: "active",
      metadata: {
        reconciledAt,
        reconciliationType: "admin_backfill",
        onChainOwner: onChainOwnerNormalized,
        ownershipStatus: userLinkage === "existing_user" ? "claimed" : "external_unclaimed",
      },
    });

    action = "created";
    logger.info(
      { agentId, handle: normalizedHandle, onChainAgentId: onChain.agentId, owner: onChain.nftOwner, userLinkage, linkedUserId },
      "[reconcile] Created new agent row from on-chain state",
    );
  } else {
    agentId = existing.id;
    linkedUserId = existing.ownerUserId ?? existing.userId;

    const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
    const existingOwnershipStatus = typeof existingMeta.ownershipStatus === "string"
      ? existingMeta.ownershipStatus
      : null;
    const existingReconciliationType = typeof existingMeta.reconciliationType === "string"
      ? existingMeta.reconciliationType
      : null;
    userLinkage =
      existingReconciliationType === "admin_backfill" && existingOwnershipStatus === "external_unclaimed"
        ? "system_user"
        : "existing_user";

    const existingRegs = Array.isArray(existing.chainRegistrations) ? existing.chainRegistrations : [];

    const alreadyHasReg = existingRegs.some(
      (r) => typeof r === "object" && r !== null && (r as Record<string, unknown>).agentId === onChain.agentId,
    );

    const updatedRegs = alreadyHasReg
      ? existingRegs
      : [...existingRegs, chainRegEntry];

    await db.update(agentsTable).set({
      onChainOwner: onChainOwnerNormalized,
      nftStatus: "active",
      erc8004AgentId: onChain.agentId,
      erc8004Chain: "base",
      erc8004Registry: registryAddress,
      chainRegistrations: updatedRegs as Record<string, unknown>[],
      handleIsOnchain: true,
      handleTier: tierString,
      handleStatus: "active",
      metadata: {
        ...existingMeta,
        reconciledAt,
        reconciliationType: "admin_backfill",
        onChainOwner: onChainOwnerNormalized,
        ownershipStatus: existingOwnershipStatus ?? "external_unclaimed",
      },
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agentId));

    action = "updated";
    logger.info(
      { agentId, handle: normalizedHandle, onChainAgentId: onChain.agentId, owner: onChain.nftOwner, userLinkage },
      "[reconcile] Updated existing agent row chain-related fields only",
    );
  }

  try {
    await db.insert(nftAuditLogTable).values({
      agentId,
      handle: normalizedHandle,
      action: "reconcile",
      operation: action === "created" ? "backfill_create" : "backfill_update",
      chain: "base",
      txHash: null,
      erc8004AgentId: parseInt(onChain.agentId, 10),
      toAddress: onChainOwnerNormalized,
      custodian: "external",
      status: "success",
      metadata: {
        reconciliationType: "admin_backfill",
        reconciledAt,
        onChainTier: onChain.tier,
        active: onChain.active,
        expired: onChain.expired,
        userLinkage,
      },
    });
  } catch (auditErr) {
    logger.warn(
      { err: auditErr instanceof Error ? auditErr.message : auditErr, agentId, handle: normalizedHandle },
      "[reconcile] NFT audit log insert failed (non-fatal) — reconciliation succeeded but audit record was not written",
    );
  }

  return {
    action,
    agentId,
    handle: normalizedHandle,
    onChainAgentId: onChain.agentId,
    onChainOwner: onChainOwnerNormalized,
    active: onChain.active,
    expired: onChain.expired,
    tier: onChain.tier,
    reconciledAt,
    userLinkage,
    linkedUserId,
  };
}
