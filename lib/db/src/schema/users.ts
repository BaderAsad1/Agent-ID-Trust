import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subscriptionPlanEnum } from "./enums";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    replitUserId: varchar("replit_user_id", { length: 255 }),
    provider: varchar("provider", { length: 20 }).notNull().default("replit"),
    providerId: varchar("provider_id", { length: 255 }),
    email: varchar("email", { length: 255 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    username: varchar("username", { length: 255 }),
    githubUsername: varchar("github_username", { length: 255 }),
    plan: subscriptionPlanEnum("plan").default("free").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("users_replit_user_id_idx").on(table.replitUserId),
    index("users_provider_id_idx").on(table.provider, table.providerId),
    index("users_email_idx").on(table.email),
    index("users_username_idx").on(table.username),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
