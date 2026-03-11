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
import { ownerTypeEnum } from "./enums";

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerType: ownerTypeEnum("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    hashedKey: varchar("hashed_key", { length: 255 }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]),
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
    index("api_keys_owner_idx").on(table.ownerType, table.ownerId),
    index("api_keys_prefix_idx").on(table.keyPrefix),
  ],
);

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeysTable.$inferSelect;
