import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { domainStatusEnum } from "./enums";

export const agentDomainsTable = pgTable(
  "agent_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    baseDomain: varchar("base_domain", { length: 255 }).notNull(),
    status: domainStatusEnum("status").default("pending").notNull(),
    providerMetadata: jsonb("provider_metadata"),
    dnsRecords: jsonb("dns_records"),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_domains_domain_idx").on(table.domain),
    index("agent_domains_agent_id_idx").on(table.agentId),
    index("agent_domains_status_idx").on(table.status),
  ],
);

export const insertAgentDomainSchema = createInsertSchema(
  agentDomainsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentDomain = z.infer<typeof insertAgentDomainSchema>;
export type AgentDomain = typeof agentDomainsTable.$inferSelect;
