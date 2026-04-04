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
import { agentTransfersTable } from "./agent-transfers";
import { transferAssetTypeEnum } from "./enums";

export const agentTransferAssetsTable = pgTable(
  "agent_transfer_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => agentTransfersTable.id, { onDelete: "cascade" }),
    assetName: varchar("asset_name", { length: 255 }).notNull(),
    assetCategory: transferAssetTypeEnum("asset_category").notNull(),
    description: text("description"),
    reconnectedAt: timestamp("reconnected_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_transfer_assets_transfer_id_idx").on(table.transferId),
    index("agent_transfer_assets_category_idx").on(table.assetCategory),
  ],
);

export const insertAgentTransferAssetSchema = createInsertSchema(agentTransferAssetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentTransferAsset = z.infer<typeof insertAgentTransferAssetSchema>;
export type AgentTransferAsset = typeof agentTransferAssetsTable.$inferSelect;
