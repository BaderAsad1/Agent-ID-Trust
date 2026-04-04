import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentWebhooksTable = pgTable(
  "agent_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().default([]).notNull(),
    active: boolean("active").default(true).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disableReason: varchar("disable_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agent_webhooks_agent_id_idx").on(table.agentId),
    index("agent_webhooks_active_idx").on(table.active),
  ],
);

export const webhookDeliveriesTable = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => agentWebhooksTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("webhook_deliveries_webhook_id_idx").on(table.webhookId),
    index("webhook_deliveries_agent_id_idx").on(table.agentId),
    index("webhook_deliveries_status_idx").on(table.status),
    index("webhook_deliveries_next_retry_idx").on(table.nextRetryAt),
  ],
);

export type AgentWebhook = typeof agentWebhooksTable.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;
