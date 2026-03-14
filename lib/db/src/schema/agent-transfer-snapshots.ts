import {
  pgTable,
  uuid,
  integer,
  varchar,
  jsonb,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentTransfersTable } from "./agent-transfers";
import { agentsTable } from "./agents";

export const agentTransferSnapshotsTable = pgTable(
  "agent_transfer_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => agentTransfersTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    preTransferTrustScore: integer("pre_transfer_trust_score").notNull(),
    preTransferTrustTier: varchar("pre_transfer_trust_tier", { length: 50 }).notNull(),
    preTransferTrustBreakdown: jsonb("pre_transfer_trust_breakdown"),
    historicalAgentReputation: real("historical_agent_reputation").notNull(),
    currentOperatorReputation: real("current_operator_reputation").notNull(),
    effectiveLiveTrust: real("effective_live_trust").notNull(),
    transferAdjustmentFactor: real("transfer_adjustment_factor"),
    continuityQualityScore: real("continuity_quality_score"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_transfer_snapshots_transfer_id_idx").on(table.transferId),
    index("agent_transfer_snapshots_agent_id_idx").on(table.agentId),
  ],
);

export const insertAgentTransferSnapshotSchema = createInsertSchema(agentTransferSnapshotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentTransferSnapshot = z.infer<typeof insertAgentTransferSnapshotSchema>;
export type AgentTransferSnapshot = typeof agentTransferSnapshotsTable.$inferSelect;
