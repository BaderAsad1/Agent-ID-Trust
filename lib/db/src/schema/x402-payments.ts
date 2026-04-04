import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const x402PaymentsTable = pgTable(
  "x402_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    amountUsdc: varchar("amount_usdc", { length: 100 }).notNull(),
    paymentType: varchar("payment_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    payerAddress: varchar("payer_address", { length: 255 }),
    payeeAddress: varchar("payee_address", { length: 255 }),
    txHash: varchar("tx_hash", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("x402_payments_idempotency_key_idx").on(table.idempotencyKey),
    index("x402_payments_agent_id_idx").on(table.agentId),
    index("x402_payments_status_idx").on(table.status),
  ],
);

export type X402Payment = typeof x402PaymentsTable.$inferSelect;
