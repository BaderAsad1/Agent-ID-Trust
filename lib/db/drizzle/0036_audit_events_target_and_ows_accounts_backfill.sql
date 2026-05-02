-- Migration: convert post-merge "ensures" into a real migration.
--
-- Two idempotent operations previously executed by scripts/post-merge.sh:
--
--   1. audit_events: add target/ip/user-agent columns. Schema in
--      lib/db/src/schema/audit-events.ts already declares them; production
--      already has them (drizzle-kit push created them at the schema sizes).
--
--   2. agent_ows_wallet_accounts: backfill normalized rows from the JSONB
--      `accounts` column on agent_ows_wallets. Originally added by
--      0033_ows_wallet_accounts_normalized.sql but re-asserted on every
--      post-merge because drizzle-kit push only syncs schema, not data.
--
-- All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING so this migration
-- is a no-op against any database where the post-merge ensures have run
-- (i.e. production), and produces the same final shape on a fresh DB.

ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "target_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "target_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "ip_address" varchar(64),
  ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_target_idx"
  ON "audit_events" USING btree ("target_type", "target_id");
--> statement-breakpoint
INSERT INTO "agent_ows_wallet_accounts"
  ("agent_id", "ows_wallet_id", "caip10", "namespace", "chain_reference", "address", "address_lower")
SELECT
  w.agent_id,
  w.id AS ows_wallet_id,
  account_text AS caip10,
  split_part(account_text, ':', 1) AS namespace,
  split_part(account_text, ':', 2) AS chain_reference,
  split_part(account_text, ':', 3) AS address,
  lower(split_part(account_text, ':', 3)) AS address_lower
FROM "agent_ows_wallets" w
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(w.accounts, '[]'::jsonb)) AS account_text
WHERE
  array_length(string_to_array(account_text, ':'), 1) = 3
  AND length(split_part(account_text, ':', 1)) > 0
  AND length(split_part(account_text, ':', 2)) > 0
  AND length(split_part(account_text, ':', 3)) > 0
ON CONFLICT ("agent_id", "caip10") DO NOTHING;
