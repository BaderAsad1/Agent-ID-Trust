import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
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
    const parsed = submitTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }
    const body = parsed.data;

    if (body.senderAgentId) {
      const senderAgent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, body.senderAgentId),
        columns: { id: true, userId: true },
      });
      if (!senderAgent || senderAgent.userId !== req.userId) {
        throw new AppError(403, "SENDER_NOT_OWNED", "You do not own the specified sender agent");
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
    if (err instanceof AppError) return next(err);
    const message = err instanceof Error ? err.message : "";
    if (message === "RECIPIENT_NOT_FOUND") {
      return next(new AppError(404, "RECIPIENT_NOT_FOUND", "Recipient agent not found or inactive"));
    }
    if (message === "SENDER_REQUIRED") {
      return next(new AppError(400, "SENDER_REQUIRED", "Either senderUserId or senderAgentId is required"));
    }
    if (message === "SELF_TASK_NOT_ALLOWED") {
      return next(new AppError(400, "SELF_TASK_NOT_ALLOWED", "Agent cannot send a task to itself"));
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
    const parsed = listTasksSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues);
    }
    const query = parsed.data;
    const userAgentIds = await getUserAgentIds(req.userId!);

    if (query.recipientAgentId && !userAgentIds.includes(query.recipientAgentId)) {
      throw new AppError(403, "NOT_OWNER", "You do not own the specified recipient agent");
    }

    if (query.senderAgentId && !userAgentIds.includes(query.senderAgentId)) {
      throw new AppError(403, "NOT_OWNER", "You do not own the specified sender agent");
    }

    const result = await listTasks({
      ...query,
      recipientAgentIds: (!query.recipientAgentId && !query.senderAgentId) ? userAgentIds : undefined,
      senderUserId: (!query.recipientAgentId && !query.senderAgentId) ? req.userId! : undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) return next(err);
    next(err);
  }
});

router.get("/:taskId", requireAuth, validateUuidParam("taskId"), async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    const hasAccess = await canAccessTask(taskId, req.userId!);
    if (!hasAccess) {
      throw new AppError(404, "NOT_FOUND", "Task not found");
    }

    const task = await getTaskById(taskId);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.post("/:taskId/acknowledge", requireAuth, validateUuidParam("taskId"), async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    const task = await acknowledgeTask(taskId, req.userId!);
    if (!task) {
      throw new AppError(404, "NOT_FOUND", "Task not found or not owned");
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
    if (err instanceof AppError) return next(err);
    const message = err instanceof Error ? err.message : "";
    if (message === "INVALID_DELIVERY_STATE") {
      return next(new AppError(409, "INVALID_DELIVERY_STATE", "Task cannot be acknowledged in its current delivery state"));
    }
    next(err);
  }
});

const businessStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "completed", "failed", "cancelled"]),
  result: z.record(z.string(), z.unknown()).optional(),
});

router.patch("/:taskId/business-status", requireAuth, validateUuidParam("taskId"), async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;
    const parsed = businessStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }
    const body = parsed.data;

    const task = await updateBusinessStatus(
      taskId,
      req.userId!,
      body.status,
      body.result,
    );

    if (!task) {
      throw new AppError(404, "NOT_FOUND", "Task not found or not owned");
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
    if (err instanceof AppError) return next(err);
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("INVALID_TRANSITION")) {
      return next(new AppError(409, "INVALID_TRANSITION", `Invalid status transition: ${message.split(":")[1]}`));
    }
    next(err);
  }
});

router.get("/:taskId/delivery-receipts", requireAuth, validateUuidParam("taskId"), async (req, res, next) => {
  try {
    const taskId = req.params.taskId as string;

    const hasAccess = await canAccessTask(taskId, req.userId!);
    if (!hasAccess) {
      throw new AppError(404, "NOT_FOUND", "Task not found");
    }

    const receipts = await getDeliveryReceipts(taskId);
    res.json({ receipts });
  } catch (err) {
    next(err);
  }
});

export default router;
