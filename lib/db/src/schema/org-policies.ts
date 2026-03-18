import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentOrganizationsTable } from "./agent-organizations";

export const orgPoliciesTable = pgTable(
  "org_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => agentOrganizationsTable.id, { onDelete: "cascade" }),
    policyType: varchar("policy_type", { length: 100 }).notNull(),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("org_policies_org_id_idx").on(table.orgId),
    index("org_policies_policy_type_idx").on(table.policyType),
  ],
);

export const insertOrgPolicySchema = createInsertSchema(orgPoliciesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrgPolicy = z.infer<typeof insertOrgPolicySchema>;
export type OrgPolicy = typeof orgPoliciesTable.$inferSelect;
