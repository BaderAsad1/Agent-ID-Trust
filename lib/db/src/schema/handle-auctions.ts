import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const handleAuctionsTable = pgTable(
  "handle_auctions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handle: varchar("handle", { length: 100 }).notNull(),
    startPrice: integer("start_price").notNull(),
    reservePrice: integer("reserve_price").notNull(),
    currentPrice: integer("current_price").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    winnerId: uuid("winner_id"),
    winnerStripeSessionId: varchar("winner_stripe_session_id", { length: 255 }),
    settled: boolean("settled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("handle_auctions_handle_active_idx").on(table.handle).where(
      sql`settled = false`,
    ),
    index("handle_auctions_ends_at_idx").on(table.endsAt),
    index("handle_auctions_settled_idx").on(table.settled),
  ],
);

export type HandleAuction = typeof handleAuctionsTable.$inferSelect;
export type InsertHandleAuction = typeof handleAuctionsTable.$inferInsert;
