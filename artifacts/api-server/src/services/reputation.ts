import { eq, sql, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { env } from "../lib/env";
import { computeTrustScore, determineTier } from "./trust-score";

export interface ReputationSummary {
  score: number;
  tier: string;
  feedbackCount: number;
  chains: string[];
}

function isOnchainEnabled(): boolean {
  return env().ONCHAIN_MINTING_ENABLED === "true" || env().ONCHAIN_MINTING_ENABLED === "1";
}

function parseChainRegistrations(chainMints: Record<string, unknown> | null | undefined): Array<{ chain: string; contractAddress?: string; tokenId?: string; agentId?: string }> {
  if (!chainMints || typeof chainMints !== "object") return [];
  return Object.entries(chainMints)
    .filter(([, v]) => v && typeof v === "object")
    .map(([chain, v]) => ({
      chain,
      ...((v as Record<string, unknown>)),
    }));
}

async function fetchOnchainReputation(
  chain: string,
  _agentId: string | undefined,
): Promise<{ score: number; feedbackCount: number } | null> {
  if (!isOnchainEnabled()) return null;

  try {
    const registrarAddress = process.env.BASE_AGENTID_REGISTRAR;
    const rpcUrl = process.env.BASE_RPC_URL;

    if (!registrarAddress || !rpcUrl || chain !== "base") {
      logger.debug({ chain }, "[reputation] On-chain reputation registry not configured — skipping");
      return null;
    }

    logger.debug({ chain, registrar: registrarAddress }, "[reputation] On-chain reputation fetch stub — registry integration pending deployment");
    return null;
  } catch (err) {
    logger.warn({ err, chain }, "[reputation] Failed to fetch on-chain reputation — skipping chain");
    return null;
  }
}

export async function aggregateTrustScore(agentId: string): Promise<ReputationSummary> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { chainMints: true, trustScore: true, trustTier: true, chainRegistrations: true },
  });

  if (!agent) {
    return { score: 0, tier: "unverified", feedbackCount: 0, chains: [] };
  }

  const chainData = (agent.chainRegistrations as Record<string, unknown> | null) ?? (agent.chainMints as Record<string, unknown> | null);
  const registrations = parseChainRegistrations(chainData);

  if (!isOnchainEnabled() || registrations.length === 0) {
    return {
      score: agent.trustScore ?? 0,
      tier: agent.trustTier ?? "unverified",
      feedbackCount: 0,
      chains: registrations.map(r => r.chain),
    };
  }

  let totalScore = 0;
  let totalFeedback = 0;
  const chains: string[] = [];

  for (const reg of registrations) {
    const onchain = await fetchOnchainReputation(
      reg.chain as string,
      reg.agentId as string | undefined,
    );
    if (onchain) {
      totalScore += onchain.score;
      totalFeedback += onchain.feedbackCount;
      chains.push(reg.chain as string);
    }
  }

  if (chains.length === 0) {
    return {
      score: agent.trustScore ?? 0,
      tier: agent.trustTier ?? "unverified",
      feedbackCount: 0,
      chains: registrations.map(r => r.chain),
    };
  }

  const normalizedScore = Math.round(totalScore / chains.length);

  return {
    score: Math.max(0, Math.min(normalizedScore, 10)),
    tier: agent.trustTier ?? "unverified",
    feedbackCount: totalFeedback,
    chains,
  };
}

async function processAgentReputation(agentId: string): Promise<void> {
  try {
    const { trustScore, trustTier, trustBreakdown } = await computeTrustScore(agentId);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { chainRegistrations: true, chainMints: true, erc8004AgentId: true },
    });

    let finalScore = trustScore;
    let finalTier = trustTier;

    if (isOnchainEnabled() && agent) {
      const chainData = (agent.chainRegistrations as Record<string, unknown> | null) ?? (agent.chainMints as Record<string, unknown> | null);
      const registrations = parseChainRegistrations(chainData);

      if (registrations.length > 0) {
        let onchainTotal = 0;
        let onchainCount = 0;

        for (const reg of registrations) {
          const onchain = await fetchOnchainReputation(reg.chain, reg.agentId ?? agent.erc8004AgentId ?? undefined);
          if (onchain) {
            onchainTotal += onchain.score;
            onchainCount++;
          }
        }

        if (onchainCount > 0) {
          const onchainAvg = Math.round(onchainTotal / onchainCount);
          finalScore = Math.round((trustScore * 0.8) + (onchainAvg * 0.2));
          finalScore = Math.max(0, Math.min(finalScore, 100));
          const agentRecord = await db.query.agentsTable.findFirst({
            where: eq(agentsTable.id, agentId),
          });
          if (agentRecord) {
            finalTier = determineTier(finalScore, agentRecord.verificationStatus === "verified");
          }
        }
      }
    }

    await db.update(agentsTable)
      .set({
        trustScore: finalScore,
        trustTier: finalTier,
        trustBreakdown,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agentId));
  } catch (err) {
    logger.error({ agentId, error: err instanceof Error ? err.message : String(err) }, "[reputation] Error processing agent reputation");
  }
}

const BATCH_SIZE = 50;
let jobTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function runReputationJob(): Promise<void> {
  if (isRunning) {
    logger.debug("[reputation] Job already running — skipping this cycle");
    return;
  }

  isRunning = true;
  const startedAt = Date.now();
  logger.info("[reputation] Starting hourly reputation aggregation job");

  try {
    const activeAgents = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.status, "active"))
      .limit(500);

    if (activeAgents.length === 0) {
      logger.info("[reputation] No active agents to process");
      return;
    }

    logger.info({ count: activeAgents.length }, "[reputation] Processing agents");

    for (let i = 0; i < activeAgents.length; i += BATCH_SIZE) {
      const batch = activeAgents.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(a => processAgentReputation(a.id)));
    }

    const durationMs = Date.now() - startedAt;
    logger.info({ count: activeAgents.length, durationMs }, "[reputation] Hourly aggregation complete");
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "[reputation] Job failed");
  } finally {
    isRunning = false;
  }
}

export function startReputationJob(): void {
  if (jobTimer) {
    logger.warn("[reputation] Job already started");
    return;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;

  logger.info("[reputation] Scheduling hourly reputation aggregation job");

  const initialDelay = 5 * 60 * 1000;
  setTimeout(() => {
    void runReputationJob();
    jobTimer = setInterval(() => {
      void runReputationJob();
    }, ONE_HOUR_MS);
  }, initialDelay);
}

export function stopReputationJob(): void {
  if (jobTimer) {
    clearInterval(jobTimer);
    jobTimer = null;
    logger.info("[reputation] Hourly reputation job stopped");
  }
}
