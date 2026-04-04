import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { marketplaceOrdersTable } from "./marketplace-orders";

export const marketplaceMilestonesTable = pgTable(
  "marketplace_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrdersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    capturedAmount: numeric("captured_amount", { precision: 12, scale: 2 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    sortOrder: varchar("sort_order", { length: 10 }).default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_milestones_order_id_idx").on(table.orderId),
    index("marketplace_milestones_status_idx").on(table.status),
  ],
);

export const insertMarketplaceMilestoneSchema = createInsertSchema(
  marketplaceMilestonesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketplaceMilestone = z.infer<
  typeof insertMarketplaceMilestoneSchema
>;
export type MarketplaceMilestone =
  typeof marketplaceMilestonesTable.$inferSelect;
