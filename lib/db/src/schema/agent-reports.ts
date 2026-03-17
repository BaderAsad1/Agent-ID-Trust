import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const agentReportReasonEnum = pgEnum("agent_report_reason", [
  "spam",
  "impersonation",
  "malicious",
  "scam",
  "terms_violation",
  "fake_identity",
  "other",
]);

export const agentReportStatusEnum = pgEnum("agent_report_status", [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const agentReportsTable = pgTable(
  "agent_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectAgentId: uuid("subject_agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    reporterAgentId: uuid("reporter_agent_id").references(() => agentsTable.id, {
      onDelete: "set null",
    }),
    reporterUserId: uuid("reporter_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reason: agentReportReasonEnum("reason").notNull(),
    description: text("description"),
    evidence: text("evidence"),
    status: agentReportStatusEnum("status").default("pending").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    resolution: varchar("resolution", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_reports_subject_agent_id_idx").on(table.subjectAgentId),
    index("agent_reports_reporter_user_id_idx").on(table.reporterUserId),
    index("agent_reports_reporter_agent_id_idx").on(table.reporterAgentId),
    index("agent_reports_status_idx").on(table.status),
    index("agent_reports_created_at_idx").on(table.createdAt),
  ],
);

export type AgentReport = typeof agentReportsTable.$inferSelect;
