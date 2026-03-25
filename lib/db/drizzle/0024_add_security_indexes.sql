CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_hashed_token" ON "magic_link_tokens" ("hashed_token");
CREATE INDEX IF NOT EXISTS "idx_agents_user_id_status" ON "agents" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_api_keys_hashed_key" ON "api_keys" ("hashed_key");
CREATE INDEX IF NOT EXISTS "idx_auth_nonces_nonce_agent_consumed_expires" ON "auth_nonces" ("nonce", "agent_id", "consumed_at", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_agent_activity_log_agent_created" ON "agent_activity_log" ("agent_id", "created_at");
