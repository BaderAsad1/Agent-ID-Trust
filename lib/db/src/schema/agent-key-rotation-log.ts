import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { agentKeysTable } from "./agent-keys";

export const agentKeyRotationLogTable = pgTable(
  "agent_key_rotation_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    oldKeyId: uuid("old_key_id")
      .notNull()
      .references(() => agentKeysTable.id),
    newKeyId: uuid("new_key_id")
      .notNull()
      .references(() => agentKeysTable.id),
    rotationReason: varchar("rotation_reason", { length: 255 }),
    rotatedByKid: varchar("rotated_by_kid", { length: 255 }),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_key_rotation_log_agent_id_idx").on(table.agentId),
    index("agent_key_rotation_log_old_key_idx").on(table.oldKeyId),
    index("agent_key_rotation_log_new_key_idx").on(table.newKeyId),
  ],
);

export type AgentKeyRotationLog = typeof agentKeyRotationLogTable.$inferSelect;
