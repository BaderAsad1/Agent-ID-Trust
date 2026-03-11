import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
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
import { requirePlanFeature } from "../../services/billing";

const router = Router();

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

    const available = await isHandleAvailable(handle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    let agent;
    try {
      agent = await createAgent({
        userId: req.userId!,
        ...parsed.data,
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
      payload: { handle: agent.handle },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await recomputeAndStore(agent.id);

    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const agents = await listAgentsByUser(req.userId!);
    res.json({ agents });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId", requireAuth, async (req, res, next) => {
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

router.put("/:agentId", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "No fields to update");
    }

    if (parsed.data.isPublic === true) {
      const eligibility = await requirePlanFeature(req.userId!, "canListOnMarketplace");
      if (!eligibility.allowed) {
        throw new AppError(403, "PLAN_REQUIRED",
          `Marketplace listing requires the ${eligibility.requiredPlan} plan or higher. Current plan: ${eligibility.currentPlan}`);
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

    if (changedFields.some((f) => ["endpointUrl", "capabilities", "description", "avatarUrl", "protocols"].includes(f))) {
      await recomputeAndStore(updated.id);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:agentId", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (agent.userId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.deleted",
      payload: { handle: agent.handle },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await deleteAgent(agentId, req.userId!);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
