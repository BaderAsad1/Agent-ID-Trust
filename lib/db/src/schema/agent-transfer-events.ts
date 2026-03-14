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
import { agentTransfersTable } from "./agent-transfers";

export const agentTransferEventsTable = pgTable(
  "agent_transfer_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => agentTransfersTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }),
    actorId: uuid("actor_id"),
    actorType: varchar("actor_type", { length: 20 }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_transfer_events_transfer_id_idx").on(table.transferId),
    index("agent_transfer_events_event_type_idx").on(table.eventType),
  ],
);

export const insertAgentTransferEventSchema = createInsertSchema(agentTransferEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentTransferEvent = z.infer<typeof insertAgentTransferEventSchema>;
export type AgentTransferEvent = typeof agentTransferEventsTable.$inferSelect;
