import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentActivityLogTable = pgTable(
  "agent_activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    signature: text("signature"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("agent_activity_log_agent_id_idx").on(table.agentId),
    index("agent_activity_log_event_type_idx").on(table.eventType),
    index("agent_activity_log_created_at_idx").on(table.createdAt),
  ],
);

export const insertAgentActivityLogSchema = createInsertSchema(
  agentActivityLogTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentActivityLog = z.infer<
  typeof insertAgentActivityLogSchema
>;
export type AgentActivityLog = typeof agentActivityLogTable.$inferSelect;
