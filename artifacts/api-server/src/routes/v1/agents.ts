import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { logger } from "../../middlewares/request-logger";
import { requireAuth } from "../../middlewares/replit-auth";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  createAgent,
  listAgentsByUser,
  getAgentById,
  updateAgent,
  deleteAgent,
  validateHandle,
  isHandleAvailable,
} from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { requirePlanFeature, getHandlePriceCents } from "../../services/billing";
import {
  getActiveCredential,
  issueCredential,
  reissueCredential,
} from "../../services/credentials";
import { buildBootstrapBundle } from "./agent-runtime";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentActivityLogTable } from "@workspace/db/schema";

const router = Router();

router.get("/whoami", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = req.authenticatedAgent!;
    const bundle = await buildBootstrapBundle(agent);
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

const createAgentSchema = z.object({
  handle: z.string().min(3).max(100),
  displayName: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  endpointUrl: z.url().optional(),
  capabilities: z.array(z.string()).max(50).optional(),
  scopes: z.array(z.string()).max(50).optional(),
  protocols: z.array(z.string()).max(20).optional(),
  authMethods: z.array(z.string()).max(10).optional(),
  paymentMethods: z.array(z.string()).max(10).optional(),
  isPublic: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  endpointUrl: z.url().optional(),
  endpointSecret: z.string().max(500).optional(),
  capabilities: z.array(z.string()).max(50).optional(),
  scopes: z.array(z.string()).max(50).optional(),
  protocols: z.array(z.string()).max(20).optional(),
  authMethods: z.array(z.string()).max(10).optional(),
  paymentMethods: z.array(z.string()).max(10).optional(),
  isPublic: z.boolean().optional(),
  status: z.enum(["draft", "active", "inactive"]).optional(),
  avatarUrl: z.url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle } = parsed.data;
    const handleError = validateHandle(handle);
    if (handleError) {
      throw new AppError(400, "INVALID_HANDLE", handleError);
    }

    const normalizedHandle = handle.toLowerCase();
    const available = await isHandleAvailable(normalizedHandle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    const handlePriceCents = getHandlePriceCents(normalizedHandle);
    const handleLen = normalizedHandle.replace(/[^a-z0-9]/g, "").length;
    const pricingTier = handleLen <= 3 ? "ultra_premium" : handleLen === 4 ? "premium" : "standard";

    let agent;
    try {
      agent = await createAgent({
        userId: req.userId!,
        ...parsed.data,
        handle: normalizedHandle,
        metadata: {
          ...(parsed.data.metadata || {}),
          handlePricing: {
            annualPriceCents: handlePriceCents,
            tier: pricingTier,
            characterLength: handleLen,
            paymentStatus: "pending",
            registeredAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message === "HANDLE_CONFLICT") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      throw err;
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.created",
      payload: {
        handle: agent.handle,
        handlePriceCents,
        pricingTier,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.created",
        payload: { handle: agent.handle },
        isPublic: true,
      });
    } catch {}

    await recomputeAndStore(agent.id);

    res.status(201).json({
      ...agent,
      handlePricing: {
        annualPriceCents: handlePriceCents,
        annualPriceDollars: handlePriceCents / 100,
        tier: pricingTier,
        characterLength: handleLen,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const agents = await listAgentsByUser(req.userId!);
    const enriched = agents.map((a) => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      const hp = meta.handlePricing as Record<string, unknown> | undefined;
      return {
        ...a,
        handlePricing: hp
          ? {
              annualPriceCents: hp.annualPriceCents,
              annualPriceDollars: Number(hp.annualPriceCents) / 100,
              tier: hp.tier,
              characterLength: hp.characterLength,
              paymentStatus: hp.paymentStatus,
            }
          : undefined,
      };
    });
    res.json({ agents: enriched });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    res.json(agent);
  } catch (err) {
    next(err);
  }
});

router.put("/:agentId", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "No fields to update");
    }

    if (parsed.data.metadata) {
      const incoming = parsed.data.metadata as Record<string, unknown>;
      delete incoming.handlePricing;
    }

    if (parsed.data.isPublic === true) {
      const eligibility = await requirePlanFeature(req.userId!, "canListOnMarketplace");
      if (!eligibility.allowed) {
        throw new AppError(403, "PLAN_REQUIRED",
          `Marketplace listing requires the ${eligibility.requiredPlan} plan or higher. Current plan: ${eligibility.currentPlan}`);
      }
    }

    const existingAgent = await getAgentById(agentId);
    if (existingAgent) {
      const meta = (existingAgent.metadata || {}) as Record<string, unknown>;
      const hp = meta.handlePricing as Record<string, unknown> | undefined;
      if (hp?.paymentStatus === "pending") {
        if (parsed.data.status === "active") {
          throw new AppError(402, "HANDLE_PAYMENT_REQUIRED",
            "Handle payment must be completed before activating this agent. Use POST /billing/handle-checkout.");
        }
        if (parsed.data.isPublic === true) {
          throw new AppError(402, "HANDLE_PAYMENT_REQUIRED",
            "Handle payment must be completed before listing this agent publicly.");
        }
      }
    }

    const updated = await updateAgent(agentId, req.userId!, parsed.data);
    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Agent not found or you do not own it");
    }

    const changedFields = Object.keys(parsed.data);
    await logActivity({
      agentId: updated.id,
      eventType: changedFields.includes("endpointUrl")
        ? "agent.endpoint_updated"
        : changedFields.includes("status")
          ? "agent.status_changed"
          : "agent.updated",
      payload: { updatedFields: changedFields },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const trustRelevantChanged = changedFields.some((f) => ["endpointUrl", "capabilities", "description", "avatarUrl", "protocols"].includes(f));
    const credentialRelevantChanged = changedFields.some((f) => ["capabilities", "protocols"].includes(f));

    if (trustRelevantChanged) {
      const result = await recomputeAndStore(updated.id);
      const previousScore = existingAgent?.trustScore ?? 0;
      const scoreChangedEnough = Math.abs(result.trustScore - previousScore) >= 5;

      if (credentialRelevantChanged && !scoreChangedEnough) {
        try {
          await reissueCredential(updated.id);
        } catch (err) {
          logger.error({ err }, "[agents] Failed to reissue credential after update");
        }
      }
    } else if (credentialRelevantChanged) {
      try {
        await reissueCredential(updated.id);
      } catch (err) {
        logger.error({ err }, "[agents] Failed to reissue credential after update");
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

function requireHumanOrAgentAuthForDelete(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.delete("/:agentId", requireHumanOrAgentAuthForDelete, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "An agent can only delete itself");
      }
    } else {
      if (agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.deleted",
      payload: { handle: agent.handle, deletedBy: req.authenticatedAgent ? "agent-key" : "user" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await deleteAgent(agentId, agent.userId);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/activity", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const source = req.query.source as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    if (source === "signed") {
      const { getSignedActivityLog } = await import("../../services/activity-log");
      const activities = await getSignedActivityLog(agentId, limit, offset);
      res.json({ activities, source: "signed" });
      return;
    }

    const activities = await db.query.agentActivityLogTable.findMany({
      where: eq(agentActivityLogTable.agentId, agentId),
      orderBy: [desc(agentActivityLogTable.createdAt)],
      limit,
    });

    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/keys/rotate", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only rotate its own keys");
    }

    const { oldKeyId, newPublicKey, keyType, reason } = req.body;
    if (!oldKeyId || !newPublicKey) {
      throw new AppError(400, "VALIDATION_ERROR", "oldKeyId and newPublicKey are required");
    }

    const { initiateKeyRotation } = await import("../../services/agent-keys");

    const result = await initiateKeyRotation(agentId, oldKeyId, newPublicKey, keyType || "ed25519", reason);
    if (!result) {
      throw new AppError(404, "NOT_FOUND", "Active key not found");
    }

    await logActivity({
      agentId,
      eventType: "agent.key_rotated",
      payload: {
        oldKeyId,
        newKeyId: result.newKey.id,
        rotationLogId: result.rotationLogId,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_rotated",
        payload: {
          oldKeyId,
          newKeyId: result.newKey.id,
          rotationLogId: result.rotationLogId,
        },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(agentId, "key.rotated", {
        oldKeyId,
        newKeyId: result.newKey.id,
        rotationLogId: result.rotationLogId,
      });
    } catch {}

    res.status(201).json({
      oldKey: result.oldKey,
      newKey: result.newKey,
      rotationLogId: result.rotationLogId,
      gracePeriodEnds: result.oldKey.expiresAt,
      message: "Key rotation initiated. Old key has a 24h grace period. Call /keys/verify-rotation to complete.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/keys/verify-rotation", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only verify its own key rotations");
    }

    const { rotationLogId } = req.body;
    if (!rotationLogId) {
      throw new AppError(400, "VALIDATION_ERROR", "rotationLogId is required");
    }

    const { verifyKeyRotation } = await import("../../services/agent-keys");
    const result = await verifyKeyRotation(agentId, rotationLogId);

    if (!result.success) {
      throw new AppError(404, "NOT_FOUND", result.message);
    }

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_rotation_verified",
        payload: { rotationLogId },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(agentId, "key.rotation_verified", { rotationLogId });
    } catch {}

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/credential", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    let credential = await getActiveCredential(agentId);
    if (!credential) {
      credential = await issueCredential(agentId);
    }

    res.json(credential);
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/credential/reissue", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const credential = await reissueCredential(agentId);
    res.json(credential);
  } catch (err) {
    next(err);
  }
});

export default router;
