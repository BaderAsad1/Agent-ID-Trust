import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { marketplaceOrdersTable } from "./marketplace-orders";
import { usersTable } from "./users";

export const marketplaceDisputesTable = pgTable(
  "marketplace_disputes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrdersTable.id, { onDelete: "cascade" }),
    raisedByUserId: uuid("raised_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    reason: varchar("reason", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).notNull().default("open"),
    adminNote: text("admin_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_disputes_order_id_idx").on(table.orderId),
    index("marketplace_disputes_status_idx").on(table.status),
    index("marketplace_disputes_raised_by_idx").on(table.raisedByUserId),
  ],
);

export const insertMarketplaceDisputeSchema = createInsertSchema(
  marketplaceDisputesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketplaceDispute = z.infer<
  typeof insertMarketplaceDisputeSchema
>;
export type MarketplaceDispute = typeof marketplaceDisputesTable.$inferSelect;
