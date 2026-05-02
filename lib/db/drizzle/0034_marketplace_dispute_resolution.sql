ALTER TABLE "marketplace_disputes"
  ADD COLUMN IF NOT EXISTS "evidence" text,
  ADD COLUMN IF NOT EXISTS "seller_response" text,
  ADD COLUMN IF NOT EXISTS "responded_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "resolution" varchar(32),
  ADD COLUMN IF NOT EXISTS "resolved_by_user_id" uuid REFERENCES "users"("id");
