import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentSpendingRulesTable = pgTable(
  "agent_spending_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    maxPerTransactionCents: integer("max_per_transaction_cents").default(1000).notNull(),
    dailyCapCents: integer("daily_cap_cents").default(5000).notNull(),
    monthlyCapCents: integer("monthly_cap_cents").default(50000).notNull(),
    allowedAddresses: jsonb("allowed_addresses").$type<string[]>().default([]),
    cdpPolicyId: varchar("cdp_policy_id", { length: 255 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_spending_rules_agent_id_idx").on(table.agentId),
  ],
);

export type AgentSpendingRule = typeof agentSpendingRulesTable.$inferSelect;
