import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { logger } from "../../middlewares/request-logger";
import {
  createAgent,
  getAgentById,
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
import { apiKeysTable, usersTable, agentsTable, agentClaimTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

export default router;
