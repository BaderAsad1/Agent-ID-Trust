import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
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
    network: varchar("network", { length: 50 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
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
    uniqueIndex("agent_ows_wallets_agent_network_idx").on(table.agentId, table.network),
    index("agent_ows_wallets_address_idx").on(table.address),
  ],
);

export type AgentOwsWallet = typeof agentOwsWalletsTable.$inferSelect;
