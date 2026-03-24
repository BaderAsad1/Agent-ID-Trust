import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const handleRegistrationLogTable = pgTable(
  "handle_registration_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("handle_registration_log_user_id_idx").on(table.userId),
    index("handle_registration_log_created_at_idx").on(table.createdAt),
  ],
);

export type HandleRegistrationLog = typeof handleRegistrationLogTable.$inferSelect;
