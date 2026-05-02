import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  timestamp,
  index,
  jsonb,
  text,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { a2aServiceListingsTable } from "./a2a-service-listings";
import { a2aEngagementsTable } from "./a2a-engagements";

export const a2aServiceCallsTable = pgTable(
  "a2a_service_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: varchar("call_id", { length: 255 }).notNull().unique(),
    engagementId: uuid("engagement_id").references(
      () => a2aEngagementsTable.id,
      { onDelete: "set null" },
    ),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => a2aServiceListingsTable.id, { onDelete: "cascade" }),
    callerAgentId: uuid("caller_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    providerAgentId: uuid("provider_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("success"),
    httpStatus: integer("http_status"),
    requestPayload: jsonb("request_payload"),
    responseBody: jsonb("response_body"),
    errorMessage: text("error_message"),
    executionMs: integer("execution_ms").notNull().default(0),
    amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    platformFeeUsdc: numeric("platform_fee_usdc", {
      precision: 18,
      scale: 6,
    }).notNull().default("0"),
    providerPayoutUsdc: numeric("provider_payout_usdc", {
      precision: 18,
      scale: 6,
    }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull().default("USDC"),
    receiptB64: text("receipt_b64"),
    receiptSignature: varchar("receipt_signature", { length: 255 }),
    txHash: varchar("tx_hash", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("a2a_service_calls_engagement_idx").on(table.engagementId),
    index("a2a_service_calls_caller_service_idx").on(
      table.callerAgentId,
      table.serviceId,
    ),
    index("a2a_service_calls_user_idx").on(table.userId),
    index("a2a_service_calls_created_at_idx").on(table.createdAt),
  ],
);

export type A2AServiceCall = typeof a2aServiceCallsTable.$inferSelect;
export type NewA2AServiceCall = typeof a2aServiceCallsTable.$inferInsert;
