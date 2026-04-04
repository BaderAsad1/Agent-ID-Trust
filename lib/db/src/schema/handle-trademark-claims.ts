import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const handleTrademarkClaimsTable = pgTable(
  "handle_trademark_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handle: varchar("handle", { length: 100 }).notNull(),
    claimantName: varchar("claimant_name", { length: 255 }).notNull(),
    claimantEmail: varchar("claimant_email", { length: 255 }).notNull(),
    trademarkNumber: varchar("trademark_number", { length: 100 }),
    jurisdiction: varchar("jurisdiction", { length: 100 }),
    evidence: text("evidence"),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("handle_trademark_claims_handle_idx").on(table.handle),
    index("handle_trademark_claims_status_idx").on(table.status),
  ],
);

export type HandleTrademarkClaim = typeof handleTrademarkClaimsTable.$inferSelect;
export type InsertHandleTrademarkClaim = typeof handleTrademarkClaimsTable.$inferInsert;
