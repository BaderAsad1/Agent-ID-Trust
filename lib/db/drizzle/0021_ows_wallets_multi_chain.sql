-- Migration: OWS wallets multi-chain support
-- Adds wallet_id and accounts columns to agent_ows_wallets.
-- Changes unique constraint from (agent_id, network) to agent_id only.
-- IMPORTANT: Deterministically deduplicates existing multi-row-per-agent records
--            before applying new unique index. Uses ROW_NUMBER() to handle ties.

--> statement-breakpoint
ALTER TABLE "agent_ows_wallets" ADD COLUMN IF NOT EXISTS "wallet_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "agent_ows_wallets" ADD COLUMN IF NOT EXISTS "accounts" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
-- Deduplicate: for each agent_id keep only one row (the most recently updated;
-- ties broken by id desc for determinism). Delete all other rows first.
DELETE FROM "agent_ows_wallets"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY agent_id
             ORDER BY updated_at DESC, id DESC
           ) AS rn
    FROM "agent_ows_wallets"
  ) ranked
  WHERE rn > 1
);
--> statement-breakpoint
-- Drop the old (agent_id, network) unique index now that data is deduplicated.
DROP INDEX IF EXISTS "agent_ows_wallets_agent_network_idx";
--> statement-breakpoint
-- Create the new agent_id-only unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ows_wallets_agent_idx" ON "agent_ows_wallets" USING btree ("agent_id");
