import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { marketplaceOrdersTable } from "./marketplace-orders";
import { marketplaceListingsTable } from "./marketplace-listings";
import { usersTable } from "./users";
import { agentsTable } from "./agents";

export const marketplaceReviewsTable = pgTable(
  "marketplace_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrdersTable.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListingsTable.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => usersTable.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("marketplace_reviews_order_id_idx").on(table.orderId),
    index("marketplace_reviews_listing_id_idx").on(table.listingId),
    index("marketplace_reviews_agent_id_idx").on(table.agentId),
    index("marketplace_reviews_reviewer_id_idx").on(table.reviewerId),
  ],
);

export const insertMarketplaceReviewSchema = createInsertSchema(
  marketplaceReviewsTable,
).omit({ id: true, createdAt: true });
export type InsertMarketplaceReview = z.infer<
  typeof insertMarketplaceReviewSchema
>;
export type MarketplaceReview = typeof marketplaceReviewsTable.$inferSelect;
