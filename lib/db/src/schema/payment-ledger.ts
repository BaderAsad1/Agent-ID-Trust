import {
  pgTable,
  uuid,
  varchar,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { paymentDirectionEnum, accountTypeEnum } from "./enums";

export const paymentLedgerTable = pgTable(
  "payment_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    relatedOrderId: uuid("related_order_id"),
    relatedTaskId: uuid("related_task_id"),
    provider: varchar("provider", { length: 50 }).notNull(),
    direction: paymentDirectionEnum("direction").notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    accountId: uuid("account_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    entryType: varchar("entry_type", { length: 50 }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("payment_ledger_order_id_idx").on(table.relatedOrderId),
    index("payment_ledger_task_id_idx").on(table.relatedTaskId),
    index("payment_ledger_account_idx").on(
      table.accountType,
      table.accountId,
    ),
    index("payment_ledger_created_at_idx").on(table.createdAt),
  ],
);

export const insertPaymentLedgerSchema = createInsertSchema(
  paymentLedgerTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentLedger = z.infer<typeof insertPaymentLedgerSchema>;
export type PaymentLedgerEntry = typeof paymentLedgerTable.$inferSelect;
