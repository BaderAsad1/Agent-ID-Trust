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

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorType: varchar("actor_type", { length: 50 }).notNull(),
    actorId: uuid("actor_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorType, table.actorId),
    index("audit_events_event_type_idx").on(table.eventType),
    index("audit_events_created_at_idx").on(table.createdAt),
  ],
);

export const insertAuditEventSchema = createInsertSchema(
  auditEventsTable,
).omit({ id: true, createdAt: true });
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
