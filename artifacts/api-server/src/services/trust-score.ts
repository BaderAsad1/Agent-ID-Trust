import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentReputationEventsTable,
  type Agent,
} from "@workspace/db/schema";

type TrustTier = "unverified" | "basic" | "verified" | "trusted" | "elite";

const MAX_SCORES = {
  verification: 25,
  longevity: 20,
  activity: 25,
  reputation: 20,
  profileCompleteness: 10,
};

function computeVerificationScore(agent: Agent): number {
  if (agent.verificationStatus === "verified") return MAX_SCORES.verification;
  if (agent.verificationStatus === "pending") return 5;
  return 0;
}

function computeLongevityScore(agent: Agent): number {
  const ageMs = Date.now() - new Date(agent.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= 365) return MAX_SCORES.longevity;
  if (ageDays >= 180) return 16;
  if (ageDays >= 90) return 12;
  if (ageDays >= 30) return 8;
  if (ageDays >= 7) return 4;
  return 2;
}

function computeActivityScore(agent: Agent): number {
  const completed = agent.tasksCompleted;
  if (completed >= 100) return MAX_SCORES.activity;
  if (completed >= 50) return 20;
  if (completed >= 20) return 15;
  if (completed >= 10) return 10;
  if (completed >= 5) return 6;
  if (completed >= 1) return 3;
  return 0;
}

function computeProfileCompletenessScore(agent: Agent): number {
  let score = 0;
  if (agent.displayName) score += 2;
  if (agent.description) score += 2;
  if (agent.endpointUrl) score += 2;
  if (agent.avatarUrl) score += 1;
  const caps = agent.capabilities as string[] | null;
  if (caps && caps.length > 0) score += 2;
  const protos = agent.protocols as string[] | null;
  if (protos && protos.length > 0) score += 1;
  return Math.min(score, MAX_SCORES.profileCompleteness);
}

async function computeReputationScore(agentId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${agentReputationEventsTable.delta}), 0)` })
    .from(agentReputationEventsTable)
    .where(eq(agentReputationEventsTable.agentId, agentId));

  const raw = Number(result[0]?.total ?? 0);
  return Math.max(0, Math.min(raw, MAX_SCORES.reputation));
}

function determineTier(score: number, verified: boolean): TrustTier {
  if (score >= 90 && verified) return "elite";
  if (score >= 70 && verified) return "trusted";
  if (score >= 40 && verified) return "verified";
  if (score >= 20) return "basic";
  return "unverified";
}

export async function computeTrustScore(agentId: string): Promise<{
  trustScore: number;
  trustBreakdown: Record<string, number>;
  trustTier: TrustTier;
}> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });

  if (!agent) {
    return {
      trustScore: 0,
      trustBreakdown: {
        verification: 0,
        longevity: 0,
        activity: 0,
        reputation: 0,
        profileCompleteness: 0,
      } as Record<string, number>,
      trustTier: "unverified",
    };
  }

  const verification = computeVerificationScore(agent);
  const longevity = computeLongevityScore(agent);
  const activity = computeActivityScore(agent);
  const reputation = await computeReputationScore(agentId);
  const profileCompleteness = computeProfileCompletenessScore(agent);

  const trustBreakdown: Record<string, number> = {
    verification,
    longevity,
    activity,
    reputation,
    profileCompleteness,
  };

  const trustScore = verification + longevity + activity + reputation + profileCompleteness;
  const isVerified = agent.verificationStatus === "verified";
  const trustTier = determineTier(trustScore, isVerified);

  return { trustScore, trustBreakdown, trustTier };
}

export async function recomputeAndStore(agentId: string) {
  const { trustScore, trustBreakdown, trustTier } =
    await computeTrustScore(agentId);

  await db
    .update(agentsTable)
    .set({
      trustScore,
      trustBreakdown,
      trustTier,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));

  return { trustScore, trustBreakdown, trustTier };
}

export async function addReputationEvent(
  agentId: string,
  eventType: string,
  delta: number,
  reason?: string,
) {
  await db.insert(agentReputationEventsTable).values({
    agentId,
    eventType,
    delta,
    reason,
  });

  return recomputeAndStore(agentId);
}
