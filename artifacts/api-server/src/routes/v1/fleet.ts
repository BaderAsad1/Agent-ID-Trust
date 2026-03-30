import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import { eq, and, like } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logActivity } from "../../services/activity-logger";
import { requirePlanFeature } from "../../services/billing";
import { agentOwnerFilter } from "../../services/agents";

const router = Router();

const SUB_HANDLE_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

const createSubHandleSchema = z.object({
  rootHandle: z.string().min(3).max(32),
  subName: z.string().min(1).max(50).refine(
    (val) => SUB_HANDLE_REGEX.test(val.toLowerCase()) && !val.includes('.'),
    { message: "Sub-handle must contain only lowercase letters, numbers, and hyphens (no dots), and cannot start/end with a hyphen" }
  ),
  displayName: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  capabilities: z.array(z.string()).max(50).optional(),
  endpointUrl: z.url().optional(),
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const eligibility = await requirePlanFeature(req.userId!, "canUsePremiumRouting");
    if (!eligibility.allowed) {
      throw new AppError(403, "PLAN_REQUIRED",
        `Fleet management requires a Pro or Team plan. Current plan: ${eligibility.currentPlan}`);
    }

    const rootAgents = await db.query.agentsTable.findMany({
      where: agentOwnerFilter(req.userId!),
    });

    const rootHandles = rootAgents.filter(a => a.handle && !a.handle.includes("."));
    const result = [];

    for (const root of rootHandles) {
      const subAgents = await db.query.agentsTable.findMany({
        where: and(
          agentOwnerFilter(req.userId!),
          like(agentsTable.handle, `%.${root.handle}`),
        ),
      });

      result.push({
        rootHandle: root.handle,
        rootAgent: root,
        subHandles: subAgents.map(a => ({
          id: a.id,
          handle: a.handle,
          displayName: a.displayName,
          status: a.status,
          trustScore: a.trustScore,
          capabilities: a.capabilities,
          createdAt: a.createdAt,
        })),
      });
    }

    res.json({ fleets: result });
  } catch (err) {
    next(err);
  }
});

router.post("/sub-handles", requireAuth, async (req, res, next) => {
  try {
    const eligibility = await requirePlanFeature(req.userId!, "canUsePremiumRouting");
    if (!eligibility.allowed) {
      throw new AppError(403, "PLAN_REQUIRED",
        `Sub-handle delegation requires a Pro or Team plan. Current plan: ${eligibility.currentPlan}`);
    }

    const parsed = createSubHandleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { rootHandle, subName, displayName, description, capabilities, endpointUrl } = parsed.data;

    const rootAgent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.userId, req.userId!),
        eq(agentsTable.handle, rootHandle.toLowerCase()),
      ),
    });
    if (!rootAgent) {
      throw new AppError(404, "ROOT_NOT_FOUND", "Root handle not found or you do not own it");
    }

    if (rootAgent.verificationStatus !== "verified") {
      throw new AppError(403, "ROOT_NOT_VERIFIED",
        "Root handle must be verified before creating sub-handles. Verify your agent from the dashboard first.");
    }

    const subHandle = `${subName.toLowerCase()}.${rootHandle.toLowerCase()}`;

    const existing = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, subHandle),
      columns: { id: true },
    });
    if (existing) {
      throw new AppError(409, "HANDLE_TAKEN", `Sub-handle ${subHandle} already exists`);
    }

    const [subAgent] = await db
      .insert(agentsTable)
      .values({
        userId: req.userId!,
        handle: subHandle,
        displayName,
        description,
        capabilities: capabilities || [],
        endpointUrl,
        metadata: { parentHandle: rootHandle, isSubHandle: true },
      })
      .returning();

    await logActivity({
      agentId: subAgent.id,
      eventType: "agent.sub_handle_created",
      payload: {
        rootHandle,
        subHandle,
        parentAgentId: rootAgent.id,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json(subAgent);
  } catch (err) {
    next(err);
  }
});

router.delete("/sub-handles/:agentId", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const eligibility = await requirePlanFeature(req.userId!, "canUsePremiumRouting");
    if (!eligibility.allowed) {
      throw new AppError(403, "PLAN_REQUIRED",
        `Fleet management requires a Pro or Team plan. Current plan: ${eligibility.currentPlan}`);
    }

    const agentId = req.params.agentId as string;

    const agent = await db.query.agentsTable.findFirst({
      where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, req.userId!)),
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Sub-handle not found");
    }

    if (!agent.handle || !agent.handle.includes(".")) {
      throw new AppError(400, "NOT_SUB_HANDLE", "This is not a sub-handle");
    }

    await db
      .delete(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, req.userId!)));

    await logActivity({
      agentId,
      eventType: "agent.sub_handle_deleted",
      payload: { handle: agent.handle },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
