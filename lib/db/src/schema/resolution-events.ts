import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const resolutionEventsTable = pgTable(
  "resolution_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handle: varchar("handle", { length: 255 }).notNull(),
    resolvedAgentId: uuid("resolved_agent_id"),
    clientType: varchar("client_type", { length: 50 }),
    responseTimeMs: integer("response_time_ms"),
    cacheHit: varchar("cache_hit", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("resolution_events_handle_idx").on(table.handle),
    index("resolution_events_created_at_idx").on(table.createdAt),
    index("resolution_events_agent_id_idx").on(table.resolvedAgentId),
  ],
);

export const insertResolutionEventSchema = createInsertSchema(
  resolutionEventsTable,
).omit({ id: true, createdAt: true });
export type InsertResolutionEvent = z.infer<typeof insertResolutionEventSchema>;
export type ResolutionEvent = typeof resolutionEventsTable.$inferSelect;
