CREATE TABLE IF NOT EXISTS "undeliverable_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_address" varchar(255) NOT NULL,
  "sender_address" varchar(255) NOT NULL,
  "subject" varchar(500),
  "body" text NOT NULL,
  "body_format" varchar(20) DEFAULT 'text' NOT NULL,
  "external_message_id" varchar(500),
  "reason" varchar(100) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "undeliverable_messages_recipient_idx" ON "undeliverable_messages" USING btree ("recipient_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "undeliverable_messages_expires_at_idx" ON "undeliverable_messages" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "undeliverable_messages_created_at_idx" ON "undeliverable_messages" USING btree ("created_at");
--> statement-breakpoint
UPDATE "agent_inboxes" SET "address" = REPLACE("address", '@agents.local', '@getagent.id') WHERE "address" LIKE '%@agents.local';
--> statement-breakpoint
UPDATE "agent_inboxes" SET "address_domain" = 'getagent.id' WHERE "address_domain" = 'agents.local';
