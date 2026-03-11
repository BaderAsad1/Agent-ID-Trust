import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userIdentitiesTable = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    metadata: jsonb("metadata"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_identities_user_id_idx").on(table.userId),
    uniqueIndex("user_identities_provider_user_idx").on(
      table.provider,
      table.providerUserId,
    ),
  ],
);

export const insertUserIdentitySchema = createInsertSchema(
  userIdentitiesTable,
).omit({ id: true, createdAt: true });
export type InsertUserIdentity = z.infer<typeof insertUserIdentitySchema>;
export type UserIdentity = typeof userIdentitiesTable.$inferSelect;
