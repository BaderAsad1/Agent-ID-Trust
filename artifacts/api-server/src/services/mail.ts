import { eq, and, desc, sql, ilike, gte, lte, inArray } from "drizzle-orm";
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
} from "@workspace/db/schema";

const SYSTEM_LABELS = ["inbox", "sent", "archived", "spam", "important", "tasks"];

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

  const address = agent ? `${agent.handle}@agents.local` : `${agentId}@agents.local`;

  const [inbox] = await db
    .insert(agentInboxesTable)
    .values({
      agentId,
      address,
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

export async function updateThreadStatus(
  threadId: string,
  status: AgentThread["status"],
): Promise<AgentThread | null> {
  const [updated] = await db
    .update(agentThreadsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(agentThreadsTable.id, threadId))
    .returning();
  return updated ?? null;
}

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

  if (subject) {
    const existingThread = await db.query.agentThreadsTable.findFirst({
      where: and(
        eq(agentThreadsTable.inboxId, inboxId),
        eq(agentThreadsTable.subject, subject),
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
      subject: subject || "(no subject)",
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
  inReplyToId?: string;
  senderTrustScore?: number;
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
      bodyFormat: input.bodyFormat || "text",
      isRead: input.direction === "outbound",
      deliveryStatus: "delivered",
      senderTrustScore: input.senderTrustScore,
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

  const [updated] = await db
    .update(agentMessagesTable)
    .set({ isRead, updatedAt: new Date() })
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

  await db
    .insert(messageLabelAssignmentsTable)
    .values({ messageId, labelId })
    .onConflictDoNothing();
  return true;
}

export async function removeLabel(messageId: string, labelId: string, agentId: string): Promise<boolean> {
  const label = await db.query.messageLabelsTable.findFirst({
    where: and(eq(messageLabelsTable.id, labelId), eq(messageLabelsTable.agentId, agentId)),
  });
  if (!label) return false;

  await db.delete(messageLabelAssignmentsTable).where(
    and(
      eq(messageLabelAssignmentsTable.messageId, messageId),
      eq(messageLabelAssignmentsTable.labelId, labelId),
    ),
  );
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
    const matches = rule.conditions.every((cond) => evaluateCondition(message, cond));
    if (!matches) continue;

    for (const action of rule.actions) {
      await executeAction(message, action);
    }
  }
}

function evaluateCondition(message: AgentMessage, cond: RoutingCondition): boolean {
  let value: string | number | null | undefined;

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
    default:
      return false;
  }

  if (value === null || value === undefined) return false;

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

  return { taskId: task.id };
}

export async function createWebhook(
  inboxId: string,
  agentId: string,
  url: string,
  events: string[],
  secret?: string,
): Promise<InboxWebhook> {
  const [webhook] = await db
    .insert(inboxWebhooksTable)
    .values({ inboxId, agentId, url, events, secret, status: "active" })
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
  updates: Partial<Pick<InboxWebhook, "url" | "events" | "secret" | "status">>,
): Promise<InboxWebhook | null> {
  const [updated] = await db
    .update(inboxWebhooksTable)
    .set({ ...updates, updatedAt: new Date() })
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

  for (const wh of webhooks) {
    const events = (wh.events as string[]) || [];
    if (events.length > 0 && !events.includes(eventType)) continue;

    try {
      const response = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(wh.secret ? { "X-Webhook-Secret": wh.secret } : {}),
        },
        body: JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });

      await db
        .update(inboxWebhooksTable)
        .set({
          lastDeliveredAt: new Date(),
          failureCount: response.ok ? 0 : sql`${inboxWebhooksTable.failureCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(inboxWebhooksTable.id, wh.id));
    } catch {
      await db
        .update(inboxWebhooksTable)
        .set({
          failureCount: sql`${inboxWebhooksTable.failureCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(inboxWebhooksTable.id, wh.id));
    }
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
