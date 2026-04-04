import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { deliveryStatusEnum } from "./enums";

export const deliveryReceiptsTable = pgTable(
  "delivery_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    endpointUrl: text("endpoint_url"),
    requestSignature: text("request_signature"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("delivery_receipts_task_id_idx").on(table.taskId),
    index("delivery_receipts_status_idx").on(table.status),
  ],
);

export const insertDeliveryReceiptSchema = createInsertSchema(
  deliveryReceiptsTable,
).omit({ id: true, attemptedAt: true });
export type InsertDeliveryReceipt = z.infer<
  typeof insertDeliveryReceiptSchema
>;
export type DeliveryReceipt = typeof deliveryReceiptsTable.$inferSelect;
