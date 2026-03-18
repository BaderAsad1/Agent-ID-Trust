import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ownerTokensTable = pgTable(
  "owner_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    used: boolean("used").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("owner_tokens_token_idx").on(table.token),
    index("owner_tokens_user_id_idx").on(table.userId),
  ],
);

export type OwnerToken = typeof ownerTokensTable.$inferSelect;
