import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const humanAuditLogTable = pgTable(
  "human_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 255 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: varchar("resource_id", { length: 255 }),
    hashedIp: varchar("hashed_ip", { length: 64 }),
    userAgent: text("user_agent"),
    bodyMetadata: jsonb("body_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("human_audit_log_user_id_idx").on(table.userId),
    index("human_audit_log_created_at_idx").on(table.createdAt),
    index("human_audit_log_action_idx").on(table.action),
    index("human_audit_log_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export type HumanAuditLog = typeof humanAuditLogTable.$inferSelect;
export type InsertHumanAuditLog = typeof humanAuditLogTable.$inferInsert;
