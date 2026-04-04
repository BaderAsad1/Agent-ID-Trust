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
import { agentsTable } from "./agents";

export const nftAuditLogTable = pgTable(
  "nft_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => agentsTable.id, { onDelete: "set null" }),
    handle: varchar("handle", { length: 100 }),
    action: varchar("action", { length: 50 }),
    operation: varchar("operation", { length: 50 }),
    chain: varchar("chain", { length: 100 }),
    txHash: varchar("tx_hash", { length: 255 }),
    erc8004AgentId: integer("erc8004_agent_id"),
    tokenId: varchar("token_id", { length: 255 }),
    fromAddress: varchar("from_address", { length: 255 }),
    toAddress: varchar("to_address", { length: 255 }),
    contractAddress: varchar("contract_address", { length: 255 }),
    custodian: varchar("custodian", { length: 50 }),
    status: varchar("status", { length: 50 }).notNull().default("success"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("nft_audit_log_agent_id_idx").on(table.agentId),
    index("nft_audit_log_handle_idx").on(table.handle),
    index("nft_audit_log_chain_idx").on(table.chain),
    index("nft_audit_log_action_idx").on(table.action),
    index("nft_audit_log_created_at_idx").on(table.createdAt),
    index("nft_audit_log_erc8004_agent_id_idx").on(table.erc8004AgentId),
  ],
);

export type NftAuditLog = typeof nftAuditLogTable.$inferSelect;
export type InsertNftAuditLog = typeof nftAuditLogTable.$inferInsert;
