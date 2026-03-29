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
    handle: varchar("handle", { length: 32 }),
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
    handleExpiresAt: timestamp("handle_expires_at", { withTimezone: true }),
    handleRegisteredAt: timestamp("handle_registered_at", { withTimezone: true }),
    handleTier: varchar("handle_tier", { length: 50 }),
    handleIsOnchain: boolean("handle_is_onchain").default(false).notNull(),
    handlePaid: boolean("handle_paid").default(false).notNull(),
    handleStripeSubscriptionId: varchar("handle_stripe_subscription_id", { length: 255 }),
    handleRenewalNotifiedAt: timestamp("handle_renewal_notified_at", { withTimezone: true }),
    onChainTokenId: varchar("on_chain_token_id", { length: 255 }),
    onChainOwner: varchar("on_chain_owner", { length: 255 }),
    onChainTxHash: varchar("on_chain_tx_hash", { length: 255 }),
    walletAddress: varchar("wallet_address", { length: 255 }),
    walletNetwork: varchar("wallet_network", { length: 50 }),
    walletProvisionedAt: timestamp("wallet_provisioned_at", { withTimezone: true }),
    walletPolicyId: varchar("wallet_policy_id", { length: 255 }),
    walletIsSelfCustodial: boolean("wallet_is_self_custodial").default(false).notNull(),
    walletUsdcBalance: varchar("wallet_usdc_balance", { length: 100 }),
    walletLastBalanceCheck: timestamp("wallet_last_balance_check", { withTimezone: true }),
    planTier: varchar("plan_tier", { length: 50 }),
    inboxActive: boolean("inbox_active").default(false).notNull(),
    apiAccess: boolean("api_access").default(true).notNull(),
    trustScoreActive: boolean("trust_score_active").default(true).notNull(),
    paymentAuthorized: boolean("payment_authorized").default(false).notNull(),
    authorizedSpendLimitCents: integer("authorized_spend_limit_cents").default(0).notNull(),
    annualPriceUsd: integer("annual_price_usd"),
    autoRenew: boolean("auto_renew").default(false).notNull(),
    renewalNotifiedAt: timestamp("renewal_notified_at", { withTimezone: true }),
    bootstrapIssuedAt: timestamp("bootstrap_issued_at", { withTimezone: true }),
    ownerUserId: uuid("owner_user_id"),
    ownerVerifiedAt: timestamp("owner_verified_at", { withTimezone: true }),
    ownerVerificationMethod: varchar("owner_verification_method", { length: 50 }),
    isReserved: boolean("is_reserved").default(false).notNull(),
    reservedReason: varchar("reserved_reason", { length: 50 }),
    isClaimed: boolean("is_claimed").default(false).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 100 }),
    revocationStatement: text("revocation_statement"),
    chainMints: jsonb("chain_mints").$type<Record<string, unknown>>().default({}),
    nftStatus: varchar("nft_status", { length: 20 }).default("none"),
    nftCustodian: varchar("nft_custodian", { length: 20 }),
    nftOwnerWallet: varchar("nft_owner_wallet", { length: 255 }),
    erc8004AgentId: varchar("erc8004_agent_id", { length: 255 }),
    erc8004Chain: varchar("erc8004_chain", { length: 50 }),
    erc8004Registry: varchar("erc8004_registry", { length: 255 }),
    chainRegistrations: jsonb("chain_registrations").$type<Record<string, unknown>[]>().default([]),
    paidThrough: timestamp("paid_through", { withTimezone: true }),
    gracePeriodEnds: timestamp("grace_period_ends", { withTimezone: true }),
    handleStatus: varchar("handle_status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agents_handle_idx").on(table.handle).where(sql`handle IS NOT NULL`),
    index("agents_handle_lower_idx").on(sql`lower(${table.handle})`).where(sql`handle IS NOT NULL`),
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
    index("agents_handle_expires_at_idx").on(table.handleExpiresAt),
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
