-- Identity Architecture Rebuild: enterprise plan enum, handle identity model tables

-- Add enterprise value to subscription_plan enum (safe, idempotent)
ALTER TYPE "subscription_plan" ADD VALUE IF NOT EXISTS 'enterprise';

-- Add handle identity model columns to agents (idempotent)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_is_onchain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_stripe_subscription_id" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_renewal_notified_at" TIMESTAMP WITH TIME ZONE;

-- Add on-chain identity fields (idempotent)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_token_id" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_owner" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_tx_hash" VARCHAR(255);

-- Add plan/billing activation state fields (idempotent)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "plan_tier" VARCHAR(50);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "inbox_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "api_access" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "trust_score_active" BOOLEAN NOT NULL DEFAULT true;

-- Add agentic payment authorization fields (idempotent)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "payment_authorized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "authorized_spend_limit_cents" INTEGER NOT NULL DEFAULT 0;

-- Indexes for handle identity enforcement
CREATE INDEX IF NOT EXISTS "agents_handle_paid_idx" ON "agents" ("handle_paid");
CREATE INDEX IF NOT EXISTS "agents_handle_onchain_idx" ON "agents" ("handle_is_onchain");

-- Handle payments table (tracks paid handle registrations and renewals)
CREATE TABLE IF NOT EXISTS "handle_payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" UUID NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "handle" VARCHAR(100) NOT NULL,
  "tier" VARCHAR(50) NOT NULL,
  "annual_price_cents" INTEGER NOT NULL,
  "stripe_session_id" VARCHAR(255),
  "stripe_subscription_id" VARCHAR(255),
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "payment_method" VARCHAR(50),
  "tx_hash" VARCHAR(255),
  "is_onchain" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "handle_payments_agent_id_idx" ON "handle_payments" ("agent_id");
CREATE INDEX IF NOT EXISTS "handle_payments_user_id_idx" ON "handle_payments" ("user_id");
CREATE INDEX IF NOT EXISTS "handle_payments_handle_idx" ON "handle_payments" ("handle");
CREATE INDEX IF NOT EXISTS "handle_payments_status_idx" ON "handle_payments" ("status");

-- Agentic payment authorizations table (agent spend limits set by owner)
CREATE TABLE IF NOT EXISTS "agentic_payment_authorizations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" UUID NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "authorized_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "spend_limit_cents" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "payment_method" VARCHAR(50),
  "stripe_payment_method_id" VARCHAR(255),
  "stripe_customer_id" VARCHAR(255),
  "expires_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agentic_payment_auth_agent_id_idx" ON "agentic_payment_authorizations" ("agent_id");
CREATE INDEX IF NOT EXISTS "agentic_payment_auth_user_id_idx" ON "agentic_payment_authorizations" ("authorized_by_user_id");
CREATE INDEX IF NOT EXISTS "agentic_payment_auth_active_idx" ON "agentic_payment_authorizations" ("is_active");
