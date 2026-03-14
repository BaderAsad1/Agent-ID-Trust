import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { agentTransfersTable } from "./agent-transfers";

export const agentOperatorHistoryTable = pgTable(
  "agent_operator_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => usersTable.id),
    transferId: uuid("transfer_id")
      .references(() => agentTransfersTable.id),
    operatorHandle: varchar("operator_handle", { length: 255 }),
    verificationStatus: varchar("verification_status", { length: 50 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_operator_history_agent_id_idx").on(table.agentId),
    index("agent_operator_history_operator_id_idx").on(table.operatorId),
    index("agent_operator_history_transfer_id_idx").on(table.transferId),
  ],
);

export const insertAgentOperatorHistorySchema = createInsertSchema(agentOperatorHistoryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentOperatorHistory = z.infer<typeof insertAgentOperatorHistorySchema>;
export type AgentOperatorHistory = typeof agentOperatorHistoryTable.$inferSelect;
