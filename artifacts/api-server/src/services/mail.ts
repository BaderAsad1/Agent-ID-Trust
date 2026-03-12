import { eq, and, desc, sql, ilike, gte, lte, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentInboxesTable,
  agentThreadsTable,
  agentMessagesTable,
  messageLabelsTable,
  messageLabelAssignmentsTable,
  messageAttachmentsTable,
  messageEventsTable,
  inboxWebhooksTable,
  inboundTransportEventsTable,
  outboundMessageDeliveriesTable,
  agentsTable,
  tasksTable,
  type AgentInbox,
  type AgentThread,
  type AgentMessage,
  type MessageLabel,
  type InboxWebhook,
  type RoutingRule,
  type RoutingCondition,
  type RoutingAction,
  type ProvenanceEntry,
} from "@workspace/db/schema";
import { signWebhookPayload, deliverOutbound, recordOutboundDeliveryResult } from "./mail-transport";
import { enqueueWebhookDelivery, isWebhookQueueAvailable } from "../workers/webhook-delivery";
import { encryptSecret, decryptSecret } from "../utils/crypto";
import { AppError } from "../middlewares/error-handler";
import { normalizeSubject as normalizeSubjectUtil, evaluateConditionSync, generateSnippet, isPrivateOrLocalUrl } from "./mail-utils";

const MAIL_BASE_DOMAIN = process.env.MAIL_BASE_DOMAIN || "agents.local";

function isUrlSafe(url: string): boolean {
  if (isPrivateOrLocalUrl(url)) return false;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host.startsWith("169.254.")) return false;
    if (host === "metadata.google.internal") return false;
    return true;
  } catch {
    return false;
  }
}

const SYSTEM_LABELS = [
  "inbox", "sent", "archived", "spam", "important", "tasks",
  "drafts", "flagged", "verified", "quarantine",
  "unread", "routed", "requires-approval",
  "paid", "marketplace", "jobs", "agent", "human",
];

export async function ensureSystemLabels(agentId: string): Promise<void> {
  for (const name of SYSTEM_LABELS) {
    await db
      .insert(messageLabelsTable)
      .values({ agentId, name, isSystem: true })
      .onConflictDoNothing();
  }
}

export async function getOrCreateInbox(agentId: string): Promise<AgentInbox> {
  const existing = await db.query.agentInboxesTable.findFirst({
    where: eq(agentInboxesTable.agentId, agentId),
  });
  if (existing) return existing;

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { handle: true },
  });

  const localPart = agent?.handle || agentId;
  const address = `${localPart}@${MAIL_BASE_DOMAIN}`;

  const [inbox] = await db
    .insert(agentInboxesTable)
    .values({
      agentId,
      address,
      addressLocalPart: localPart,
      addressDomain: MAIL_BASE_DOMAIN,
      displayName: agent?.handle,
      status: "active",
    })
    .onConflictDoNothing()
    .returning();

  if (!inbox) {
    const found = await db.query.agentInboxesTable.findFirst({
      where: eq(agentInboxesTable.agentId, agentId),
    });
    if (!found) throw new Error("Failed to create inbox");
    return found;
  }

  await ensureSystemLabels(agentId);
  return inbox;
}

export async function provisionInboxForAgent(agentId: string): Promise<AgentInbox> {
  const inbox = await getOrCreateInbox(agentId);
  await ensureSystemLabels(agentId);
  return inbox;
}

export async function getInbox(inboxId: string): Promise<AgentInbox | null> {
  const inbox = await db.query.agentInboxesTable.findFirst({
    where: eq(agentInboxesTable.id, inboxId),
  });
  return inbox ?? null;
}

export async function getInboxByAgent(agentId: string): Promise<AgentInbox | null> {
  const inbox = await db.query.agentInboxesTable.findFirst({
    where: eq(agentInboxesTable.agentId, agentId),
  });
  return inbox ?? null;
}

export async function updateInbox(
  inboxId: string,
  updates: Partial<Pick<AgentInbox, "displayName" | "status" | "autoRespond" | "autoRespondMessage" | "routingRules">>,
): Promise<AgentInbox | null> {
  const [updated] = await db
    .update(agentInboxesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(agentInboxesTable.id, inboxId))
    .returning();
  return updated ?? null;
}

export async function getInboxStats(inboxId: string) {
  const [msgStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${agentMessagesTable.isRead} = false and ${agentMessagesTable.direction} = 'inbound')::int`,
    })
    .from(agentMessagesTable)
    .where(eq(agentMessagesTable.inboxId, inboxId));

  const [threadStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${agentThreadsTable.status} = 'open')::int`,
    })
    .from(agentThreadsTable)
    .where(eq(agentThreadsTable.inboxId, inboxId));

  return {
    messages: { total: msgStats.total, unread: msgStats.unread },
    threads: { total: threadStats.total, open: threadStats.open },
  };
}

export interface ThreadListFilters {
  inboxId: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listThreads(filters: ThreadListFilters): Promise<{
  threads: AgentThread[];
  total: number;
}> {
  const conditions = [eq(agentThreadsTable.inboxId, filters.inboxId)];
  if (filters.status) {
    conditions.push(
      eq(agentThreadsTable.status, filters.status as AgentThread["status"]),
    );
  }
  const where = and(...conditions);

  const [threads, countResult] = await Promise.all([
    db.query.agentThreadsTable.findMany({
      where,
      orderBy: [desc(agentThreadsTable.lastMessageAt)],
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentThreadsTable)
      .where(where),
  ]);

  return { threads, total: countResult[0].count };
}

export async function getThread(threadId: string): Promise<AgentThread | null> {
  const thread = await db.query.agentThreadsTable.findFirst({
    where: eq(agentThreadsTable.id, threadId),
  });
  return thread ?? null;
}

export async function getThreadMessages(threadId: string): Promise<AgentMessage[]> {
  return db.query.agentMessagesTable.findMany({
    where: eq(agentMessagesTable.threadId, threadId),
    orderBy: [desc(agentMessagesTable.createdAt)],
  });
}

export async function archiveMessage(messageId: string, agentId: string): Promise<AgentMessage | null> {
  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return null;

  await db
    .update(agentMessagesTable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentMessagesTable.id, messageId));

  const archivedLabel = await db.query.messageLabelsTable.findFirst({
    where: and(
      eq(messageLabelsTable.agentId, agentId),
      eq(messageLabelsTable.name, "archived"),
    ),
  });
  if (archivedLabel) {
    await assignLabel(messageId, archivedLabel.id, agentId);
  }

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "message.archived",
    payload: {},
  });

  const updated = await getMessage(messageId);
  return updated;
}

export async function manuallyRouteMessage(
  messageId: string,
  agentId: string,
  rules?: RoutingRule[],
): Promise<void> {
  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return;

  let rulesToApply = rules;
  if (!rulesToApply) {
    const inbox = await db.query.agentInboxesTable.findFirst({
      where: eq(agentInboxesTable.id, message.inboxId),
    });
    rulesToApply = (inbox?.routingRules as RoutingRule[]) || [];
  }

  await applyRoutingRules(message, rulesToApply);
}

export async function bulkAssignLabel(
  messageIds: string[],
  labelId: string,
  agentId: string,
): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];
  for (const messageId of messageIds) {
    try {
      const ok = await assignLabel(messageId, labelId, agentId);
      if (ok) count++;
      else errors.push(messageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mail] bulkAssignLabel failed for message ${messageId}: ${msg}`);
      errors.push(messageId);
    }
  }
  return { count, errors };
}

export async function bulkRemoveLabel(
  messageIds: string[],
  labelId: string,
  agentId: string,
): Promise<{ count: number; errors: string[] }> {
  let count = 0;
  const errors: string[] = [];
  for (const messageId of messageIds) {
    try {
      const ok = await removeLabel(messageId, labelId, agentId);
      if (ok) count++;
      else errors.push(messageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mail] bulkRemoveLabel failed for message ${messageId}: ${msg}`);
      errors.push(messageId);
    }
  }
  return { count, errors };
}

export async function updateThreadStatus(
  threadId: string,
  status: AgentThread["status"],
): Promise<AgentThread | null> {
  const [updated] = await db
    .update(agentThreadsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(agentThreadsTable.id, threadId))
    .returning();

  if (updated) {
    await emitWebhookEvent(updated.inboxId, "thread.updated", {
      threadId,
      status,
      messageCount: updated.messageCount,
      subject: updated.subject,
    });
  }

  return updated ?? null;
}

const normalizeSubject = normalizeSubjectUtil;

async function findOrCreateThread(
  inboxId: string,
  agentId: string,
  subject: string | null | undefined,
  inReplyToId: string | null | undefined,
): Promise<AgentThread> {
  if (inReplyToId) {
    const parentMsg = await db.query.agentMessagesTable.findFirst({
      where: and(
        eq(agentMessagesTable.id, inReplyToId),
        eq(agentMessagesTable.agentId, agentId),
      ),
      columns: { threadId: true },
    });
    if (parentMsg) {
      const thread = await db.query.agentThreadsTable.findFirst({
        where: and(
          eq(agentThreadsTable.id, parentMsg.threadId),
          eq(agentThreadsTable.agentId, agentId),
        ),
      });
      if (thread) return thread;
    }
  }

  const normalized = normalizeSubject(subject);
  if (normalized) {
    const existingThread = await db.query.agentThreadsTable.findFirst({
      where: and(
        eq(agentThreadsTable.inboxId, inboxId),
        eq(agentThreadsTable.subject, normalized),
        eq(agentThreadsTable.status, "open"),
      ),
      orderBy: [desc(agentThreadsTable.lastMessageAt)],
    });
    if (existingThread) return existingThread;
  }

  const [thread] = await db
    .insert(agentThreadsTable)
    .values({
      inboxId,
      agentId,
      subject: normalized || subject || "(no subject)",
      status: "open",
    })
    .returning();

  return thread;
}

export interface SendMessageInput {
  agentId: string;
  direction: "inbound" | "outbound";
  senderType: "agent" | "user" | "system" | "external";
  senderAgentId?: string;
  senderUserId?: string;
  senderAddress?: string;
  recipientAddress?: string;
  subject?: string;
  body: string;
  bodyFormat?: string;
  structuredPayload?: Record<string, unknown>;
  inReplyToId?: string;
  senderTrustScore?: number;
  senderVerified?: boolean;
  priority?: string;
  metadata?: Record<string, unknown>;
}

export async function sendMessage(input: SendMessageInput): Promise<AgentMessage> {
  const inbox = await getOrCreateInbox(input.agentId);

  const thread = await findOrCreateThread(
    inbox.id,
    input.agentId,
    input.subject,
    input.inReplyToId,
  );

  const initialProvenance: ProvenanceEntry[] = [{
    timestamp: new Date().toISOString(),
    action: input.direction === "inbound" ? "received" : "sent",
    actor: input.senderAddress || input.senderAgentId || input.senderUserId || "unknown",
    actorType: input.senderType as ProvenanceEntry["actorType"],
    details: { inboxId: inbox.id, threadId: thread.id },
  }];

  const [message] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread.id,
      inboxId: inbox.id,
      agentId: input.agentId,
      direction: input.direction,
      senderType: input.senderType,
      senderAgentId: input.senderAgentId,
      senderUserId: input.senderUserId,
      senderAddress: input.senderAddress || (input.direction === "outbound" ? inbox.address : undefined),
      recipientAddress: input.recipientAddress || (input.direction === "inbound" ? inbox.address : undefined),
      subject: input.subject || thread.subject,
      body: input.body,
      snippet: generateSnippet(input.body, input.bodyFormat || "text"),
      bodyFormat: input.bodyFormat || "text",
      structuredPayload: input.structuredPayload,
      isRead: input.direction === "outbound",
      deliveryStatus: input.direction === "outbound" ? "queued" : "delivered",
      senderTrustScore: input.senderTrustScore,
      senderVerified: input.senderVerified ?? false,
      provenanceChain: initialProvenance,
      priority: input.priority || "normal",
      inReplyToId: input.inReplyToId,
      metadata: input.metadata,
    })
    .returning();

  const unreadIncrement = input.direction === "inbound" ? 1 : 0;

  const participantUpdate: Record<string, unknown> = {
    messageCount: sql`${agentThreadsTable.messageCount} + 1`,
    unreadCount: sql`${agentThreadsTable.unreadCount} + ${unreadIncrement}`,
    lastMessageAt: new Date(),
    updatedAt: new Date(),
  };

  if (input.senderAgentId) {
    participantUpdate.participantAgentIds = sql`
      case when ${agentThreadsTable.participantAgentIds} @> ${JSON.stringify([input.senderAgentId])}::jsonb
      then ${agentThreadsTable.participantAgentIds}
      else ${agentThreadsTable.participantAgentIds} || ${JSON.stringify([input.senderAgentId])}::jsonb
      end
    `;
  }
  if (input.senderUserId) {
    participantUpdate.participantUserIds = sql`
      case when ${agentThreadsTable.participantUserIds} @> ${JSON.stringify([input.senderUserId])}::jsonb
      then ${agentThreadsTable.participantUserIds}
      else ${agentThreadsTable.participantUserIds} || ${JSON.stringify([input.senderUserId])}::jsonb
      end
    `;
  }

  await db
    .update(agentThreadsTable)
    .set(participantUpdate)
    .where(eq(agentThreadsTable.id, thread.id));

  await db
    .update(agentInboxesTable)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(agentInboxesTable.id, inbox.id));

  await db.insert(messageEventsTable).values({
    messageId: message.id,
    eventType: input.direction === "inbound" ? "message.received" : "message.sent",
    payload: {
      direction: input.direction,
      senderType: input.senderType,
      threadId: thread.id,
    },
  });

  if (input.direction === "inbound" && inbox.routingRules && (inbox.routingRules as RoutingRule[]).length > 0) {
    await applyRoutingRules(message, inbox.routingRules as RoutingRule[]);
  }

  if (input.direction === "outbound" && input.recipientAddress) {
    const transportResult = await deliverOutbound({
      messageId: message.id,
      from: input.senderAddress || inbox.address,
      to: input.recipientAddress,
      subject: message.subject || undefined,
      body: input.body,
      bodyFormat: input.bodyFormat || "text",
      metadata: input.metadata,
    });
    await recordOutboundDeliveryResult(message.id, transportResult);

    if (transportResult.success) {
      await db
        .update(agentMessagesTable)
        .set({ deliveryStatus: "delivered", updatedAt: new Date() })
        .where(eq(agentMessagesTable.id, message.id));
    } else {
      await db
        .update(agentMessagesTable)
        .set({ deliveryStatus: "failed", updatedAt: new Date() })
        .where(eq(agentMessagesTable.id, message.id));

      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.delivery_failed",
        payload: { direction: input.direction },
      });
    }
  }

  await emitWebhookEvent(inbox.id, input.direction === "inbound" ? "message.received" : "message.sent", {
    messageId: message.id,
    threadId: thread.id,
    direction: input.direction,
    subject: message.subject,
  });

  return message;
}

export interface MessageListFilters {
  inboxId?: string;
  threadId?: string;
  agentId?: string;
  direction?: string;
  isRead?: boolean;
  senderType?: string;
  subject?: string;
  labelId?: string;
  afterDate?: string;
  beforeDate?: string;
  minTrustScore?: number;
  limit?: number;
  offset?: number;
}

export async function listMessages(filters: MessageListFilters): Promise<{
  messages: AgentMessage[];
  total: number;
}> {
  const conditions = [];

  if (filters.inboxId) conditions.push(eq(agentMessagesTable.inboxId, filters.inboxId));
  if (filters.threadId) conditions.push(eq(agentMessagesTable.threadId, filters.threadId));
  if (filters.agentId) conditions.push(eq(agentMessagesTable.agentId, filters.agentId));
  if (filters.direction) {
    conditions.push(eq(agentMessagesTable.direction, filters.direction as AgentMessage["direction"]));
  }
  if (filters.isRead !== undefined) conditions.push(eq(agentMessagesTable.isRead, filters.isRead));
  if (filters.senderType) {
    conditions.push(eq(agentMessagesTable.senderType, filters.senderType as AgentMessage["senderType"]));
  }
  if (filters.subject) conditions.push(ilike(agentMessagesTable.subject, `%${filters.subject}%`));
  if (filters.afterDate) conditions.push(gte(agentMessagesTable.createdAt, new Date(filters.afterDate)));
  if (filters.beforeDate) conditions.push(lte(agentMessagesTable.createdAt, new Date(filters.beforeDate)));
  if (filters.minTrustScore !== undefined) {
    conditions.push(gte(agentMessagesTable.senderTrustScore, filters.minTrustScore));
  }

  if (filters.labelId) {
    const labelMsgIds = await db
      .select({ messageId: messageLabelAssignmentsTable.messageId })
      .from(messageLabelAssignmentsTable)
      .where(eq(messageLabelAssignmentsTable.labelId, filters.labelId));
    const ids = labelMsgIds.map((r) => r.messageId);
    if (ids.length === 0) return { messages: [], total: 0 };
    conditions.push(inArray(agentMessagesTable.id, ids));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [messages, countResult] = await Promise.all([
    db.query.agentMessagesTable.findMany({
      where,
      orderBy: [desc(agentMessagesTable.createdAt)],
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentMessagesTable)
      .where(where),
  ]);

  return { messages, total: countResult[0].count };
}

export async function getMessage(messageId: string): Promise<AgentMessage | null> {
  const msg = await db.query.agentMessagesTable.findFirst({
    where: eq(agentMessagesTable.id, messageId),
  });
  return msg ?? null;
}

export async function markMessageRead(
  messageId: string,
  isRead: boolean,
): Promise<AgentMessage | null> {
  const msg = await getMessage(messageId);
  if (!msg) return null;

  if (msg.isRead === isRead) return msg;

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: isRead ? "message.read" : "message.unread",
    payload: {},
  });

  const [updated] = await db
    .update(agentMessagesTable)
    .set({
      isRead,
      readAt: isRead ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(agentMessagesTable.id, messageId))
    .returning();

  const delta = isRead ? -1 : 1;
  if (msg.direction === "inbound") {
    await db
      .update(agentThreadsTable)
      .set({
        unreadCount: sql`greatest(${agentThreadsTable.unreadCount} + ${delta}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(agentThreadsTable.id, msg.threadId));
  }

  return updated ?? null;
}

export async function markThreadRead(threadId: string): Promise<void> {
  await db
    .update(agentMessagesTable)
    .set({ isRead: true, updatedAt: new Date() })
    .where(
      and(
        eq(agentMessagesTable.threadId, threadId),
        eq(agentMessagesTable.isRead, false),
      ),
    );

  await db
    .update(agentThreadsTable)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(agentThreadsTable.id, threadId));
}

export async function createLabel(
  agentId: string,
  name: string,
  color?: string,
): Promise<MessageLabel> {
  const [label] = await db
    .insert(messageLabelsTable)
    .values({ agentId, name, color, isSystem: false })
    .returning();
  return label;
}

export async function listLabels(agentId: string): Promise<MessageLabel[]> {
  return db.query.messageLabelsTable.findMany({
    where: eq(messageLabelsTable.agentId, agentId),
  });
}

export async function deleteLabel(labelId: string, agentId: string): Promise<boolean> {
  const label = await db.query.messageLabelsTable.findFirst({
    where: and(eq(messageLabelsTable.id, labelId), eq(messageLabelsTable.agentId, agentId)),
  });
  if (!label || label.isSystem) return false;

  await db.delete(messageLabelAssignmentsTable).where(
    eq(messageLabelAssignmentsTable.labelId, labelId),
  );
  await db.delete(messageLabelsTable).where(
    and(eq(messageLabelsTable.id, labelId), eq(messageLabelsTable.agentId, agentId)),
  );
  return true;
}

export async function assignLabel(messageId: string, labelId: string, agentId: string): Promise<boolean> {
  const label = await db.query.messageLabelsTable.findFirst({
    where: and(eq(messageLabelsTable.id, labelId), eq(messageLabelsTable.agentId, agentId)),
  });
  if (!label) return false;

  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return false;

  await db
    .insert(messageLabelAssignmentsTable)
    .values({ messageId, labelId })
    .onConflictDoNothing();

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "label.assigned",
    payload: { labelId, labelName: label.name },
  });

  return true;
}

export async function removeLabel(messageId: string, labelId: string, agentId: string): Promise<boolean> {
  const label = await db.query.messageLabelsTable.findFirst({
    where: and(eq(messageLabelsTable.id, labelId), eq(messageLabelsTable.agentId, agentId)),
  });
  if (!label) return false;

  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return false;

  await db.delete(messageLabelAssignmentsTable).where(
    and(
      eq(messageLabelAssignmentsTable.messageId, messageId),
      eq(messageLabelAssignmentsTable.labelId, labelId),
    ),
  );

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "label.removed",
    payload: { labelId, labelName: label.name },
  });

  return true;
}

export async function getMessageLabels(messageId: string): Promise<MessageLabel[]> {
  const assignments = await db
    .select({ labelId: messageLabelAssignmentsTable.labelId })
    .from(messageLabelAssignmentsTable)
    .where(eq(messageLabelAssignmentsTable.messageId, messageId));

  if (assignments.length === 0) return [];

  return db.query.messageLabelsTable.findMany({
    where: inArray(
      messageLabelsTable.id,
      assignments.map((a) => a.labelId),
    ),
  });
}

async function applyRoutingRules(
  message: AgentMessage,
  rules: RoutingRule[],
): Promise<void> {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const results = await Promise.all(
      rule.conditions.map((cond) => evaluateCondition(message, cond)),
    );
    if (!results.every(Boolean)) continue;

    for (const action of rule.actions) {
      await executeAction(message, action);
    }

    const routedLabel = await db.query.messageLabelsTable.findFirst({
      where: and(
        eq(messageLabelsTable.agentId, message.agentId),
        eq(messageLabelsTable.name, "routed"),
      ),
    });
    if (routedLabel) {
      await assignLabel(message.id, routedLabel.id, message.agentId);
    }

    await emitWebhookEvent(message.inboxId, "message.routed", {
      messageId: message.id,
      threadId: message.threadId,
      ruleId: rule.id,
      ruleName: rule.name,
      actions: rule.actions.map((a) => a.type),
    });
  }
}

async function evaluateCondition(message: AgentMessage, cond: RoutingCondition): Promise<boolean> {
  if (cond.field === "label") {
    const labels = await getMessageLabels(message.id);
    const labelNames = labels.map((l) => l.name.toLowerCase());
    const target = String(cond.value).toLowerCase();
    switch (cond.operator) {
      case "eq":
        return labelNames.includes(target);
      case "neq":
        return !labelNames.includes(target);
      case "contains":
        return labelNames.some((n) => n.includes(target));
      default:
        return false;
    }
  }

  let value: string | number | boolean | null | undefined;

  switch (cond.field) {
    case "sender_type":
      value = message.senderType;
      break;
    case "sender_trust":
      value = message.senderTrustScore;
      break;
    case "subject":
      value = message.subject;
      break;
    case "direction":
      value = message.direction;
      break;
    case "sender_verified":
      value = message.senderVerified;
      break;
    case "priority":
      value = message.priority;
      break;
    case "sender_address":
      value = message.senderAddress;
      break;
    case "body":
      value = message.body;
      break;
    default:
      return false;
  }

  if (value === null || value === undefined) return false;

  if (typeof value === "boolean") {
    return cond.operator === "eq"
      ? value === (cond.value === true || cond.value === "true")
      : value !== (cond.value === true || cond.value === "true");
  }

  switch (cond.operator) {
    case "eq":
      return String(value) === String(cond.value);
    case "neq":
      return String(value) !== String(cond.value);
    case "gt":
      return Number(value) > Number(cond.value);
    case "lt":
      return Number(value) < Number(cond.value);
    case "gte":
      return Number(value) >= Number(cond.value);
    case "lte":
      return Number(value) <= Number(cond.value);
    case "contains":
      return String(value).toLowerCase().includes(String(cond.value).toLowerCase());
    case "matches":
      try {
        return new RegExp(String(cond.value), "i").test(String(value));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

async function executeAction(message: AgentMessage, action: RoutingAction): Promise<void> {
  switch (action.type) {
    case "label": {
      const labelName = action.params?.label as string;
      if (!labelName) break;
      const label = await db.query.messageLabelsTable.findFirst({
        where: and(
          eq(messageLabelsTable.agentId, message.agentId),
          eq(messageLabelsTable.name, labelName),
        ),
      });
      if (label) {
        await assignLabel(message.id, label.id, message.agentId);
      }
      break;
    }
    case "archive": {
      await db
        .update(agentThreadsTable)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(agentThreadsTable.id, message.threadId));
      break;
    }
    case "convert_task": {
      await convertMessageToTask(message.id, message.agentId);
      break;
    }
    case "forward": {
      const targetAddress = action.params?.to as string;
      const targetEndpoint = action.params?.endpoint as string;
      if (!targetAddress && !targetEndpoint) break;

      let delivered = false;

      if (targetEndpoint) {
        if (!isUrlSafe(targetEndpoint)) {
          console.error(`[mail] Blocked forward to unsafe endpoint: ${targetEndpoint}`);
          break;
        }
        try {
          const forwardPayload = {
            messageId: message.id,
            threadId: message.threadId,
            subject: message.subject,
            body: message.body,
            bodyFormat: message.bodyFormat,
            senderAddress: message.senderAddress,
            senderType: message.senderType,
            priority: message.priority,
            structuredPayload: message.structuredPayload,
            forwardedFrom: message.inboxId,
            timestamp: new Date().toISOString(),
          };
          const resp = await fetch(targetEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(forwardPayload),
            signal: AbortSignal.timeout(10000),
          });
          delivered = resp.ok;
        } catch {
          delivered = false;
        }
      }

      if (targetAddress) {
        const targetInbox = await db.query.agentInboxesTable.findFirst({
          where: eq(agentInboxesTable.address, targetAddress),
        });
        if (targetInbox) {
          await sendMessage({
            agentId: targetInbox.agentId,
            direction: "inbound",
            senderType: message.senderType as "agent" | "user" | "system" | "external",
            senderAgentId: message.senderAgentId || undefined,
            senderUserId: message.senderUserId || undefined,
            senderAddress: message.senderAddress || undefined,
            subject: message.subject ? `Fwd: ${message.subject}` : undefined,
            body: message.body,
            bodyFormat: message.bodyFormat,
            metadata: { forwardedFrom: message.id, originalInbox: message.inboxId },
          });
          delivered = true;
        }
      }

      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.forwarded",
        payload: {
          to: targetAddress || null,
          endpoint: targetEndpoint || null,
          delivered,
        },
      });
      break;
    }
    case "auto_reply": {
      const replyBody = action.params?.body as string;
      if (!replyBody) break;
      const inbox = await db.query.agentInboxesTable.findFirst({
        where: eq(agentInboxesTable.id, message.inboxId),
      });
      if (inbox) {
        await sendMessage({
          agentId: message.agentId,
          direction: "outbound",
          senderType: "agent",
          senderAgentId: message.agentId,
          senderAddress: inbox.address,
          recipientAddress: message.senderAddress || undefined,
          subject: message.subject ? `Re: ${message.subject}` : undefined,
          body: replyBody,
          inReplyToId: message.id,
        });
      }
      break;
    }
    case "webhook": {
      const webhookUrl = action.params?.url as string;
      if (!webhookUrl) break;
      if (!isUrlSafe(webhookUrl)) {
        console.error(`[mail] Blocked routing webhook to unsafe URL: ${webhookUrl}`);
        break;
      }
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "routing.webhook",
            messageId: message.id,
            subject: message.subject,
            senderType: message.senderType,
            direction: message.direction,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        console.error(`[mail] routing webhook delivery to ${webhookUrl} failed:`, err instanceof Error ? err.message : err);
      }
      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "routing.webhook_fired",
        payload: { url: webhookUrl },
      });
      break;
    }
    case "drop": {
      await db
        .update(agentMessagesTable)
        .set({ deliveryStatus: "bounced", updatedAt: new Date() })
        .where(eq(agentMessagesTable.id, message.id));
      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.dropped",
        payload: { reason: action.params?.reason || "routing_rule" },
      });
      break;
    }
    case "reject": {
      await db
        .update(agentMessagesTable)
        .set({ deliveryStatus: "bounced", updatedAt: new Date() })
        .where(eq(agentMessagesTable.id, message.id));
      const inbox = await db.query.agentInboxesTable.findFirst({
        where: eq(agentInboxesTable.id, message.inboxId),
      });
      if (inbox && message.senderAddress) {
        await sendMessage({
          agentId: message.agentId,
          direction: "outbound",
          senderType: "system",
          senderAddress: inbox.address,
          recipientAddress: message.senderAddress,
          subject: `Rejected: ${message.subject || "(no subject)"}`,
          body: (action.params?.reason as string) || "Your message was rejected by the recipient's routing policy.",
          inReplyToId: message.id,
        });
      }
      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.rejected",
        payload: { reason: action.params?.reason || "routing_policy" },
      });
      break;
    }
    case "require_verification": {
      await db
        .update(agentMessagesTable)
        .set({ deliveryStatus: "queued", updatedAt: new Date() })
        .where(eq(agentMessagesTable.id, message.id));
      const quarantineLabel = await db.query.messageLabelsTable.findFirst({
        where: and(
          eq(messageLabelsTable.agentId, message.agentId),
          eq(messageLabelsTable.name, "quarantine"),
        ),
      });
      if (quarantineLabel) {
        await assignLabel(message.id, quarantineLabel.id, message.agentId);
      }
      const reqApprovalLabel = await db.query.messageLabelsTable.findFirst({
        where: and(
          eq(messageLabelsTable.agentId, message.agentId),
          eq(messageLabelsTable.name, "requires-approval"),
        ),
      });
      if (reqApprovalLabel) {
        await assignLabel(message.id, reqApprovalLabel.id, message.agentId);
      }
      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.verification_required",
        payload: { reason: action.params?.reason || "unverified_sender" },
      });
      break;
    }
    case "quarantine": {
      const qLabel = await db.query.messageLabelsTable.findFirst({
        where: and(
          eq(messageLabelsTable.agentId, message.agentId),
          eq(messageLabelsTable.name, "quarantine"),
        ),
      });
      if (qLabel) {
        await assignLabel(message.id, qLabel.id, message.agentId);
      }
      await db.insert(messageEventsTable).values({
        messageId: message.id,
        eventType: "message.quarantined",
        payload: { reason: action.params?.reason || "routing_rule" },
      });
      break;
    }
    default:
      break;
  }
}

export async function convertMessageToTask(
  messageId: string,
  agentId: string,
): Promise<{ taskId: string } | null> {
  const message = await getMessage(messageId);
  if (!message) return null;

  if (message.convertedTaskId) return { taskId: message.convertedTaskId };

  const [task] = await db
    .insert(tasksTable)
    .values({
      recipientAgentId: agentId,
      senderUserId: message.senderUserId,
      senderAgentId: message.senderAgentId,
      taskType: "mail_conversion",
      payload: {
        subject: message.subject,
        body: message.body,
        messageId: message.id,
      },
      deliveryStatus: "pending",
      businessStatus: "pending",
      originatingMessageId: message.id,
    })
    .returning();

  await db
    .update(agentMessagesTable)
    .set({ convertedTaskId: task.id, updatedAt: new Date() })
    .where(eq(agentMessagesTable.id, messageId));

  await db
    .update(agentsTable)
    .set({
      tasksReceived: sql`${agentsTable.tasksReceived} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "message.converted_to_task",
    payload: { taskId: task.id },
  });

  const taskLabel = await db.query.messageLabelsTable.findFirst({
    where: and(
      eq(messageLabelsTable.agentId, agentId),
      eq(messageLabelsTable.name, "tasks"),
    ),
  });
  if (taskLabel) {
    await assignLabel(messageId, taskLabel.id, agentId);
  }

  await emitWebhookEvent(message.inboxId, "message.converted_to_task", {
    messageId,
    taskId: task.id,
    threadId: message.threadId,
    subject: message.subject,
  });

  return { taskId: task.id };
}

export async function createWebhook(
  inboxId: string,
  agentId: string,
  url: string,
  events: string[],
  secret?: string,
): Promise<InboxWebhook> {
  if (!isUrlSafe(url)) {
    throw new AppError(400, "INVALID_URL", "Webhook URL targets a private or unsafe address");
  }
  const secretEncrypted = secret ? encryptSecret(secret) : undefined;
  const [webhook] = await db
    .insert(inboxWebhooksTable)
    .values({ inboxId, agentId, url, events, secretEncrypted, status: "active" })
    .returning();
  return webhook;
}

export async function listWebhooks(inboxId: string): Promise<InboxWebhook[]> {
  return db.query.inboxWebhooksTable.findMany({
    where: eq(inboxWebhooksTable.inboxId, inboxId),
  });
}

export async function updateWebhook(
  webhookId: string,
  agentId: string,
  updates: Partial<Pick<InboxWebhook, "url" | "events" | "status">> & { secret?: string },
): Promise<InboxWebhook | null> {
  if (updates.url && !isUrlSafe(updates.url)) {
    throw new AppError(400, "INVALID_URL", "Webhook URL targets a private or unsafe address");
  }
  const dbUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (updates.secret !== undefined) {
    dbUpdates.secretEncrypted = updates.secret ? encryptSecret(updates.secret) : null;
    delete dbUpdates.secret;
  }
  const [updated] = await db
    .update(inboxWebhooksTable)
    .set(dbUpdates)
    .where(and(eq(inboxWebhooksTable.id, webhookId), eq(inboxWebhooksTable.agentId, agentId)))
    .returning();
  return updated ?? null;
}

export async function deleteWebhook(webhookId: string, agentId: string): Promise<boolean> {
  const result = await db
    .delete(inboxWebhooksTable)
    .where(and(eq(inboxWebhooksTable.id, webhookId), eq(inboxWebhooksTable.agentId, agentId)));
  return (result.rowCount ?? 0) > 0;
}

async function emitWebhookEvent(
  inboxId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await db.query.inboxWebhooksTable.findMany({
    where: and(
      eq(inboxWebhooksTable.inboxId, inboxId),
      eq(inboxWebhooksTable.status, "active"),
    ),
  });

  const useQueue = isWebhookQueueAvailable();

  for (const wh of webhooks) {
    const events = (wh.events as string[]) || [];
    if (events.length > 0 && !events.includes(eventType)) continue;

    if (!isUrlSafe(wh.url)) {
      console.error(`[mail] Blocked webhook delivery to unsafe URL: ${wh.url}`);
      continue;
    }

    if (useQueue) {
      const webhookSecret = wh.secretEncrypted ? decryptSecret(wh.secretEncrypted) : undefined;
      await enqueueWebhookDelivery({
        webhookId: wh.id,
        webhookUrl: wh.url,
        webhookSecret,
        eventType,
        payload,
        messageId: payload.messageId as string,
      });
      continue;
    }

    await deliverWebhookInProcess(wh, eventType, payload);
  }
}

async function deliverWebhookInProcess(
  wh: InboxWebhook,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000;
  const RETRY_DELAYS = [0, BASE_DELAY, BASE_DELAY * 2];

  const timestamp = new Date().toISOString();
  const webhookPayload = { event: eventType, payload, timestamp };
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const webhookSecret = wh.secretEncrypted ? decryptSecret(wh.secretEncrypted) : undefined;
  if (webhookSecret) {
    const signature = signWebhookPayload(webhookPayload as unknown as Record<string, unknown>, webhookSecret);
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
    headers["X-Webhook-Timestamp"] = timestamp;
  }

  let delivered = false;
  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }

    try {
      const response = await fetch(wh.url, {
        method: "POST",
        headers,
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000),
      });

      lastStatusCode = response.status;

      if (response.ok) {
        delivered = true;
        await db
          .update(inboxWebhooksTable)
          .set({
            lastDeliveredAt: new Date(),
            failureCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(inboxWebhooksTable.id, wh.id));

        await db.insert(messageEventsTable).values({
          messageId: payload.messageId as string,
          eventType: "webhook.delivered",
          payload: {
            webhookId: wh.id,
            url: wh.url,
            statusCode: response.status,
            attempt: attempt + 1,
          },
        });
        break;
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  if (!delivered) {
    await db
      .update(inboxWebhooksTable)
      .set({
        failureCount: sql`${inboxWebhooksTable.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(inboxWebhooksTable.id, wh.id));

    await db.insert(messageEventsTable).values({
      messageId: payload.messageId as string,
      eventType: "webhook.failed",
      payload: {
        webhookId: wh.id,
        url: wh.url,
        error: lastError,
        statusCode: lastStatusCode,
        totalAttempts: MAX_RETRIES,
      },
    });
  }
}

export async function recordInboundTransport(
  inboxId: string,
  provider: string,
  rawPayload: unknown,
  processedMessageId?: string,
  error?: string,
) {
  const [event] = await db
    .insert(inboundTransportEventsTable)
    .values({
      inboxId,
      provider,
      rawPayload,
      status: error ? "failed" : processedMessageId ? "completed" : "pending",
      processedMessageId,
      errorMessage: error,
    })
    .returning();
  return event;
}

export async function recordOutboundDelivery(
  messageId: string,
  provider: string,
  status: "pending" | "processing" | "completed" | "failed",
  providerMessageId?: string,
  error?: string,
) {
  const [delivery] = await db
    .insert(outboundMessageDeliveriesTable)
    .values({
      messageId,
      provider,
      status,
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: status === "completed" ? new Date() : undefined,
      providerMessageId,
      errorMessage: error,
    })
    .returning();
  return delivery;
}

export async function getMessageEvents(messageId: string) {
  return db.query.messageEventsTable.findMany({
    where: eq(messageEventsTable.messageId, messageId),
    orderBy: [desc(messageEventsTable.createdAt)],
  });
}

export async function getMessageAttachments(messageId: string) {
  return db.query.messageAttachmentsTable.findMany({
    where: eq(messageAttachmentsTable.messageId, messageId),
  });
}

export interface SearchFilters {
  agentId: string;
  query?: string;
  direction?: string;
  senderType?: string;
  isRead?: boolean;
  senderVerified?: boolean;
  labelId?: string;
  labelName?: string;
  afterDate?: string;
  beforeDate?: string;
  minTrustScore?: number;
  hasConvertedTask?: boolean;
  convertedTaskId?: string;
  originatingTaskId?: string;
  threadId?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export async function searchMessages(filters: SearchFilters): Promise<{
  messages: AgentMessage[];
  total: number;
}> {
  const conditions = [eq(agentMessagesTable.agentId, filters.agentId)];

  if (filters.query) {
    conditions.push(
      or(
        ilike(agentMessagesTable.subject, `%${filters.query}%`),
        ilike(agentMessagesTable.body, `%${filters.query}%`),
        ilike(agentMessagesTable.senderAddress, `%${filters.query}%`),
      )!,
    );
  }
  if (filters.direction) {
    conditions.push(eq(agentMessagesTable.direction, filters.direction as AgentMessage["direction"]));
  }
  if (filters.senderType) {
    conditions.push(eq(agentMessagesTable.senderType, filters.senderType as AgentMessage["senderType"]));
  }
  if (filters.isRead !== undefined) {
    conditions.push(eq(agentMessagesTable.isRead, filters.isRead));
  }
  if (filters.afterDate) {
    conditions.push(gte(agentMessagesTable.createdAt, new Date(filters.afterDate)));
  }
  if (filters.beforeDate) {
    conditions.push(lte(agentMessagesTable.createdAt, new Date(filters.beforeDate)));
  }
  if (filters.minTrustScore !== undefined) {
    conditions.push(gte(agentMessagesTable.senderTrustScore, filters.minTrustScore));
  }
  if (filters.threadId) {
    conditions.push(eq(agentMessagesTable.threadId, filters.threadId));
  }
  if (filters.priority) {
    conditions.push(eq(agentMessagesTable.priority, filters.priority));
  }
  if (filters.senderVerified !== undefined) {
    conditions.push(eq(agentMessagesTable.senderVerified, filters.senderVerified));
  }
  if (filters.convertedTaskId) {
    conditions.push(eq(agentMessagesTable.convertedTaskId, filters.convertedTaskId));
  }
  if (filters.originatingTaskId) {
    conditions.push(eq(agentMessagesTable.originatingTaskId, filters.originatingTaskId));
  }
  if (filters.hasConvertedTask === true) {
    conditions.push(sql`${agentMessagesTable.convertedTaskId} is not null`);
  } else if (filters.hasConvertedTask === false) {
    conditions.push(sql`${agentMessagesTable.convertedTaskId} is null`);
  }

  if (filters.labelId || filters.labelName) {
    let targetLabelId = filters.labelId;
    if (!targetLabelId && filters.labelName) {
      const label = await db.query.messageLabelsTable.findFirst({
        where: and(
          eq(messageLabelsTable.agentId, filters.agentId),
          eq(messageLabelsTable.name, filters.labelName),
        ),
      });
      targetLabelId = label?.id;
    }
    if (targetLabelId) {
      const labelMsgIds = await db
        .select({ messageId: messageLabelAssignmentsTable.messageId })
        .from(messageLabelAssignmentsTable)
        .where(eq(messageLabelAssignmentsTable.labelId, targetLabelId));
      const ids = labelMsgIds.map((r) => r.messageId);
      if (ids.length === 0) return { messages: [], total: 0 };
      conditions.push(inArray(agentMessagesTable.id, ids));
    } else {
      return { messages: [], total: 0 };
    }
  }

  const where = and(...conditions);

  const [messages, countResult] = await Promise.all([
    db.query.agentMessagesTable.findMany({
      where,
      orderBy: [desc(agentMessagesTable.createdAt)],
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentMessagesTable)
      .where(where),
  ]);

  return { messages, total: countResult[0].count };
}

export async function ingestExternalMessage(input: {
  recipientAddress: string;
  senderAddress: string;
  senderType: "agent" | "user" | "external";
  senderAgentId?: string;
  subject?: string;
  body: string;
  bodyFormat?: string;
  structuredPayload?: Record<string, unknown>;
  externalMessageId?: string;
  senderTrustScore?: number;
  senderVerified?: boolean;
  priority?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ message: AgentMessage; inbox: AgentInbox } | null> {
  const inbox = await db.query.agentInboxesTable.findFirst({
    where: eq(agentInboxesTable.address, input.recipientAddress),
  });
  if (!inbox) return null;

  if (inbox.status !== "active") return null;

  const message = await sendMessage({
    agentId: inbox.agentId,
    direction: "inbound",
    senderType: input.senderType,
    senderAgentId: input.senderAgentId,
    senderAddress: input.senderAddress,
    recipientAddress: input.recipientAddress,
    subject: input.subject,
    body: input.body,
    bodyFormat: input.bodyFormat,
    structuredPayload: input.structuredPayload,
    senderTrustScore: input.senderTrustScore,
    senderVerified: input.senderVerified,
    priority: input.priority,
    metadata: input.metadata,
  });

  if (input.externalMessageId) {
    await db
      .update(agentMessagesTable)
      .set({ externalMessageId: input.externalMessageId })
      .where(eq(agentMessagesTable.id, message.id));
  }

  await recordInboundTransport(
    inbox.id,
    "api",
    { senderAddress: input.senderAddress, externalMessageId: input.externalMessageId },
    message.id,
  );

  return { message, inbox };
}

export async function replyToThread(
  agentId: string,
  threadId: string,
  body: string,
  opts?: {
    bodyFormat?: string;
    structuredPayload?: Record<string, unknown>;
    recipientAddress?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AgentMessage | null> {
  const thread = await getThread(threadId);
  if (!thread || thread.agentId !== agentId) return null;

  const inbox = await getInboxByAgent(agentId);
  if (!inbox) return null;

  const lastInbound = await db.query.agentMessagesTable.findFirst({
    where: and(
      eq(agentMessagesTable.threadId, threadId),
      eq(agentMessagesTable.direction, "inbound"),
    ),
    orderBy: [desc(agentMessagesTable.createdAt)],
  });

  return sendMessage({
    agentId,
    direction: "outbound",
    senderType: "agent",
    senderAgentId: agentId,
    senderAddress: inbox.address,
    recipientAddress: opts?.recipientAddress || lastInbound?.senderAddress || undefined,
    subject: thread.subject ? `Re: ${thread.subject.replace(/^Re:\s*/i, "")}` : undefined,
    body,
    bodyFormat: opts?.bodyFormat,
    structuredPayload: opts?.structuredPayload,
    inReplyToId: lastInbound?.id,
    metadata: opts?.metadata,
  });
}

export async function rejectMessage(
  messageId: string,
  agentId: string,
  reason?: string,
): Promise<boolean> {
  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return false;

  await db
    .update(agentMessagesTable)
    .set({ deliveryStatus: "bounced", updatedAt: new Date() })
    .where(eq(agentMessagesTable.id, messageId));

  const inbox = await getInboxByAgent(agentId);
  if (inbox && message.senderAddress) {
    await sendMessage({
      agentId,
      direction: "outbound",
      senderType: "system",
      senderAddress: inbox.address,
      recipientAddress: message.senderAddress,
      subject: `Rejected: ${message.subject || "(no subject)"}`,
      body: reason || "Your message was rejected.",
      inReplyToId: messageId,
    });
  }

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "message.rejected",
    payload: { reason: reason || "manual_rejection", rejectedBy: agentId },
  });

  return true;
}

export async function approveMessage(
  messageId: string,
  agentId: string,
): Promise<AgentMessage | null> {
  const message = await getMessage(messageId);
  if (!message || message.agentId !== agentId) return null;

  const [updated] = await db
    .update(agentMessagesTable)
    .set({
      deliveryStatus: "delivered",
      senderVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(agentMessagesTable.id, messageId))
    .returning();

  const labelsToRemove = await db.query.messageLabelsTable.findMany({
    where: and(
      eq(messageLabelsTable.agentId, agentId),
      inArray(messageLabelsTable.name, ["quarantine", "requires-approval"]),
    ),
  });
  for (const label of labelsToRemove) {
    await removeLabel(messageId, label.id, agentId);
  }

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "message.approved",
    payload: { approvedBy: agentId },
  });

  return updated ?? null;
}

export async function verifyAgentOwnership(
  agentId: string,
  userId: string,
): Promise<boolean> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true },
  });
  return !!agent;
}

export async function verifyInboxOwnership(
  inboxId: string,
  userId: string,
): Promise<{ owned: boolean; agentId?: string }> {
  const inbox = await db.query.agentInboxesTable.findFirst({
    where: eq(agentInboxesTable.id, inboxId),
  });
  if (!inbox) return { owned: false };

  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, inbox.agentId), eq(agentsTable.userId, userId)),
    columns: { id: true },
  });
  return { owned: !!agent, agentId: inbox.agentId };
}
