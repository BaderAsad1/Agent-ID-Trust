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
import { sql } from "drizzle-orm";
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
    // H10: DB-level uniqueness — one active (non-revoked) attestation per (attester, subject).
    // This is a partial unique index (WHERE revoked_at IS NULL) so revoked attestations
    // can be re-created after revocation without violating the constraint.
    uniqueIndex("agent_attestations_active_unique_idx")
      .on(table.attesterId, table.subjectId)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export type AgentAttestation = typeof agentAttestationsTable.$inferSelect;
