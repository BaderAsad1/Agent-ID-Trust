import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentReputationEventsTable = pgTable(
  "agent_reputation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agent_reputation_events_agent_id_idx").on(table.agentId),
    index("agent_reputation_events_created_at_idx").on(table.createdAt),
  ],
);

export const insertAgentReputationEventSchema = createInsertSchema(
  agentReputationEventsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentReputationEvent = z.infer<
  typeof insertAgentReputationEventSchema
>;
export type AgentReputationEvent =
  typeof agentReputationEventsTable.$inferSelect;
