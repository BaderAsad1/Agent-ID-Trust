import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { transferStatusEnum, transferTypeEnum } from "./enums";

export const agentTransfersTable = pgTable(
  "agent_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id),
    buyerId: uuid("buyer_id")
      .references(() => usersTable.id),
    status: transferStatusEnum("status").default("draft").notNull(),
    transferType: transferTypeEnum("transfer_type").notNull(),
    askingPrice: integer("asking_price"),
    agreedPrice: integer("agreed_price"),
    currency: varchar("currency", { length: 10 }).default("USD"),
    holdProvider: varchar("hold_provider", { length: 100 }),
    holdStatus: varchar("hold_status", { length: 50 }),
    holdReference: varchar("hold_reference", { length: 255 }),
    notes: text("notes"),
    metadata: jsonb("metadata"),
    listedAt: timestamp("listed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    holdFundedAt: timestamp("hold_funded_at", { withTimezone: true }),
    handoffStartedAt: timestamp("handoff_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_transfers_agent_id_idx").on(table.agentId),
    index("agent_transfers_seller_id_idx").on(table.sellerId),
    index("agent_transfers_buyer_id_idx").on(table.buyerId),
    index("agent_transfers_status_idx").on(table.status),
  ],
);

export const insertAgentTransferSchema = createInsertSchema(agentTransfersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentTransfer = z.infer<typeof insertAgentTransferSchema>;
export type AgentTransfer = typeof agentTransfersTable.$inferSelect;
