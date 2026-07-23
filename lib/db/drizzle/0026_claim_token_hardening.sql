-- Claim Token Hardening (Task #147, AUDIT-002)
-- 1. Add expiresAt column to agent_claim_tokens for time-bounded one-time use
-- 2. Replace non-unique token index with a unique constraint (hashed tokens are unique)
-- 3. Owner tokens are now stored as SHA-256 hashes (no schema change needed — column is varchar(64))

-- Define the legacy table shape for databases created entirely from migrations.
CREATE TABLE IF NOT EXISTS agent_claim_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token VARCHAR(512) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_claim_tokens_agent_id_idx ON agent_claim_tokens (agent_id);
CREATE INDEX IF NOT EXISTS agent_claim_tokens_active_idx ON agent_claim_tokens (agent_id, is_active);

-- ============================================================
-- AUDIT-002: Add expiresAt column to agent_claim_tokens
-- Default existing rows to expired (they are legacy plaintext tokens and must be regenerated)
-- ============================================================
ALTER TABLE agent_claim_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Update existing active tokens to expire immediately (force regeneration)
UPDATE agent_claim_tokens
  SET expires_at = NOW()
  WHERE is_active = true AND is_used = false;

-- ============================================================
-- AUDIT-002: Replace non-unique index with unique constraint on token
-- ============================================================
DROP INDEX IF EXISTS agent_claim_tokens_token_idx;

CREATE UNIQUE INDEX IF NOT EXISTS agent_claim_tokens_token_unique_idx
  ON agent_claim_tokens (token);
