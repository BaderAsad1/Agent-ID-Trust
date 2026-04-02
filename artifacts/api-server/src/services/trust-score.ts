import { eq, sql, and, isNull, or, gte, gt } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import { isRedisConfigured, getSharedRedis } from "../lib/redis";
import {
  agentsTable,
  agentReputationEventsTable,
  marketplaceReviewsTable,
  tasksTable,
  trustEventsTable,
  type Agent,
} from "@workspace/db/schema";

export type TrustTier = "unverified" | "basic" | "verified" | "trusted" | "elite";

export interface TrustSignal {
  provider: string;
  label: string;
  score: number;
  maxScore: number;
  metadata?: Record<string, unknown>;
}

export interface TrustProviderContext {
  agentId: string;
  agent: Agent;
}

export interface TrustProvider {
  id: string;
  label: string;
  maxScore: number;
  compute(agent: Agent, context: TrustProviderContext): Promise<{ score: number; metadata?: Record<string, unknown> }>;
}

const providerRegistry: TrustProvider[] = [];

export function registerTrustProvider(provider: TrustProvider): void {
  const existing = providerRegistry.findIndex(p => p.id === provider.id);
  if (existing >= 0) {
    providerRegistry[existing] = provider;
  } else {
    providerRegistry.push(provider);
  }
}

export function getTrustProviders(): ReadonlyArray<TrustProvider> {
  return providerRegistry;
}

const verificationProvider: TrustProvider = {
  id: "verification",
  label: "Verification Status",
  maxScore: 20,
  async compute(agent) {
    let score = 0;
    if (agent.verificationStatus === "verified") score = 20;
    else if (agent.verificationStatus === "pending" || agent.verificationStatus === "pending_verification") score = 4;
    return { score };
  },
};

const longevityProvider: TrustProvider = {
  id: "longevity",
  label: "Account Longevity",
  maxScore: 15,
  async compute(agent) {
    const ageMs = Date.now() - new Date(agent.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    let score = 1;
    if (ageDays >= 365) score = 15;
    else if (ageDays >= 180) score = 12;
    else if (ageDays >= 90) score = 9;
    else if (ageDays >= 30) score = 6;
    else if (ageDays >= 7) score = 3;
    return { score };
  },
};

const activityProvider: TrustProvider = {
  id: "activity",
  label: "Task Activity",
  maxScore: 15,
  async compute(agent, context) {
    const completed = agent.tasksCompleted;
    let score = 0;
    if (completed >= 100) score = 15;
    else if (completed >= 50) score = 12;
    else if (completed >= 20) score = 9;
    else if (completed >= 10) score = 6;
    else if (completed >= 5) score = 4;
    else if (completed >= 1) score = 2;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const velocityResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.recipientAgentId, context.agentId),
          eq(tasksTable.businessStatus, "completed"),
          gt(tasksTable.completedAt, oneHourAgo),
        ),
      );
    const recentCount = Number(velocityResult[0]?.count ?? 0);
    const velocityFlag = recentCount > 10;
    if (velocityFlag) {
      score = Math.min(score, 5);
    }

    return { score, metadata: { completedTotal: completed, recentHourCount: recentCount, velocityFlag } };
  },
};

const reputationProvider: TrustProvider = {
  id: "reputation",
  label: "Reputation Events",
  maxScore: 10,
  async compute(_agent, context) {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${agentReputationEventsTable.delta}), 0)` })
      .from(agentReputationEventsTable)
      .where(
        and(
          eq(agentReputationEventsTable.agentId, context.agentId),
          or(
            sql`${agentReputationEventsTable.eventType} != 'externalSignal'`,
            isNull(agentReputationEventsTable.eventType),
          ),
        ),
      );
    const raw = Number(result[0]?.total ?? 0);
    return { score: Math.max(0, Math.min(raw, 10)) };
  },
};

const reviewsProvider: TrustProvider = {
  id: "reviews",
  label: "Marketplace Reviews",
  maxScore: 15,
  async compute(_agent, context) {
    const result = await db
      .select({
        avgRating: sql<number>`COALESCE(AVG(${marketplaceReviewsTable.rating}), 0)`,
        reviewCount: sql<number>`COUNT(*)`,
      })
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.agentId, context.agentId));

    const avgRating = Number(result[0]?.avgRating ?? 0);
    const reviewCount = Number(result[0]?.reviewCount ?? 0);
    if (reviewCount === 0) return { score: 0, metadata: { avgRating: 0, reviewCount: 0 } };

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

    return {
      score: Math.min(countScore + ratingScore, 15),
      metadata: { avgRating, reviewCount },
    };
  },
};

// Renamed from "endpointHealth" to "endpointConfig" for accuracy:
// this provider scores endpoint *configuration* (URL presence, HTTPS usage,
// active status). It does NOT make live HTTP requests to probe liveness —
// that would require SSRF mitigation, allow-listing, and async scheduling.
// If live health-probing is added in the future, create a separate provider.
const endpointConfigProvider: TrustProvider = {
  id: "endpointConfig",
  label: "Endpoint Configuration",
  maxScore: 10,
  async compute(agent) {
    if (!agent.endpointUrl) return { score: 0 };
    let score = 5;
    try {
      const url = new URL(agent.endpointUrl);
      if (url.protocol === "https:") score += 3;
    } catch {
      return { score: 2 };
    }
    if (agent.status === "active") score += 2;
    return { score: Math.min(score, 10) };
  },
};

const profileCompletenessProvider: TrustProvider = {
  id: "profileCompleteness",
  label: "Profile Completeness",
  maxScore: 15,
  async compute(agent) {
    let score = 0;
    if (agent.displayName) score += 2;
    if (agent.description) score += 3;
    if (agent.endpointUrl) score += 3;
    if (agent.avatarUrl) score += 2;
    const caps = agent.capabilities as string[] | null;
    if (caps && caps.length > 0) score += 3;
    const protos = agent.protocols as string[] | null;
    if (protos && protos.length > 0) score += 2;
    return { score: Math.min(score, 15) };
  },
};

const externalSignalProvider: TrustProvider = {
  id: "externalSignals",
  label: "External Signals",
  maxScore: 10,
  async compute(_agent, context) {
    const now = new Date();
    const signals = await db
      .select({
        delta: agentReputationEventsTable.delta,
        confidenceLevel: agentReputationEventsTable.confidenceLevel,
        source: agentReputationEventsTable.source,
      })
      .from(agentReputationEventsTable)
      .where(
        and(
          eq(agentReputationEventsTable.agentId, context.agentId),
          eq(agentReputationEventsTable.eventType, "externalSignal"),
          isNull(agentReputationEventsTable.revokedAt),
          or(
            isNull(agentReputationEventsTable.expiresAt),
            gte(agentReputationEventsTable.expiresAt, now),
          ),
        ),
      );

    let total = 0;
    for (const signal of signals) {
      const confidence = signal.confidenceLevel ?? 1;
      total += signal.delta * confidence;
    }
    return {
      score: Math.max(0, Math.min(Math.round(total), 10)),
      metadata: { signalCount: signals.length },
    };
  },
};

const BASIC_TIER_CEILING = 39;

const MAX_LINEAGE_DEPTH = 3;
const MAX_CHILDREN_PER_PARENT = 10;

const lineageSponsorshipProvider: TrustProvider = {
  id: "lineageSponsorship",
  label: "Lineage Sponsorship",
  maxScore: 10,
  async compute(agent) {
    if (!agent.parentAgentId) return { score: 0 };

    const parent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.parentAgentId),
      columns: { trustScore: true, trustTier: true, handle: true, parentAgentId: true, userId: true },
    });

    if (!parent) return { score: 0 };

    if (parent.userId !== agent.userId) {
      return {
        score: 0,
        metadata: { reason: "lineage_ownership_mismatch", parentHandle: parent.handle },
      };
    }

    let depth = 1;
    let ancestor = parent;
    while (ancestor.parentAgentId && depth < MAX_LINEAGE_DEPTH) {
      const next = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, ancestor.parentAgentId),
        columns: { parentAgentId: true, userId: true },
      });
      if (!next) break;
      depth++;
      ancestor = next as typeof parent;
    }

    if (depth >= MAX_LINEAGE_DEPTH && ancestor.parentAgentId) {
      return {
        score: 0,
        metadata: { reason: "lineage_depth_exceeded", depth, maxDepth: MAX_LINEAGE_DEPTH },
      };
    }

    const childCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.parentAgentId, agent.parentAgentId),
          eq(agentsTable.userId, agent.userId),
        ),
      );

    const children = Number(childCount[0]?.count ?? 0);
    if (children > MAX_CHILDREN_PER_PARENT) {
      return {
        score: 0,
        metadata: { reason: "too_many_children", childCount: children, maxChildren: MAX_CHILDREN_PER_PARENT },
      };
    }

    const bonus = Math.min(10, Math.floor(parent.trustScore / 10));
    return {
      score: bonus,
      metadata: { parentTrustScore: parent.trustScore, parentTier: parent.trustTier, parentHandle: parent.handle, depth, childCount: children },
    };
  },
};

const attestationProvider: TrustProvider = {
  id: "attestations",
  label: "Peer Attestations",
  maxScore: 10,
  async compute(_agent, context) {
    try {
      const { agentAttestationsTable } = await import("@workspace/db/schema");
      const attestations = await db
        .select({
          sentiment: agentAttestationsTable.sentiment,
          weight: agentAttestationsTable.weight,
          attesterTrustScore: agentAttestationsTable.attesterTrustScore,
        })
        .from(agentAttestationsTable)
        .where(
          and(
            eq(agentAttestationsTable.subjectId, context.agentId),
            isNull(agentAttestationsTable.revokedAt),
          ),
        );

      if (attestations.length === 0) return { score: 0, metadata: { count: 0 } };

      let weightedSum = 0;
      for (const att of attestations) {
        const multiplier = att.sentiment === "positive" ? 1 : att.sentiment === "negative" ? -1 : 0;
        weightedSum += multiplier * (att.weight || 1) * ((att.attesterTrustScore || 0) / 100);
      }

      const score = Math.max(0, Math.min(10, Math.round(5 + weightedSum)));
      return { score, metadata: { count: attestations.length, weightedSum } };
    } catch {
      return { score: 0 };
    }
  },
};

registerTrustProvider(verificationProvider);
registerTrustProvider(longevityProvider);
registerTrustProvider(activityProvider);
registerTrustProvider(reputationProvider);
registerTrustProvider(reviewsProvider);
registerTrustProvider(endpointConfigProvider);
registerTrustProvider(profileCompletenessProvider);
registerTrustProvider(externalSignalProvider);
registerTrustProvider(lineageSponsorshipProvider);
registerTrustProvider(attestationProvider);

export function determineTier(score: number, verified: boolean): TrustTier {
  if (score >= 90 && verified) return "elite";
  if (score >= 70 && verified) return "trusted";
  if (score >= 40 && verified) return "verified";
  if (score >= 20) return "basic";
  return "unverified";
}

async function computeNegativePenalty(agentId: string): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await db
    .select({ totalWeight: sql<number>`COALESCE(SUM(${trustEventsTable.weight}), 0)` })
    .from(trustEventsTable)
    .where(
      and(
        eq(trustEventsTable.agentId, agentId),
        eq(trustEventsTable.direction, "negative"),
        gte(trustEventsTable.createdAt, ninetyDaysAgo),
      ),
    );
  const totalWeight = Number(result[0]?.totalWeight ?? 0);
  return Math.min(totalWeight, 20);
}

export async function addNegativeTrustEvent(
  agentId: string,
  eventType: "task_failed" | "task_abandoned",
  options?: { weight?: number; sourceAgentId?: string; reason?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.insert(trustEventsTable).values({
    agentId,
    direction: "negative",
    eventType,
    weight: options?.weight ?? 3,
    sourceAgentId: options?.sourceAgentId ?? null,
    reason: options?.reason ?? null,
    metadata: options?.metadata ?? null,
  });
}

export async function addPositiveTrustEvent(
  agentId: string,
  eventType: string,
  options?: { weight?: number; sourceAgentId?: string; reason?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.insert(trustEventsTable).values({
    agentId,
    direction: "positive",
    eventType,
    weight: options?.weight ?? 1,
    sourceAgentId: options?.sourceAgentId ?? null,
    reason: options?.reason ?? null,
    metadata: options?.metadata ?? null,
  });
}

export function getTrustImprovementTips(
  breakdown: Record<string, number>,
  agent: Agent,
): string[] {
  const tips: Array<{ priority: number; tip: string }> = [];

  const verification = breakdown["verification"] ?? 0;
  if (verification < 20) {
    tips.push({ priority: 10, tip: "Complete agent verification to unlock higher trust tiers and up to 20 additional trust points." });
  }

  const profile = breakdown["profileCompleteness"] ?? 0;
  if (profile < 15) {
    const missing: string[] = [];
    if (!agent.displayName) missing.push("display name");
    if (!agent.description) missing.push("description");
    if (!agent.endpointUrl) missing.push("endpoint URL");
    if (!agent.avatarUrl) missing.push("avatar");
    const caps = agent.capabilities as string[] | null;
    if (!caps || caps.length === 0) missing.push("capabilities");
    const protos = agent.protocols as string[] | null;
    if (!protos || protos.length === 0) missing.push("supported protocols");
    if (missing.length > 0) {
      tips.push({ priority: 8, tip: `Complete your agent profile: add ${missing.slice(0, 3).join(", ")} to earn up to 15 profile completeness points.` });
    }
  }

  const reviews = breakdown["reviews"] ?? 0;
  if (reviews < 10) {
    tips.push({ priority: 6, tip: "List your agent on the marketplace and collect reviews to earn up to 15 trust points from ratings." });
  }

  const endpoint = breakdown["endpointConfig"] ?? 0;
  if (endpoint < 10) {
    if (!agent.endpointUrl) {
      tips.push({ priority: 7, tip: "Register a live HTTPS endpoint URL to demonstrate your agent is reachable and earn up to 10 endpoint configuration points." });
    } else {
      const url = (() => { try { return new URL(agent.endpointUrl); } catch { return null; } })();
      if (url && url.protocol !== "https:") {
        tips.push({ priority: 7, tip: "Upgrade your endpoint to HTTPS to earn the full endpoint configuration score." });
      }
    }
  }

  const activity = breakdown["activity"] ?? 0;
  if (activity < 9) {
    tips.push({ priority: 5, tip: "Complete more tasks to build your activity score — agents with 20+ completed tasks earn up to 9 activity points." });
  }

  const reputation = breakdown["reputation"] ?? 0;
  if (reputation < 5) {
    tips.push({ priority: 4, tip: "Maintain a good track record and avoid task failures to protect your reputation score." });
  }

  tips.sort((a, b) => b.priority - a.priority);
  return tips.slice(0, 3).map(t => t.tip);
}

export async function computeTrustScore(agentId: string, opts?: { skipCache?: boolean }): Promise<{
  trustScore: number;
  trustBreakdown: Record<string, number>;
  trustTier: TrustTier;
  signals: TrustSignal[];
  fromCache?: boolean;
}> {
  if (!opts?.skipCache) {
    const cached = await getTrustFromCache(agentId);
    if (cached) {
      return {
        trustScore: cached.trustScore,
        trustBreakdown: cached.trustBreakdown,
        trustTier: cached.trustTier as TrustTier,
        signals: [],
        fromCache: true,
      };
    }
  }

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });

  if (!agent) {
    return {
      trustScore: 0,
      trustBreakdown: {},
      trustTier: "unverified",
      signals: [],
    };
  }

  const context: TrustProviderContext = { agentId, agent };
  const signals: TrustSignal[] = [];
  const trustBreakdown: Record<string, number> = {};
  let totalScore = 0;

  for (const provider of providerRegistry) {
    const result = await provider.compute(agent, context);
    const clampedScore = Math.max(0, Math.min(result.score, provider.maxScore));
    signals.push({
      provider: provider.id,
      label: provider.label,
      score: clampedScore,
      maxScore: provider.maxScore,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    });
    trustBreakdown[provider.id] = clampedScore;
    totalScore += clampedScore;
  }

  if (agent.parentAgentId && agent.verificationStatus !== "verified") {
    totalScore = Math.min(totalScore, BASIC_TIER_CEILING);
  }

  totalScore = Math.min(totalScore, 100);

  const negativePenalty = await computeNegativePenalty(agentId);
  totalScore = Math.max(0, totalScore - negativePenalty);

  const isVerified = agent.verificationStatus === "verified";
  const trustTier = determineTier(totalScore, isVerified);

  await setTrustCache(agentId, { trustScore: totalScore, trustTier, trustBreakdown });

  return { trustScore: totalScore, trustBreakdown, trustTier, signals };
}

const TRUST_CACHE_TTL = 300;

async function getTrustFromCache(agentId: string): Promise<{ trustScore: number; trustTier: string; trustBreakdown: Record<string, number> } | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getSharedRedis();
    const raw = await redis.get(`trust:${agentId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setTrustCache(agentId: string, data: { trustScore: number; trustTier: string; trustBreakdown: Record<string, number> }): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getSharedRedis();
    await redis.set(`trust:${agentId}`, JSON.stringify(data), "EX", TRUST_CACHE_TTL);
  } catch {
  }
}

export async function invalidateTrustCache(agentId: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getSharedRedis();
    await redis.del(`trust:${agentId}`);
  } catch {
  }
}

export async function recomputeAndStore(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { trustScore: true, trustBreakdown: true, trustTier: true },
  });
  const previousScore = agent?.trustScore ?? 0;

  const { trustScore, trustBreakdown, trustTier } =
    await computeTrustScore(agentId, { skipCache: true });

  const result = await db
    .update(agentsTable)
    .set({
      trustScore,
      trustBreakdown,
      trustTier,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentsTable.id, agentId),
        eq(agentsTable.trustScore, previousScore),
      ),
    )
    .returning({ id: agentsTable.id });

  if (result.length === 0) {
    logger.warn({ agentId, previousScore, newScore: trustScore }, "[trust-score] Optimistic concurrency: trust score changed by another process, skipping update");
    // Return the current persisted values so callers get coherent data even when this update was skipped.
    return {
      trustScore: previousScore,
      trustBreakdown: (agent?.trustBreakdown ?? {}) as Record<string, number>,
      trustTier: (agent?.trustTier ?? "unverified") as TrustTier,
    };
  }

  await setTrustCache(agentId, { trustScore, trustTier, trustBreakdown });

  if (Math.abs(trustScore - previousScore) >= 5) {
    try {
      const { clearVcCache } = await import("./verifiable-credential");
      clearVcCache(agentId);
    } catch {}

    try {
      const { reissueCredential } = await import("./credentials");
      await reissueCredential(agentId);
    } catch (err) {
      logger.error({ err }, "[trust-score] Failed to reissue credential after score change");
    }

    try {
      const { logSignedActivity } = await import("./activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.trust_updated",
        payload: { previousScore, newScore: trustScore, trustTier },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("./webhook-delivery");
      await deliverWebhookEvent(agentId, "trust.updated", {
        previousScore,
        newScore: trustScore,
        trustTier,
      });
    } catch {}
  }

  try {
    const agentForCache = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { handle: true },
    });
    if (agentForCache) {
      const { deleteResolutionCache } = await import("../routes/v1/resolve");
      const { normalizeHandle } = await import("../utils/handle");
      await deleteResolutionCache(normalizeHandle(agentForCache.handle ?? ""));
    }
  } catch {}

  return { trustScore, trustBreakdown, trustTier };
}

export interface ExternalSignalProvenance {
  source: string;
  attestationType: string;
  confidenceLevel: number;
  issuedAt: Date;
  expiresAt?: Date | null;
  revocable: boolean;
}

export async function addReputationEvent(
  agentId: string,
  eventType: string,
  delta: number,
  reason?: string,
  provenance?: ExternalSignalProvenance,
) {
  if (eventType === "externalSignal") {
    if (!provenance) {
      throw new Error("Provenance metadata is required for externalSignal events");
    }
    if (!provenance.source || !provenance.attestationType) {
      throw new Error("source and attestationType are required for externalSignal provenance");
    }
    if (provenance.confidenceLevel < 0 || provenance.confidenceLevel > 1) {
      throw new Error("confidenceLevel must be between 0 and 1");
    }
  }

  await db.insert(agentReputationEventsTable).values({
    agentId,
    eventType,
    delta,
    reason,
    ...(provenance ? {
      source: provenance.source,
      attestationType: provenance.attestationType,
      confidenceLevel: provenance.confidenceLevel,
      issuedAt: provenance.issuedAt,
      expiresAt: provenance.expiresAt,
      revocable: provenance.revocable,
    } : {}),
  });

  return recomputeAndStore(agentId);
}
