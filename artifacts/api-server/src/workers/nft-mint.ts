import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { mintHandleOnBase, BaseChainError } from "../services/chains/base";
import { sql } from "drizzle-orm";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_RETRIES = 3;

let timer: ReturnType<typeof setInterval> | null = null;

function isBaseEnabled(): boolean {
  return !!(
    process.env.BASE_RPC_URL &&
    process.env.BASE_MINTER_PRIVATE_KEY &&
    process.env.BASE_HANDLE_CONTRACT &&
    process.env.BASE_PLATFORM_WALLET
  );
}

async function processPendingMints(): Promise<void> {
  if (!isBaseEnabled()) {
    return;
  }

  const pendingAgents = await db
    .select({
      id: agentsTable.id,
      handle: agentsTable.handle,
      chainMints: agentsTable.chainMints,
      nftStatus: agentsTable.nftStatus,
    })
    .from(agentsTable)
    .where(
      eq(agentsTable.nftStatus, "pending_mint"),
    )
    .limit(50);

  if (pendingAgents.length === 0) return;

  logger.info({ count: pendingAgents.length }, "[nft-mint] Processing pending mints");

  for (const agent of pendingAgents) {
    if (!agent.handle) {
      logger.warn({ agentId: agent.id }, "[nft-mint] Agent has no handle, skipping");
      await db
        .update(agentsTable)
        .set({ nftStatus: "none", updatedAt: new Date() })
        .where(eq(agentsTable.id, agent.id));
      continue;
    }

    const chainMints = (agent.chainMints as Record<string, unknown>) || {};
    const mintAttempts = ((chainMints.mintAttempts as number) || 0);

    if (mintAttempts >= MAX_RETRIES) {
      logger.error({ agentId: agent.id, handle: agent.handle, mintAttempts }, "[nft-mint] Max retries exceeded, marking as failed");
      await db
        .update(agentsTable)
        .set({
          nftStatus: "mint_failed",
          chainMints: {
            ...chainMints,
            failedAt: new Date().toISOString(),
            failureReason: "Max retries exceeded",
          },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));
      continue;
    }

    try {
      logger.info({ agentId: agent.id, handle: agent.handle, attempt: mintAttempts + 1 }, "[nft-mint] Attempting to mint handle NFT");

      await db
        .update(agentsTable)
        .set({
          chainMints: {
            ...chainMints,
            mintAttempts: mintAttempts + 1,
            lastAttemptAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));

      const result = await mintHandleOnBase(agent.handle);

      await db
        .update(agentsTable)
        .set({
          nftStatus: "minted",
          onChainTokenId: result.tokenId.toString(),
          onChainTxHash: result.txHash,
          chainMints: {
            base: {
              tokenId: result.tokenId.toString(),
              txHash: result.txHash,
              contract: result.contract,
              mintedAt: new Date().toISOString(),
              custodian: "platform",
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));

      logger.info(
        { agentId: agent.id, handle: agent.handle, tokenId: result.tokenId.toString(), txHash: result.txHash },
        "[nft-mint] Handle minted successfully",
      );
    } catch (err) {
      const isAlreadyMinted = err instanceof BaseChainError && err.code === "ALREADY_MINTED";

      if (isAlreadyMinted) {
        logger.info({ agentId: agent.id, handle: agent.handle }, "[nft-mint] Handle already minted on chain, syncing");
        const { resolveHandleTokenId } = await getTokenIdFromChain(agent.handle);
        await db
          .update(agentsTable)
          .set({
            nftStatus: "minted",
            onChainTokenId: resolveHandleTokenId?.toString(),
            chainMints: {
              ...chainMints,
              base: {
                tokenId: resolveHandleTokenId?.toString(),
                mintedAt: new Date().toISOString(),
                custodian: "platform",
                note: "Already minted on chain",
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, agent.id));
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, agentId: agent.id, handle: agent.handle, attempt: mintAttempts + 1 }, "[nft-mint] Mint failed");

        await db
          .update(agentsTable)
          .set({
            chainMints: {
              ...chainMints,
              mintAttempts: mintAttempts + 1,
              lastError: errorMsg,
              lastAttemptAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, agent.id));

        if (mintAttempts + 1 >= MAX_RETRIES) {
          await db
            .update(agentsTable)
            .set({
              nftStatus: "mint_failed",
              updatedAt: new Date(),
            })
            .where(eq(agentsTable.id, agent.id));
        }
      }
    }
  }
}

async function getTokenIdFromChain(handle: string): Promise<{ resolveHandleTokenId: bigint | null }> {
  try {
    const { createPublicClient, http, parseAbi } = await import("viem");
    const { base } = await import("viem/chains");
    const { AGENT_ID_HANDLE_ABI, getBaseConfig } = await import("../services/chains/base");

    const { rpcUrl, contractAddress } = getBaseConfig();
    if (!rpcUrl || !contractAddress) return { resolveHandleTokenId: null };

    const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const tokenId = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: AGENT_ID_HANDLE_ABI,
      functionName: "resolveHandle",
      args: [handle],
    }) as bigint;

    return { resolveHandleTokenId: tokenId };
  } catch {
    return { resolveHandleTokenId: null };
  }
}

export function startNftMintWorker(): void {
  if (timer) return;

  logger.info("[nft-mint] Starting NFT mint worker (60s polling)");

  processPendingMints().catch(err => {
    logger.error({ err }, "[nft-mint] Initial mint pass failed");
  });

  timer = setInterval(() => {
    processPendingMints().catch(err => {
      logger.error({ err }, "[nft-mint] Mint pass failed");
    });
  }, POLL_INTERVAL_MS);
}

export function stopNftMintWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("[nft-mint] NFT mint worker stopped");
  }
}
