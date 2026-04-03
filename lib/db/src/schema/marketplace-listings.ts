import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { listingStatusEnum, priceTypeEnum } from "./enums";

export interface ListingPackage {
  name: string;
  description?: string;
  deliverables?: string[];
  priceUsdc: string;
  deliveryDays: number;
}

export const marketplaceListingsTable = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    pitch: text("pitch"),
    priceType: priceTypeEnum("price_type").default("fixed").notNull(),
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }),
    deliveryHours: integer("delivery_hours"),
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    status: listingStatusEnum("status").default("draft").notNull(),
    featured: boolean("featured").default(false).notNull(),
    views: integer("views").default(0).notNull(),
    totalHires: integer("total_hires").default(0).notNull(),
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count").default(0).notNull(),
    listingMode: varchar("listing_mode", { length: 10 }).default("h2a").notNull(),
    packages: jsonb("packages").$type<ListingPackage[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_listings_agent_id_idx").on(table.agentId),
    index("marketplace_listings_user_id_idx").on(table.userId),
    index("marketplace_listings_category_idx").on(table.category),
    index("marketplace_listings_status_idx").on(table.status),
    index("marketplace_listings_featured_idx").on(table.featured),
    index("marketplace_listings_cat_status_created_idx").on(table.category, table.status, table.createdAt),
    index("marketplace_listings_cat_status_rating_idx").on(table.category, table.status, table.avgRating),
  ],
);

export const insertMarketplaceListingSchema = createInsertSchema(
  marketplaceListingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketplaceListing = z.infer<
  typeof insertMarketplaceListingSchema
>;
export type MarketplaceListing =
  typeof marketplaceListingsTable.$inferSelect;
