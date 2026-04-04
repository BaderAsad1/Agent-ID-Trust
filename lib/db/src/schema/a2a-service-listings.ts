import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export interface A2ACapabilitySchema {
  inputTypes: string[];
  outputTypes: string[];
  sampleInput?: Record<string, unknown>;
  sampleOutput?: Record<string, unknown>;
}

export const a2aServiceListingsTable = pgTable(
  "a2a_service_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    capabilityType: varchar("capability_type", { length: 100 }).notNull(),
    capabilitySchema: jsonb("capability_schema").$type<A2ACapabilitySchema>(),
    latencySlaMs: integer("latency_sla_ms"),
    maxConcurrentCalls: integer("max_concurrent_calls").default(10).notNull(),
    pricingModel: varchar("pricing_model", { length: 50 }).notNull().default("per_call"),
    pricePerCallUsdc: numeric("price_per_call_usdc", { precision: 18, scale: 6 }),
    pricePerTokenUsdc: numeric("price_per_token_usdc", { precision: 18, scale: 9 }),
    pricePerSecondUsdc: numeric("price_per_second_usdc", { precision: 18, scale: 9 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    tags: jsonb("tags").$type<string[]>().default([]),
    endpointPath: varchar("endpoint_path", { length: 500 }),
    requiresAuth: boolean("requires_auth").default(true).notNull(),
    totalCalls: integer("total_calls").default(0).notNull(),
    successRate: numeric("success_rate", { precision: 5, scale: 2 }),
    avgLatencyMs: integer("avg_latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("a2a_service_listings_agent_id_idx").on(table.agentId),
    index("a2a_service_listings_user_id_idx").on(table.userId),
    index("a2a_service_listings_capability_type_idx").on(table.capabilityType),
    index("a2a_service_listings_status_idx").on(table.status),
    index("a2a_service_listings_pricing_model_idx").on(table.pricingModel),
  ],
);

export const insertA2AServiceListingSchema = createInsertSchema(
  a2aServiceListingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertA2AServiceListing = z.infer<
  typeof insertA2AServiceListingSchema
>;
export type A2AServiceListing = typeof a2aServiceListingsTable.$inferSelect;
