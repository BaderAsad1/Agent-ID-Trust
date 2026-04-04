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
import { paymentIntentsTable } from "./payment-intents";
import { paymentStatusEnum } from "./enums";

export const paymentAuthorizationsTable = pgTable(
  "payment_authorizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntentsTable.id),
    provider: varchar("provider", { length: 50 }).notNull(),
    authorizationType: varchar("authorization_type", { length: 50 }).notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payment_authorizations_intent_id_idx").on(table.paymentIntentId),
    index("payment_authorizations_status_idx").on(table.status),
  ],
);

export const insertPaymentAuthorizationSchema = createInsertSchema(
  paymentAuthorizationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentAuthorization = z.infer<
  typeof insertPaymentAuthorizationSchema
>;
export type PaymentAuthorization =
  typeof paymentAuthorizationsTable.$inferSelect;
