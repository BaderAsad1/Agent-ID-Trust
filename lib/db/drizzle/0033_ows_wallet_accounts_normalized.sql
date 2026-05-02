-- Migration: normalize OWS wallet accounts into an indexed table + GIN index on JSONB
--
-- Replaces the in-process JS scan in /api/v1/resolve/address/:address (formerly
-- TODO at resolve.ts ~L589) with a B-tree-indexed lookup.
--
-- Two complementary changes:
--   1. New table `agent_ows_wallet_accounts` with one row per CAIP-10 account
--      and indexes on (namespace, address_lower) and (address_lower).
--   2. GIN index on `agent_ows_wallets.accounts` JSONB so any straggler caller
--      hitting that column still gets index-backed `@>` containment queries.
--
-- Backfill is idempotent (ON CONFLICT DO NOTHING) — safe to re-run.

CREATE TABLE IF NOT EXISTS "agent_ows_wallet_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE cascade,
  "ows_wallet_id" uuid NOT NULL REFERENCES "agent_ows_wallets"("id") ON DELETE cascade,
  "caip10" text NOT NULL,
  "namespace" varchar(32) NOT NULL,
  "chain_reference" varchar(64) NOT NULL,
  "address" varchar(255) NOT NULL,
  "address_lower" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ows_wallet_accounts_agent_caip10_idx"
  ON "agent_ows_wallet_accounts" USING btree ("agent_id", "caip10");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallet_accounts_agent_id_idx"
  ON "agent_ows_wallet_accounts" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallet_accounts_ows_wallet_id_idx"
  ON "agent_ows_wallet_accounts" USING btree ("ows_wallet_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallet_accounts_address_lower_idx"
  ON "agent_ows_wallet_accounts" USING btree ("address_lower");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallet_accounts_namespace_address_lower_idx"
  ON "agent_ows_wallet_accounts" USING btree ("namespace", "address_lower");
--> statement-breakpoint
-- Backfill from the existing JSONB array. Only valid CAIP-10 strings
-- ("namespace:reference:address") are inserted; raw addresses (legacy data
-- from provisionOwsWallet pre-fix) are skipped because they fail the 3-part check.
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
--> statement-breakpoint
-- GIN index on the JSONB accounts column. Enables containment queries like
-- `accounts @> '["eip155:8453:0x…"]'::jsonb` to use the index instead of a
-- sequential scan over every row.
CREATE INDEX IF NOT EXISTS "agent_ows_wallets_accounts_gin_idx"
  ON "agent_ows_wallets" USING gin ("accounts");
