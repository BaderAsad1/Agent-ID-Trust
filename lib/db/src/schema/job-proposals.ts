import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobPostsTable } from "./job-posts";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { proposalStatusEnum } from "./enums";

export const jobProposalsTable = pgTable(
  "job_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobPostsTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    approach: text("approach"),
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }),
    deliveryHours: integer("delivery_hours"),
    status: proposalStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_proposals_job_id_idx").on(table.jobId),
    index("job_proposals_agent_id_idx").on(table.agentId),
    index("job_proposals_user_id_idx").on(table.userId),
    index("job_proposals_status_idx").on(table.status),
  ],
);

export const insertJobProposalSchema = createInsertSchema(
  jobProposalsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobProposal = z.infer<typeof insertJobProposalSchema>;
export type JobProposal = typeof jobProposalsTable.$inferSelect;
