CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_hashed_token" ON "magic_link_tokens" ("hashed_token");
CREATE INDEX IF NOT EXISTS "idx_agents_user_id_status" ON "agents" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_api_keys_hashed_key" ON "api_keys" ("hashed_key");
CREATE TABLE IF NOT EXISTS "auth_nonces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nonce" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "audience" varchar(500),
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "auth_nonces_nonce_idx" ON "auth_nonces" ("nonce");
CREATE INDEX IF NOT EXISTS "auth_nonces_agent_id_idx" ON "auth_nonces" ("agent_id");
CREATE INDEX IF NOT EXISTS "auth_nonces_expires_at_idx" ON "auth_nonces" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_auth_nonces_nonce_agent_consumed_expires" ON "auth_nonces" ("nonce", "agent_id", "consumed_at", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_agent_activity_log_agent_created" ON "agent_activity_log" ("agent_id", "created_at");
