import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, tasksTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { assertSandboxIsolation, isAgentSandbox } from "../../middlewares/sandbox";
import { logger } from "../../middlewares/request-logger";
import {
  submitTask,
  getTaskById,
  listTasks,
  acknowledgeTask,
  updateBusinessStatus,
  canAccessTask,
  getUserAgentIds,
} from "../../services/tasks";
import { forwardTask, getDeliveryReceipts } from "../../services/task-forwarding";
import { logActivity } from "../../services/activity-logger";
import { createTaskPaymentIntent, captureTaskPayment, cancelTaskPayment } from "../../services/stripe-connect";

function requireHumanOrAgentAuth(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

const router = Router();

const submitTaskSchema = z.object({
  recipientAgentId: z.string().uuid(),
  senderAgentId: z.string().uuid().optional(),
  taskType: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).optional(),
  relatedOrderId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(255).optional(),
  paymentAmount: z.number().int().positive().optional(),
  escrowAmount: z.number().int().positive().optional(),
  escrowCurrency: z.string().max(10).optional().default("usd"),
});

router.post("/", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const body = submitTaskSchema.parse(req.body);

    let senderAgentId = body.senderAgentId;
    if (req.authenticatedAgent) {
      senderAgentId = req.authenticatedAgent.id;
    } else if (body.senderAgentId) {
      const senderAgent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, body.senderAgentId),
        columns: { id: true, userId: true },
      });
      if (!senderAgent || senderAgent.userId !== req.userId) {
        res.status(403).json({
          code: "SENDER_NOT_OWNED",
          message: "You do not own the specified sender agent",
        });
        return;
      }
    }

    if (body.idempotencyKey) {
      const { and: andOp } = await import("drizzle-orm");
      const existing = await db.query.tasksTable.findFirst({
        where: andOp(
          eq(tasksTable.idempotencyKey, body.idempotencyKey),
          senderAgentId
            ? eq(tasksTable.senderAgentId, senderAgentId)
            : eq(tasksTable.senderUserId, req.userId!),
        ),
      });
      if (existing) {
        res.status(200).json({ task: existing, delivery: { status: "already_exists", attemptNumber: 0 } });
        return;
      }
    }

    const recipientAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, body.recipientAgentId),
      columns: { id: true, handle: true, metadata: true, stripeConnectAccountId: true, stripeConnectStatus: true },
    });

    assertSandboxIsolation(req, recipientAgent, "task recipient");

    if (senderAgentId) {
      const senderAgent2 = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, senderAgentId),
        columns: { handle: true, metadata: true },
      });
      const senderSandbox = isAgentSandbox(senderAgent2);
      const recipientSandbox = isAgentSandbox(recipientAgent);
      if (senderSandbox !== recipientSandbox) {
        throw new AppError(403, "SANDBOX_ISOLATION", "Cannot create tasks between sandbox and production agents");
      }
    }

    if (body.paymentAmount && body.paymentAmount > 0) {
      if (!recipientAgent?.stripeConnectAccountId || recipientAgent.stripeConnectStatus !== "active") {
        throw new Error("RECIPIENT_CONNECT_REQUIRED");
      }
    }

    const createdTask = await submitTask({
      ...body,
      senderAgentId,
      senderUserId: senderAgentId ? undefined : req.userId!,
    });

    const forwardResult = await forwardTask(createdTask);

    const task = await getTaskById(createdTask.id);

    await logActivity({
      agentId: createdTask.recipientAgentId,
      eventType: "agent.task_received",
      payload: {
        taskId: createdTask.id,
        taskType: createdTask.taskType,
        senderUserId: createdTask.senderUserId,
        senderAgentId: createdTask.senderAgentId,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (forwardResult.success) {
      await logActivity({
        agentId: createdTask.recipientAgentId,
        eventType: "agent.task_delivered",
        payload: {
          taskId: createdTask.id,
          attemptNumber: forwardResult.deliveryReceipt.attemptNumber,
          endpointUrl: forwardResult.deliveryReceipt.endpointUrl,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(createdTask.recipientAgentId, "task.received", {
        taskId: createdTask.id,
        taskType: createdTask.taskType,
        senderAgentId: createdTask.senderAgentId,
      });
    } catch {}

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: createdTask.recipientAgentId,
        eventType: "agent.task_received",
        payload: { taskId: createdTask.id, taskType: createdTask.taskType },
      });
    } catch {}

    let paymentInfo: { clientSecret: string | null; paymentIntentId: string } | undefined;
    const escrowAmountCents = body.escrowAmount || body.paymentAmount;
    if (escrowAmountCents && escrowAmountCents > 0) {
      paymentInfo = await createTaskPaymentIntent(
        escrowAmountCents,
        body.recipientAgentId,
        createdTask.id,
      );
      await db.update(tasksTable).set({
        escrowAmount: escrowAmountCents,
        escrowCurrency: body.escrowCurrency || "usd",
        escrowStatus: "held",
        stripePaymentIntentId: paymentInfo.paymentIntentId,
        updatedAt: new Date(),
      }).where(eq(tasksTable.id, createdTask.id));
    }

    const freshTask = await getTaskById(createdTask.id);

    res.status(201).json({
      task: freshTask,
      delivery: {
        status: forwardResult.deliveryReceipt.status,
        attemptNumber: forwardResult.deliveryReceipt.attemptNumber,
      },
      ...(paymentInfo ? { payment: { clientSecret: paymentInfo.clientSecret, paymentIntentId: paymentInfo.paymentIntentId } } : {}),
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "RECIPIENT_NOT_FOUND") {
      res
        .status(404)
        .json({ code: "RECIPIENT_NOT_FOUND", message: "Recipient agent not found or inactive" });
      return;
    }
    if (message === "SENDER_REQUIRED") {
      res
        .status(400)
        .json({ code: "SENDER_REQUIRED", message: "Either senderUserId or senderAgentId is required" });
      return;
    }
    if (message === "RECIPIENT_CONNECT_REQUIRED") {
      res.status(422).json({
        code: "RECIPIENT_CONNECT_REQUIRED",
        message: "Recipient agent must have an active Stripe Connect account to accept paid tasks",
      });
      return;
    }
    next(err);
  }
});

const listTasksSchema = z.object({
  recipientAgentId: z.string().uuid().optional(),
  senderAgentId: z.string().uuid().optional(),
  deliveryStatus: z.string().optional(),
  businessStatus: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const query = listTasksSchema.parse(req.query);

    let userAgentIds: string[];
    if (req.authenticatedAgent) {
      userAgentIds = [req.authenticatedAgent.id];
    } else {
      userAgentIds = await getUserAgentIds(req.userId!);
    }

    if (query.recipientAgentId && !userAgentIds.includes(query.recipientAgentId)) {
      res.status(403).json({
        code: "NOT_OWNER",
        message: "You do not own the specified recipient agent",
      });
      return;
    }

    if (query.senderAgentId && !userAgentIds.includes(query.senderAgentId)) {
      res.status(403).json({
        code: "NOT_OWNER",
        message: "You do not own the specified sender agent",
      });
      return;
    }

    const result = await listTasks({
      ...query,
      recipientAgentIds: (!query.recipientAgentId && !query.senderAgentId) ? userAgentIds : undefined,
      senderUserId: (!query.recipientAgentId && !query.senderAgentId && !req.authenticatedAgent) ? req.userId! : undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    next(err);
  }
});

router.get("/:taskId", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    if (req.authenticatedAgent) {
      const task = await getTaskById(taskId);
      if (!task || (task.recipientAgentId !== req.authenticatedAgent.id && task.senderAgentId !== req.authenticatedAgent.id)) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
        return;
      }
      res.json(task);
      return;
    }

    const hasAccess = await canAccessTask(taskId, req.userId!);
    if (!hasAccess) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
      return;
    }

    const task = await getTaskById(taskId);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.post("/:taskId/acknowledge", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    if (req.authenticatedAgent) {
      const task = await getTaskById(taskId);
      if (!task || task.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      const userId = req.authenticatedAgent.userId;
      const acknowledged = await acknowledgeTask(taskId, userId);
      if (!acknowledged) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      await logActivity({
        agentId: acknowledged.recipientAgentId,
        eventType: "agent.task_acknowledged",
        payload: { taskId: acknowledged.id, acknowledgedAt: acknowledged.acknowledgedAt },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      res.json(acknowledged);
      return;
    }

    const task = await acknowledgeTask(taskId, req.userId!);
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }

    await logActivity({
      agentId: task.recipientAgentId,
      eventType: "agent.task_acknowledged",
      payload: {
        taskId: task.id,
        acknowledgedAt: task.acknowledgedAt,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "INVALID_DELIVERY_STATE") {
      res.status(409).json({
        code: "INVALID_DELIVERY_STATE",
        message: "Task cannot be acknowledged in its current delivery state",
      });
      return;
    }
    next(err);
  }
});

router.post("/:taskId/accept", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }
    const task = await updateBusinessStatus(taskId, userId, "accepted");
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }
    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({ agentId: task.recipientAgentId, eventType: "agent.task_accepted", payload: { taskId: task.id } });
    } catch {}
    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(task.recipientAgentId, "task.accepted", { taskId: task.id });
    } catch {}
    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({ code: "INVALID_TRANSITION", message: `Invalid status transition: ${message.split(":")[1]}` });
      return;
    }
    next(err);
  }
});

router.post("/:taskId/start", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }
    const task = await updateBusinessStatus(taskId, userId, "in_progress");
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }
    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({ agentId: task.recipientAgentId, eventType: "agent.task_started", payload: { taskId: task.id } });
    } catch {}
    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(task.recipientAgentId, "task.started", { taskId: task.id });
    } catch {}
    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({ code: "INVALID_TRANSITION", message: `Invalid status transition: ${message.split(":")[1]}` });
      return;
    }
    next(err);
  }
});

const completeTaskSchema = z.object({
  result: z.record(z.string(), z.unknown()).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

router.post("/:taskId/complete", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    const body = completeTaskSchema.parse(req.body || {});
    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }
    const task = await updateBusinessStatus(taskId, userId, "completed", body.result);
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }
    if (body.rating) {
      await db.update(tasksTable).set({ rating: body.rating }).where(eq(tasksTable.id, taskId));
    }

    const completedTask = await db.query.tasksTable.findFirst({
      where: eq(tasksTable.id, taskId),
      columns: { escrowStatus: true, stripePaymentIntentId: true },
    });
    if (completedTask?.escrowStatus === "held") {
      const releaseAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await db.update(tasksTable).set({
        escrowStatus: "released",
        escrowReleaseAt: releaseAt,
        updatedAt: new Date(),
      }).where(eq(tasksTable.id, taskId));
      if (completedTask.stripePaymentIntentId) {
        try {
          await captureTaskPayment(taskId);
        } catch (captureErr) {
          logger.error({ err: captureErr, taskId }, "[tasks] Failed to capture escrow payment on completion");
        }
      }
    }

    await logActivity({
      agentId: task.recipientAgentId,
      eventType: "agent.task_completed",
      payload: { taskId: task.id, rating: body.rating },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({ agentId: task.recipientAgentId, eventType: "agent.task_completed", payload: { taskId: task.id }, isPublic: true });
    } catch {}
    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(task.recipientAgentId, "task.completed", { taskId: task.id, rating: body.rating });
    } catch {}
    try {
      const { recomputeAndStore } = await import("../../services/trust-score");
      await recomputeAndStore(task.recipientAgentId);
    } catch {}
    const updated = await getTaskById(taskId);
    res.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({ code: "INVALID_TRANSITION", message: `Invalid status transition: ${message.split(":")[1]}` });
      return;
    }
    next(err);
  }
});

router.post("/:taskId/reject", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }
    const task = await updateBusinessStatus(taskId, userId, "rejected", req.body?.result);
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }
    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({ agentId: task.recipientAgentId, eventType: "agent.task_rejected", payload: { taskId: task.id } });
    } catch {}
    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(task.recipientAgentId, "task.rejected", { taskId: task.id });
    } catch {}
    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({ code: "INVALID_TRANSITION", message: `Invalid status transition: ${message.split(":")[1]}` });
      return;
    }
    next(err);
  }
});

router.post("/:taskId/fail", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }
    const task = await updateBusinessStatus(taskId, userId, "failed", req.body?.result);
    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }
    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({ agentId: task.recipientAgentId, eventType: "agent.task_failed", payload: { taskId: task.id } });
    } catch {}
    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(task.recipientAgentId, "task.failed", { taskId: task.id });
    } catch {}
    try {
      const { addNegativeTrustEvent } = await import("../../services/trust-score");
      await addNegativeTrustEvent(task.recipientAgentId, "task_failed", {
        weight: 3,
        metadata: { taskId: task.id },
      });
    } catch {}
    res.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({ code: "INVALID_TRANSITION", message: `Invalid status transition: ${message.split(":")[1]}` });
      return;
    }
    next(err);
  }
});

const businessStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "completed", "failed", "cancelled"]),
  result: z.record(z.string(), z.unknown()).optional(),
});

router.patch("/:taskId/business-status", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    const body = businessStatusSchema.parse(req.body);

    let userId: string;
    if (req.authenticatedAgent) {
      const existingTask = await getTaskById(taskId);
      if (!existingTask || existingTask.recipientAgentId !== req.authenticatedAgent.id) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
        return;
      }
      userId = req.authenticatedAgent.userId;
    } else {
      userId = req.userId!;
    }

    const task = await updateBusinessStatus(
      taskId,
      userId,
      body.status,
      body.result,
    );

    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
    }

    if (body.status === "completed") {
      await captureTaskPayment(taskId);
    } else if (body.status === "failed" || body.status === "cancelled") {
      await cancelTaskPayment(taskId);
      if (body.status === "failed") {
        try {
          const { addNegativeTrustEvent } = await import("../../services/trust-score");
          await addNegativeTrustEvent(task.recipientAgentId, "task_failed", {
            weight: 3,
            metadata: { taskId: task.id },
          });
        } catch {}
      } else if (body.status === "cancelled") {
        try {
          const { addNegativeTrustEvent } = await import("../../services/trust-score");
          await addNegativeTrustEvent(task.recipientAgentId, "task_abandoned", {
            weight: 2,
            metadata: { taskId: task.id },
          });
        } catch {}
      }
    }

    const eventType =
      body.status === "completed"
        ? ("agent.task_completed" as const)
        : ("agent.status_changed" as const);

    await logActivity({
      agentId: task.recipientAgentId,
      eventType,
      payload: {
        taskId: task.id,
        businessStatus: body.status,
        result: body.result,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(task);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "RECIPIENT_CONNECT_REQUIRED") {
      res.status(422).json({
        code: "RECIPIENT_CONNECT_REQUIRED",
        message: "Recipient agent must have an active Stripe Connect account to accept paid tasks",
      });
      return;
    }
    if (message.startsWith("INVALID_TRANSITION")) {
      res.status(409).json({
        code: "INVALID_TRANSITION",
        message: `Invalid status transition: ${message.split(":")[1]}`,
      });
      return;
    }
    next(err);
  }
});

router.post("/:taskId/dispute", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    let hasAccess = false;
    if (req.authenticatedAgent) {
      const task = await getTaskById(taskId);
      hasAccess = !!(task && (task.recipientAgentId === req.authenticatedAgent.id || task.senderAgentId === req.authenticatedAgent.id));
    } else {
      hasAccess = await canAccessTask(taskId, req.userId!);
    }
    if (!hasAccess) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
      return;
    }

    const disputeTask = await db.query.tasksTable.findFirst({
      where: eq(tasksTable.id, taskId),
      columns: { escrowStatus: true, stripePaymentIntentId: true, recipientAgentId: true },
    });

    if (!disputeTask) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
      return;
    }

    if (disputeTask.escrowStatus !== "held" && disputeTask.escrowStatus !== "released") {
      res.status(409).json({ code: "INVALID_ESCROW_STATE", message: "Task escrow is not in a disputable state" });
      return;
    }

    await db.update(tasksTable).set({
      escrowStatus: "disputed",
      updatedAt: new Date(),
    }).where(eq(tasksTable.id, taskId));

    if (disputeTask.stripePaymentIntentId) {
      try {
        await cancelTaskPayment(taskId);
        await db.update(tasksTable).set({ escrowStatus: "refunded", updatedAt: new Date() }).where(eq(tasksTable.id, taskId));
      } catch (cancelErr) {
        logger.error({ err: cancelErr, taskId }, "[tasks] Failed to cancel/refund payment intent on dispute");
      }
    }

    const updatedTask = await getTaskById(taskId);
    res.json({ task: updatedTask });
  } catch (err) {
    next(err);
  }
});

router.get("/:taskId/delivery-receipts", requireHumanOrAgentAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    if (req.authenticatedAgent) {
      const task = await getTaskById(taskId);
      if (!task || (task.recipientAgentId !== req.authenticatedAgent.id && task.senderAgentId !== req.authenticatedAgent.id)) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
        return;
      }
    } else {
      const hasAccess = await canAccessTask(taskId, req.userId!);
      if (!hasAccess) {
        res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
        return;
      }
    }

    const receipts = await getDeliveryReceipts(taskId);
    res.json({ receipts });
  } catch (err) {
    next(err);
  }
});

export default router;
