import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentAttestationsTable = pgTable(
  "agent_attestations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attesterId: uuid("attester_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    sentiment: varchar("sentiment", { length: 20 }).notNull(),
    category: varchar("category", { length: 100 }),
    content: text("content"),
    signature: text("signature").notNull(),
    attesterTrustScore: real("attester_trust_score").default(0).notNull(),
    weight: real("weight").default(1).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_attestations_attester_id_idx").on(table.attesterId),
    index("agent_attestations_subject_id_idx").on(table.subjectId),
    index("agent_attestations_sentiment_idx").on(table.sentiment),
  ],
);

export type AgentAttestation = typeof agentAttestationsTable.$inferSelect;
