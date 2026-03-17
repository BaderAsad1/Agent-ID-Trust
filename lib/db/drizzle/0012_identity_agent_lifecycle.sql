ALTER TYPE "public"."agent_status" ADD VALUE 'revoked';
ALTER TYPE "public"."key_status" ADD VALUE 'expired';

CREATE TYPE "public"."key_purpose" AS ENUM('signing', 'encryption', 'recovery', 'delegation');

ALTER TABLE "agents" ADD COLUMN "revoked_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "agents" ADD COLUMN "revocation_reason" VARCHAR(100);
ALTER TABLE "agents" ADD COLUMN "revocation_statement" TEXT;

ALTER TABLE "agent_keys" ADD COLUMN "purpose" "key_purpose";
ALTER TABLE "agent_keys" ADD COLUMN "auto_rotate_days" INTEGER;

CREATE INDEX IF NOT EXISTS "agents_revoked_at_idx" ON "agents" ("revoked_at");
CREATE INDEX IF NOT EXISTS "agent_keys_purpose_status_idx" ON "agent_keys" ("agent_id", "purpose", "status");
CREATE INDEX IF NOT EXISTS "agent_keys_expires_at_idx" ON "agent_keys" ("expires_at");
