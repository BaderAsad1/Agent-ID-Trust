import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, nftAuditLogTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { registerOnChain, BaseChainError } from "../services/chains/base";
import { getHandleTier } from "../services/handle";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_RETRIES = 3;

let timer: ReturnType<typeof setInterval> | null = null;

function isOnchainMintingEnabled(): boolean {
  const v = process.env.ONCHAIN_MINTING_ENABLED;
  return v === "true" || v === "1";
}

function isRegistrarConfigured(): boolean {
  return !!(
    process.env.BASE_RPC_URL &&
    process.env.BASE_MINTER_PRIVATE_KEY &&
    process.env.BASE_AGENTID_REGISTRAR &&
    process.env.BASE_PLATFORM_WALLET
  );
}

/**
 * Extract the anchor attempt counter stored in agent metadata.
 * chainRegistrations is reserved for canonical registration records only.
 */
function getAnchorAttempts(metadata: unknown): number {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, unknown>).anchorAttempts;
    return typeof v === "number" ? v : 0;
  }
  return 0;
}

export async function processPendingAnchors(): Promise<void> {
  if (!isOnchainMintingEnabled()) {
    logger.debug("[nft-mint] ONCHAIN_MINTING_ENABLED=false — skipping processPendingAnchors");
    return;
  }
  if (!isRegistrarConfigured()) {
    logger.debug("[nft-mint] Registrar not configured — skipping processPendingAnchors");
    return;
  }

  const pendingAgents = await db
    .select({
      id: agentsTable.id,
      handle: agentsTable.handle,
      handleTier: agentsTable.handleTier,
      handleExpiresAt: agentsTable.handleExpiresAt,
      nftStatus: agentsTable.nftStatus,
      metadata: agentsTable.metadata,
    })
    .from(agentsTable)
    .where(
      eq(agentsTable.nftStatus, "pending_anchor"),
    )
    .limit(10);

  if (pendingAgents.length === 0) return;

  logger.info({ count: pendingAgents.length }, "[nft-mint] Processing pending anchors");

  for (const agent of pendingAgents) {
    if (!agent.handle) {
      logger.warn({ agentId: agent.id }, "[nft-mint] Agent has no handle, skipping");
      await db
        .update(agentsTable)
        .set({ nftStatus: "none", updatedAt: new Date() })
        .where(eq(agentsTable.id, agent.id));
      continue;
    }

    const anchorAttempts = getAnchorAttempts(agent.metadata);

    if (anchorAttempts >= MAX_RETRIES) {
      logger.error({ agentId: agent.id, handle: agent.handle, anchorAttempts }, "[nft-mint] Max retries exceeded, marking as anchor_failed");
      await db
        .update(agentsTable)
        .set({
          nftStatus: "anchor_failed",
          metadata: {
            ...((agent.metadata as Record<string, unknown>) ?? {}),
            anchorFailedAt: new Date().toISOString(),
            anchorFailureReason: "Max retries exceeded",
          },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));
      continue;
    }

    // Increment attempt counter in metadata before attempting
    await db
      .update(agentsTable)
      .set({
        metadata: sql`jsonb_set(
          COALESCE(${agentsTable.metadata}, '{}'),
          '{anchorAttempts}',
          to_jsonb(COALESCE((${agentsTable.metadata}->>'anchorAttempts')::int, 0) + 1)
        )`,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    try {
      logger.info({ agentId: agent.id, handle: agent.handle, attempt: anchorAttempts + 1 }, "[nft-mint] Attempting to anchor handle via AgentIDRegistrar");

      const tier = agent.handleTier ?? getHandleTier(agent.handle).tier;
      const expiresAt = agent.handleExpiresAt ?? (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return d;
      })();

      const result = await registerOnChain(agent.handle, tier, expiresAt);

      if (!result) {
        logger.warn({ agentId: agent.id, handle: agent.handle }, "[nft-mint] registerOnChain returned null (ONCHAIN_MINTING_ENABLED=false or not configured) — retaining pending_anchor");
        continue;
      }

      // Store canonical chain registration record as array entry.
      // chainRegistrations = [{ chain, agentId, txHash, contractAddress, registeredAt, custodian }]
      const chainRegEntry = {
        chain: result.chain,
        agentId: result.agentId,
        txHash: result.txHash,
        contractAddress: result.contractAddress,
        registeredAt: new Date().toISOString(),
        custodian: "platform",
      };

      // erc8004Registry should store the ERC-8004 registry address (BASE_ERC8004_REGISTRY),
      // not the registrar proxy (BASE_AGENTID_REGISTRAR / result.contractAddress).
      // The registrar proxy address is correctly recorded in chainRegistrations[].contractAddress.
      const registryAddress = process.env.BASE_ERC8004_REGISTRY ?? null;

      await db
        .update(agentsTable)
        .set({
          nftStatus: "active",
          status: "active",
          nftCustodian: "platform",
          erc8004AgentId: result.agentId,
          erc8004Chain: result.chain,
          erc8004Registry: registryAddress,
          chainRegistrations: [chainRegEntry],
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));

      try {
        await db.insert(nftAuditLogTable).values({
          agentId: agent.id,
          handle: agent.handle,
          action: "register",
          chain: "base",
          txHash: result.txHash,
          contractAddress: result.contractAddress,
          custodian: "platform",
          status: "success",
          metadata: { agentId: result.agentId, tier, registeredAt: new Date().toISOString() },
        });
      } catch (auditErr) {
        logger.warn({ auditErr, agentId: agent.id }, "[nft-mint] Failed to write audit log");
      }

      logger.info(
        { agentId: agent.id, handle: agent.handle, erc8004AgentId: result.agentId, txHash: result.txHash },
        "[nft-mint] Handle anchored on-chain via AgentIDRegistrar",
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, agentId: agent.id, handle: agent.handle, attempt: anchorAttempts + 1 }, "[nft-mint] Anchor failed");

      const willRetry = anchorAttempts + 1 < MAX_RETRIES;
      if (!willRetry) {
        await db
          .update(agentsTable)
          .set({
            nftStatus: "anchor_failed",
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, agent.id));
      }

      try {
        await db.insert(nftAuditLogTable).values({
          agentId: agent.id,
          handle: agent.handle,
          action: "register",
          chain: "base",
          status: "failed",
          errorMessage: errorMsg,
          metadata: { attempt: anchorAttempts + 1 },
        });
      } catch {}
    }
  }
}

/** @deprecated Use processPendingAnchors instead. This alias is kept for backwards compatibility. */
export const processPendingMints = processPendingAnchors;

export function startNftMintWorker(): void {
  if (timer) return;

  logger.info("[nft-mint] Starting NFT anchor worker (60s polling, AgentIDRegistrar path)");

  processPendingAnchors().catch(err => {
    logger.error({ err }, "[nft-mint] Initial anchor pass failed");
  });

  timer = setInterval(() => {
    processPendingAnchors().catch(err => {
      logger.error({ err }, "[nft-mint] Anchor pass failed");
    });
  }, POLL_INTERVAL_MS);
}

export function stopNftMintWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("[nft-mint] NFT anchor worker stopped");
  }
}
