import { eq, and, ilike, sql, or, isNull } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import { agentsTable, usersTable, type Agent } from "@workspace/db/schema";
import { deriveAnchorState } from "../lib/anchor-state";

export interface CreateAgentInput {
  userId: string;
  handle?: string | null;
  displayName: string;
  description?: string;
  endpointUrl?: string;
  capabilities?: string[];
  scopes?: string[];
  protocols?: string[];
  authMethods?: string[];
  paymentMethods?: string[];
  isPublic?: boolean;
  metadata?: unknown;
}

export interface UpdateAgentInput {
  displayName?: string;
  description?: string;
  endpointUrl?: string;
  endpointSecret?: string;
  capabilities?: string[];
  scopes?: string[];
  protocols?: string[];
  authMethods?: string[];
  paymentMethods?: string[];
  isPublic?: boolean;
  status?: "draft" | "active" | "inactive";
  avatarUrl?: string;
  metadata?: unknown;
}

const HANDLE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateHandle(handle: string): string | null {
  if (handle.length < 3) {
    return "Handle must be at least 3 characters";
  }
  if (handle.length > 32) {
    return "Handle must be 32 characters or fewer";
  }
  if (!HANDLE_RE.test(handle)) {
    return "Handle must contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number";
  }
  return null;
}

export { isHandleReserved } from "./handle";
export { RESERVED_HANDLES } from "./handle";

const HANDLE_CACHE_TTL_S = 60;
const HANDLE_CACHE_TTL_MS = HANDLE_CACHE_TTL_S * 1000;

// In-memory fallback when Redis is not configured (single-instance / dev)
const _handleCacheFallback = new Map<string, { available: boolean; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _handleCacheFallback) {
    if (now > v.expiresAt) _handleCacheFallback.delete(k);
  }
}, 5 * 60 * 1000).unref();

async function _getCachedHandle(handle: string): Promise<boolean | null> {
  try {
    const { isRedisConfigured, getRedis } = await import("../lib/redis");
    if (isRedisConfigured()) {
      const val = await getRedis().get(`handle:avail:${handle}`);
      if (val !== null) return val === "1";
      return null;
    }
  } catch { /* fall through */ }
  const entry = _handleCacheFallback.get(handle);
  return entry && entry.expiresAt > Date.now() ? entry.available : null;
}

async function _setCachedHandle(handle: string, available: boolean): Promise<void> {
  try {
    const { isRedisConfigured, getRedis } = await import("../lib/redis");
    if (isRedisConfigured()) {
      await getRedis().set(`handle:avail:${handle}`, available ? "1" : "0", "EX", HANDLE_CACHE_TTL_S);
      return;
    }
  } catch { /* fall through */ }
  _handleCacheFallback.set(handle, { available, expiresAt: Date.now() + HANDLE_CACHE_TTL_MS });
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const cacheKey = handle.toLowerCase();
  const cached = await _getCachedHandle(cacheKey);
  if (cached !== null) return cached;

  const existing = await db.query.agentsTable.findFirst({
    where: ilike(agentsTable.handle, handle),
    columns: { id: true },
  });

  if (existing) {
    await _setCachedHandle(cacheKey, false);
    return false;
  }

  // Consult the on-chain registrar when chain is configured.
  // Registrar authority is final: null (unreachable) when configured → fail-closed → unavailable.
  try {
    const { isHandleAvailableOnChain, isRegistrarReadable } = await import("./chains/base");
    if (isRegistrarReadable()) {
      const onChainResult = await isHandleAvailableOnChain(handle.toLowerCase());
      if (onChainResult === null) {
        // Registrar configured but unreachable — fail-closed, do not cache
        return false;
      }
      if (!onChainResult.available) {
        await _setCachedHandle(cacheKey, false);
        return false;
      }
    }
  } catch {
    // Unexpected error during import or registrar check — treat as unavailable
    return false;
  }

  await _setCachedHandle(cacheKey, true);
  return true;
}

export function invalidateHandleCache(handle: string): void {
  const key = handle.toLowerCase();
  _handleCacheFallback.delete(key);
  // Fire-and-forget Redis invalidation
  import("../lib/redis").then(({ isRedisConfigured, getRedis }) => {
    if (isRedisConfigured()) getRedis().del(`handle:avail:${key}`).catch(() => {});
  }).catch(() => {});
}

export async function getHandleReservation(handle: string): Promise<{ isReserved: boolean; reservedReason: string | null }> {
  const existing = await db.query.agentsTable.findFirst({
    where: and(ilike(agentsTable.handle, handle), eq(agentsTable.isReserved, true)),
    columns: { isReserved: true, reservedReason: true },
  });
  if (existing) {
    return { isReserved: true, reservedReason: existing.reservedReason };
  }
  return { isReserved: false, reservedReason: null };
}

export async function createAgent(input: CreateAgentInput & { _skipHandleValidation?: boolean }): Promise<Agent> {
  if (input.handle && !input._skipHandleValidation) {
    const normalizedHandle = input.handle.toLowerCase();
    const validationError = validateHandle(normalizedHandle);
    if (validationError) {
      throw new Error(`INVALID_HANDLE: ${validationError}`);
    }
  }

  const result = await db
    .insert(agentsTable)
    .values({
      userId: input.userId,
      handle: input.handle ? input.handle.toLowerCase() : sql`NULL`,
      displayName: input.displayName,
      description: input.description,
      endpointUrl: input.endpointUrl,
      capabilities: input.capabilities || [],
      scopes: input.scopes || [],
      protocols: input.protocols || [],
      authMethods: input.authMethods || [],
      paymentMethods: input.paymentMethods || [],
      isPublic: input.isPublic ?? false,
      metadata: input.metadata,
    })
    .returning();

  if (result.length === 0) {
    throw new Error("HANDLE_CONFLICT");
  }

  const agent = result[0];

  try {
    const { getUserPlan } = await import("./billing");
    const plan = await getUserPlan(input.userId);
    const { getPlanLimits } = await import("./billing");
    const limits = getPlanLimits(plan);
    if (limits.canReceiveMail) {
      const { provisionInboxForAgent } = await import("./mail");
      await provisionInboxForAgent(agent.id);
    } else {
      logger.info({ agentId: agent.id, plan }, "[agents] Skipping inbox provisioning — plan does not include mail");
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, agentId: agent.id }, "[agents] Failed to provision inbox for agent");
  }

  // Registration email is NOT sent here — it fires at the correct completion point:
  //   • Paid-handle path → sent by handleCheckoutCompleted() after Stripe payment succeeds
  //   • No-payment path   → sent by /bootstrap/activate after the agent first connects
  // This prevents "You're registered!" emails from arriving before the user has finished onboarding.

  return agent;
}

export async function getAgentById(agentId: string): Promise<Agent | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });
  return agent ?? null;
}

/**
 * Determine whether a user is authorised to manage an agent.
 *
 * Ownership logic (in priority order):
 * 1. If `ownerUserId` is set (agent has been claimed/transferred), only that user is the owner.
 * 2. Otherwise fall back to `userId` (the original creator).
 *
 * This prevents former creators from retaining privileged access after an agent
 * has been claimed or transferred to a different user.
 */
export function isAgentOwner(agent: Agent, userId: string): boolean {
  if (agent.ownerUserId) {
    return agent.ownerUserId === userId;
  }
  return agent.userId === userId;
}

/**
 * Returns a Drizzle WHERE condition that matches agents owned by `userId`,
 * implementing the same semantics as `isAgentOwner`:
 *  - If ownerUserId IS set, only that user matches.
 *  - If ownerUserId IS NULL, only the original creator (userId) matches.
 *
 * This prevents former creators retaining access after a transfer, and
 * prevents current owners from being locked out.
 */
export function agentOwnerWhere(agentId: string, userId: string) {
  return and(
    eq(agentsTable.id, agentId),
    agentOwnerFilter(userId),
  );
}

/**
 * Returns a Drizzle WHERE filter for ownership semantics without constraining
 * by agentId. Useful for `findMany` queries (e.g. fleet listing) where you
 * want all agents owned by `userId` under the correct ownership rules.
 */
export function agentOwnerFilter(userId: string) {
  return or(
    and(isNull(agentsTable.ownerUserId), eq(agentsTable.userId, userId)),
    and(sql`${agentsTable.ownerUserId} IS NOT NULL`, eq(agentsTable.ownerUserId, userId)),
  );
}

export async function getAgentByHandle(handle: string): Promise<Agent | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: ilike(agentsTable.handle, handle),
  });
  return agent ?? null;
}

export async function listAgentsByUser(userId: string): Promise<Agent[]> {
  return db.query.agentsTable.findMany({
    where: agentOwnerFilter(userId),
    orderBy: (agents, { desc }) => [desc(agents.createdAt)],
  });
}

export async function updateAgent(
  agentId: string,
  userId: string,
  updates: UpdateAgentInput,
): Promise<Agent | null> {
  const existing = await db.query.agentsTable.findFirst({
    where: agentOwnerWhere(agentId, userId),
  });

  const finalUpdates = { ...updates };

  if (finalUpdates.metadata && existing?.metadata) {
    const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
    const incomingMeta = (finalUpdates.metadata || {}) as Record<string, unknown>;
    if (existingMeta.handlePricing) {
      incomingMeta.handlePricing = existingMeta.handlePricing;
    }
    finalUpdates.metadata = incomingMeta;
  }

  const [updated] = await db
    .update(agentsTable)
    .set({ ...finalUpdates, updatedAt: new Date() })
    .where(agentOwnerWhere(agentId, userId))
    .returning();

  if (!updated) return null;

  if (updates.capabilities || updates.status) {
    try {
      const { deleteResolutionCache } = await import("../routes/v1/resolve");
      const { normalizeHandle } = await import("../utils/handle");
      await deleteResolutionCache(normalizeHandle(updated.handle ?? ""));
    } catch {}
  }

  if (updates.status === "active" && existing?.status !== "active") {
    try {
      const { getUserPlan, getPlanLimits } = await import("./billing");
      const plan = await getUserPlan(userId);
      const limits = getPlanLimits(plan);
      if (limits.canReceiveMail) {
        const { provisionInboxForAgent } = await import("./mail");
        await provisionInboxForAgent(agentId);
      } else {
        logger.info({ agentId, plan }, "[agents] Skipping inbox provisioning on activation — plan does not include mail");
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err, agentId }, "[agents] Failed to provision inbox on activation");
    }
  }

  return updated;
}

export interface RevokeAgentInput {
  reason?: string;
  statement?: string;
}

export async function deleteAgent(
  agentId: string,
  userId: string,
  revocation?: RevokeAgentInput,
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(agentsTable)
    .set({
      status: "revoked",
      revokedAt: now,
      revocationReason: revocation?.reason || "user_deleted",
      revocationStatement: revocation?.statement || null,
      updatedAt: now,
    })
    .where(agentOwnerWhere(agentId, userId))
    .returning({ id: agentsTable.id });

  if (updated) {
    try {
      const { deleteResolutionCache } = await import("../routes/v1/resolve");
      const { normalizeHandle } = await import("../utils/handle");
      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, agentId),
        columns: { handle: true },
      });
      if (agent) {
        await deleteResolutionCache(normalizeHandle(agent.handle ?? ""));
      }
    } catch {}

    try {
      const { clearVcCache } = await import("./verifiable-credential");
      clearVcCache(agentId);
    } catch {}

    try {
      const { invalidateCredentialCache } = await import("./credentials");
      await invalidateCredentialCache(agentId);
    } catch {}

    try {
      const { invalidateTrustCache } = await import("./trust-score");
      await invalidateTrustCache(agentId);
    } catch {}

    setImmediate(async () => {
      try {
        const { agentAttestationsTable } = await import("@workspace/db/schema");
        const { recomputeAndStore } = await import("./trust-score");

        // H3: Revoke all active attestations made by this agent so their weight is
        // removed from trust computation. Trust recomputation below then picks up
        // the zeroed-out attesterTrustScore from revoked attestation rows.
        const revokedNow = new Date();
        const attestedAgents = await db
          .select({ subjectId: agentAttestationsTable.subjectId })
          .from(agentAttestationsTable)
          .where(and(
            eq(agentAttestationsTable.attesterId, agentId),
            isNull(agentAttestationsTable.revokedAt),
          ));

        if (attestedAgents.length > 0) {
          await db
            .update(agentAttestationsTable)
            .set({ revokedAt: revokedNow })
            .where(and(
              eq(agentAttestationsTable.attesterId, agentId),
              isNull(agentAttestationsTable.revokedAt),
            ));
        }

        // Now recompute trust for every subject whose attestor just got revoked.
        for (const { subjectId } of attestedAgents) {
          try {
            const { isRedisConfigured, getSharedRedis } = await import("../lib/redis");
            if (isRedisConfigured()) {
              await getSharedRedis().del(`trust:${subjectId}`);
            }
            await recomputeAndStore(subjectId);
          } catch (err) {
            logger.warn({ err, agentId, subjectId }, "[agents] Failed to recompute trust for attested subject");
          }
        }
      } catch (err) {
        logger.error({ err, agentId }, "[agents] Failed to revoke attestations / recompute trust for revoked agent");
      }
    });
  }

  return !!updated;
}

const APP_URL = process.env.APP_URL || 'https://getagent.id';

export function toPublicProfile(agent: Agent, credential?: Record<string, unknown> | null) {
  const handle = agent.handle;
  const did = `did:web:getagent.id:agents:${agent.id}`;
  const protocolAddress = `${handle}.agentid`;
  const erc8004Uri = `${APP_URL}/api/v1/p/${handle}/erc8004`;
  const domainName = `${handle}.getagent.id`;

  // Derive on-chain anchor state via shared helper (single source of truth)
  const agentAny = agent as unknown as { chainRegistrations?: unknown; nftStatus?: string };
  const { erc8004Status: profileErc8004Status, onchainStatus: profileOnchainStatus, onchainAnchor: profileOnchainAnchor } =
    deriveAnchorState(agentAny.chainRegistrations, agentAny.nftStatus);

  return {
    agent: {
      id: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      status: agent.status,
      capabilities: agent.capabilities,
      protocols: agent.protocols,
      trustScore: agent.trustScore,
      trustTier: agent.trustTier,
      verificationStatus: agent.verificationStatus,
      verificationMethod: agent.verificationMethod,
      verifiedAt: agent.verifiedAt,
      tasksReceived: agent.tasksReceived,
      tasksCompleted: agent.tasksCompleted,
      createdAt: agent.createdAt,
      endpointUrl: agent.endpointUrl,
      isClaimed: agent.isClaimed,
      ownerVerifiedAt: agent.ownerVerifiedAt,
      did,
      protocolAddress,
      erc8004Uri,
      erc8004Status: profileErc8004Status,
      onchainAnchor: profileOnchainAnchor,
      onchainStatus: profileOnchainStatus,
      domainName,
    },
    trustBreakdown: {
      verification: agent.trustBreakdown?.verification ?? 0,
      longevity: agent.trustBreakdown?.longevity ?? 0,
      activity: agent.trustBreakdown?.activity ?? 0,
      reputation: agent.trustBreakdown?.reputation ?? 0,
    },
    recentActivity: [],
    listings: [],
    credential: credential ?? null,
  };
}
