import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { webhookStatusEnum } from "./enums";

export const webhookEventsTable = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: webhookStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("webhook_events_provider_event_idx").on(
      table.provider,
      table.providerEventId,
    ),
    index("webhook_events_status_idx").on(table.status),
    index("webhook_events_created_at_idx").on(table.createdAt),
  ],
);

export const insertWebhookEventSchema = createInsertSchema(
  webhookEventsTable,
).omit({ id: true, createdAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
