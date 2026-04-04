import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  boolean,
  real,
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
    source: varchar("source", { length: 255 }),
    attestationType: varchar("attestation_type", { length: 100 }),
    confidenceLevel: real("confidence_level"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revocable: boolean("revocable").default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
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
    index("agent_reputation_events_event_type_idx").on(table.eventType),
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
