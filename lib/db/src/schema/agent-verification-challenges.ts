import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentVerificationChallengesTable = pgTable(
  "agent_verification_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    challenge: text("challenge").notNull(),
    method: varchar("method", { length: 50 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_verification_challenges_agent_id_idx").on(table.agentId),
  ],
);

export const insertAgentVerificationChallengeSchema = createInsertSchema(
  agentVerificationChallengesTable,
).omit({ id: true, createdAt: true });
export type InsertAgentVerificationChallenge = z.infer<
  typeof insertAgentVerificationChallengeSchema
>;
export type AgentVerificationChallenge =
  typeof agentVerificationChallengesTable.$inferSelect;
