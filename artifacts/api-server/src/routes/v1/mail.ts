// @ts-nocheck
import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import * as mailService from "../../services/mail";

const router = Router();

router.get("/agents/:agentId/inbox", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const inbox = await mailService.getOrCreateInbox(agentId);
    const stats = await mailService.getInboxStats(inbox.id);
    res.json({ inbox, stats });
  } catch (err) {
    next(err);
  }
});

router.patch("/agents/:agentId/inbox", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      displayName: z.string().optional(),
      status: z.enum(["active", "paused", "disabled"]).optional(),
      autoRespond: z.boolean().optional(),
      autoRespondMessage: z.string().optional(),
      routingRules: z.array(z.any()).optional(),
    });
    const body = schema.parse(req.body);

    const inbox = await mailService.getInboxByAgent(agentId);
    if (!inbox) throw new AppError(404, "NOT_FOUND", "Inbox not found");

    const updated = await mailService.updateInbox(inbox.id, body);
    res.json({ inbox: updated });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/inbox/stats", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const inbox = await mailService.getInboxByAgent(agentId);
    if (!inbox) throw new AppError(404, "NOT_FOUND", "Inbox not found");

    const stats = await mailService.getInboxStats(inbox.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/threads", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const inbox = await mailService.getInboxByAgent(agentId);
    if (!inbox) throw new AppError(404, "NOT_FOUND", "Inbox not found");

    const { status, limit, offset } = req.query;
    const result = await mailService.listThreads({
      inboxId: inbox.id,
      status: status as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/threads/:threadId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, threadId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const thread = await mailService.getThread(threadId);
    if (!thread || thread.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Thread not found");
    }
    const messages = await mailService.getThreadMessages(threadId);
    res.json({ thread: { ...thread, messages, unreadCount: thread.unreadCount } });
  } catch (err) {
    next(err);
  }
});

router.patch("/agents/:agentId/threads/:threadId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, threadId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const thread = await mailService.getThread(threadId);
    if (!thread || thread.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Thread not found");
    }

    const schema = z.object({
      status: z.enum(["open", "archived", "closed"]),
    });
    const { status } = schema.parse(req.body);

    const updated = await mailService.updateThreadStatus(threadId, status);
    res.json({ thread: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/threads/:threadId/read", requireAuth, async (req, res, next) => {
  try {
    const { agentId, threadId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const thread = await mailService.getThread(threadId);
    if (!thread || thread.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Thread not found");
    }

    await mailService.markThreadRead(threadId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/messages", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const {
      threadId, direction, isRead, senderType, subject, labelId,
      afterDate, beforeDate, minTrustScore, limit, offset,
    } = req.query;

    const inbox = await mailService.getInboxByAgent(agentId);

    const result = await mailService.listMessages({
      agentId,
      inboxId: inbox?.id,
      threadId: threadId as string | undefined,
      direction: direction as string | undefined,
      isRead: isRead !== undefined ? isRead === "true" : undefined,
      senderType: senderType as string | undefined,
      subject: subject as string | undefined,
      labelId: labelId as string | undefined,
      afterDate: afterDate as string | undefined,
      beforeDate: beforeDate as string | undefined,
      minTrustScore: minTrustScore ? Number(minTrustScore) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/messages/:messageId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const message = await mailService.getMessage(messageId);
    if (!message || message.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const [labels, rawAttachments] = await Promise.all([
      mailService.getMessageLabels(messageId),
      mailService.getMessageAttachments(messageId),
    ]);

    const attachments = rawAttachments.map(a => ({
      id: a.id,
      messageId: a.messageId,
      filename: a.fileName,
      contentType: a.mimeType,
      size: a.sizeBytes,
      url: a.storageUrl,
      checksum: a.checksum,
      createdAt: a.createdAt,
    }));

    res.json({ message, labels, attachments });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      direction: z.enum(["inbound", "outbound"]),
      senderType: z.enum(["agent", "user", "system", "external"]),
      senderAgentId: z.string().uuid().optional(),
      senderUserId: z.string().uuid().optional(),
      senderAddress: z.string().optional(),
      recipientAddress: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().min(1),
      bodyFormat: z.enum(["text", "html", "markdown"]).optional(),
      structuredPayload: z.record(z.string(), z.unknown()).optional(),
      inReplyToId: z.string().uuid().optional(),
      senderTrustScore: z.number().int().min(0).max(100).optional(),
      senderVerified: z.boolean().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });
    const body = schema.parse(req.body);

    const message = await mailService.sendMessage({
      agentId,
      ...body,
    });
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/read", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const msg = await mailService.getMessage(messageId);
    if (!msg || msg.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const schema = z.object({ isRead: z.boolean() });
    const { isRead } = schema.parse(req.body);

    const updated = await mailService.markMessageRead(messageId, isRead);
    res.json({ message: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/convert-task", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const msg = await mailService.getMessage(messageId);
    if (!msg || msg.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const result = await mailService.convertMessageToTask(messageId, agentId);
    if (!result) throw new AppError(500, "CONVERSION_FAILED", "Failed to convert message to task");

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/messages/:messageId/events", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const msg = await mailService.getMessage(messageId);
    if (!msg || msg.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const events = await mailService.getMessageEvents(messageId);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/labels", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const labels = await mailService.listLabels(agentId);
    res.json({ labels });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/labels", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      name: z.string().min(1).max(100),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    });
    const body = schema.parse(req.body);

    const label = await mailService.createLabel(agentId, body.name, body.color);
    res.status(201).json({ label });
  } catch (err) {
    next(err);
  }
});

router.delete("/agents/:agentId/labels/:labelId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, labelId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const deleted = await mailService.deleteLabel(labelId, agentId);
    if (!deleted) throw new AppError(400, "CANNOT_DELETE", "Cannot delete system label or label not found");

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/labels/:labelId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId, labelId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const msg = await mailService.getMessage(messageId);
    if (!msg || msg.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const assigned = await mailService.assignLabel(messageId, labelId, agentId);
    if (!assigned) throw new AppError(404, "NOT_FOUND", "Label not found or not owned by this agent");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/agents/:agentId/messages/:messageId/labels/:labelId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId, labelId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const msg = await mailService.getMessage(messageId);
    if (!msg || msg.agentId !== agentId) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }

    const removed = await mailService.removeLabel(messageId, labelId, agentId);
    if (!removed) throw new AppError(404, "NOT_FOUND", "Label not found or not owned by this agent");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/webhooks", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const inbox = await mailService.getInboxByAgent(agentId);
    if (!inbox) throw new AppError(404, "NOT_FOUND", "Inbox not found");

    const webhooks = await mailService.listWebhooks(inbox.id);
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/webhooks", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const inbox = await mailService.getOrCreateInbox(agentId);

    const schema = z.object({
      url: z.url(),
      events: z.array(z.string()).optional(),
      secret: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const webhook = await mailService.createWebhook(
      inbox.id,
      agentId,
      body.url,
      body.events || [],
      body.secret,
    );
    res.status(201).json({ webhook });
  } catch (err) {
    next(err);
  }
});

router.patch("/agents/:agentId/webhooks/:webhookId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, webhookId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      url: z.url().optional(),
      events: z.array(z.string()).optional(),
      secret: z.string().optional(),
      status: z.enum(["active", "paused", "disabled"]).optional(),
    });
    const body = schema.parse(req.body);

    const updated = await mailService.updateWebhook(webhookId, agentId, body);
    if (!updated) throw new AppError(404, "NOT_FOUND", "Webhook not found");

    res.json({ webhook: updated });
  } catch (err) {
    next(err);
  }
});

router.delete("/agents/:agentId/webhooks/:webhookId", requireAuth, async (req, res, next) => {
  try {
    const { agentId, webhookId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const deleted = await mailService.deleteWebhook(webhookId, agentId);
    if (!deleted) throw new AppError(404, "NOT_FOUND", "Webhook not found");

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/threads/:threadId/reply", requireAuth, async (req, res, next) => {
  try {
    const { agentId, threadId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      body: z.string().min(1),
      bodyFormat: z.enum(["text", "html", "markdown"]).optional(),
      structuredPayload: z.record(z.string(), z.unknown()).optional(),
      recipientAddress: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });
    const body = schema.parse(req.body);

    const message = await mailService.replyToThread(agentId, threadId, body.body, {
      bodyFormat: body.bodyFormat,
      structuredPayload: body.structuredPayload,
      recipientAddress: body.recipientAddress,
      metadata: body.metadata,
    });
    if (!message) throw new AppError(404, "NOT_FOUND", "Thread not found or not owned by this agent");

    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/reject", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      reason: z.string().optional(),
    });
    const { reason } = schema.parse(req.body);

    const rejected = await mailService.rejectMessage(messageId, agentId, reason);
    if (!rejected) throw new AppError(404, "NOT_FOUND", "Message not found or not owned by this agent");

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/approve", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const message = await mailService.approveMessage(messageId, agentId);
    if (!message) throw new AppError(404, "NOT_FOUND", "Message not found or not owned by this agent");

    res.json({ message });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/archive", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const archived = await mailService.archiveMessage(messageId, agentId);
    if (!archived) throw new AppError(404, "NOT_FOUND", "Message not found or not owned by this agent");

    res.json({ message: "Message archived" });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/messages/:messageId/route", requireAuth, async (req, res, next) => {
  try {
    const { agentId, messageId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    await mailService.manuallyRouteMessage(messageId, agentId);
    res.json({ message: "Message routed" });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/labels/:labelId/bulk-assign", requireAuth, async (req, res, next) => {
  try {
    const { agentId, labelId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      messageIds: z.array(z.string().uuid()),
    });
    const { messageIds } = schema.parse(req.body);

    const result = await mailService.bulkAssignLabel(messageIds, labelId, agentId);
    res.json({ success: true, count: result.count, errors: result.errors });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/labels/:labelId/bulk-remove", requireAuth, async (req, res, next) => {
  try {
    const { agentId, labelId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const schema = z.object({
      messageIds: z.array(z.string().uuid()),
    });
    const { messageIds } = schema.parse(req.body);

    const result = await mailService.bulkRemoveLabel(messageIds, labelId, agentId);
    res.json({ success: true, count: result.count, errors: result.errors });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/search", requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const owned = await mailService.verifyAgentOwnership(agentId, req.userId!);
    if (!owned) throw new AppError(403, "FORBIDDEN", "Not your agent");

    const {
      q, direction, senderType, isRead, senderVerified, labelId, labelName,
      afterDate, beforeDate, minTrustScore, hasConvertedTask, convertedTaskId,
      originatingTaskId, threadId, priority, limit, offset,
    } = req.query;

    const result = await mailService.searchMessages({
      agentId,
      query: q as string | undefined,
      direction: direction as string | undefined,
      senderType: senderType as string | undefined,
      isRead: isRead !== undefined ? isRead === "true" : undefined,
      senderVerified: senderVerified !== undefined ? senderVerified === "true" : undefined,
      labelId: labelId as string | undefined,
      labelName: labelName as string | undefined,
      afterDate: afterDate as string | undefined,
      beforeDate: beforeDate as string | undefined,
      minTrustScore: minTrustScore ? Number(minTrustScore) : undefined,
      hasConvertedTask: hasConvertedTask !== undefined ? hasConvertedTask === "true" : undefined,
      convertedTaskId: convertedTaskId as string | undefined,
      originatingTaskId: originatingTaskId as string | undefined,
      threadId: threadId as string | undefined,
      priority: priority as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest", async (req, res, next) => {
  try {
    if (!req.user && !req.apiKey) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required. Use Bearer token or API key.");
    }

    const schema = z.object({
      recipientAddress: z.string().min(1),
      senderAddress: z.string().min(1),
      senderType: z.enum(["agent", "user", "external"]),
      senderAgentId: z.string().uuid().optional(),
      subject: z.string().optional(),
      body: z.string().min(1),
      bodyFormat: z.enum(["text", "html", "markdown"]).optional(),
      structuredPayload: z.record(z.string(), z.unknown()).optional(),
      externalMessageId: z.string().optional(),
      senderTrustScore: z.number().int().min(0).max(100).optional(),
      senderVerified: z.boolean().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });

    const body = schema.parse(req.body);

    const result = await mailService.ingestExternalMessage(body);
    if (!result) {
      throw new AppError(404, "INBOX_NOT_FOUND", "No active inbox found for the given recipient address");
    }

    res.status(201).json({
      messageId: result.message.id,
      threadId: result.message.threadId,
      inboxId: result.inbox.id,
      deliveryStatus: result.message.deliveryStatus,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
