import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { keyStatusEnum } from "./enums";

export const agentKeysTable = pgTable(
  "agent_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    kid: varchar("kid", { length: 255 }).notNull(),
    keyType: varchar("key_type", { length: 50 }).notNull(),
    publicKey: text("public_key"),
    jwk: jsonb("jwk"),
    use: varchar("use", { length: 50 }).default("sig").notNull(),
    status: keyStatusEnum("status").default("active").notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotatedByKid: varchar("rotated_by_kid", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotationReason: varchar("rotation_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_keys_agent_id_idx").on(table.agentId),
    index("agent_keys_kid_idx").on(table.kid),
    index("agent_keys_agent_id_status_idx").on(table.agentId, table.status),
  ],
);

export const insertAgentKeySchema = createInsertSchema(agentKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentKey = z.infer<typeof insertAgentKeySchema>;
export type AgentKey = typeof agentKeysTable.$inferSelect;
