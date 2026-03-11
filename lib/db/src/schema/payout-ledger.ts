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
import { usersTable } from "./users";
import { payoutStatusEnum } from "./enums";

export const payoutLedgerTable = pgTable(
  "payout_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    relatedOrderId: uuid("related_order_id"),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => usersTable.id),
    provider: varchar("provider", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: payoutStatusEnum("status").default("pending").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payout_ledger_seller_user_id_idx").on(table.sellerUserId),
    index("payout_ledger_order_id_idx").on(table.relatedOrderId),
    index("payout_ledger_status_idx").on(table.status),
  ],
);

export const insertPayoutLedgerSchema = createInsertSchema(
  payoutLedgerTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayoutLedger = z.infer<typeof insertPayoutLedgerSchema>;
export type PayoutLedgerEntry = typeof payoutLedgerTable.$inferSelect;
