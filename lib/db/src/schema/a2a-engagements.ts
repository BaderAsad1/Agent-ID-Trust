import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { a2aServiceListingsTable } from "./a2a-service-listings";

export const a2aEngagementsTable = pgTable(
  "a2a_engagements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => a2aServiceListingsTable.id, { onDelete: "cascade" }),
    serviceHandle: varchar("service_handle", { length: 255 }).notNull(),
    serviceName: varchar("service_name", { length: 255 }).notNull(),
    spendingCapUsdc: numeric("spending_cap_usdc", { precision: 18, scale: 6 }).notNull().default("10"),
    totalSpentUsdc: numeric("total_spent_usdc", { precision: 18, scale: 6 }).notNull().default("0"),
    callCount: integer("call_count").notNull().default(0),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    paymentModel: varchar("payment_model", { length: 50 }).notNull().default("per_call"),
    pricePerUnit: numeric("price_per_unit", { precision: 18, scale: 6 }).notNull().default("0.01"),
    currency: varchar("currency", { length: 10 }).notNull().default("USDC"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("a2a_engagements_agent_id_idx").on(table.agentId),
    index("a2a_engagements_user_id_idx").on(table.userId),
    index("a2a_engagements_service_id_idx").on(table.serviceId),
    index("a2a_engagements_status_idx").on(table.status),
  ],
);

export type A2AEngagement = typeof a2aEngagementsTable.$inferSelect;
