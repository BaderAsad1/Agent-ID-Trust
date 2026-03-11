import { Router } from "express";
import { z } from "zod/v4";
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

router.post("/agents/register", requireAuth, async (req, res, next) => {
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

    let agent;
    try {
      agent = await createAgent({
        userId: req.userId!,
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
      payload: { handle: agent.handle },
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
      provisionalDomain: `${agent.handle}.agent`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/verify", requireAuth, async (req, res, next) => {
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
    if (agent.userId !== req.userId) {
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
      payload: { method: "key_challenge" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const trust = await recomputeAndStore(agentId);

    res.json({
      verified: true,
      agentId,
      handle: agent.handle,
      domain: `${agent.handle}.agent`,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
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

export default router;
