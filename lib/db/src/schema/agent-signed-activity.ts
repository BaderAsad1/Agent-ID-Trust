import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentSignedActivityTable = pgTable(
  "agent_signed_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    previousHash: varchar("previous_hash", { length: 128 }),
    currentHash: varchar("current_hash", { length: 128 }).notNull(),
    signature: text("signature"),
    isPublic: varchar("is_public", { length: 10 }).default("false").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_signed_activity_agent_id_idx").on(table.agentId),
    index("agent_signed_activity_seq_idx").on(table.agentId, table.sequenceNumber),
    index("agent_signed_activity_event_type_idx").on(table.eventType),
    index("agent_signed_activity_created_at_idx").on(table.createdAt),
  ],
);

export type AgentSignedActivity = typeof agentSignedActivityTable.$inferSelect;
