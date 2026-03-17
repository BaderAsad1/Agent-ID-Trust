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
  agentTypeEnum,
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
    agentType: agentTypeEnum("agent_type").default("primary").notNull(),
    parentAgentId: uuid("parent_agent_id"),
    lineageDepth: integer("lineage_depth").default(0).notNull(),
    sponsoredBy: uuid("sponsored_by"),
    maxSubagents: integer("max_subagents").default(10).notNull(),
    subagentCount: integer("subagent_count").default(0).notNull(),
    ttlExpiresAt: timestamp("ttl_expires_at", { withTimezone: true }),
    spawnedByKeyId: uuid("spawned_by_key_id"),
    tasksReceived: integer("tasks_received").default(0).notNull(),
    tasksCompleted: integer("tasks_completed").default(0).notNull(),
    transferStatus: transferStatusEnum("transfer_status"),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    orgId: uuid("org_id"),
    orgNamespace: varchar("org_namespace", { length: 200 }),
    historicalAgentReputation: real("historical_agent_reputation"),
    currentOperatorReputation: real("current_operator_reputation"),
    effectiveLiveTrust: real("effective_live_trust"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    runtimeContext: jsonb("runtime_context").$type<Record<string, unknown>>(),
    stripeConnectAccountId: text("stripe_connect_account_id"),
    stripeConnectStatus: varchar("stripe_connect_status", { length: 50 }),
    bootstrapIssuedAt: timestamp("bootstrap_issued_at", { withTimezone: true }),
    ownerUserId: uuid("owner_user_id"),
    ownerVerifiedAt: timestamp("owner_verified_at", { withTimezone: true }),
    ownerVerificationMethod: varchar("owner_verification_method", { length: 50 }),
    isReserved: boolean("is_reserved").default(false).notNull(),
    reservedReason: varchar("reserved_reason", { length: 50 }),
    isClaimed: boolean("is_claimed").default(false).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
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
    index("agents_parent_agent_id_idx").on(table.parentAgentId),
    index("agents_agent_type_idx").on(table.agentType),
    index("agents_ttl_expires_at_idx").on(table.ttlExpiresAt),
    uniqueIndex("agents_stripe_connect_account_id_idx").on(table.stripeConnectAccountId),
    index("agents_is_reserved_idx")
      .on(table.isReserved)
      .where(sql`is_reserved = true`),
  ],
);

export const agentLineageTable = pgTable(
  "agent_lineage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_lineage_agent_id_idx").on(table.agentId),
    index("agent_lineage_ancestor_id_idx").on(table.ancestorId),
    uniqueIndex("agent_lineage_agent_ancestor_idx").on(table.agentId, table.ancestorId),
  ],
);

export const insertAgentSchema = createInsertSchema(agentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
export type AgentLineage = typeof agentLineageTable.$inferSelect;
