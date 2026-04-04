import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { oauthClientsTable } from "./oauth-clients";

export const oauthTokensTable = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: varchar("token_id", { length: 128 }).notNull().unique(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 64 })
      .references(() => oauthClientsTable.clientId, { onDelete: "cascade" }),
    accessTokenHash: varchar("access_token_hash", { length: 255 }).notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 255 }),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    trustTier: varchar("trust_tier", { length: 50 }),
    verificationStatus: varchar("verification_status", { length: 50 }),
    ownerType: varchar("owner_type", { length: 50 }).default("none"),
    grantType: varchar("grant_type", { length: 100 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: varchar("revoked_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("oauth_tokens_token_id_idx").on(table.tokenId),
    index("oauth_tokens_agent_id_idx").on(table.agentId),
    index("oauth_tokens_client_id_idx").on(table.clientId),
    index("oauth_tokens_access_token_hash_idx").on(table.accessTokenHash),
    index("oauth_tokens_refresh_token_hash_idx").on(table.refreshTokenHash),
    index("oauth_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertOauthTokenSchema = createInsertSchema(oauthTokensTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOauthToken = z.infer<typeof insertOauthTokenSchema>;
export type OauthToken = typeof oauthTokensTable.$inferSelect;
