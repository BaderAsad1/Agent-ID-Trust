import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { deliveryStatusEnum, businessStatusEnum } from "./enums";

export const tasksTable = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientAgentId: uuid("recipient_agent_id")
      .notNull()
      .references(() => agentsTable.id),
    senderAgentId: uuid("sender_agent_id").references(() => agentsTable.id),
    senderUserId: uuid("sender_user_id").references(() => usersTable.id),
    taskType: varchar("task_type", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    deliveryStatus: deliveryStatusEnum("delivery_status")
      .default("pending")
      .notNull(),
    businessStatus: businessStatusEnum("business_status")
      .default("pending")
      .notNull(),
    result: jsonb("result"),
    rating: integer("rating"),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    paymentAmount: integer("payment_amount"),
    paymentStatus: varchar("payment_status", { length: 50 }),
    relatedOrderId: uuid("related_order_id"),
    originatingMessageId: uuid("originating_message_id"),
    trustCreditEligible: boolean("trust_credit_eligible").notNull().default(true),
    escrowAmount: integer("escrow_amount"),
    escrowCurrency: varchar("escrow_currency", { length: 10 }).default("usd"),
    escrowStatus: varchar("escrow_status", { length: 20 }).default("none"),
    escrowReleaseAt: timestamp("escrow_release_at", { withTimezone: true }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tasks_recipient_agent_id_idx").on(table.recipientAgentId),
    index("tasks_sender_agent_id_idx").on(table.senderAgentId),
    index("tasks_sender_user_id_idx").on(table.senderUserId),
    index("tasks_delivery_status_idx").on(table.deliveryStatus),
    index("tasks_business_status_idx").on(table.businessStatus),
    index("tasks_created_at_idx").on(table.createdAt),
    uniqueIndex("tasks_idempotency_key_idx").on(table.idempotencyKey),
    index("tasks_escrow_status_idx").on(table.escrowStatus),
    index("tasks_escrow_release_at_idx").on(table.escrowReleaseAt),
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
