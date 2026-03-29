import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const agentClaimTokensTable = pgTable(
  "agent_claim_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 512 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isUsed: boolean("is_used").default(false).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByUserId: uuid("used_by_user_id").references(() => usersTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_claim_tokens_agent_id_idx").on(table.agentId),
    uniqueIndex("agent_claim_tokens_token_unique_idx").on(table.token),
    index("agent_claim_tokens_active_idx").on(table.agentId, table.isActive),
  ],
);

export type AgentClaimToken = typeof agentClaimTokensTable.$inferSelect;
