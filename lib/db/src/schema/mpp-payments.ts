import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const mppPaymentsTable = pgTable(
  "mpp_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    paymentType: varchar("payment_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    payerAgentId: uuid("payer_agent_id"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    trustTierAtPayment: varchar("trust_tier_at_payment", { length: 50 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("mpp_payments_idempotency_key_idx").on(table.idempotencyKey),
    uniqueIndex("mpp_payments_stripe_pi_type_idx").on(table.stripePaymentIntentId, table.paymentType),
    index("mpp_payments_agent_id_idx").on(table.agentId),
    index("mpp_payments_status_idx").on(table.status),
    index("mpp_payments_stripe_pi_idx").on(table.stripePaymentIntentId),
    index("mpp_payments_payer_agent_idx").on(table.payerAgentId),
  ],
);

export type MppPayment = typeof mppPaymentsTable.$inferSelect;
export type InsertMppPayment = typeof mppPaymentsTable.$inferInsert;
