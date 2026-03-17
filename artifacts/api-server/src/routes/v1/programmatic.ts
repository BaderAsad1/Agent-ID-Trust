import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash, verify as cryptoVerify, createPublicKey } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { logger } from "../../middlewares/request-logger";
import {
  createAgent,
  getAgentById,
  getAgentByHandle,
  validateHandle,
  isHandleAvailable,
  invalidateHandleCache,
  getHandleReservation,
} from "../../services/agents";
import { formatDomain, formatHandle, formatResolverUrl } from "../../utils/handle";
import { getUserPlan, getPlanLimits } from "../../services/billing";
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
import { buildBootstrapBundle } from "./agent-runtime";
import { getHandlePricing } from "../../services/handle-pricing";
import { getStripe } from "../../services/stripe-client";
import { getOrCreateInbox } from "../../services/mail";
import { generateClaimToken } from "../../utils/claim-token";
import { db } from "@workspace/db";
import { apiKeysTable, usersTable, agentsTable, agentClaimTokensTable, agentKeysTable } from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getRedis, isRedisConfigured } from "../../lib/redis";
import { recoveryRateLimit } from "../../middlewares/rate-limit";

function hashIp(ip: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(ip) ? ip[0] : ip;
  if (!raw) return undefined;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const router = Router();

const registerSchema = z.object({
  handle: z.string().min(3).max(100),
  displayName: z.string().min(1).max(255),
  publicKey: z.string().min(1),
  keyType: z.string().default("ed25519"),
  description: z.string().max(5000).optional(),
  capabilities: z.array(z.string()).max(50).optional(),
  endpointUrl: z.url().optional(),
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
  keyType: z.string().default("ed25519"),
});

router.post("/agents/register", async (req, res, next) => {
  const t0 = performance.now();
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle, displayName, publicKey, keyType, description, capabilities, endpointUrl } =
      parsed.data;

    const handleError = validateHandle(handle.toLowerCase());
    if (handleError) {
      throw new AppError(400, "INVALID_HANDLE", handleError);
    }

    const tHandleCheck = performance.now();

    const reservation = await getHandleReservation(handle.toLowerCase());
    if (reservation.isReserved) {
      throw new AppError(409, "HANDLE_RESERVED", "This handle is reserved. If you are the legitimate brand owner, please contact support@getagent.id to claim it.");
    }

    const available = await isHandleAvailable(handle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }
    const handleCheckMs = performance.now() - tHandleCheck;

    let ownerId = req.userId;
    const tUser = performance.now();
    if (!ownerId) {
      const autonomousId = `auto_${randomBytes(16).toString("hex")}`;
      const [newUser] = await db.insert(usersTable).values({
        replitUserId: autonomousId,
        displayName: `autonomous-${handle.toLowerCase()}`,
      }).returning({ id: usersTable.id });
      ownerId = newUser.id;
    }
    const userMs = performance.now() - tUser;

    const tCreateAgent = performance.now();
    let agent;
    try {
      agent = await createAgent({
        userId: ownerId,
        handle: handle.toLowerCase(),
        displayName,
        description,
        capabilities,
        endpointUrl,
        isPublic: false,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "HANDLE_CONFLICT") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      throw err;
    }
    const createAgentMs = performance.now() - tCreateAgent;

    invalidateHandleCache(handle);

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

    const tSideEffects = performance.now();
    await Promise.all([
      logActivity({
        agentId: agent.id,
        eventType: "agent.programmatic_registered",
        payload: { handle: agent.handle, autonomous: !req.userId },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
      recomputeAndStore(agent.id),
    ]);
    const sideEffectsMs = performance.now() - tSideEffects;

    const totalMs = performance.now() - t0;
    logger.info({
      step: "register",
      handle: agent.handle,
      timings: {
        handleCheckMs: Math.round(handleCheckMs),
        userMs: Math.round(userMs),
        createAgentMs: Math.round(createAgentMs),
        keyAndChallengeMs: Math.round(keyAndChallengeMs),
        sideEffectsMs: Math.round(sideEffectsMs),
        totalMs: Math.round(totalMs),
      },
    }, `[programmatic] register completed in ${Math.round(totalMs)}ms`);

    res.status(201).json({
      agentId: agent.id,
      handle: agent.handle,
      kid: agentKey.kid,
      challenge: challenge.challenge,
      expiresAt: challenge.expiresAt,
      provisionalDomain: formatDomain(agent.handle),
      protocolAddress: formatHandle(agent.handle),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/verify", async (req, res, next) => {
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
    if (req.userId && agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    const lookupMs = performance.now() - tLookup;

    const tChallenge = performance.now();
    const result = await verifyChallenge(agentId, challenge, signature, kid);
    if (!result.success) {
      await logActivity({
        agentId,
        eventType: "agent.verification_failed",
        payload: { error: result.error },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw new AppError(400, "VERIFICATION_FAILED", result.error!);
    }
    const challengeMs = performance.now() - tChallenge;

    const apiKey = generateAgentApiKey();
    const claimToken = generateClaimToken(agentId, apiKey.prefix);

    const tParallel = performance.now();
    await Promise.all([
      db.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: agentId,
        name: `${agent.handle}-primary`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: [],
      }),
      db
        .update(agentsTable)
        .set({
          status: 'active',
          verificationStatus: 'verified',
          verificationMethod: 'key_challenge',
          verifiedAt: new Date(),
          bootstrapIssuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agentId)),
      getOrCreateInbox(agentId),
      db.insert(agentClaimTokensTable).values({
        agentId,
        token: claimToken,
      }),
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

    res.json({
      verified: true,
      agentId,
      handle: agent.handle,
      domain: formatDomain(agent.handle),
      protocolAddress: formatHandle(agent.handle),
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      apiKey: apiKey.raw,
      bootstrap,
      claimUrl,
      ownershipNote: "Save this claim URL. Visit it while signed in to your Agent ID account to permanently link this agent to your account.",
      planStatus: {
        currentPlan: ownerPlan,
        features: {
          inbox: limits.canReceiveMail,
          publicResolution: limits.canBePublic,
          marketplaceListing: limits.canListOnMarketplace,
          premiumRouting: limits.canUsePremiumRouting,
        },
        uuidResolutionUrl: `${APP_URL}/api/v1/resolve/id/${agentId}`,
        upgradePath: limits.canReceiveMail ? null : `${APP_URL}/billing/upgrade`,
        note: limits.canReceiveMail
          ? "All features are enabled on your current plan."
          : "Free plan includes UUID identity, Ed25519 key, signed credential, bootstrap bundle, UUID-based lookup, and heartbeat. Upgrade to unlock inbox, public resolution, and marketplace listing.",
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
    if (agent.userId !== req.userId) {
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

router.get("/agents/:agentId/auth-metadata", async (req, res, next) => {
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
    if (agent.userId !== req.userId) {
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
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    if (!agent.handle || !agent.handleExpiresAt) {
      throw new AppError(400, "NO_HANDLE", "This agent does not have an active handle registration");
    }

    const parsed = renewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const pricing = getHandlePricing(agent.handle);
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
            unit_amount: pricing.annualPriceCents,
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
        priceCents: String(pricing.annualPriceCents),
      },
    });

    res.json({
      url: session.url,
      handle: agent.handle,
      tier: pricing.tier,
      annualPriceUsd: pricing.annualPriceUsd,
      annualPriceCents: pricing.annualPriceCents,
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
