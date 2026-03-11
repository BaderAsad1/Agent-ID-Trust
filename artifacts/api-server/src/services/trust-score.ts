import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentReputationEventsTable,
  marketplaceReviewsTable,
  type Agent,
} from "@workspace/db/schema";

type TrustTier = "unverified" | "basic" | "verified" | "trusted" | "elite";

const MAX_SCORES = {
  verification: 20,
  longevity: 15,
  activity: 15,
  reputation: 10,
  reviews: 15,
  endpointHealth: 10,
  profileCompleteness: 15,
};

function computeVerificationScore(agent: Agent): number {
  if (agent.verificationStatus === "verified") return MAX_SCORES.verification;
  if (agent.verificationStatus === "pending") return 4;
  return 0;
}

function computeLongevityScore(agent: Agent): number {
  const ageMs = Date.now() - new Date(agent.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= 365) return MAX_SCORES.longevity;
  if (ageDays >= 180) return 12;
  if (ageDays >= 90) return 9;
  if (ageDays >= 30) return 6;
  if (ageDays >= 7) return 3;
  return 1;
}

function computeActivityScore(agent: Agent): number {
  const completed = agent.tasksCompleted;
  if (completed >= 100) return MAX_SCORES.activity;
  if (completed >= 50) return 12;
  if (completed >= 20) return 9;
  if (completed >= 10) return 6;
  if (completed >= 5) return 4;
  if (completed >= 1) return 2;
  return 0;
}

function computeProfileCompletenessScore(agent: Agent): number {
  let score = 0;
  if (agent.displayName) score += 2;
  if (agent.description) score += 3;
  if (agent.endpointUrl) score += 3;
  if (agent.avatarUrl) score += 2;
  const caps = agent.capabilities as string[] | null;
  if (caps && caps.length > 0) score += 3;
  const protos = agent.protocols as string[] | null;
  if (protos && protos.length > 0) score += 2;
  return Math.min(score, MAX_SCORES.profileCompleteness);
}

function computeEndpointHealthScore(agent: Agent): number {
  if (!agent.endpointUrl) return 0;

  let score = 5;

  try {
    const url = new URL(agent.endpointUrl);
    if (url.protocol === "https:") score += 3;
  } catch {
    return 2;
  }

  if (agent.status === "active") score += 2;

  return Math.min(score, MAX_SCORES.endpointHealth);
}

async function computeReputationScore(agentId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${agentReputationEventsTable.delta}), 0)` })
    .from(agentReputationEventsTable)
    .where(eq(agentReputationEventsTable.agentId, agentId));

  const raw = Number(result[0]?.total ?? 0);
  return Math.max(0, Math.min(raw, MAX_SCORES.reputation));
}

async function computeReviewsScore(agentId: string): Promise<number> {
  const result = await db
    .select({
      avgRating: sql<number>`COALESCE(AVG(${marketplaceReviewsTable.rating}), 0)`,
      reviewCount: sql<number>`COUNT(*)`,
    })
    .from(marketplaceReviewsTable)
    .where(eq(marketplaceReviewsTable.agentId, agentId));

  const avgRating = Number(result[0]?.avgRating ?? 0);
  const reviewCount = Number(result[0]?.reviewCount ?? 0);

  if (reviewCount === 0) return 0;

  let countScore = 0;
  if (reviewCount >= 50) countScore = 8;
  else if (reviewCount >= 20) countScore = 6;
  else if (reviewCount >= 10) countScore = 4;
  else if (reviewCount >= 5) countScore = 3;
  else if (reviewCount >= 1) countScore = 1;

  let ratingScore = 0;
  if (avgRating >= 4.5) ratingScore = 7;
  else if (avgRating >= 4.0) ratingScore = 5;
  else if (avgRating >= 3.5) ratingScore = 3;
  else if (avgRating >= 3.0) ratingScore = 2;
  else ratingScore = 1;

  return Math.min(countScore + ratingScore, MAX_SCORES.reviews);
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
        reviews: 0,
        endpointHealth: 0,
        profileCompleteness: 0,
      } as Record<string, number>,
      trustTier: "unverified",
    };
  }

  const verification = computeVerificationScore(agent);
  const longevity = computeLongevityScore(agent);
  const activity = computeActivityScore(agent);
  const reputation = await computeReputationScore(agentId);
  const reviews = await computeReviewsScore(agentId);
  const endpointHealth = computeEndpointHealthScore(agent);
  const profileCompleteness = computeProfileCompletenessScore(agent);

  const trustBreakdown: Record<string, number> = {
    verification,
    longevity,
    activity,
    reputation,
    reviews,
    endpointHealth,
    profileCompleteness,
  };

  const trustScore = verification + longevity + activity + reputation +
    reviews + endpointHealth + profileCompleteness;
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
