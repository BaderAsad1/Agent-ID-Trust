import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentWebhooksTable } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import { getAgentById } from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { buildSignatureHeader } from "../../services/webhook-delivery";
import type { Request, Response, NextFunction } from "express";
import { validateWebhookUrl, ssrfSafeFetch } from "../../lib/ssrf-guard";

// Re-export so existing tests that import from agent-webhooks continue to work.
export { validateWebhookUrl };

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

const registerWebhookSchema = z.object({
  endpointUrl: z.url().optional(),
  url: z.url().optional(),
  events: z.array(z.string()).max(50).default([]),
}).refine((data) => data.endpointUrl || data.url, {
  message: "Either endpointUrl or url is required",
});

router.post("/:agentId/webhooks", requireHumanOrAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = registerWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only manage its own webhooks");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent || agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const resolvedUrl = parsed.data.endpointUrl ?? parsed.data.url!;
    await validateWebhookUrl(resolvedUrl);
    const secret = randomBytes(32).toString("hex");

    const [webhook] = await db
      .insert(agentWebhooksTable)
      .values({
        agentId,
        url: resolvedUrl,
        secret,
        events: parsed.data.events,
      })
      .returning();

    await logActivity({
      agentId,
      eventType: "agent.webhook_created",
      payload: { webhookId: webhook.id, url: resolvedUrl, events: parsed.data.events },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      webhookId: webhook.id,
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      secret,
      createdAt: webhook.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/webhooks", requireHumanOrAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only manage its own webhooks");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent || agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const webhooks = await db.query.agentWebhooksTable.findMany({
      where: eq(agentWebhooksTable.agentId, agentId),
      columns: {
        id: true,
        url: true,
        events: true,
        active: true,
        consecutiveFailures: true,
        lastDeliveryAt: true,
        disabledAt: true,
        disableReason: true,
        createdAt: true,
      },
    });

    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

router.delete("/:agentId/webhooks/:webhookId", requireHumanOrAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const webhookId = req.params.webhookId as string;

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only manage its own webhooks");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent || agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const webhook = await db.query.agentWebhooksTable.findFirst({
      where: and(
        eq(agentWebhooksTable.id, webhookId),
        eq(agentWebhooksTable.agentId, agentId),
      ),
    });

    if (!webhook) {
      throw new AppError(404, "NOT_FOUND", "Webhook not found");
    }

    await db.delete(agentWebhooksTable).where(eq(agentWebhooksTable.id, webhookId));

    await logActivity({
      agentId,
      eventType: "agent.webhook_deleted",
      payload: { webhookId, url: webhook.url },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

const testWebhookSchema = z.object({
  eventType: z.enum(["message.received", "task.received", "trust.updated", "generic"]).default("generic"),
});

router.post("/:agentId/webhooks/:webhookId/test", requireHumanOrAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const webhookId = req.params.webhookId as string;

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only test its own webhooks");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent || agent.userId !== req.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const parsed = testWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const webhook = await db.query.agentWebhooksTable.findFirst({
      where: and(
        eq(agentWebhooksTable.id, webhookId),
        eq(agentWebhooksTable.agentId, agentId),
      ),
    });

    if (!webhook) {
      throw new AppError(404, "NOT_FOUND", "Webhook not found");
    }

    const eventType = parsed.data.eventType;
    const timestamp = new Date().toISOString();

    let testPayload: Record<string, unknown>;
    switch (eventType) {
      case "message.received":
        testPayload = {
          messageId: `test_${randomBytes(8).toString("hex")}`,
          fromAgentId: "test-sender-agent",
          fromHandle: "test-sender",
          content: "This is a test message from the Agent ID webhook test tool.",
          contentType: "text/plain",
          threadId: null,
          receivedAt: timestamp,
        };
        break;
      case "task.received":
        testPayload = {
          taskId: `test_${randomBytes(8).toString("hex")}`,
          fromAgentId: "test-delegator-agent",
          fromHandle: "test-delegator",
          title: "Test task delegation",
          description: "This is a test task created by the Agent ID webhook test tool.",
          priority: "normal",
          status: "pending",
          createdAt: timestamp,
        };
        break;
      case "trust.updated":
        testPayload = {
          previousScore: 42,
          newScore: 65,
          previousTier: "low",
          newTier: "medium",
          changedFactors: ["endpoint_verified", "activity_score"],
          updatedAt: timestamp,
        };
        break;
      default:
        testPayload = {
          message: "This is a test delivery from the Agent ID webhook test tool.",
          timestamp,
        };
    }

    const body = JSON.stringify({
      event: eventType,
      agentId,
      data: testPayload,
      timestamp,
    });

    const signature = buildSignatureHeader(body, webhook.secret);

    let delivered = false;
    let statusCode = 0;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await ssrfSafeFetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AgentID-Signature": signature,
          "X-AgentID-Event": eventType,
          "X-AgentID-Test": "true",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = response.status;
      delivered = response.ok;
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }

    res.json({
      delivered,
      statusCode,
      eventType,
      payload: testPayload,
      ...(error ? { error } : {}),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
