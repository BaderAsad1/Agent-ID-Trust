import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import {
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  billingIntervalEnum,
} from "./enums";

export const agentSubscriptionsTable = pgTable(
  "agent_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    plan: subscriptionPlanEnum("plan").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    provider: varchar("provider", { length: 50 }),
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
    index("agent_subscriptions_agent_id_idx").on(table.agentId),
    index("agent_subscriptions_user_id_idx").on(table.userId),
    index("agent_subscriptions_status_idx").on(table.status),
  ],
);

export const insertAgentSubscriptionSchema = createInsertSchema(
  agentSubscriptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentSubscription = z.infer<
  typeof insertAgentSubscriptionSchema
>;
export type AgentSubscription = typeof agentSubscriptionsTable.$inferSelect;
