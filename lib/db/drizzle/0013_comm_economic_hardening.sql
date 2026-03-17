-- E2E message encryption columns
ALTER TABLE "agent_messages" ADD COLUMN IF NOT EXISTS "is_encrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agent_messages" ADD COLUMN IF NOT EXISTS "encryption_kid" VARCHAR(255);

-- Message threading: thread_id, reply_to_id, thread_subject on messages
-- (thread_id already exists as FK to agent_threads; add reply_to_id and thread_subject)
ALTER TABLE "agent_messages" ADD COLUMN IF NOT EXISTS "reply_to_id" UUID REFERENCES "agent_messages"("id") ON DELETE SET NULL;
ALTER TABLE "agent_messages" ADD COLUMN IF NOT EXISTS "thread_subject" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "agent_messages_reply_to_id_idx" ON "agent_messages" ("reply_to_id");
CREATE INDEX IF NOT EXISTS "agent_messages_is_encrypted_idx" ON "agent_messages" ("is_encrypted");

-- Task escrow columns
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escrow_amount" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escrow_currency" VARCHAR(10) DEFAULT 'usd';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escrow_status" VARCHAR(20) DEFAULT 'none';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "escrow_release_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "tasks_escrow_status_idx" ON "tasks" ("escrow_status");
CREATE INDEX IF NOT EXISTS "tasks_escrow_release_at_idx" ON "tasks" ("escrow_release_at");
