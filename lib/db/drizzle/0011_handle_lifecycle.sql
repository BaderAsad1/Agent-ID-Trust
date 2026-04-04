ALTER TABLE "agents" ADD COLUMN "handle_expires_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "agents" ADD COLUMN "handle_registered_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "agents" ADD COLUMN "handle_tier" VARCHAR(50);
ALTER TABLE "agents" ADD COLUMN "annual_price_usd" INTEGER;
ALTER TABLE "agents" ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN "renewal_notified_at" TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS "agents_handle_expires_at_idx" ON "agents" ("handle_expires_at");

CREATE TABLE IF NOT EXISTS "handle_auctions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "handle" VARCHAR(100) NOT NULL,
  "start_price" INTEGER NOT NULL,
  "reserve_price" INTEGER NOT NULL,
  "current_price" INTEGER NOT NULL,
  "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "winner_id" UUID,
  "winner_stripe_session_id" VARCHAR(255),
  "settled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "handle_auctions_handle_active_idx" ON "handle_auctions" ("handle") WHERE settled = false;
CREATE INDEX IF NOT EXISTS "handle_auctions_ends_at_idx" ON "handle_auctions" ("ends_at");
CREATE INDEX IF NOT EXISTS "handle_auctions_settled_idx" ON "handle_auctions" ("settled");

CREATE TABLE IF NOT EXISTS "handle_trademark_claims" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "handle" VARCHAR(100) NOT NULL,
  "claimant_name" VARCHAR(255) NOT NULL,
  "claimant_email" VARCHAR(255) NOT NULL,
  "trademark_number" VARCHAR(100),
  "jurisdiction" VARCHAR(100),
  "evidence" TEXT,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "reviewed_at" TIMESTAMP WITH TIME ZONE,
  "review_notes" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "handle_trademark_claims_handle_idx" ON "handle_trademark_claims" ("handle");
CREATE INDEX IF NOT EXISTS "handle_trademark_claims_status_idx" ON "handle_trademark_claims" ("status");
