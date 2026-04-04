import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const magicLinkTokensTable = pgTable(
  "magic_link_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    token: varchar("hashed_token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("magic_link_token_idx").on(table.token),
    index("magic_link_email_idx").on(table.email),
  ],
);

export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
