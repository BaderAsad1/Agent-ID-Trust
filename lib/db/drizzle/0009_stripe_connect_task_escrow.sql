ALTER TABLE "agents" ADD COLUMN "stripe_connect_account_id" text;
ALTER TABLE "agents" ADD COLUMN "stripe_connect_status" varchar(50);
ALTER TABLE "tasks" ADD COLUMN "payment_intent_id" varchar(255);
ALTER TABLE "tasks" ADD COLUMN "payment_amount" integer;
ALTER TABLE "tasks" ADD COLUMN "payment_status" varchar(50);
CREATE UNIQUE INDEX IF NOT EXISTS "agents_stripe_connect_account_id_idx" ON "agents" ("stripe_connect_account_id");
