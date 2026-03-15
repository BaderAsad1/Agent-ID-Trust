import { eq, sql, and, isNull, or, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentReputationEventsTable,
  marketplaceReviewsTable,
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
  async compute(agent) {
    const completed = agent.tasksCompleted;
    let score = 0;
    if (completed >= 100) score = 15;
    else if (completed >= 50) score = 12;
    else if (completed >= 20) score = 9;
    else if (completed >= 10) score = 6;
    else if (completed >= 5) score = 4;
    else if (completed >= 1) score = 2;
    return { score };
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

const endpointHealthProvider: TrustProvider = {
  id: "endpointHealth",
  label: "Endpoint Health",
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

const SPONSORSHIP_BONUS: Record<TrustTier, number> = {
  unverified: 0,
  basic: 2,
  verified: 5,
  trusted: 8,
  elite: 10,
};

const BASIC_TIER_CEILING = 39;

const lineageSponsorshipProvider: TrustProvider = {
  id: "lineageSponsorship",
  label: "Lineage Sponsorship",
  maxScore: 10,
  async compute(agent) {
    if (!agent.parentAgentId) return { score: 0 };

    const parent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.parentAgentId),
      columns: { trustTier: true, handle: true },
    });

    if (!parent) return { score: 0 };

    const bonus = SPONSORSHIP_BONUS[parent.trustTier as TrustTier] ?? 0;
    return {
      score: bonus,
      metadata: { parentTier: parent.trustTier, parentHandle: parent.handle },
    };
  },
};

registerTrustProvider(verificationProvider);
registerTrustProvider(longevityProvider);
registerTrustProvider(activityProvider);
registerTrustProvider(reputationProvider);
registerTrustProvider(reviewsProvider);
registerTrustProvider(endpointHealthProvider);
registerTrustProvider(profileCompletenessProvider);
registerTrustProvider(externalSignalProvider);
registerTrustProvider(lineageSponsorshipProvider);

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
  signals: TrustSignal[];
}> {
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

  const isVerified = agent.verificationStatus === "verified";
  const trustTier = determineTier(totalScore, isVerified);

  return { trustScore: totalScore, trustBreakdown, trustTier, signals };
}

export async function recomputeAndStore(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { trustScore: true },
  });
  const previousScore = agent?.trustScore ?? 0;

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

  if (Math.abs(trustScore - previousScore) >= 5) {
    try {
      const { reissueCredential } = await import("./credentials");
      await reissueCredential(agentId);
    } catch (err) {
      console.error(`[trust-score] Failed to reissue credential after score change:`, err instanceof Error ? err.message : err);
    }
  }

  try {
    const agentForCache = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { handle: true },
    });
    if (agentForCache) {
      const { deleteResolutionCache } = await import("../routes/v1/resolve");
      const { normalizeHandle } = await import("../utils/handle");
      await deleteResolutionCache(normalizeHandle(agentForCache.handle));
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
