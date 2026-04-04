import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
  text,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const a2aPayoutQueueTable = pgTable(
  "a2a_payout_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: varchar("call_id", { length: 255 }).notNull(),
    serviceId: uuid("service_id").notNull(),
    paymentId: varchar("payment_id", { length: 255 }),
    txHash: varchar("tx_hash", { length: 255 }),
    callerAgentId: uuid("caller_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "set null" }),
    providerAgentId: uuid("provider_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "set null" }),
    providerWalletAddress: varchar("provider_wallet_address", { length: 255 }),
    providerPayoutUsdc: numeric("provider_payout_usdc", { precision: 18, scale: 6 }).notNull(),
    platformFeeUsdc: numeric("platform_fee_usdc", { precision: 18, scale: 6 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("a2a_payout_queue_status_idx").on(table.status),
    index("a2a_payout_queue_provider_agent_idx").on(table.providerAgentId),
    index("a2a_payout_queue_call_id_idx").on(table.callId),
  ],
);

export type A2APayoutQueueEntry = typeof a2aPayoutQueueTable.$inferSelect;
