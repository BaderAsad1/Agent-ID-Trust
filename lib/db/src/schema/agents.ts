import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  real,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import {
  agentStatusEnum,
  verificationStatusEnum,
  verificationMethodEnum,
  trustTierEnum,
  transferStatusEnum,
} from "./enums";

export const agentsTable = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    avatarSeed: varchar("avatar_seed", { length: 255 }),
    avatarUrl: text("avatar_url"),
    status: agentStatusEnum("status").default("draft").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    endpointUrl: text("endpoint_url"),
    endpointSecret: text("endpoint_secret"),
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    protocols: jsonb("protocols").$type<string[]>().default([]),
    authMethods: jsonb("auth_methods").$type<string[]>().default([]),
    paymentMethods: jsonb("payment_methods").$type<string[]>().default([]),
    metadata: jsonb("metadata"),
    trustScore: integer("trust_score").default(0).notNull(),
    trustBreakdown: jsonb("trust_breakdown").$type<Record<string, number>>(),
    trustTier: trustTierEnum("trust_tier").default("unverified").notNull(),
    verificationStatus: verificationStatusEnum("verification_status")
      .default("unverified")
      .notNull(),
    verificationMethod: verificationMethodEnum("verification_method"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    parentAgentId: uuid("parent_agent_id"),
    lineageDepth: integer("lineage_depth").default(0).notNull(),
    sponsoredBy: uuid("sponsored_by"),
    tasksReceived: integer("tasks_received").default(0).notNull(),
    tasksCompleted: integer("tasks_completed").default(0).notNull(),
    transferStatus: transferStatusEnum("transfer_status"),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    historicalAgentReputation: real("historical_agent_reputation"),
    currentOperatorReputation: real("current_operator_reputation"),
    effectiveLiveTrust: real("effective_live_trust"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    runtimeContext: jsonb("runtime_context").$type<Record<string, unknown>>(),
    bootstrapIssuedAt: timestamp("bootstrap_issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agents_handle_idx").on(table.handle),
    index("agents_handle_lower_idx").on(sql`lower(${table.handle})`),
    index("agents_user_id_idx").on(table.userId),
    index("agents_status_idx").on(table.status),
    index("agents_verification_status_idx").on(table.verificationStatus),
    index("agents_trust_score_idx").on(table.trustScore),
  ],
);

export const insertAgentSchema = createInsertSchema(agentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
