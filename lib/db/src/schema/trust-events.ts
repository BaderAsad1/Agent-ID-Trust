import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const trustEventDirectionEnum = pgEnum("trust_event_direction", [
  "positive",
  "negative",
]);

export const trustEventsTable = pgTable(
  "trust_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    direction: trustEventDirectionEnum("direction").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    weight: integer("weight").notNull().default(1),
    sourceAgentId: uuid("source_agent_id").references(() => agentsTable.id, { onDelete: "set null" }),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("trust_events_agent_id_idx").on(table.agentId),
    index("trust_events_created_at_idx").on(table.createdAt),
    index("trust_events_direction_idx").on(table.direction),
    index("trust_events_event_type_idx").on(table.eventType),
  ],
);

export type TrustEvent = typeof trustEventsTable.$inferSelect;
export type InsertTrustEvent = typeof trustEventsTable.$inferInsert;
