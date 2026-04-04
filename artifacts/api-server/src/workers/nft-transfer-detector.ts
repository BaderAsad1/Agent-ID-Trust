import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { AGENT_ID_HANDLE_ABI, getBaseConfig } from "../services/chains/base";

const POLL_INTERVAL_MS = 60 * 1000;
const DISPUTE_WINDOW_DAYS = 7;

let timer: ReturnType<typeof setInterval> | null = null;
let lastCheckedBlock: bigint | null = null;

function isBaseEnabled(): boolean {
  const { rpcUrl, registrarAddress, platformWallet } = getBaseConfig();
  return !!(rpcUrl && registrarAddress && platformWallet);
}

async function detectSecondarySales(): Promise<void> {
  if (!isBaseEnabled()) return;

  const { rpcUrl, registrarAddress, platformWallet } = getBaseConfig();
  if (!rpcUrl || !registrarAddress || !platformWallet) return;

  try {
    const { createPublicClient, http, parseAbi } = await import("viem");
    const { base } = await import("viem/chains");

    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = lastCheckedBlock ? lastCheckedBlock + 1n : currentBlock - 1000n;

    if (fromBlock > currentBlock) {
      lastCheckedBlock = currentBlock;
      return;
    }

    logger.info({ fromBlock: fromBlock.toString(), toBlock: currentBlock.toString() }, "[nft-transfer-detector] Checking for HandleTransferred events");

    const logs = await publicClient.getLogs({
      address: registrarAddress as `0x${string}`,
      event: {
        type: "event",
        name: "HandleTransferred",
        inputs: [
          { type: "address", name: "from", indexed: true },
          { type: "address", name: "to", indexed: true },
          { type: "uint256", name: "tokenId", indexed: true },
          { type: "string", name: "handle", indexed: false },
        ],
      },
      fromBlock,
      toBlock: currentBlock,
    });

    lastCheckedBlock = currentBlock;

    const nonPlatformTransfers = logs.filter(log => {
      const from = (log.args.from as string) || "";
      return from.toLowerCase() !== platformWallet.toLowerCase();
    });

    if (nonPlatformTransfers.length === 0) {
      return;
    }

    logger.info({ count: nonPlatformTransfers.length }, "[nft-transfer-detector] Found secondary sale transfers");

    for (const log of nonPlatformTransfers) {
      const tokenId = (log.args.tokenId as bigint).toString();
      const from = log.args.from as string;
      const to = log.args.to as string;
      const handle = log.args.handle as string;
      const txHash = log.transactionHash;

      try {
        const agent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.onChainTokenId, tokenId),
          columns: { id: true, userId: true, onChainOwner: true, chainRegistrations: true, nftStatus: true },
        });

        if (!agent) {
          logger.warn({ tokenId, handle, txHash }, "[nft-transfer-detector] No agent found for tokenId, skipping");
          continue;
        }

        const { agentsTable: agentsTableInner } = await import("@workspace/db/schema");
        const agentWithWallet = await db.query.agentsTable.findFirst({
          where: eq(agentsTableInner.walletAddress, to.toLowerCase()),
          columns: { id: true, userId: true },
        });
        const newOwnerUser = agentWithWallet ? { id: agentWithWallet.userId } : null;

        const disputeWindowEnd = new Date(Date.now() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const chainRegs = (agent.chainRegistrations as Record<string, unknown>[]) || [];
        const existingBaseIdx = chainRegs.findIndex((r: Record<string, unknown>) => r.chain === "base" || r.chain === "base-sepolia");
        const existingBase = existingBaseIdx >= 0 ? (chainRegs[existingBaseIdx] as Record<string, unknown>) : {};

        const updatedBaseReg = {
          ...existingBase,
          chain: existingBase.chain || "base",
          custodian: "user",
          ownerWallet: to.toLowerCase(),
          lastTransferTx: txHash,
          lastTransferAt: new Date().toISOString(),
        };

        const updatedRegs = [...chainRegs];
        if (existingBaseIdx >= 0) {
          updatedRegs[existingBaseIdx] = updatedBaseReg;
        } else {
          updatedRegs.push(updatedBaseReg);
        }

        if (newOwnerUser) {
          await db
            .update(agentsTable)
            .set({
              onChainOwner: to.toLowerCase(),
              nftStatus: "minted",
              chainRegistrations: updatedRegs,
              updatedAt: new Date(),
            })
            .where(eq(agentsTable.id, agent.id));

          logger.info({ agentId: agent.id, handle, tokenId, to, txHash }, "[nft-transfer-detector] Secondary transfer to known user recorded");
        } else {
          const pendingBaseReg = {
            ...updatedBaseReg,
            disputeWindowEnd: disputeWindowEnd.toISOString(),
            pendingClaimSince: new Date().toISOString(),
          };
          const pendingRegs = [...chainRegs];
          if (existingBaseIdx >= 0) {
            pendingRegs[existingBaseIdx] = pendingBaseReg;
          } else {
            pendingRegs.push(pendingBaseReg);
          }

          await db
            .update(agentsTable)
            .set({
              onChainOwner: to.toLowerCase(),
              nftStatus: "pending_claim",
              chainRegistrations: pendingRegs,
              updatedAt: new Date(),
            })
            .where(eq(agentsTable.id, agent.id));

          logger.info(
            { agentId: agent.id, handle, tokenId, from, to, txHash, disputeWindowEnd },
            "[nft-transfer-detector] Secondary transfer to unknown address — set pending_claim with 7-day dispute window",
          );
        }
      } catch (err) {
        logger.error({ err, tokenId, handle, txHash }, "[nft-transfer-detector] Failed to process transfer event");
      }
    }
  } catch (err) {
    logger.error({ err }, "[nft-transfer-detector] Failed to fetch HandleTransferred events");
  }
}

export function startNftTransferDetector(): void {
  if (timer) return;

  if (process.env.NFT_TRANSFER_DETECTOR_ENABLED !== "true") {
    logger.info("[nft-transfer-detector] Disabled (set NFT_TRANSFER_DETECTOR_ENABLED=true to enable)");
    return;
  }

  logger.info("[nft-transfer-detector] Starting NFT transfer detector (60s polling)");

  detectSecondarySales().catch(err => {
    logger.error({ err }, "[nft-transfer-detector] Initial detection pass failed");
  });

  timer = setInterval(() => {
    detectSecondarySales().catch(err => {
      logger.error({ err }, "[nft-transfer-detector] Detection pass failed");
    });
  }, POLL_INTERVAL_MS);
}

export function stopNftTransferDetector(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("[nft-transfer-detector] NFT transfer detector stopped");
  }
}
