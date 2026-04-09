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

export const marketplaceOrderMessagesTable = pgTable(
  "marketplace_order_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrdersTable.id, { onDelete: "cascade" }),
    senderRole: varchar("sender_role", { length: 20 }).notNull(),
    senderUserId: uuid("sender_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("marketplace_order_messages_order_id_idx").on(table.orderId),
    index("marketplace_order_messages_created_at_idx").on(table.createdAt),
  ],
);

export const insertMarketplaceOrderMessageSchema = createInsertSchema(
  marketplaceOrderMessagesTable,
).omit({ id: true, createdAt: true });

export type InsertMarketplaceOrderMessage = z.infer<
  typeof insertMarketplaceOrderMessageSchema
>;
export type MarketplaceOrderMessage =
  typeof marketplaceOrderMessagesTable.$inferSelect;
