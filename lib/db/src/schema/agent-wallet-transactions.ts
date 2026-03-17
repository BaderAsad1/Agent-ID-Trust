import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentWalletTransactionsTable = pgTable(
  "agent_wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    txHash: varchar("tx_hash", { length: 255 }),
    type: varchar("type", { length: 50 }).notNull(),
    direction: varchar("direction", { length: 20 }).notNull(),
    amount: varchar("amount", { length: 100 }).notNull(),
    token: varchar("token", { length: 20 }).notNull().default("USDC"),
    fromAddress: varchar("from_address", { length: 255 }),
    toAddress: varchar("to_address", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    description: text("description"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_wallet_txns_agent_id_idx").on(table.agentId),
    index("agent_wallet_txns_tx_hash_idx").on(table.txHash),
    index("agent_wallet_txns_created_at_idx").on(table.createdAt),
  ],
);

export type AgentWalletTransaction = typeof agentWalletTransactionsTable.$inferSelect;
