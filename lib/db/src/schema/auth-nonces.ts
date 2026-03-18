import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const authNoncesTable = pgTable(
  "auth_nonces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nonce: varchar("nonce", { length: 128 }).notNull().unique(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 500 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_nonces_nonce_idx").on(table.nonce),
    index("auth_nonces_agent_id_idx").on(table.agentId),
    index("auth_nonces_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertAuthNonceSchema = createInsertSchema(authNoncesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuthNonce = z.infer<typeof insertAuthNonceSchema>;
export type AuthNonce = typeof authNoncesTable.$inferSelect;
