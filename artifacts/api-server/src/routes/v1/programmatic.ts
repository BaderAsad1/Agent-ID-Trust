import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  createAgent,
  getAgentById,
  validateHandle,
  isHandleAvailable,
} from "../../services/agents";
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
import { db } from "@workspace/db";
import { apiKeysTable, usersTable } from "@workspace/db/schema";

const router = Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  message: {
    error: "Too many registration attempts",
    code: "RATE_LIMIT_EXCEEDED",
    retryAfterSeconds: 900,
  },
  validate: { xForwardedForHeader: false },
});

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

router.post("/agents/register", registrationLimiter, async (req, res, next) => {
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

    const available = await isHandleAvailable(handle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    let ownerId = req.userId;
    if (!ownerId) {
      const autonomousId = `auto_${randomBytes(16).toString("hex")}`;
      const [newUser] = await db.insert(usersTable).values({
        replitUserId: autonomousId,
        displayName: `autonomous-${handle.toLowerCase()}`,
      }).returning({ id: usersTable.id });
      ownerId = newUser.id;
    }

    let agent;
    try {
      agent = await createAgent({
        userId: ownerId,
        handle: handle.toLowerCase(),
        displayName,
        description,
        capabilities,
        endpointUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "HANDLE_CONFLICT") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      throw err;
    }

    const agentKey = await createAgentKey({
      agentId: agent.id,
      keyType,
      publicKey,
    });

    const challenge = await initiateVerification(agent.id, "key_challenge");

    await logActivity({
      agentId: agent.id,
      eventType: "agent.programmatic_registered",
      payload: { handle: agent.handle, autonomous: !req.userId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await recomputeAndStore(agent.id);

    res.status(201).json({
      agentId: agent.id,
      handle: agent.handle,
      kid: agentKey.kid,
      challenge: challenge.challenge,
      expiresAt: challenge.expiresAt,
      provisionalDomain: `${agent.handle.toLowerCase()}.getagent.id`,
      protocolAddress: `${agent.handle}.agentid`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/verify", registrationLimiter, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, challenge, signature, kid } = parsed.data;

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (req.userId && agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

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

    await logActivity({
      agentId,
      eventType: "agent.verified",
      payload: { method: "key_challenge", autonomous: !req.userId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const trust = await recomputeAndStore(agentId);

    const apiKey = generateAgentApiKey();
    await db.insert(apiKeysTable).values({
      ownerType: "agent",
      ownerId: agentId,
      name: `${agent.handle}-primary`,
      keyPrefix: apiKey.prefix,
      hashedKey: apiKey.hashed,
      scopes: [],
    });

    res.json({
      verified: true,
      agentId,
      handle: agent.handle,
      domain: `${agent.handle.toLowerCase()}.getagent.id`,
      protocolAddress: `${agent.handle}.agentid`,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      apiKey: apiKey.raw,
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

export default router;
