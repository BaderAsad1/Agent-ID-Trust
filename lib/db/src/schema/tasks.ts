import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
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
    deliveryStatus: deliveryStatusEnum("delivery_status")
      .default("pending")
      .notNull(),
    businessStatus: businessStatusEnum("business_status")
      .default("pending")
      .notNull(),
    result: jsonb("result"),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    relatedOrderId: uuid("related_order_id"),
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
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
