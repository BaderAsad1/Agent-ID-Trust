CREATE TABLE IF NOT EXISTS "marketplace_order_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "marketplace_orders"("id") ON DELETE cascade,
  "sender_role" varchar(20) NOT NULL,
  "sender_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_order_messages_order_id_idx"
  ON "marketplace_order_messages" ("order_id");

CREATE INDEX IF NOT EXISTS "marketplace_order_messages_created_at_idx"
  ON "marketplace_order_messages" ("created_at");
