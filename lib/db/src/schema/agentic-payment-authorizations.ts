import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const agenticPaymentAuthorizationsTable = pgTable(
  "agentic_payment_authorizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    authorizedByUserId: uuid("authorized_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    spendLimitCents: integer("spend_limit_cents").notNull().default(0),
    isActive: boolean("is_active").default(true).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }),
    stripePaymentMethodId: varchar("stripe_payment_method_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agentic_payment_auth_agent_id_idx").on(table.agentId),
    index("agentic_payment_auth_user_id_idx").on(table.authorizedByUserId),
    index("agentic_payment_auth_active_idx").on(table.isActive),
  ],
);

export type AgenticPaymentAuthorization = typeof agenticPaymentAuthorizationsTable.$inferSelect;
export type InsertAgenticPaymentAuthorization = typeof agenticPaymentAuthorizationsTable.$inferInsert;
