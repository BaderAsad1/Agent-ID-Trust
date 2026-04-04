import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const oauthClientsTable = pgTable(
  "oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: varchar("client_id", { length: 64 }).notNull().unique(),
    clientSecretHash: varchar("client_secret_hash", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().default([]).notNull(),
    allowedScopes: jsonb("allowed_scopes").$type<string[]>().default([]).notNull(),
    grantTypes: jsonb("grant_types").$type<string[]>().default(["authorization_code"]).notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("oauth_clients_client_id_idx").on(table.clientId),
    index("oauth_clients_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const insertOauthClientSchema = createInsertSchema(oauthClientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOauthClient = z.infer<typeof insertOauthClientSchema>;
export type OauthClient = typeof oauthClientsTable.$inferSelect;
