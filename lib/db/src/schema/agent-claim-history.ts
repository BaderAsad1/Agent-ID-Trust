import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentClaimHistoryTable = pgTable(
  "agent_claim_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 50 }).notNull(),
    fromOwner: varchar("from_owner", { length: 255 }),
    toOwner: varchar("to_owner", { length: 255 }),
    performedByUserId: uuid("performed_by_user_id"),
    evidenceHash: varchar("evidence_hash", { length: 255 }),
    notes: text("notes"),
    disputeStatus: varchar("dispute_status", { length: 50 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_claim_history_agent_id_idx").on(table.agentId),
    index("agent_claim_history_action_idx").on(table.action),
    index("agent_claim_history_created_at_idx").on(table.createdAt),
  ],
);

export const insertAgentClaimHistorySchema = createInsertSchema(
  agentClaimHistoryTable,
).omit({ id: true, createdAt: true });
export type InsertAgentClaimHistory = z.infer<typeof insertAgentClaimHistorySchema>;
export type AgentClaimHistory = typeof agentClaimHistoryTable.$inferSelect;
