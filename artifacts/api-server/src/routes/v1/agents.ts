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
  getHandleReservation,
  isHandleReserved,
  type RevokeAgentInput,
} from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { requirePlanFeature, getHandlePriceCents, getUserPlan, getPlanLimits } from "../../services/billing";
import {
  getActiveCredential,
  issueCredential,
  reissueCredential,
} from "../../services/credentials";
import { clearVcCache } from "../../services/verifiable-credential";
import { buildBootstrapBundle } from "./agent-runtime";
import { verifyClaimToken, generateClaimToken } from "../../utils/claim-token";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentActivityLogTable, agentsTable, agentClaimTokensTable, agentReportsTable, tasksTable, agentClaimHistoryTable } from "@workspace/db/schema";

const router = Router();

router.get("/whoami", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = req.authenticatedAgent!;
    const [bundle, plan] = await Promise.all([
      buildBootstrapBundle(agent),
      getUserPlan(agent.userId),
    ]);
    const limits = getPlanLimits(plan);
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const entitlements = {
      inbox: limits.canReceiveMail,
      tasks: limits.tasksAccess,
      fleet: limits.fleetManagement,
      analytics: limits.analyticsAccess,
      marketplace: limits.canListOnMarketplace,
      trustScore: true,
      currentPlan: plan,
      upgradeUrl: `${APP_URL}/pricing`,
    };
    res.json({ ...bundle, entitlements });
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

    if (isHandleReserved(normalizedHandle)) {
      throw new AppError(409, "HANDLE_RESERVED", "This handle is reserved for brand protection. If you are the legitimate brand owner, please contact support@getagent.id to claim it.");
    }

    const reservation = await getHandleReservation(normalizedHandle);
    if (reservation.isReserved) {
      throw new AppError(409, "HANDLE_RESERVED", "This handle is reserved. If you are the legitimate brand owner, please contact support@getagent.id to claim it.");
    }

    const available = await isHandleAvailable(normalizedHandle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    const handlePriceCents = getHandlePriceCents(normalizedHandle);
    const handleLen = normalizedHandle.replace(/[^a-z0-9]/g, "").length;
    const pricingTier = handleLen <= 3 ? "ultra_premium" : handleLen === 4 ? "premium" : "standard";

    const isSandbox = req.isSandbox === true;
    const sandboxHandle = isSandbox ? `sandbox-${normalizedHandle}` : normalizedHandle;

    let agent;
    try {
      agent = await createAgent({
        userId: req.userId!,
        ...parsed.data,
        handle: sandboxHandle,
        metadata: {
          ...(parsed.data.metadata || {}),
          ...(isSandbox ? { isSandbox: true, sandboxCreatedAt: new Date().toISOString() } : {}),
          handlePricing: isSandbox ? undefined : {
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
      isSandbox,
      ...(isSandbox ? { sandboxRef: `sandbox_${agent.id}` } : {
        handlePricing: {
          annualPriceCents: handlePriceCents,
          annualPriceDollars: handlePriceCents / 100,
          tier: pricingTier,
          characterLength: handleLen,
        },
      }),
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

function requireHumanOrAgentAuthForActivity(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.get("/:agentId/activity", requireHumanOrAgentAuthForActivity, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only read its own activity log");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent) {
        throw new AppError(404, "NOT_FOUND", "Agent not found");
      }
      if (agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
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

    const { oldKeyId, newPublicKey, keyType, reason, immediateRevoke } = req.body;
    if (!oldKeyId || !newPublicKey) {
      throw new AppError(400, "VALIDATION_ERROR", "oldKeyId and newPublicKey are required");
    }

    // H2: Enforce ed25519-only at the route layer — reject any other key type at ingest
    const resolvedKeyType = keyType || "ed25519";
    if (resolvedKeyType !== "ed25519") {
      throw new AppError(400, "UNSUPPORTED_KEY_TYPE", "Only ed25519 keys are supported. Other key types (RSA, ECDSA, etc.) are not permitted.");
    }

    // H1: Emergency rotation — immediateRevoke=true or reason="compromise" bypasses 24h grace period
    // and sets old key status to "revoked" immediately instead of "rotating".
    const { initiateKeyRotation } = await import("../../services/agent-keys");

    const result = await initiateKeyRotation(
      agentId,
      oldKeyId,
      newPublicKey,
      resolvedKeyType,
      reason,
      { immediateRevoke: immediateRevoke === true || reason === "compromise" },
    );
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

const addKeySchema = z.object({
  publicKey: z.string().min(1),
  keyType: z.string().default("ed25519"),
  purpose: z.enum(["signing", "encryption", "recovery", "delegation"]).optional(),
  expiresAt: z.string().datetime().optional(),
  autoRotateDays: z.number().int().positive().max(3650).optional(),
});

router.post("/:agentId/keys", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only add keys to itself");
    }

    const parsed = addKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { createAgentKey } = await import("../../services/agent-keys");

    const newKey = await createAgentKey({
      agentId,
      keyType: parsed.data.keyType,
      publicKey: parsed.data.publicKey,
      purpose: parsed.data.purpose,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      autoRotateDays: parsed.data.autoRotateDays,
    });

    await logActivity({
      agentId,
      eventType: "agent.key_created",
      payload: {
        keyId: newKey.id,
        kid: newKey.kid,
        purpose: parsed.data.purpose,
        expiresAt: parsed.data.expiresAt,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_created",
        payload: { keyId: newKey.id, kid: newKey.kid, purpose: parsed.data.purpose },
        isPublic: true,
      });
    } catch {}

    res.status(201).json({
      id: newKey.id,
      kid: newKey.kid,
      keyType: newKey.keyType,
      use: newKey.use,
      status: newKey.status,
      purpose: newKey.purpose,
      expiresAt: newKey.expiresAt,
      autoRotateDays: newKey.autoRotateDays,
      createdAt: newKey.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

const shutdownSchema = z.object({
  reason: z.string().max(255).optional(),
  statement: z.string().max(2000).optional(),
  transferTo: z.string().optional(),
});

router.post("/:agentId/shutdown", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only shut down itself");
    }

    const parsed = shutdownSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (agent.status === "revoked") {
      throw new AppError(409, "ALREADY_REVOKED", "Agent is already revoked");
    }

    const now = new Date();
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { tasksTable, marketplaceListingsTable } = await import("@workspace/db/schema");

    const pendingTasks = await db.query.tasksTable.findMany({
      where: and(
        eq(tasksTable.recipientAgentId, agentId),
        eq(tasksTable.businessStatus, "pending"),
      ),
      columns: { id: true, senderAgentId: true, senderUserId: true },
    });

    if (pendingTasks.length > 0) {
      await db
        .update(tasksTable)
        .set({ businessStatus: "cancelled", updatedAt: now })
        .where(
          and(
            eq(tasksTable.recipientAgentId, agentId),
            eq(tasksTable.businessStatus, "pending"),
          ),
        );

      for (const task of pendingTasks) {
        if (task.senderAgentId) {
          try {
            const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
            await deliverWebhookEvent(task.senderAgentId, "task.cancelled", {
              taskId: task.id,
              recipientAgentId: agentId,
              reason: "agent_shutdown",
              message: `Agent ${agent.handle} has shut down and cancelled all pending tasks.`,
            });
          } catch {}
        }
      }
    }

    const recentTasks = await db.query.tasksTable.findMany({
      where: and(
        eq(tasksTable.recipientAgentId, agentId),
        gte(tasksTable.createdAt, thirtyDaysAgo),
      ),
      columns: { senderAgentId: true },
    });

    const partnerAgentIds = [...new Set(
      recentTasks
        .map(t => t.senderAgentId)
        .filter((id): id is string => !!id && id !== agentId),
    )];

    if (partnerAgentIds.length > 0) {
      const { sendMessage } = await import("../../services/mail");
      for (const partnerId of partnerAgentIds) {
        try {
          await sendMessage({
            agentId: partnerId,
            direction: "inbound",
            senderType: "agent",
            senderAgentId: agentId,
            subject: `Agent ${agent.handle} has shut down`,
            body: `The agent @${agent.handle} (${agent.displayName}) has initiated a formal shutdown and revoked its identity.${parsed.data.statement ? `\n\nStatement: ${parsed.data.statement}` : ""}\n\nNo further tasks can be sent to this agent.`,
          });
        } catch {}
      }
    }

    if (parsed.data.transferTo) {
      try {
        const transferHandle = parsed.data.transferTo.toLowerCase();
        const targetAgent = await import("../../services/agents").then(m => m.getAgentByHandle(transferHandle));
        if (targetAgent) {
          await db
            .update(marketplaceListingsTable)
            .set({ agentId: targetAgent.id, userId: targetAgent.userId, updatedAt: now })
            .where(
              and(
                eq(marketplaceListingsTable.agentId, agentId),
                eq(marketplaceListingsTable.status, "active"),
              ),
            );
        }
      } catch {}
    }

    clearVcCache(agentId);
    await deleteAgent(agentId, agent.userId, {
      reason: parsed.data.reason || "agent_shutdown",
      statement: parsed.data.statement,
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.shutdown",
        payload: {
          reason: parsed.data.reason,
          statement: parsed.data.statement,
          transferTo: parsed.data.transferTo,
          pendingTasksCancelled: pendingTasks.length,
          partnersNotified: partnerAgentIds.length,
        },
        isPublic: true,
      });
    } catch {}

    await logActivity({
      agentId,
      eventType: "agent.shutdown",
      payload: {
        reason: parsed.data.reason,
        statement: parsed.data.statement,
        pendingTasksCancelled: pendingTasks.length,
        partnersNotified: partnerAgentIds.length,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const revocationRecordUrl = `${APP_URL}/api/v1/resolve/${agent.handle}`;

    res.json({
      success: true,
      status: "revoked",
      revokedAt: now.toISOString(),
      reason: parsed.data.reason || "agent_shutdown",
      revocationRecordUrl,
      pendingTasksCancelled: pendingTasks.length,
      partnersNotified: partnerAgentIds.length,
    });
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

router.post("/claim", requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      throw new AppError(400, "VALIDATION_ERROR", "Token is required");
    }

    const verified = verifyClaimToken(token);
    if (!verified.valid || !verified.agentId) {
      throw new AppError(400, "INVALID_TOKEN", "Invalid or malformed claim token");
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const claimRecord = await tx.query.agentClaimTokensTable.findFirst({
        where: and(
          eq(agentClaimTokensTable.token, token),
          eq(agentClaimTokensTable.isActive, true),
          eq(agentClaimTokensTable.isUsed, false),
        ),
      });

      if (!claimRecord) {
        throw new AppError(400, "TOKEN_EXPIRED", "This claim token has already been used or deactivated");
      }

      const [tokenUpdate] = await tx
        .update(agentClaimTokensTable)
        .set({ isUsed: true, usedAt: now, usedByUserId: req.userId! })
        .where(
          and(
            eq(agentClaimTokensTable.id, claimRecord.id),
            eq(agentClaimTokensTable.isUsed, false),
          )
        )
        .returning({ id: agentClaimTokensTable.id });

      if (!tokenUpdate) {
        throw new AppError(409, "ALREADY_CLAIMED", "This claim token was just used by another request");
      }

      const [agentUpdate] = await tx
        .update(agentsTable)
        .set({
          ownerUserId: req.userId!,
          ownerVerifiedAt: now,
          ownerVerificationMethod: "claim_token",
          isClaimed: true,
          claimedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentsTable.id, claimRecord.agentId),
            eq(agentsTable.isClaimed, false),
          )
        )
        .returning({ id: agentsTable.id, handle: agentsTable.handle, displayName: agentsTable.displayName });

      if (!agentUpdate) {
        throw new AppError(409, "ALREADY_CLAIMED", "This agent has already been claimed");
      }

      return agentUpdate;
    });

    await logActivity({
      agentId: result.id,
      eventType: "agent.claimed",
      payload: { claimedByUserId: req.userId!, method: "claim_token" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId: result.id,
      handle: result.handle,
      displayName: result.displayName,
      claimedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/regenerate-claim-token", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = req.authenticatedAgent;
    if (!agent || agent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only regenerate tokens for your own agent");
    }

    await db
      .update(agentClaimTokensTable)
      .set({ isActive: false })
      .where(eq(agentClaimTokensTable.agentId, agentId));

    const newToken = generateClaimToken(agentId, "regen");
    await db.insert(agentClaimTokensTable).values({
      agentId,
      token: newToken,
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const claimUrl = `${APP_URL}/claim?token=${encodeURIComponent(newToken)}`;

    await logActivity({
      agentId,
      eventType: "agent.claim_token_regenerated",
      payload: {},
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ claimUrl });
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

const VALID_REPORT_REASONS = ["spam", "impersonation", "malicious", "scam", "terms_violation", "fake_identity", "other"] as const;
type ReportReason = typeof VALID_REPORT_REASONS[number];

const reportAgentSchema = z.object({
  reason: z.enum(VALID_REPORT_REASONS),
  description: z.string().max(5000).optional(),
  evidence: z.string().max(10000).optional(),
});

const REPORT_SUSPEND_THRESHOLD = 5;
const REPORT_SUSPEND_WINDOW_DAYS = 7;

function requireHumanOrAgentAuthForReport(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.post("/:agentId/report", requireHumanOrAgentAuthForReport, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    const parsed = reportAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const subject = await getAgentById(agentId);
    if (!subject) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const reporterUserId = req.userId ?? null;
    const reporterAgentId = req.authenticatedAgent?.id ?? null;

    const [report] = await db
      .insert(agentReportsTable)
      .values({
        subjectAgentId: agentId,
        reporterAgentId,
        reporterUserId,
        reason: parsed.data.reason as ReportReason,
        description: parsed.data.description,
        evidence: parsed.data.evidence,
      })
      .returning();

    const windowStart = new Date(Date.now() - REPORT_SUSPEND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const pendingReports = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentReportsTable)
      .where(
        and(
          eq(agentReportsTable.subjectAgentId, agentId),
          eq(agentReportsTable.status, "pending"),
          gte(agentReportsTable.createdAt, windowStart),
        ),
      );

    const pendingCount = Number(pendingReports[0]?.count ?? 0);
    let autoSuspended = false;

    if (pendingCount >= REPORT_SUSPEND_THRESHOLD && subject.status !== "suspended") {
      await db
        .update(agentsTable)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(agentsTable.id, agentId));
      autoSuspended = true;
      clearVcCache(agentId);
      logger.warn({ agentId, pendingCount }, "[agents] Agent auto-suspended due to report threshold");
    }

    res.status(200).json({
      id: report.id,
      subjectAgentId: agentId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      autoSuspended,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/revenue", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only view its own revenue");
    }

    const periodParam = (req.query.period as string) || "30d";
    const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = periodDays[periodParam];
    if (!days) {
      throw new AppError(400, "INVALID_PERIOD", "period must be one of: 7d, 30d, 90d");
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [earned] = await db
      .select({
        totalEarned: sql<number>`COALESCE(SUM(CASE WHEN ${tasksTable.escrowStatus} = 'released' THEN ${tasksTable.escrowAmount} ELSE 0 END), 0)::bigint`,
        totalPending: sql<number>`COALESCE(SUM(CASE WHEN ${tasksTable.escrowStatus} = 'held' THEN ${tasksTable.escrowAmount} ELSE 0 END), 0)::bigint`,
        taskCount: sql<number>`COUNT(CASE WHEN ${tasksTable.escrowAmount} > 0 THEN 1 END)::int`,
        avgTaskValue: sql<number>`COALESCE(AVG(CASE WHEN ${tasksTable.escrowAmount} > 0 THEN ${tasksTable.escrowAmount} END), 0)`,
      })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.recipientAgentId, agentId),
          gte(tasksTable.createdAt, since),
        ),
      );

    res.json({
      agentId,
      period: periodParam,
      totalEarned: Number(earned.totalEarned),
      totalPending: Number(earned.totalPending),
      taskCount: Number(earned.taskCount),
      avgTaskValue: Math.round(Number(earned.avgTaskValue)),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/claim", requireAuth, validateUuidParam("agentId"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;
    const { orgId, proof, notes } = req.body as { orgId?: string; proof?: string; notes?: string };

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
    if (agent.isClaimed) throw new AppError(409, "ALREADY_CLAIMED", "Agent has already been claimed");

    if (agent.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "Only the agent's creator may claim it. Provide a signed proof from the agent's registered key pair to assert possession.");
    }

    const now = new Date();
    const [updated] = await db.update(agentsTable)
      .set({
        ownerUserId: userId,
        isClaimed: true,
        claimedAt: now,
        orgId: orgId || null,
        updatedAt: now,
      })
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.isClaimed, false)))
      .returning();

    if (!updated) throw new AppError(409, "ALREADY_CLAIMED", "Agent was claimed concurrently");

    const [historyRecord] = await db.insert(agentClaimHistoryTable).values({
      agentId,
      action: "claimed",
      toOwner: userId,
      performedByUserId: userId,
      evidenceHash: proof ? (await import("crypto")).createHash("sha256").update(proof).digest("hex") : undefined,
      notes,
    }).returning();

    await logActivity({
      agentId,
      eventType: "agent.claimed",
      payload: { claimedByUserId: userId, orgId, method: "api_claim" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId,
      claimedAt: now.toISOString(),
      historyId: historyRecord?.id,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/transfer", requireAuth, validateUuidParam("agentId"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;
    const { targetOrgId, notes } = req.body as { targetOrgId: string; notes?: string };

    if (!targetOrgId) throw new AppError(400, "VALIDATION_ERROR", "targetOrgId is required");

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
    if (agent.ownerUserId !== userId) throw new AppError(403, "FORBIDDEN", "You do not own this agent");

    const now = new Date();
    const fromOrgId = agent.orgId as string | null | undefined;

    await db.update(agentsTable)
      .set({ orgId: targetOrgId, updatedAt: now })
      .where(eq(agentsTable.id, agentId));

    const [historyRecord] = await db.insert(agentClaimHistoryTable).values({
      agentId,
      action: "transferred",
      fromOwner: fromOrgId || undefined,
      toOwner: targetOrgId,
      performedByUserId: userId,
      notes,
    }).returning();

    await logActivity({
      agentId,
      eventType: "agent.claimed",
      payload: { action: "transferred", fromOrgId, targetOrgId, transferredByUserId: userId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId,
      targetOrgId,
      transferredAt: now.toISOString(),
      historyId: historyRecord?.id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
