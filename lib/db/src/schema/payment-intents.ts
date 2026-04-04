import {
  pgTable,
  uuid,
  varchar,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { paymentStatusEnum, initiatorTypeEnum } from "./enums";

export const paymentIntentsTable = pgTable(
  "payment_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(),
    initiatorType: initiatorTypeEnum("initiator_type").notNull(),
    initiatorId: uuid("initiator_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    metadata: jsonb("metadata"),
    providerReference: varchar("provider_reference", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payment_intents_initiator_idx").on(
      table.initiatorType,
      table.initiatorId,
    ),
    index("payment_intents_status_idx").on(table.status),
    index("payment_intents_provider_ref_idx").on(table.providerReference),
  ],
);

export const insertPaymentIntentSchema = createInsertSchema(
  paymentIntentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentIntent = typeof paymentIntentsTable.$inferSelect;
