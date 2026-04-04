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
import { marketplaceListingsTable } from "./marketplace-listings";

export const marketplaceAnalyticsEventsTable = pgTable(
  "marketplace_analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    listingId: uuid("listing_id")
      .references(() => marketplaceListingsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    agentId: uuid("agent_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_analytics_events_listing_id_idx").on(table.listingId),
    index("marketplace_analytics_events_event_type_idx").on(table.eventType),
    index("marketplace_analytics_events_created_at_idx").on(table.createdAt),
    index("marketplace_analytics_events_user_id_idx").on(table.userId),
  ],
);

export const insertMarketplaceAnalyticsEventSchema = createInsertSchema(
  marketplaceAnalyticsEventsTable,
).omit({ id: true, createdAt: true });
export type InsertMarketplaceAnalyticsEvent = z.infer<
  typeof insertMarketplaceAnalyticsEventSchema
>;
export type MarketplaceAnalyticsEvent =
  typeof marketplaceAnalyticsEventsTable.$inferSelect;
