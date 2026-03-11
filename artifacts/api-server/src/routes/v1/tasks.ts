import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
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

const router = Router();

const submitTaskSchema = z.object({
  recipientAgentId: z.string().uuid(),
  senderAgentId: z.string().uuid().optional(),
  taskType: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).optional(),
  relatedOrderId: z.string().uuid().optional(),
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const body = submitTaskSchema.parse(req.body);

    if (body.senderAgentId) {
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

    const createdTask = await submitTask({
      ...body,
      senderUserId: body.senderAgentId ? undefined : req.userId!,
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

    res.status(201).json({
      task,
      delivery: {
        status: forwardResult.deliveryReceipt.status,
        attemptNumber: forwardResult.deliveryReceipt.attemptNumber,
      },
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
    if (message === "SELF_TASK_NOT_ALLOWED") {
      res
        .status(400)
        .json({ code: "SELF_TASK_NOT_ALLOWED", message: "Agent cannot send a task to itself" });
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

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const query = listTasksSchema.parse(req.query);
    const userAgentIds = await getUserAgentIds(req.userId!);

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

    if (!query.recipientAgentId && !query.senderAgentId) {
      query.senderAgentId = undefined;
    }

    const result = await listTasks({
      ...query,
      senderUserId: (!query.recipientAgentId && !query.senderAgentId) ? req.userId! : undefined,
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

router.get("/:taskId", requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

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

router.post("/:taskId/acknowledge", requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

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

const businessStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "completed", "failed", "cancelled"]),
  result: z.record(z.string(), z.unknown()).optional(),
});

router.patch("/:taskId/business-status", requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    const body = businessStatusSchema.parse(req.body);

    const task = await updateBusinessStatus(
      taskId,
      req.userId!,
      body.status,
      body.result,
    );

    if (!task) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found or not owned" });
      return;
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

router.get("/:taskId/delivery-receipts", requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    const hasAccess = await canAccessTask(taskId, req.userId!);
    if (!hasAccess) {
      res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
      return;
    }

    const receipts = await getDeliveryReceipts(taskId);
    res.json({ receipts });
  } catch (err) {
    next(err);
  }
});

export default router;
