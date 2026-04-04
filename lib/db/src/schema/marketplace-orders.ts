import {
  pgTable,
  uuid,
  text,
  numeric,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { marketplaceListingsTable } from "./marketplace-listings";
import { usersTable } from "./users";
import { agentsTable } from "./agents";
import { orderStatusEnum } from "./enums";

export const marketplaceOrdersTable = pgTable(
  "marketplace_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListingsTable.id),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => usersTable.id),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => usersTable.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id),
    taskDescription: text("task_description"),
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }).notNull(),
    platformFee: numeric("platform_fee", { precision: 12, scale: 2 }).notNull(),
    sellerPayout: numeric("seller_payout", {
      precision: 12,
      scale: 2,
    }).notNull(),
    status: orderStatusEnum("status").default("pending").notNull(),
    paymentProvider: varchar("payment_provider", { length: 50 }),
    providerPaymentReference: varchar("provider_payment_reference", {
      length: 255,
    }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    selectedPackage: varchar("selected_package", { length: 100 }),
    orchestratorAgentId: uuid("orchestrator_agent_id"),
    parentOrderId: uuid("parent_order_id"),
    escrowPaymentIntentId: varchar("escrow_payment_intent_id", { length: 255 }),
    releasedAmount: numeric("released_amount", { precision: 12, scale: 2 }),
    paymentRail: varchar("payment_rail", { length: 20 }).default("stripe").notNull(),
    x402PaymentId: uuid("x402_payment_id"),
    platformFeeUsdc: numeric("platform_fee_usdc", { precision: 18, scale: 6 }),
    providerUsdcAddress: varchar("provider_usdc_address", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_orders_listing_id_idx").on(table.listingId),
    index("marketplace_orders_buyer_user_id_idx").on(table.buyerUserId),
    index("marketplace_orders_seller_user_id_idx").on(table.sellerUserId),
    index("marketplace_orders_agent_id_idx").on(table.agentId),
    index("marketplace_orders_status_idx").on(table.status),
  ],
);

export const insertMarketplaceOrderSchema = createInsertSchema(
  marketplaceOrdersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketplaceOrder = z.infer<
  typeof insertMarketplaceOrderSchema
>;
export type MarketplaceOrder = typeof marketplaceOrdersTable.$inferSelect;
