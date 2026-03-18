import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const waitlistTable = pgTable(
  "waitlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    source: varchar("source", { length: 50 }).default("website"),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
    referrer: varchar("referrer", { length: 2000 }),
    notified: boolean("notified").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("waitlist_email_idx").on(table.email),
    index("waitlist_created_at_idx").on(table.createdAt),
  ],
);

export type WaitlistEntry = typeof waitlistTable.$inferSelect;
