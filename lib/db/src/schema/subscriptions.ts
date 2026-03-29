import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import {
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  billingIntervalEnum,
} from "./enums";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => usersTable.id),
    plan: subscriptionPlanEnum("plan").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    provider: varchar("provider", { length: 50 }),
    providerCustomerId: varchar("provider_customer_id", { length: 255 }),
    providerSubscriptionId: varchar("provider_subscription_id", {
      length: 255,
    }),
    billingInterval: billingIntervalEnum("billing_interval"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_provider_sub_id_idx").on(
      table.providerSubscriptionId,
    ),
    uniqueIndex("subscriptions_provider_sub_id_unique_idx").on(
      table.providerSubscriptionId,
    ),
  ],
);

export const insertSubscriptionSchema = createInsertSchema(
  subscriptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
