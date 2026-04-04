import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { AGENT_ID_HANDLE_ABI, getBaseConfig } from "../services/chains/base";

/**
 * Normalise chainRegistrations to a mutable array regardless of whether it was
 * stored as an array [{chain,...}] or an object {base:{...}}.
 *
 * For object form, the key is the chain label. If the nested value lacks a
 * `chain` field the key is injected so callers can use `r.chain` uniformly.
 */
function normaliseChainRegs(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) {
    return (raw as Array<unknown>).filter(
      (e): e is Record<string, unknown> => !!e && typeof e === "object",
    );
  }
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => !!v && typeof v === "object")
    .map(([key, v]) => {
      const entry = v as Record<string, unknown>;
      return entry.chain ? entry : { ...entry, chain: key };
    });
}

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

    // Real AgentIDRegistrar event shape:
    //   HandleTransferred(string handle, uint256 indexed agentId, address indexed from, address indexed to)
    const logs = await publicClient.getLogs({
      address: registrarAddress as `0x${string}`,
      event: {
        type: "event",
        name: "HandleTransferred",
        inputs: [
          { type: "string", name: "handle", indexed: false },
          { type: "uint256", name: "agentId", indexed: true },
          { type: "address", name: "from", indexed: true },
          { type: "address", name: "to", indexed: true },
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
      // agentId here is the registrar's on-chain agentId (ERC-8004 tokenId), not the DB UUID
      const onChainAgentId = (log.args.agentId as bigint).toString();
      const from = log.args.from as string;
      const to = log.args.to as string;
      const handle = log.args.handle as string;
      const txHash = log.transactionHash;

      try {
        // Lookup by handle (canonical registrar key extracted from HandleTransferred event).
        // handle is the primary key on-chain so there is no secondary fallback needed.
        const agent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.handle, handle),
          columns: { id: true, userId: true, onChainOwner: true, chainRegistrations: true, nftStatus: true },
        });

        if (!agent) {
          logger.warn({ onChainAgentId, handle, txHash }, "[nft-transfer-detector] No agent found for handle, skipping");
          continue;
        }

        const { agentsTable: agentsTableInner } = await import("@workspace/db/schema");
        const agentWithWallet = await db.query.agentsTable.findFirst({
          where: eq(agentsTableInner.walletAddress, to.toLowerCase()),
          columns: { id: true, userId: true },
        });
        const newOwnerUser = agentWithWallet ? { id: agentWithWallet.userId } : null;

        const disputeWindowEnd = new Date(Date.now() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        // Normalise to array regardless of whether stored as object or array form
        const chainRegs = normaliseChainRegs(agent.chainRegistrations);
        const existingBaseIdx = chainRegs.findIndex((r) => r.chain === "base" || r.chain === "base-sepolia");
        const existingBase: Record<string, unknown> = existingBaseIdx >= 0 ? chainRegs[existingBaseIdx] : {};

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

          logger.info({ agentId: agent.id, handle, onChainAgentId, to, txHash }, "[nft-transfer-detector] Secondary transfer to known user recorded");
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
            { agentId: agent.id, handle, onChainAgentId, from, to, txHash, disputeWindowEnd },
            "[nft-transfer-detector] Secondary transfer to unknown address — set pending_claim with 7-day dispute window",
          );
        }
      } catch (err) {
        logger.error({ err, onChainAgentId, handle, txHash }, "[nft-transfer-detector] Failed to process transfer event");
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
