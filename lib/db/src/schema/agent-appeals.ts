import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const appealStatusEnum = pgEnum("appeal_status", [
  "pending",
  "under_review",
  "approved",
  "rejected",
]);

export const agentAppealsTable = pgTable(
  "agent_appeals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
    status: appealStatusEnum("status").default("pending").notNull(),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_appeals_agent_id_idx").on(table.agentId),
    index("agent_appeals_status_idx").on(table.status),
    index("agent_appeals_created_at_idx").on(table.createdAt),
  ],
);

export type AgentAppeal = typeof agentAppealsTable.$inferSelect;
export type InsertAgentAppeal = typeof agentAppealsTable.$inferInsert;
