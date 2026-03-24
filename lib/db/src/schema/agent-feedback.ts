import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentFeedbackTable = pgTable(
  "agent_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectAgentId: uuid("subject_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    submitterAgentId: uuid("submitter_agent_id")
      .references(() => agentsTable.id, { onDelete: "set null" }),
    value: integer("value").notNull(),
    valueDecimals: integer("value_decimals").notNull().default(0),
    tag1: varchar("tag1", { length: 255 }),
    chain: varchar("chain", { length: 100 }).notNull(),
    onchainTxHash: varchar("onchain_tx_hash", { length: 255 }),
    onchainStatus: varchar("onchain_status", { length: 50 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_feedback_subject_agent_id_idx").on(table.subjectAgentId),
    index("agent_feedback_submitter_agent_id_idx").on(table.submitterAgentId),
    index("agent_feedback_created_at_idx").on(table.createdAt),
    index("agent_feedback_chain_idx").on(table.chain),
  ],
);

export type AgentFeedback = typeof agentFeedbackTable.$inferSelect;
export type InsertAgentFeedback = typeof agentFeedbackTable.$inferInsert;
