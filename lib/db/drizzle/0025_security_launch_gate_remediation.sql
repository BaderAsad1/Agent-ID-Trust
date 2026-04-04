-- Security Launch Gate Remediation (Task #147)
-- AUDIT-013: Unique index on hashed_key in api_keys table
-- AUDIT-014: Unique index on provider_subscription_id in subscriptions table
-- AUDIT-015: Narrow handle column to 32 chars (aligns with validator)
-- AUDIT-011: Webhook secrets are now encrypted at application layer (no schema change needed)

-- ============================================================
-- AUDIT-013: Remove duplicate hashed_key entries first, then add unique constraint
-- ============================================================
DELETE FROM api_keys
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY hashed_key ORDER BY created_at ASC) AS rn
    FROM api_keys
    WHERE revoked_at IS NULL
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hashed_key_unique_idx
  ON api_keys (hashed_key);

-- ============================================================
-- AUDIT-014: Remove duplicate provider_subscription_id entries, then add unique constraint
-- ============================================================
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY provider_subscription_id ORDER BY created_at ASC) AS rn
    FROM subscriptions
    WHERE provider_subscription_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_sub_id_unique_idx
  ON subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ============================================================
-- AUDIT-015: Narrow handle column from 100 to 32 characters
-- Truncation guard: reject any existing handles > 32 chars before altering.
-- In practice this should be a no-op since the validator enforces max 32.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM agents WHERE handle IS NOT NULL AND length(handle) > 32
  ) THEN
    RAISE EXCEPTION 'Cannot narrow handle column: existing handles exceed 32 characters. Investigate data before running this migration.';
  END IF;
END $$;

ALTER TABLE agents ALTER COLUMN handle TYPE VARCHAR(32);
