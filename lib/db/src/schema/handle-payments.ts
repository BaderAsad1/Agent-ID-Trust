import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const handlePaymentsTable = pgTable(
  "handle_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 100 }).notNull(),
    tier: varchar("tier", { length: 50 }).notNull(),
    annualPriceCents: integer("annual_price_cents").notNull(),
    stripeSessionId: varchar("stripe_session_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    paymentMethod: varchar("payment_method", { length: 50 }),
    txHash: varchar("tx_hash", { length: 255 }),
    isOnchain: boolean("is_onchain").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("handle_payments_agent_id_idx").on(table.agentId),
    index("handle_payments_user_id_idx").on(table.userId),
    index("handle_payments_handle_idx").on(table.handle),
    index("handle_payments_status_idx").on(table.status),
  ],
);

export type HandlePayment = typeof handlePaymentsTable.$inferSelect;
export type InsertHandlePayment = typeof handlePaymentsTable.$inferInsert;
