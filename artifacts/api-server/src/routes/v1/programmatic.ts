import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash, verify as cryptoVerify, createPublicKey } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { logger } from "../../middlewares/request-logger";
import {
  createAgent,
  getAgentById,
  isAgentOwner,
  getAgentByHandle,
  validateHandle,
  isHandleAvailable,
  invalidateHandleCache,
  getHandleReservation,
} from "../../services/agents";
import { formatDomain, formatHandle, formatResolverUrl } from "../../utils/handle";
import { getUserPlan, getPlanLimits, getActiveUserSubscription } from "../../services/billing";
import {
  initiateVerification,
  verifyChallenge,
  getAuthMetadata,
} from "../../services/verification";
import {
  createAgentKey,
  listAgentKeys,
  rotateAgentKey,
} from "../../services/agent-keys";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { buildBootstrapBundle } from "../../services/identity";
import { getHandleTier, checkHandleAvailability, assignHandleToAgent } from "../../services/handle";
import { getStripe } from "../../services/stripe-client";
import { getOrCreateInbox } from "../../services/mail";
import { generateClaimToken } from "../../utils/claim-token";
import { db } from "@workspace/db";
import type { Agent as DbAgent } from "@workspace/db";
import { apiKeysTable, usersTable, agentsTable, agentClaimTokensTable, agentKeysTable, ownerTokensTable } from "@workspace/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { hashClaimToken } from "../../utils/crypto";
import { getRedis, isRedisConfigured } from "../../lib/redis";
import { recoveryRateLimit, registrationRateLimitStrict, challengeRateLimit } from "../../middlewares/rate-limit";

function hashIp(ip: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(ip) ? ip[0] : ip;
  if (!raw) return undefined;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const router = Router();

// Rejects newlines and ASCII control characters to prevent prompt injection.
// These characters allow a crafted displayName/description/capability to break
// out of prompt boundaries in any LLM that consumes the identity block.
const safeTextField = (maxLen: number) =>
  z.string().max(maxLen).refine(
    (v) => !/[\r\n\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v),
    { message: "Field must not contain newline or control characters" },
  );

const registerSchema = z.object({
  handle: z.string().min(3).max(32).optional(),
  displayName: z.string().min(1).max(255),
  publicKey: z.string().min(1),
  keyType: z.enum(["ed25519"]).default("ed25519"),
  description: safeTextField(5000).optional(),
  capabilities: z.array(
    z.string().max(100).refine(
      (v) => !/[\r\n\x00-\x1F\x7F]/.test(v),
      { message: "Capability must not contain newline or control characters" },
    ),
  ).max(50).optional(),
  endpointUrl: z.url().optional(),
  ownerToken: z.string().optional(),
});

const verifySchema = z.object({
  agentId: z.string().uuid(),
  challenge: z.string().min(1),
  signature: z.string().min(1),
  kid: z.string().min(1),
});

const rotateKeySchema = z.object({
  oldKeyId: z.string().uuid(),
  newPublicKey: z.string().min(1),
  keyType: z.enum(["ed25519"]).default("ed25519"),
});

const AUTONOMOUS_REG_WINDOW_SEC = 24 * 60 * 60;
const AUTONOMOUS_REG_LIMIT = 5;

// C4: Separate cap on total unverified agents registered per IP per day
const UNVERIFIED_AGENT_DAILY_LIMIT = 20;

/**
 * Increment and check the daily count of unverified agents for a given IP.
 * This is separate from the Sybil quota (which only applies to autonomous/no-owner registrations).
 * All registrations — authenticated or not — count toward this limit.
 * Fails-closed in production if Redis is unavailable.
 */
async function checkUnverifiedAgentDailyLimit(clientIp: string | undefined): Promise<void> {
  if (!clientIp) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable: client identity cannot be determined.");
    }
    return;
  }

  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[programmatic] ALERT: Unverified agent daily limit check blocked — Redis not configured in production");
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable. Please try again shortly.");
    }
    return;
  }

  try {
    const redis = getRedis();
    const key = `unverified_agents:daily:${createHash("sha256").update(clientIp).digest("hex").slice(0, 16)}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, AUTONOMOUS_REG_WINDOW_SEC);
    }
    if (count > UNVERIFIED_AGENT_DAILY_LIMIT) {
      // Anomaly instrumentation: log high-velocity registration activity for SOC monitoring
      logger.warn(
        { ip: createHash("sha256").update(clientIp).digest("hex").slice(0, 8), count },
        "[programmatic] SECURITY ALERT: Registration velocity anomaly — IP exceeded unverified agent daily cap",
      );
      throw new AppError(429, "DAILY_AGENT_LIMIT_EXCEEDED", "Daily unverified agent registration limit exceeded for this IP address.", {
        retryAfterSeconds: AUTONOMOUS_REG_WINDOW_SEC,
      });
    }
    // Anomaly warning at 80% threshold for early detection
    if (count >= Math.floor(UNVERIFIED_AGENT_DAILY_LIMIT * 0.8)) {
      logger.warn(
        { ip: createHash("sha256").update(clientIp).digest("hex").slice(0, 8), count, limit: UNVERIFIED_AGENT_DAILY_LIMIT },
        "[programmatic] SECURITY NOTICE: Registration velocity nearing daily IP cap",
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (process.env.NODE_ENV === "production") {
      logger.error({ err: (err as Error).message }, "[programmatic] ALERT: Unverified agent daily limit check failed — blocking registration (fail-closed)");
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable. Please try again shortly.");
    }
    logger.warn({ err: (err as Error).message }, "[programmatic] Unverified agent daily limit check failed (dev mode: allowing request)");
  }
}

async function checkSybilQuota(clientIp: string | undefined): Promise<void> {
  if (!clientIp) {
    // No client IP means we cannot enforce the quota — fail-closed in production.
    if (process.env.NODE_ENV === "production") {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable: client identity cannot be determined.");
    }
    return;
  }

  if (!isRedisConfigured()) {
    // No Redis configured — fail-closed in production (Sybil quota requires Redis).
    if (process.env.NODE_ENV === "production") {
      logger.error("[programmatic] ALERT: Sybil quota check blocked — Redis not configured in production");
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable. Please try again shortly.");
    }
    return; // Dev/test: allow without Redis
  }

  try {
    const redis = getRedis();
    const key = `sybil:auto_reg:${createHash("sha256").update(clientIp).digest("hex").slice(0, 16)}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, AUTONOMOUS_REG_WINDOW_SEC);
    }
    if (count > AUTONOMOUS_REG_LIMIT) {
      throw new AppError(429, "SYBIL_LIMIT_EXCEEDED", "Autonomous registration quota exceeded. Register fewer agents per day or authenticate with an account.", {
        retryAfterSeconds: AUTONOMOUS_REG_WINDOW_SEC,
      });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Redis error — fail-closed in production to prevent Sybil bypass via Redis unavailability.
    if (process.env.NODE_ENV === "production") {
      logger.error({ err: (err as Error).message }, "[programmatic] ALERT: Sybil quota check failed — blocking registration (fail-closed in production)");
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Registration temporarily unavailable. Please try again shortly.");
    }
    logger.warn({ err: (err as Error).message }, "[programmatic] Sybil quota check failed (dev mode: allowing request)");
  }
}

router.post("/agents/register", registrationRateLimitStrict, async (req, res, next) => {
  const t0 = performance.now();
  const APP_URL = process.env.APP_URL || "https://getagent.id";
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle, displayName, publicKey, keyType, description, capabilities, endpointUrl, ownerToken } =
      parsed.data;

    let requestedHandle: string | null = handle ? handle.toLowerCase() : null;
    let handleTierInfo = requestedHandle ? getHandleTier(requestedHandle) : null;

    const tHandleCheck = performance.now();

    if (requestedHandle) {
      const handleError = validateHandle(requestedHandle);
      if (handleError) {
        throw new AppError(400, "INVALID_HANDLE", handleError);
      }

      if (handleTierInfo?.tier === "reserved_1_2") {
        throw new AppError(400, "HANDLE_RESERVED", "Handles of 1-2 characters are reserved");
      }

      if (handleTierInfo?.tier === "premium_3" || handleTierInfo?.tier === "premium_4") {
        throw new AppError(402, "PAYMENT_REQUIRED", `${requestedHandle.length}-character handles are premium handles requiring Stripe payment ($${handleTierInfo.annualUsd}/yr)`, {
          handle: requestedHandle,
          tier: handleTierInfo.tier,
          annualCents: handleTierInfo.annualCents,
          annualUsd: handleTierInfo.annualUsd,
          checkoutUrl: `${APP_URL}/api/v1/pay/handle/claim`,
          note: `Register without a handle first to obtain your permanent UUID identity, then claim this handle via /api/v1/pay/handle/claim after payment.`,
          upgradeUrl: `${APP_URL}/pricing`,
          paymentOptions: `${APP_URL}/api/v1/pay/options`,
        });
      }

      if (handleTierInfo?.tier === "standard_5plus") {
        // H6: Standard handle entitlement check.
        // Requires an ACTIVE subscription (not just any plan) at registration time.
        // We verify against the subscriptions table directly rather than the cached plan name,
        // and record the subscription ID for audit trail.
        const existingUserId = req.userId;
        if (!existingUserId) {
          throw new AppError(402, "PLAN_REQUIRED", "Autonomous agents cannot register standard handles. Authenticate with an account and subscribe to a Starter plan or above.", {
            handle: requestedHandle,
            tier: "standard_5plus",
          });
        }
        const activeSub = await getActiveUserSubscription(existingUserId);
        const eligiblePlans = ["starter", "builder", "pro", "team", "enterprise"];
        const isEligible = activeSub !== null && eligiblePlans.includes(activeSub.plan);
        if (!isEligible) {
          throw new AppError(402, "PLAN_REQUIRED", "A 5+ character handle requires an active Starter plan or above", {
            handle: requestedHandle,
            tier: "standard_5plus",
            annualCents: handleTierInfo.annualCents,
            annualUsd: handleTierInfo.annualUsd,
            note: "Register without a handle first to obtain your permanent UUID identity, then upgrade to a Starter plan and claim a handle at /api/v1/pay/handle/claim.",
            upgradeUrl: `${APP_URL}/pricing`,
            paymentOptions: `${APP_URL}/api/v1/pay/options`,
            plans: [
              { id: "starter", name: "Starter", monthlyUsd: 29, yearlyUsd: 290 },
              { id: "pro", name: "Pro", monthlyUsd: 79, yearlyUsd: 790 },
            ],
            subscriptionStatus: activeSub?.status ?? "none",
          });
        }
        // Store the granting subscription ID for audit trail (attached to agent after creation below)
        // activeSub.providerSubscriptionId is the Stripe subscription ID
        // This is used further down when setting handlePaid=true
        (req as unknown as Record<string, unknown>)._grantingSubscriptionId = activeSub.providerSubscriptionId ?? activeSub.id;
      }

      const reservation = await getHandleReservation(requestedHandle);
      if (reservation.isReserved) {
        throw new AppError(409, "HANDLE_RESERVED", "This handle is reserved. If you are the legitimate brand owner, please contact support@getagent.id to claim it.");
      }

      const available = await isHandleAvailable(requestedHandle);
      if (!available) {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
    }
    const handleCheckMs = performance.now() - tHandleCheck;

    let ownerId = req.userId;
    const tUser = performance.now();

    if (ownerId) {
      const ownerPlan = await getUserPlan(ownerId);
      const ownerLimits = getPlanLimits(ownerPlan);
      const existingAgents = await db.select({ id: agentsTable.id }).from(agentsTable)
        .where(and(eq(agentsTable.userId, ownerId), eq(agentsTable.status, "active")));
      if (existingAgents.length >= ownerLimits.agentLimit) {
        throw new AppError(403, "AGENT_LIMIT_REACHED", `Agent limit reached. Your ${ownerPlan} plan allows ${ownerLimits.agentLimit} agent(s).`, {
          currentPlan: ownerPlan,
          agentLimit: ownerLimits.agentLimit,
          currentCount: existingAgents.length,
        });
      }
    }

    // C4: Per-IP daily unverified agent cap applies to ALL registrations (auth'd and anon)
    await checkUnverifiedAgentDailyLimit(req.ip);
    if (!ownerId) {
      const clientIp = req.ip;
      await checkSybilQuota(clientIp);

      const autonomousId = `auto_${randomBytes(16).toString("hex")}`;
      const [newUser] = await db.insert(usersTable).values({
        provider: "autonomous",
        providerId: autonomousId,
        displayName: requestedHandle ? `autonomous-${requestedHandle}` : `autonomous-${autonomousId.slice(0, 8)}`,
      }).returning({ id: usersTable.id });
      ownerId = newUser.id;
    } else {
      // H4: Authenticated users registering via the programmatic path are subject to the
      // same plan-based agent count limits as the dashboard path. Autonomous (no-owner)
      // registrations are rate-limited by the Sybil quota instead.
      const ownerPlanCheck = await getUserPlan(ownerId);
      const ownerLimits = getPlanLimits(ownerPlanCheck);
      const activeAgentCount = await db.select({ id: agentsTable.id }).from(agentsTable)
        .where(and(eq(agentsTable.userId, ownerId), eq(agentsTable.status, "active")));
      if (activeAgentCount.length >= ownerLimits.agentLimit) {
        throw new AppError(403, "AGENT_LIMIT_REACHED",
          `Agent limit reached. Your ${ownerPlanCheck} plan allows ${ownerLimits.agentLimit} agent(s).`,
          { currentPlan: ownerPlanCheck, agentLimit: ownerLimits.agentLimit, currentCount: activeAgentCount.length });
      }
    }
    const userMs = performance.now() - tUser;

    const tCreateAgent = performance.now();
    let agent: DbAgent & Record<string, unknown>;
    try {
      if (requestedHandle) {
        // Acquire a Postgres session-level advisory lock on the handle before creation to close
        // the race window between the availability check above and the DB insert below.
        // Mirrors the same pattern used in the human registration route (agents.ts).
        agent = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestedHandle!}))`);

          // Re-confirm availability inside the lock — a concurrent request may have
          // won the race between our outer check and this transaction.
          const existingRow = await tx.query.agentsTable.findFirst({
            where: sql`lower(${agentsTable.handle}) = lower(${requestedHandle!})`,
            columns: { id: true },
          });
          if (existingRow) {
            throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
          }

          const created = await createAgent({
            userId: ownerId,
            handle: requestedHandle ?? null,
            displayName,
            description,
            capabilities,
            endpointUrl,
            isPublic: false,
          });

          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          const tierInfo = getHandleTier(requestedHandle!);
          const grantingSubscriptionId = (req as unknown as Record<string, unknown>)._grantingSubscriptionId as string | undefined;
          await tx.update(agentsTable).set({
            handleTier: tierInfo.tier,
            handlePaid: true,
            handleRegisteredAt: new Date(),
            handleExpiresAt: oneYearFromNow,
            updatedAt: new Date(),
            ...(grantingSubscriptionId ? { metadata: { grantingSubscriptionId } } : {}),
          }).where(eq(agentsTable.id, created.id));

          return {
            ...created,
            handleTier: tierInfo.tier,
            handlePaid: true,
            handleRegisteredAt: new Date(),
            handleExpiresAt: oneYearFromNow,
          } as DbAgent & Record<string, unknown>;
        });
      } else {
        agent = await createAgent({
          userId: ownerId,
          handle: null,
          displayName,
          description,
          capabilities,
          endpointUrl,
          isPublic: false,
        }) as DbAgent & Record<string, unknown>;
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.message === "HANDLE_CONFLICT") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      throw err;
    }
    const createAgentMs = performance.now() - tCreateAgent;

    if (requestedHandle) {
      invalidateHandleCache(requestedHandle);
    }

    const tKeyAndChallenge = performance.now();
    const [agentKey, challenge] = await Promise.all([
      createAgentKey({
        agentId: agent.id,
        keyType,
        publicKey,
      }),
      initiateVerification(agent.id, "key_challenge"),
    ]);
    const keyAndChallengeMs = performance.now() - tKeyAndChallenge;

    if (ownerToken) {
      // C5: Owner-token linking at registration is only permitted for authenticated (non-autonomous) registrations.
      // Autonomous agents must go through the verified /link-owner flow after gaining verificationStatus="verified".
      // This prevents the ownerToken path from bypassing the verification requirement enforced on /link-owner.
      if (!req.userId) {
        logger.warn({ agentId: agent.id }, "[programmatic] C5: Rejecting ownerToken for autonomous registration — owner linking requires authenticated session");
        // Do not throw — just skip the token (autonomous agents can't claim ownership at registration)
      } else {
        try {
          const hashedOwnerToken = createHash("sha256").update(ownerToken).digest("hex");
          const tokenRecord = await db.query.ownerTokensTable.findFirst({
            where: and(
              eq(ownerTokensTable.token, hashedOwnerToken),
              eq(ownerTokensTable.used, false),
            ),
          });
          if (tokenRecord && new Date() < tokenRecord.expiresAt) {
            // Additional guard: token must belong to the authenticated user making this request.
            // Hard-fail rather than silently skip — caller needs to know their token was rejected
            // so they can investigate (wrong account, token generated by a different user, etc.).
            if (tokenRecord.userId !== req.userId) {
              throw new AppError(403, "OWNER_TOKEN_USER_MISMATCH", "The owner token was generated by a different account. Generate a new token from the account you are currently authenticated as.");
            }
            await db.transaction(async (tx) => {
              await tx.update(agentsTable).set({
                ownerUserId: tokenRecord.userId,
                isClaimed: true,
                claimedAt: new Date(),
                updatedAt: new Date(),
              }).where(eq(agentsTable.id, agent.id));
              await tx.update(ownerTokensTable).set({ used: true }).where(eq(ownerTokensTable.id, tokenRecord.id));
            });
            agent = { ...agent, ownerUserId: tokenRecord.userId, isClaimed: true, claimedAt: new Date() };
          }
        } catch (ownerTokenErr) {
          // Re-throw AppErrors (intentional failures like user mismatch); swallow transient DB errors
          if (ownerTokenErr instanceof AppError) throw ownerTokenErr;
          logger.warn({ agentId: agent.id }, "[programmatic] Failed to link owner token due to transient error, continuing without linking");
        }
      }
    }

    const tSideEffects = performance.now();
    await Promise.all([
      logActivity({
        agentId: agent.id,
        eventType: "agent.programmatic_registered",
        payload: { handle: agent.handle, hasHandle: !!requestedHandle, autonomous: !req.userId },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
      recomputeAndStore(agent.id),
    ]);
    const sideEffectsMs = performance.now() - tSideEffects;

    const totalMs = performance.now() - t0;
    logger.info({
      step: "register",
      agentId: agent.id,
      handle: agent.handle,
      hasHandle: !!requestedHandle,
      timings: {
        handleCheckMs: Math.round(handleCheckMs),
        userMs: Math.round(userMs),
        createAgentMs: Math.round(createAgentMs),
        keyAndChallengeMs: Math.round(keyAndChallengeMs),
        sideEffectsMs: Math.round(sideEffectsMs),
        totalMs: Math.round(totalMs),
      },
    }, `[programmatic] register completed in ${Math.round(totalMs)}ms`);

    const handleExpiresAt = agent.handleExpiresAt ?? null;
    const canonicalDid = `did:web:getagent.id:agents:${agent.id}`;
    res.status(201).json({
      agentId: agent.id,
      did: canonicalDid,
      machineIdentity: {
        agentId: agent.id,
        did: canonicalDid,
        permanent: true,
        resolutionUrl: `${APP_URL}/api/v1/resolve/id/${agent.id}`,
        profileUrl: `${APP_URL}/id/${agent.id}`,
      },
      handleIdentity: requestedHandle ? {
        handle: requestedHandle,
        did: canonicalDid,
        tier: handleTierInfo?.tier ?? null,
        expiresAt: handleExpiresAt,
        renewalUrl: `${APP_URL}/api/v1/pay/handle/renew`,
        claimUrl: `${APP_URL}/api/v1/pay/handle/claim`,
      } : null,
      handle: requestedHandle ?? null,
      kid: agentKey.kid,
      challenge: challenge.challenge,
      expiresAt: challenge.expiresAt,
      provisionalDomain: requestedHandle ? formatDomain(requestedHandle) : null,
      protocolAddress: requestedHandle ? formatHandle(requestedHandle) : null,
      note: requestedHandle
        ? "Handle alias registered. Complete verification to activate. Handle renewal required annually."
        : `No handle alias requested. Your permanent machine identity is ${canonicalDid}. Claim a handle alias at ${APP_URL}/handle/purchase after verification.`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/verify", challengeRateLimit, async (req, res, next) => {
  const t0 = performance.now();
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, challenge, signature, kid } = parsed.data;

    const tLookup = performance.now();
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (req.userId && !isAgentOwner(agent, req.userId)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    // H4: Re-check agent count limit before activation to prevent bypass via this path.
    // Only applies to owned agents (autonomous agents are limited by Sybil quota instead).
    if (agent.userId) {
      const ownerPlanVerify = await getUserPlan(agent.userId);
      const ownerLimitsVerify = getPlanLimits(ownerPlanVerify);
      const activeCountVerify = await db.select({ id: agentsTable.id }).from(agentsTable)
        .where(and(eq(agentsTable.userId, agent.userId), eq(agentsTable.status, "active")));
      if (activeCountVerify.length >= ownerLimitsVerify.agentLimit) {
        throw new AppError(403, "AGENT_LIMIT_REACHED",
          `Agent limit reached. Your ${ownerPlanVerify} plan allows ${ownerLimitsVerify.agentLimit} active agent(s).`,
          { currentPlan: ownerPlanVerify, agentLimit: ownerLimitsVerify.agentLimit });
      }
    }

    const lookupMs = performance.now() - tLookup;

    const tChallenge = performance.now();

    // H9: Per-agent challenge attempt tracking (Redis-backed, in addition to per-IP rate limiting).
    // Prevents distributed brute-force where many IPs submit wrong signatures for one agentId.
    const CHALLENGE_MAX_ATTEMPTS = 5;
    const CHALLENGE_ATTEMPT_WINDOW_SEC = 15 * 60; // 15 min lockout window
    const challengeLockKey = `challenge_lock:${agentId}`;
    let challengeLockout = false;
    if (isRedisConfigured()) {
      try {
        const redis = getRedis();
        const attempts = await redis.get(challengeLockKey);
        if (attempts && parseInt(attempts, 10) >= CHALLENGE_MAX_ATTEMPTS) {
          challengeLockout = true;
        }
      } catch {
        // Redis error: allow request through (per-IP rate limit still applies)
      }
    }
    if (challengeLockout) {
      throw new AppError(429, "CHALLENGE_LOCKED", "Too many failed verification attempts for this agent. Try again in 15 minutes.");
    }

    const result = await verifyChallenge(agentId, challenge, signature, kid);
    if (!result.success) {
      // Increment per-agent failure counter
      if (isRedisConfigured()) {
        try {
          const redis = getRedis();
          const count = await redis.incr(challengeLockKey);
          if (count === 1) {
            await redis.expire(challengeLockKey, CHALLENGE_ATTEMPT_WINDOW_SEC);
          }
        } catch {
          // Non-fatal — per-IP rate limit still provides protection
        }
      }
      await logActivity({
        agentId,
        eventType: "agent.verification_failed",
        payload: { error: result.error },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw new AppError(400, "VERIFICATION_FAILED", result.error!);
    }
    // Clear the per-agent lockout counter on successful verification
    if (isRedisConfigured()) {
      try {
        const redis = getRedis();
        await redis.del(challengeLockKey);
      } catch {}
    }
    const challengeMs = performance.now() - tChallenge;

    const apiKey = generateAgentApiKey();
    const claimToken = generateClaimToken(agentId, apiKey.prefix);

    const tParallel = performance.now();
    // H5: Wrap core activation writes in a transaction for atomicity.
    await db.transaction(async (tx) => {
      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: agentId,
        name: `${agent.handle ? agent.handle + "-primary" : "primary-" + agentId.slice(0, 8)}`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: [],
      });
      await tx
        .update(agentsTable)
        .set({
          status: 'active',
          verificationStatus: 'verified',
          verificationMethod: 'key_challenge',
          verifiedAt: new Date(),
          bootstrapIssuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agentId));
      await tx.insert(agentClaimTokensTable).values({
        agentId,
        token: claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    // Side-effects outside the transaction (non-critical)
    await Promise.all([
      getOrCreateInbox(agentId),
      logActivity({
        agentId,
        eventType: "agent.verified",
        payload: { method: "key_challenge", autonomous: !req.userId },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
    ]);
    const parallelMs = performance.now() - tParallel;

    const tFinalize = performance.now();
    const [trust, freshAgent, ownerPlan] = await Promise.all([
      recomputeAndStore(agentId),
      getAgentById(agentId),
      getUserPlan(agent.userId),
    ]);
    const bootstrap = await buildBootstrapBundle(freshAgent!);
    const limits = getPlanLimits(ownerPlan);

    setImmediate(async () => {
      try {
        const { provisionOwsWallet } = await import("../../services/ows-wallet");
        await provisionOwsWallet(agentId, freshAgent!.userId);
      } catch (err) {
        logger.error({ agentId, error: err instanceof Error ? err.message : err }, "[programmatic] Background OWS wallet provisioning failed");
      }
    });

    const finalizeMs = performance.now() - tFinalize;

    const totalMs = performance.now() - t0;
    logger.info({
      step: "verify",
      agentId,
      timings: {
        lookupMs: Math.round(lookupMs),
        challengeMs: Math.round(challengeMs),
        parallelMs: Math.round(parallelMs),
        finalizeMs: Math.round(finalizeMs),
        totalMs: Math.round(totalMs),
      },
    }, `[programmatic] verify completed in ${Math.round(totalMs)}ms`);

    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const claimUrl = `${APP_URL}/claim?token=${encodeURIComponent(claimToken)}`;

    const verifyCanonicalDid = `did:web:getagent.id:agents:${agentId}`;
    res.json({
      verified: true,
      agentId,
      did: verifyCanonicalDid,
      machineIdentity: {
        agentId,
        did: verifyCanonicalDid,
        resolutionUrl: `${APP_URL}/api/v1/resolve/id/${agentId}`,
      },
      handle: agent.handle ?? null,
      domain: agent.handle ? formatDomain(agent.handle) : null,
      protocolAddress: agent.handle ? formatHandle(agent.handle) : null,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      apiKey: apiKey.raw,
      bootstrap,
      claimUrl,
      ownershipNote: "Save this claim URL. Visit it while signed in to your Agent ID account to permanently link this agent to your account.",
      wallet: freshAgent?.walletAddress
        ? { address: freshAgent.walletAddress, network: freshAgent.walletNetwork || "base-mainnet" }
        : { status: "provisioning", note: "Wallet is being provisioned in the background. Poll GET /api/v1/agents/{agentId}/wallet for status." },
      planStatus: {
        currentPlan: ownerPlan,
        features: {
          inbox: limits.canReceiveMail,
          publicResolution: limits.canBePublic,
          marketplaceListing: limits.canListOnMarketplace,
          premiumRouting: limits.canUsePremiumRouting,
        },
        uuidResolutionUrl: `${APP_URL}/api/v1/resolve/id/${agentId}`,
        upgradePath: limits.canReceiveMail ? null : `${APP_URL}/pricing`,
        note: limits.canReceiveMail
          ? "All features are enabled on your current plan."
          : "UUID identity, Ed25519 key, signed credential, and bootstrap bundle are available without a plan. Upgrade to a Starter plan or above to unlock inbox, public resolution, and marketplace listing.",
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/rotate-key", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = rotateKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const result = await rotateAgentKey(
      agent.id,
      parsed.data.oldKeyId,
      parsed.data.newPublicKey,
      parsed.data.keyType,
    );

    if (!result) {
      throw new AppError(400, "KEY_NOT_FOUND", "Old key not found or already revoked");
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.key_rotated",
      payload: {
        revokedKeyId: result.revokedKey.id,
        newKeyKid: result.newKey.kid,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      revokedKeyId: result.revokedKey.id,
      newKey: {
        id: result.newKey.id,
        kid: result.newKey.kid,
        keyType: result.newKey.keyType,
        createdAt: result.newKey.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/auth-metadata", challengeRateLimit, async (req, res, next) => {
  try {
    const meta = await getAuthMetadata(req.params.agentId as string);
    if (!meta) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

const createAgentApiKeySchema = z.object({
  name: z.string().min(1).max(255).default("default"),
  scopes: z.array(z.string()).max(20).optional(),
});

function generateAgentApiKey(): { raw: string; prefix: string; hashed: string } {
  const raw = `agk_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 8);
  const hashed = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hashed };
}

router.post("/agents/:agentId/api-keys", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const parsed = createAgentApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const apiKey = generateAgentApiKey();

    const [record] = await db.insert(apiKeysTable).values({
      ownerType: "agent",
      ownerId: agent.id,
      name: parsed.data.name,
      keyPrefix: apiKey.prefix,
      hashedKey: apiKey.hashed,
      scopes: parsed.data.scopes || [],
    }).returning();

    await logActivity({
      agentId: agent.id,
      eventType: "agent.key_created",
      payload: { apiKeyId: record.id, name: parsed.data.name },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      apiKey: apiKey.raw,
      scopes: record.scopes,
      createdAt: record.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/api-keys", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const keys = await db.query.apiKeysTable.findMany({
      where: and(
        eq(apiKeysTable.ownerType, "agent"),
        eq(apiKeysTable.ownerId, agent.id),
      ),
      columns: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    res.json({ keys });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/api-keys/rotate", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const apiKey = generateAgentApiKey();

    await db.transaction(async (tx) => {
      await tx
        .delete(apiKeysTable)
        .where(and(eq(apiKeysTable.ownerType, "agent"), eq(apiKeysTable.ownerId, agent.id)));

      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: agent.id,
        name: "default",
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: [],
      });
    });

    await logActivity({
      agentId: agent.id,
      eventType: "agent.key_rotated",
      payload: {},
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      apiKey: apiKey.raw,
      keyPrefix: apiKey.prefix,
      message: "API key rotated. Store the new key securely — it will not be shown again.",
    });
  } catch (err) {
    next(err);
  }
});

const renewSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/agents/:agentId/handle/renew", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    if (!agent.handle || !agent.handleExpiresAt) {
      throw new AppError(400, "NO_HANDLE", "This agent does not have an active handle registration");
    }

    const parsed = renewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const pricing = getHandleTier(agent.handle);
    const stripe = getStripe();

    const user = await db
      .select({ id: usersTable.id, stripeCustomerId: usersTable.stripeCustomerId, email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    if (!user[0]) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    let customerId = user[0].stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user[0].email ?? undefined,
        name: user[0].displayName ?? undefined,
        metadata: { userId: user[0].id },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(usersTable.id, req.userId!));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Handle Renewal: @${agent.handle}`,
              description: `One-year renewal for @${agent.handle} on Agent ID (${pricing.tier})`,
            },
            unit_amount: pricing.annualCents,
          },
          quantity: 1,
        },
      ],
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      metadata: {
        type: "handle_renewal",
        agentId: agent.id,
        handle: agent.handle,
        userId: req.userId!,
        tier: pricing.tier,
        priceCents: String(pricing.annualCents),
      },
    });

    res.json({
      url: session.url,
      handle: agent.handle,
      tier: pricing.tier,
      annualPriceUsd: Math.round(pricing.annualCents / 100),
      annualPriceCents: pricing.annualCents,
      currentExpiry: agent.handleExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

const recoverChallengeSchema = z.object({
  agentId: z.string().uuid().optional(),
  handle: z.string().min(1).optional(),
}).refine((data) => data.agentId || data.handle, {
  message: "At least one of agentId or handle is required",
});

const recoverSchema = z.object({
  agentId: z.string().uuid().optional(),
  handle: z.string().min(1).optional(),
  signature: z.string().min(1),
  kid: z.string().min(1).optional(),
}).refine((data) => data.agentId || data.handle, {
  message: "At least one of agentId or handle is required",
});

const RECOVERY_CHALLENGE_TTL = 600;

router.post("/recover/challenge", recoveryRateLimit, async (req, res, next) => {
  try {
    if (!isRedisConfigured()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Recovery service requires Redis, which is not configured");
    }

    const parsed = recoverChallengeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId: inputAgentId, handle } = parsed.data;

    let agent;
    if (inputAgentId) {
      agent = await getAgentById(inputAgentId);
    } else if (handle) {
      agent = await getAgentByHandle(handle);
    }

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const challenge = randomBytes(32).toString("hex");
    const redisKey = `recovery:challenge:${agent.id}`;
    const redis = getRedis();
    await redis.set(redisKey, challenge, "EX", RECOVERY_CHALLENGE_TTL);

    const expiresAt = new Date(Date.now() + RECOVERY_CHALLENGE_TTL * 1000).toISOString();

    res.json({
      agentId: agent.id,
      handle: agent.handle,
      challenge,
      expiresAt,
      signingInstructions: "Sign the challenge string with your Ed25519 private key (the one corresponding to the public key registered for this agent). Submit the base64-encoded signature to POST /api/v1/programmatic/recover.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/recover", recoveryRateLimit, async (req, res, next) => {
  try {
    if (!isRedisConfigured()) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Recovery service requires Redis, which is not configured");
    }

    const parsed = recoverSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId: inputAgentId, handle, signature, kid } = parsed.data;

    let agent;
    if (inputAgentId) {
      agent = await getAgentById(inputAgentId);
    } else if (handle) {
      agent = await getAgentByHandle(handle);
    }

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (agent.isClaimed && agent.userId) {
      if (!req.userId || req.userId !== agent.userId) {
        throw new AppError(403, "OWNER_AUTH_REQUIRED", "This agent has a verified owner. Sign into your Agent ID account first, then retry recovery.", {
          hint: "Visit https://getagent.id/dashboard to sign in",
          agentHandle: agent.handle,
          isClaimed: true,
        });
      }
    }

    const redis = getRedis();

    const attemptsKey = `recovery:attempts:${agent.id}`;
    const recoveryAttempts = await redis.incr(attemptsKey);
    if (recoveryAttempts === 1) {
      await redis.expire(attemptsKey, 3600);
    }

    if (recoveryAttempts > 3) {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.api_key.recovery_attempted",
        payload: {
          success: false,
          attemptNumber: recoveryAttempts,
          ipHash: hashIp(req.ip),
          isClaimed: !!agent.isClaimed,
          reason: "rate_limited",
        },
      });
      throw new AppError(429, "TOO_MANY_RECOVERY_ATTEMPTS", "Maximum 3 recovery attempts per hour. Try again later or contact support.", {
        retryAfter: 3600,
      });
    }

    const redisKey = `recovery:challenge:${agent.id}`;
    const challenge = await redis.get(redisKey);

    if (!challenge) {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.api_key.recovery_attempted",
        payload: {
          success: false,
          attemptNumber: recoveryAttempts,
          ipHash: hashIp(req.ip),
          isClaimed: !!agent.isClaimed,
          reason: "challenge_expired",
        },
      });
      throw new AppError(410, "CHALLENGE_EXPIRED", "Recovery challenge has expired or does not exist. Please request a new challenge.");
    }

    let candidateKeys;
    if (kid) {
      const keyByKid = await db.query.agentKeysTable.findFirst({
        where: and(
          eq(agentKeysTable.agentId, agent.id),
          eq(agentKeysTable.kid, kid),
          or(
            eq(agentKeysTable.status, "active"),
            eq(agentKeysTable.status, "rotating"),
          ),
        ),
      });
      candidateKeys = keyByKid ? [keyByKid] : [];
    } else {
      candidateKeys = await db.query.agentKeysTable.findMany({
        where: and(
          eq(agentKeysTable.agentId, agent.id),
          or(
            eq(agentKeysTable.status, "active"),
            eq(agentKeysTable.status, "rotating"),
          ),
        ),
        orderBy: (keys, { desc }) => [desc(keys.createdAt)],
      });
    }

    if (candidateKeys.length === 0) {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.api_key.recovery_attempted",
        payload: {
          success: false,
          attemptNumber: recoveryAttempts,
          ipHash: hashIp(req.ip),
          isClaimed: !!agent.isClaimed,
          reason: "no_keys",
        },
      });
      throw new AppError(400, "NO_KEYS", "No active or rotating keys found for this agent");
    }

    let matchedKey = null;
    for (const key of candidateKeys) {
      if (!key.publicKey) continue;
      try {
        const pubKey = createPublicKey({
          key: Buffer.from(key.publicKey, "base64"),
          format: "der",
          type: "spki",
        });
        // H2: Cryptographic enforcement — reject non-Ed25519 key material regardless of stored label
        if (pubKey.asymmetricKeyType !== "ed25519") {
          continue;
        }
        const isValid = cryptoVerify(
          null,
          Buffer.from(challenge),
          pubKey,
          Buffer.from(signature, "base64"),
        );
        if (isValid) {
          matchedKey = key;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!matchedKey) {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.api_key.recovery_attempted",
        payload: {
          success: false,
          attemptNumber: recoveryAttempts,
          ipHash: hashIp(req.ip),
          isClaimed: !!agent.isClaimed,
          reason: "signature_invalid",
        },
      });
      throw new AppError(403, "SIGNATURE_INVALID", "Signature verification failed against all candidate keys");
    }

    const deleted = await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      redisKey,
      challenge,
    ) as number;

    if (!deleted) {
      throw new AppError(410, "CHALLENGE_EXPIRED", "Recovery challenge was already consumed by a concurrent request. Please request a new challenge.");
    }

    const apiKey = generateAgentApiKey();
    await db.transaction(async (tx) => {
      await tx.delete(apiKeysTable).where(
        and(
          eq(apiKeysTable.ownerType, "agent"),
          eq(apiKeysTable.ownerId, agent!.id),
        ),
      );
      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: agent!.id,
        name: `${agent!.handle}-recovered`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: [],
      });
    });

    await logActivity({
      agentId: agent.id,
      eventType: "agent.api_key.recovered",
      payload: { matchedKid: matchedKey.kid },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { logSignedActivity } = await import("../../services/activity-log");
    await logSignedActivity({
      agentId: agent.id,
      eventType: "agent.api_key.recovery_attempted",
      payload: {
        success: true,
        attemptNumber: recoveryAttempts,
        ipHash: hashIp(req.ip),
        isClaimed: !!agent.isClaimed,
        matchedKid: matchedKey.kid,
      },
    });

    res.json({
      recovered: true,
      apiKey: apiKey.raw,
      agentId: agent.id,
      handle: agent.handle,
      matchedKid: matchedKey.kid,
      message: "API key recovered successfully. All previous API keys have been revoked.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
