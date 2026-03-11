import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subscriptionPlanEnum } from "./enums";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    replitUserId: varchar("replit_user_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    username: varchar("username", { length: 255 }),
    plan: subscriptionPlanEnum("plan").default("free").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_replit_user_id_idx").on(table.replitUserId)],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
