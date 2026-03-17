ALTER TABLE "public"."agent_messages" ADD COLUMN IF NOT EXISTS "is_draft" boolean NOT NULL DEFAULT false;
