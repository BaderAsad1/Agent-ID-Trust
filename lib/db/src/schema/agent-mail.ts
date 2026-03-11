import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";
import {
  inboxStatusEnum,
  messageDirectionEnum,
  senderTypeEnum,
  messageDeliveryStatusEnum,
  mailWebhookStatusEnum,
  transportStatusEnum,
  threadStatusEnum,
} from "./enums";

export const agentInboxesTable = pgTable(
  "agent_inboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    status: inboxStatusEnum("status").default("active").notNull(),
    autoRespond: boolean("auto_respond").default(false).notNull(),
    autoRespondMessage: text("auto_respond_message"),
    routingRules: jsonb("routing_rules").$type<RoutingRule[]>().default([]),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_inboxes_address_idx").on(table.address),
    uniqueIndex("agent_inboxes_agent_id_idx").on(table.agentId),
    index("agent_inboxes_status_idx").on(table.status),
  ],
);

export interface ProvenanceEntry {
  timestamp: string;
  action: string;
  actor: string;
  actorType: "agent" | "user" | "system" | "external";
  details?: Record<string, unknown>;
}

export interface RoutingRule {
  id: string;
  name: string;
  conditions: RoutingCondition[];
  actions: RoutingAction[];
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  field: "sender_type" | "sender_trust" | "subject" | "label" | "direction" | "sender_verified" | "priority" | "sender_address" | "body";
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "matches";
  value: string | number | boolean;
}

export interface RoutingAction {
  type: "label" | "archive" | "forward" | "auto_reply" | "convert_task" | "webhook" | "drop" | "reject" | "require_verification" | "quarantine";
  params?: Record<string, unknown>;
}

export const agentThreadsTable = pgTable(
  "agent_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => agentInboxesTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 500 }),
    status: threadStatusEnum("status").default("open").notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    participantAgentIds: jsonb("participant_agent_ids").$type<string[]>().default([]),
    participantUserIds: jsonb("participant_user_ids").$type<string[]>().default([]),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_threads_inbox_id_idx").on(table.inboxId),
    index("agent_threads_agent_id_idx").on(table.agentId),
    index("agent_threads_status_idx").on(table.status),
    index("agent_threads_last_message_at_idx").on(table.lastMessageAt),
  ],
);

export const agentMessagesTable = pgTable(
  "agent_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreadsTable.id, { onDelete: "cascade" }),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => agentInboxesTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: senderTypeEnum("sender_type").notNull(),
    senderAgentId: uuid("sender_agent_id").references(() => agentsTable.id),
    senderUserId: uuid("sender_user_id").references(() => usersTable.id),
    senderAddress: varchar("sender_address", { length: 255 }),
    recipientAddress: varchar("recipient_address", { length: 255 }),
    subject: varchar("subject", { length: 500 }),
    body: text("body").notNull(),
    snippet: varchar("snippet", { length: 300 }),
    bodyFormat: varchar("body_format", { length: 20 }).default("text").notNull(),
    structuredPayload: jsonb("structured_payload").$type<Record<string, unknown>>(),
    isRead: boolean("is_read").default(false).notNull(),
    deliveryStatus: messageDeliveryStatusEnum("delivery_status")
      .default("queued")
      .notNull(),
    senderTrustScore: integer("sender_trust_score"),
    senderVerified: boolean("sender_verified").default(false).notNull(),
    provenanceChain: jsonb("provenance_chain").$type<ProvenanceEntry[]>(),
    priority: varchar("priority", { length: 20 }).default("normal").notNull(),
    originatingTaskId: uuid("originating_task_id").references(() => tasksTable.id),
    convertedTaskId: uuid("converted_task_id"),
    inReplyToId: uuid("in_reply_to_id"),
    externalMessageId: varchar("external_message_id", { length: 500 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_messages_thread_id_idx").on(table.threadId),
    index("agent_messages_inbox_id_idx").on(table.inboxId),
    index("agent_messages_agent_id_idx").on(table.agentId),
    index("agent_messages_direction_idx").on(table.direction),
    index("agent_messages_sender_agent_id_idx").on(table.senderAgentId),
    index("agent_messages_sender_user_id_idx").on(table.senderUserId),
    index("agent_messages_delivery_status_idx").on(table.deliveryStatus),
    index("agent_messages_created_at_idx").on(table.createdAt),
    index("agent_messages_is_read_idx").on(table.isRead),
  ],
);

export const messageLabelsTable = pgTable(
  "message_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 7 }),
    isSystem: boolean("is_system").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_labels_agent_id_idx").on(table.agentId),
    uniqueIndex("message_labels_agent_name_idx").on(table.agentId, table.name),
  ],
);

export const messageLabelAssignmentsTable = pgTable(
  "message_label_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => agentMessagesTable.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => messageLabelsTable.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_label_assignments_message_id_idx").on(table.messageId),
    index("message_label_assignments_label_id_idx").on(table.labelId),
    uniqueIndex("message_label_assignments_unique_idx").on(
      table.messageId,
      table.labelId,
    ),
  ],
);

export const messageAttachmentsTable = pgTable(
  "message_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => agentMessagesTable.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageUrl: text("storage_url"),
    checksum: varchar("checksum", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_attachments_message_id_idx").on(table.messageId),
  ],
);

export const messageEventsTable = pgTable(
  "message_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => agentMessagesTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_events_message_id_idx").on(table.messageId),
    index("message_events_event_type_idx").on(table.eventType),
    index("message_events_created_at_idx").on(table.createdAt),
  ],
);

export const inboxWebhooksTable = pgTable(
  "inbox_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => agentInboxesTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: varchar("secret", { length: 255 }),
    events: jsonb("events").$type<string[]>().default([]),
    status: mailWebhookStatusEnum("status").default("active").notNull(),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    failureCount: integer("failure_count").default(0).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("inbox_webhooks_inbox_id_idx").on(table.inboxId),
    index("inbox_webhooks_agent_id_idx").on(table.agentId),
    index("inbox_webhooks_status_idx").on(table.status),
  ],
);

export const inboundTransportEventsTable = pgTable(
  "inbound_transport_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => agentInboxesTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 100 }).notNull(),
    rawPayload: jsonb("raw_payload"),
    status: transportStatusEnum("status").default("pending").notNull(),
    processedMessageId: uuid("processed_message_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("inbound_transport_events_inbox_id_idx").on(table.inboxId),
    index("inbound_transport_events_status_idx").on(table.status),
    index("inbound_transport_events_created_at_idx").on(table.createdAt),
  ],
);

export const outboundMessageDeliveriesTable = pgTable(
  "outbound_message_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => agentMessagesTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 100 }).notNull(),
    status: transportStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 500 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("outbound_deliveries_message_id_idx").on(table.messageId),
    index("outbound_deliveries_status_idx").on(table.status),
    index("outbound_deliveries_created_at_idx").on(table.createdAt),
  ],
);

export const insertAgentInboxSchema = createInsertSchema(agentInboxesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentInbox = z.infer<typeof insertAgentInboxSchema>;
export type AgentInbox = typeof agentInboxesTable.$inferSelect;

export const insertAgentThreadSchema = createInsertSchema(agentThreadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentThread = z.infer<typeof insertAgentThreadSchema>;
export type AgentThread = typeof agentThreadsTable.$inferSelect;

export const insertAgentMessageSchema = createInsertSchema(agentMessagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentMessage = z.infer<typeof insertAgentMessageSchema>;
export type AgentMessage = typeof agentMessagesTable.$inferSelect;

export const insertMessageLabelSchema = createInsertSchema(messageLabelsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessageLabel = z.infer<typeof insertMessageLabelSchema>;
export type MessageLabel = typeof messageLabelsTable.$inferSelect;

export const insertInboxWebhookSchema = createInsertSchema(inboxWebhooksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInboxWebhook = z.infer<typeof insertInboxWebhookSchema>;
export type InboxWebhook = typeof inboxWebhooksTable.$inferSelect;
