import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tasksTable } from "./tasks";

export const taskMessagesTable = pgTable(
  "task_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    senderType: varchar("sender_type", { length: 50 }).notNull(),
    senderId: uuid("sender_id"),
    messageType: varchar("message_type", { length: 50 }).default("text").notNull(),
    content: text("content"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("task_messages_task_id_idx").on(table.taskId),
    index("task_messages_created_at_idx").on(table.createdAt),
  ],
);

export type TaskMessage = typeof taskMessagesTable.$inferSelect;
