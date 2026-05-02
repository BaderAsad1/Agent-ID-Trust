import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const agentOwsWalletsTable = pgTable(
  "agent_ows_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    walletId: varchar("wallet_id", { length: 255 }),
    network: varchar("network", { length: 50 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    accounts: jsonb("accounts").$type<string[]>().default([]),
    providerWalletId: varchar("provider_wallet_id", { length: 255 }),
    providerPolicyId: varchar("provider_policy_id", { length: 255 }),
    isSelfCustodial: boolean("is_self_custodial").default(false).notNull(),
    status: varchar("status", { length: 50 }).default("active").notNull(),
    metadata: text("metadata"),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_ows_wallets_agent_id_idx").on(table.agentId),
    index("agent_ows_wallets_user_id_idx").on(table.userId),
    uniqueIndex("agent_ows_wallets_agent_idx").on(table.agentId),
    index("agent_ows_wallets_address_idx").on(table.address),
    // GIN index on JSONB accounts column. Enables sub-millisecond `@>` containment
    // queries (e.g. `accounts @> '["eip155:8453:0x…"]'`) instead of in-process JS
    // scans of every row. Used as a fallback for any caller still going through
    // the JSONB column; the canonical lookup path now uses agent_ows_wallet_accounts.
    index("agent_ows_wallets_accounts_gin_idx").using("gin", table.accounts),
  ],
);

export type AgentOwsWallet = typeof agentOwsWalletsTable.$inferSelect;

// Normalized one-row-per-CAIP10-account table backing fast reverse-address
// lookups for /api/v1/resolve/address/:address. Each row is one CAIP-10
// account string ("namespace:reference:address") that some agent's OWS wallet
// has registered. Indexed on (namespace, address_lower) for sub-millisecond
// scans regardless of how many wallets exist.
export const agentOwsWalletAccountsTable = pgTable(
  "agent_ows_wallet_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    owsWalletId: uuid("ows_wallet_id")
      .notNull()
      .references(() => agentOwsWalletsTable.id, { onDelete: "cascade" }),
    // Full CAIP-10 string, e.g. "eip155:8453:0xabc..."
    caip10: text("caip10").notNull(),
    // Parsed CAIP-10 components for indexed lookups
    namespace: varchar("namespace", { length: 32 }).notNull(),
    chainReference: varchar("chain_reference", { length: 64 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    // Lower-cased address for case-insensitive EVM lookups (Tron/Solana are
    // case-sensitive but lowercasing is a no-op for matching).
    addressLower: varchar("address_lower", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_ows_wallet_accounts_agent_id_idx").on(table.agentId),
    index("agent_ows_wallet_accounts_ows_wallet_id_idx").on(table.owsWalletId),
    index("agent_ows_wallet_accounts_address_lower_idx").on(table.addressLower),
    index("agent_ows_wallet_accounts_namespace_address_lower_idx").on(
      table.namespace,
      table.addressLower,
    ),
    uniqueIndex("agent_ows_wallet_accounts_agent_caip10_idx").on(
      table.agentId,
      table.caip10,
    ),
  ],
);

export type AgentOwsWalletAccount =
  typeof agentOwsWalletAccountsTable.$inferSelect;
