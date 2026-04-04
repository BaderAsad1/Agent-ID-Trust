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

export const oauthAuthorizationCodesTable = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 128 }).notNull().unique(),
    clientId: varchar("client_id", { length: 64 })
      .notNull()
      .references(() => oauthClientsTable.clientId, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    redirectUri: varchar("redirect_uri", { length: 2048 }),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    codeChallenge: varchar("code_challenge", { length: 256 }),
    codeChallengeMethod: varchar("code_challenge_method", { length: 10 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("oauth_auth_codes_code_idx").on(table.code),
    index("oauth_auth_codes_client_id_idx").on(table.clientId),
    index("oauth_auth_codes_agent_id_idx").on(table.agentId),
    index("oauth_auth_codes_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertOauthAuthorizationCodeSchema = createInsertSchema(
  oauthAuthorizationCodesTable,
).omit({ id: true, createdAt: true });
export type InsertOauthAuthorizationCode = z.infer<typeof insertOauthAuthorizationCodeSchema>;
export type OauthAuthorizationCode = typeof oauthAuthorizationCodesTable.$inferSelect;
