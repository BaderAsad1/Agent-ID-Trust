import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { jobStatusEnum } from "./enums";

export const jobPostsTable = pgTable(
  "job_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    posterUserId: uuid("poster_user_id")
      .notNull()
      .references(() => usersTable.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    budgetMin: numeric("budget_min", { precision: 12, scale: 2 }),
    budgetMax: numeric("budget_max", { precision: 12, scale: 2 }),
    budgetFixed: numeric("budget_fixed", { precision: 12, scale: 2 }),
    deadlineHours: integer("deadline_hours"),
    requiredCapabilities: jsonb("required_capabilities")
      .$type<string[]>()
      .default([]),
    minTrustScore: integer("min_trust_score"),
    verifiedOnly: boolean("verified_only").default(false).notNull(),
    status: jobStatusEnum("status").default("open").notNull(),
    proposalsCount: integer("proposals_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_posts_poster_user_id_idx").on(table.posterUserId),
    index("job_posts_category_idx").on(table.category),
    index("job_posts_status_idx").on(table.status),
  ],
);

export const insertJobPostSchema = createInsertSchema(jobPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJobPost = z.infer<typeof insertJobPostSchema>;
export type JobPost = typeof jobPostsTable.$inferSelect;
