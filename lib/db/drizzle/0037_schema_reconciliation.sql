-- Migration 0037: reconcile tables and columns that historically existed only through schema push.
-- Every operation is additive/idempotent so this is safe for databases that were
-- already synchronized with drizzle-kit push as well as brand-new databases.

DO $$
BEGIN
  CREATE TYPE "public"."key_purpose" AS ENUM('signing', 'encryption', 'recovery', 'delegation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TYPE "public"."agent_status" ADD VALUE IF NOT EXISTS 'revoked';--> statement-breakpoint
ALTER TYPE "public"."business_status" ADD VALUE IF NOT EXISTS 'in_progress' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."key_status" ADD VALUE IF NOT EXISTS 'rotating' BEFORE 'revoked';--> statement-breakpoint
ALTER TYPE "public"."key_status" ADD VALUE IF NOT EXISTS 'expired';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'none' BEFORE 'free';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'builder' AFTER 'starter';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "resolution_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "handle" varchar(255) NOT NULL,
  "resolved_agent_id" uuid,
  "client_type" varchar(50),
  "response_time_ms" integer,
  "cache_hit" varchar(10),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resolution_events_handle_idx" ON "resolution_events" ("handle");
CREATE INDEX IF NOT EXISTS "resolution_events_created_at_idx" ON "resolution_events" ("created_at");
CREATE INDEX IF NOT EXISTS "resolution_events_agent_id_idx" ON "resolution_events" ("resolved_agent_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "human_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "handle" varchar(100) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "bio" text,
  "avatar_url" text,
  "is_verified" boolean DEFAULT false NOT NULL,
  "is_public" boolean DEFAULT true NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "human_profiles_handle_idx" ON "human_profiles" ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "human_profiles_owner_user_id_idx" ON "human_profiles" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "human_profiles_is_public_idx" ON "human_profiles" ("is_public");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_key_rotation_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "old_key_id" uuid NOT NULL REFERENCES "agent_keys"("id"),
  "new_key_id" uuid NOT NULL REFERENCES "agent_keys"("id"),
  "rotation_reason" varchar(255),
  "rotated_by_kid" varchar(255),
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_key_rotation_log_agent_id_idx" ON "agent_key_rotation_log" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_key_rotation_log_old_key_idx" ON "agent_key_rotation_log" ("old_key_id");
CREATE INDEX IF NOT EXISTS "agent_key_rotation_log_new_key_idx" ON "agent_key_rotation_log" ("new_key_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_delivery_at" timestamp with time zone,
  "disabled_at" timestamp with time zone,
  "disable_reason" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_webhooks_agent_id_idx" ON "agent_webhooks" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_webhooks_active_idx" ON "agent_webhooks" ("active");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" uuid NOT NULL REFERENCES "agent_webhooks"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "event" varchar(100) NOT NULL,
  "payload" jsonb,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "http_status" integer,
  "response_body" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_agent_id_idx" ON "webhook_deliveries" ("agent_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx" ON "webhook_deliveries" ("status");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_next_retry_idx" ON "webhook_deliveries" ("next_retry_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "task_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "sender_type" varchar(50) NOT NULL,
  "sender_id" uuid,
  "message_type" varchar(50) DEFAULT 'text' NOT NULL,
  "content" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_messages_task_id_idx" ON "task_messages" ("task_id");
CREATE INDEX IF NOT EXISTS "task_messages_created_at_idx" ON "task_messages" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_attestations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attester_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "sentiment" varchar(20) NOT NULL,
  "category" varchar(100),
  "content" text,
  "signature" text NOT NULL,
  "attester_trust_score" real DEFAULT 0 NOT NULL,
  "weight" real DEFAULT 1 NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_attestations_attester_id_idx" ON "agent_attestations" ("attester_id");
CREATE INDEX IF NOT EXISTS "agent_attestations_subject_id_idx" ON "agent_attestations" ("subject_id");
CREATE INDEX IF NOT EXISTS "agent_attestations_sentiment_idx" ON "agent_attestations" ("sentiment");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_attestations_active_unique_idx" ON "agent_attestations" ("attester_id", "subject_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_signed_activity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "sequence_number" integer NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "payload" jsonb,
  "previous_hash" varchar(128),
  "current_hash" varchar(128) NOT NULL,
  "signature" text,
  "is_public" varchar(10) DEFAULT 'false' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_signed_activity_agent_id_idx" ON "agent_signed_activity" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_signed_activity_seq_idx" ON "agent_signed_activity" ("agent_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "agent_signed_activity_event_type_idx" ON "agent_signed_activity" ("event_type");
CREATE INDEX IF NOT EXISTS "agent_signed_activity_created_at_idx" ON "agent_signed_activity" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_wallet_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "tx_hash" varchar(255),
  "type" varchar(50) NOT NULL,
  "direction" varchar(20) NOT NULL,
  "amount" varchar(100) NOT NULL,
  "token" varchar(20) DEFAULT 'USDC' NOT NULL,
  "from_address" varchar(255),
  "to_address" varchar(255),
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "description" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_wallet_txns_agent_id_idx" ON "agent_wallet_transactions" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_wallet_txns_tx_hash_idx" ON "agent_wallet_transactions" ("tx_hash");
CREATE INDEX IF NOT EXISTS "agent_wallet_txns_created_at_idx" ON "agent_wallet_transactions" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_spending_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "max_per_transaction_cents" integer DEFAULT 1000 NOT NULL,
  "daily_cap_cents" integer DEFAULT 5000 NOT NULL,
  "monthly_cap_cents" integer DEFAULT 50000 NOT NULL,
  "allowed_addresses" jsonb DEFAULT '[]'::jsonb,
  "cdp_policy_id" varchar(255),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_spending_rules_agent_id_idx" ON "agent_spending_rules" ("agent_id");--> statement-breakpoint

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
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "x402_payments_idempotency_key_idx" ON "x402_payments" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "x402_payments_agent_id_idx" ON "x402_payments" ("agent_id");
CREATE INDEX IF NOT EXISTS "x402_payments_status_idx" ON "x402_payments" ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agentid_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "audience" varchar(500),
  "scopes" jsonb DEFAULT '[]'::jsonb,
  "trust_tier" varchar(50),
  "verification_status" varchar(50),
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" varchar(255),
  "ip_address" varchar(64),
  "user_agent" varchar(512),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agentid_sessions_session_id_idx" ON "agentid_sessions" ("session_id");
CREATE INDEX IF NOT EXISTS "agentid_sessions_agent_id_idx" ON "agentid_sessions" ("agent_id");
CREATE INDEX IF NOT EXISTS "agentid_sessions_expires_at_idx" ON "agentid_sessions" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" varchar(64) NOT NULL UNIQUE,
  "client_secret_hash" varchar(255),
  "name" varchar(255) NOT NULL,
  "description" text,
  "icon_url" varchar(2048),
  "redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "grant_types" jsonb DEFAULT '["authorization_code"]'::jsonb NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_client_id_idx" ON "oauth_clients" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_clients_owner_user_id_idx" ON "oauth_clients" ("owner_user_id");
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "icon_url" varchar(2048);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(128) NOT NULL UNIQUE,
  "client_id" varchar(64) NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "redirect_uri" varchar(2048),
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "code_challenge" varchar(256),
  "code_challenge_method" varchar(10),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_code_idx" ON "oauth_authorization_codes" ("code");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_client_id_idx" ON "oauth_authorization_codes" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_agent_id_idx" ON "oauth_authorization_codes" ("agent_id");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_expires_at_idx" ON "oauth_authorization_codes" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_id" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "client_id" varchar(64) REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "access_token_hash" varchar(255) NOT NULL,
  "refresh_token_hash" varchar(255),
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "trust_tier" varchar(50),
  "verification_status" varchar(50),
  "owner_type" varchar(50) DEFAULT 'none',
  "grant_type" varchar(100) NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_reason" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_token_id_idx" ON "oauth_tokens" ("token_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_agent_id_idx" ON "oauth_tokens" ("agent_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_client_id_idx" ON "oauth_tokens" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_access_token_hash_idx" ON "oauth_tokens" ("access_token_hash");
CREATE INDEX IF NOT EXISTS "oauth_tokens_refresh_token_hash_idx" ON "oauth_tokens" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "oauth_tokens_expires_at_idx" ON "oauth_tokens" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_claim_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "action" varchar(50) NOT NULL,
  "from_owner" varchar(255),
  "to_owner" varchar(255),
  "performed_by_user_id" uuid,
  "evidence_hash" varchar(255),
  "notes" text,
  "dispute_status" varchar(50),
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" uuid,
  "resolution_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_claim_history_agent_id_idx" ON "agent_claim_history" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_claim_history_action_idx" ON "agent_claim_history" ("action");
CREATE INDEX IF NOT EXISTS "agent_claim_history_created_at_idx" ON "agent_claim_history" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL UNIQUE,
  "source" varchar(50) DEFAULT 'website',
  "ip_hash" varchar(64),
  "user_agent" varchar(500),
  "referrer" varchar(2000),
  "notified" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_email_idx" ON "waitlist" ("email");
CREATE INDEX IF NOT EXISTS "waitlist_created_at_idx" ON "waitlist" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "submitter_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "value" integer NOT NULL,
  "value_decimals" integer DEFAULT 0 NOT NULL,
  "tag1" varchar(255),
  "chain" varchar(100) NOT NULL,
  "onchain_tx_hash" varchar(255),
  "onchain_status" varchar(50),
  "error_message" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_feedback_subject_agent_id_idx" ON "agent_feedback" ("subject_agent_id");
CREATE INDEX IF NOT EXISTS "agent_feedback_submitter_agent_id_idx" ON "agent_feedback" ("submitter_agent_id");
CREATE INDEX IF NOT EXISTS "agent_feedback_created_at_idx" ON "agent_feedback" ("created_at");
CREATE INDEX IF NOT EXISTS "agent_feedback_chain_idx" ON "agent_feedback" ("chain");--> statement-breakpoint

ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "target_type" varchar(50);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "target_id" varchar(255);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "ip_address" varchar(64);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);
CREATE INDEX IF NOT EXISTS "audit_events_target_idx" ON "audit_events" ("target_type", "target_id");--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "replit_user_id" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provider" varchar(20) DEFAULT 'replit' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provider_id" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_username" varchar(255);
CREATE INDEX IF NOT EXISTS "users_provider_id_idx" ON "users" ("provider", "provider_id");--> statement-breakpoint

ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "rotated_at" timestamp with time zone;
ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "rotated_by_kid" varchar(255);
ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "rotation_reason" varchar(255);
ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "purpose" "key_purpose";
ALTER TABLE "agent_keys" ADD COLUMN IF NOT EXISTS "auto_rotate_days" integer;
CREATE INDEX IF NOT EXISTS "agent_keys_agent_id_status_idx" ON "agent_keys" ("agent_id", "status");--> statement-breakpoint

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "included_handle_claimed" varchar(64);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "included_handle_claimed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "rating" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "trust_credit_eligible" boolean DEFAULT true NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_idempotency_key_idx" ON "tasks" ("idempotency_key");--> statement-breakpoint

ALTER TABLE "nft_audit_log" ALTER COLUMN "operation" DROP NOT NULL;
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "action" varchar(50);
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "token_id" varchar(255);
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "contract_address" varchar(255);
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "custodian" varchar(50);
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'success' NOT NULL;
ALTER TABLE "nft_audit_log" ADD COLUMN IF NOT EXISTS "error_message" text;
CREATE INDEX IF NOT EXISTS "nft_audit_log_action_idx" ON "nft_audit_log" ("action");--> statement-breakpoint

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "org_id" uuid;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "org_namespace" varchar(200);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_policy_id" varchar(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_usdc_balance" varchar(100);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "wallet_last_balance_check" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "owner_verified_at" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "owner_verification_method" varchar(50);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "is_claimed" boolean DEFAULT false NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "revocation_reason" varchar(100);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "revocation_statement" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "nft_custodian" varchar(20);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "nft_owner_wallet" varchar(255);
ALTER TABLE "agents" ALTER COLUMN "erc8004_agent_id" TYPE varchar(255) USING "erc8004_agent_id"::text;
CREATE INDEX IF NOT EXISTS "agents_user_id_status_idx" ON "agents" ("user_id", "status");--> statement-breakpoint

ALTER TABLE "agent_claim_tokens" ALTER COLUMN "expires_at" DROP DEFAULT;
