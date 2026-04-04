import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentidSessionsTable = pgTable(
  "agentid_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: varchar("session_id", { length: 128 }).notNull().unique(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 500 }),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    trustTier: varchar("trust_tier", { length: 50 }),
    verificationStatus: varchar("verification_status", { length: 50 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: varchar("revoked_reason", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agentid_sessions_session_id_idx").on(table.sessionId),
    index("agentid_sessions_agent_id_idx").on(table.agentId),
    index("agentid_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertAgentidSessionSchema = createInsertSchema(agentidSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentidSession = z.infer<typeof insertAgentidSessionSchema>;
export type AgentidSession = typeof agentidSessionsTable.$inferSelect;
