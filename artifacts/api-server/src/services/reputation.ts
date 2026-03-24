import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { env } from "../lib/env";

export interface ReputationSummary {
  score: number;
  tier: string;
  feedbackCount: number;
  chains: string[];
}

function isOnchainEnabled(): boolean {
  return env().ONCHAIN_MINTING_ENABLED === "true" || env().ONCHAIN_MINTING_ENABLED === "1";
}

function parseChainRegistrations(chainMints: Record<string, unknown> | null | undefined): Array<{ chain: string; contractAddress?: string; tokenId?: string }> {
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
  _tokenId: string | undefined,
): Promise<{ score: number; feedbackCount: number } | null> {
  if (!isOnchainEnabled()) return null;

  try {
    logger.debug({ chain }, "[reputation] Fetching on-chain reputation summary");
    return null;
  } catch (err) {
    logger.warn({ err, chain }, "[reputation] Failed to fetch on-chain reputation — skipping chain");
    return null;
  }
}

export async function aggregateTrustScore(agentId: string): Promise<ReputationSummary> {
  if (!isOnchainEnabled()) {
    return { score: 0, tier: "unverified", feedbackCount: 0, chains: [] };
  }

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { chainMints: true, trustScore: true, trustTier: true },
  });

  if (!agent) {
    return { score: 0, tier: "unverified", feedbackCount: 0, chains: [] };
  }

  const registrations = parseChainRegistrations(agent.chainMints as Record<string, unknown> | null);

  if (registrations.length === 0) {
    return {
      score: 0,
      tier: agent.trustTier ?? "unverified",
      feedbackCount: 0,
      chains: [],
    };
  }

  let totalScore = 0;
  let totalFeedback = 0;
  const chains: string[] = [];

  for (const reg of registrations) {
    const onchain = await fetchOnchainReputation(
      reg.chain as string,
      reg.tokenId as string | undefined,
    );
    if (onchain) {
      totalScore += onchain.score;
      totalFeedback += onchain.feedbackCount;
      chains.push(reg.chain as string);
    }
  }

  if (chains.length === 0) {
    return {
      score: 0,
      tier: agent.trustTier ?? "unverified",
      feedbackCount: 0,
      chains: [],
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
