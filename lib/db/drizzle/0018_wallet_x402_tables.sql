-- Wallet columns on agents table
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_address" varchar(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_network" varchar(50);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_provisioned_at" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_policy_id" varchar(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_is_self_custodial" boolean NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_usdc_balance" varchar(100);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_last_balance_check" timestamp with time zone;

-- Agent wallet transactions table
CREATE TABLE IF NOT EXISTS "agent_wallet_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "tx_hash" varchar(255),
  "type" varchar(50) NOT NULL,
  "direction" varchar(20) NOT NULL,
  "amount" varchar(100) NOT NULL,
  "token" varchar(20) NOT NULL DEFAULT 'USDC',
  "from_address" varchar(255),
  "to_address" varchar(255),
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "description" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_wallet_txns_agent_id_idx" ON "agent_wallet_transactions" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_wallet_txns_tx_hash_idx" ON "agent_wallet_transactions" ("tx_hash");
CREATE INDEX IF NOT EXISTS "agent_wallet_txns_created_at_idx" ON "agent_wallet_transactions" ("created_at");

-- Agent spending rules table
CREATE TABLE IF NOT EXISTS "agent_spending_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "max_per_transaction_cents" integer NOT NULL DEFAULT 1000,
  "daily_cap_cents" integer NOT NULL DEFAULT 5000,
  "monthly_cap_cents" integer NOT NULL DEFAULT 50000,
  "allowed_addresses" jsonb DEFAULT '[]'::jsonb,
  "cdp_policy_id" varchar(255),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_spending_rules_agent_id_idx" ON "agent_spending_rules" ("agent_id");

-- x402 payments table
CREATE TABLE IF NOT EXISTS "x402_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(255) NOT NULL,
  "amount_usdc" varchar(100) NOT NULL,
  "payment_type" varchar(100) NOT NULL,
  "resource_id" varchar(255),
  "payer_address" varchar(255),
  "payee_address" varchar(255),
  "tx_hash" varchar(255),
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "error_message" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "x402_payments_idempotency_key_idx" ON "x402_payments" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "x402_payments_agent_id_idx" ON "x402_payments" ("agent_id");
CREATE INDEX IF NOT EXISTS "x402_payments_status_idx" ON "x402_payments" ("status");
