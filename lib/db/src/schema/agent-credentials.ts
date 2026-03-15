import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentCredentialsTable = pgTable(
  "agent_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    serialNumber: varchar("serial_number", { length: 20 }).notNull(),
    credentialJson: jsonb("credential_json").notNull(),
    signature: text("signature").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_credentials_agent_id_idx").on(table.agentId),
    uniqueIndex("agent_credentials_serial_number_idx").on(table.serialNumber),
    index("agent_credentials_is_active_idx").on(table.isActive),
    index("agent_credentials_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertAgentCredentialSchema = createInsertSchema(
  agentCredentialsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentCredential = z.infer<typeof insertAgentCredentialSchema>;
export type AgentCredential = typeof agentCredentialsTable.$inferSelect;
