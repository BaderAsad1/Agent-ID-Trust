-- Performance Indexes (Task: Backend Performance Audit)
-- 1. Case-insensitive wallet address lookup (reverse lookup by wallet)
-- 2. Case-insensitive on-chain owner lookup
-- 3. Composite (is_public, status) for marketplace queries
-- 4. Composite (handle, status, is_public) for resolution hot path
--
-- Note: CONCURRENTLY is omitted here because Drizzle's migrate() wraps
-- each migration in a transaction, and Postgres does not allow CREATE INDEX
-- CONCURRENTLY inside a transaction. These statements are lightweight
-- on a small or idle table. For zero-downtime index creation on a live
-- large table, run the CONCURRENTLY variant manually outside of the
-- migration runner and mark this migration as already applied.

CREATE INDEX IF NOT EXISTS "agents_wallet_address_lower_idx"
  ON "agents" (lower("wallet_address"))
  WHERE "wallet_address" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_on_chain_owner_lower_idx"
  ON "agents" (lower("on_chain_owner"))
  WHERE "on_chain_owner" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_is_public_status_idx"
  ON "agents" ("is_public", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_handle_status_is_public_idx"
  ON "agents" ("handle", "status", "is_public")
  WHERE "handle" IS NOT NULL;
