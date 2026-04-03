-- Task 168: Dual-rail Agentic Marketplace Commerce Engine
-- Adds: marketplace_milestones, marketplace_disputes, a2a_service_listings,
--       marketplace_analytics_events, a2a_payout_queue
-- Extends: marketplace_orders (parent_order_id, escrow_payment_intent_id, released_amount, payment_rail, x402_payment_id, platform_fee_usdc, provider_usdc_address, orchestrator_agent_id, selected_package)
--
-- NOTE: Schema was applied to the database via `drizzle-kit push --force`.
-- This file serves as the migration record for environments using the file-based runner.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_milestones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "order_id" uuid NOT NULL REFERENCES "marketplace_orders"("id") ON DELETE CASCADE,
        "title" varchar(255) NOT NULL,
        "description" text,
        "amount" numeric(12, 2) NOT NULL,
        "due_at" timestamp with time zone,
        "status" varchar(50) DEFAULT 'pending' NOT NULL,
        "stripe_payment_intent_id" varchar(255),
        "captured_amount" numeric(12, 2),
        "completed_at" timestamp with time zone,
        "approved_at" timestamp with time zone,
        "released_at" timestamp with time zone,
        "sort_order" varchar(10) DEFAULT '0',
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_milestones_order_id_idx" ON "marketplace_milestones" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_milestones_status_idx" ON "marketplace_milestones" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_disputes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "order_id" uuid NOT NULL REFERENCES "marketplace_orders"("id") ON DELETE CASCADE,
        "raised_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
        "reason" varchar(255) NOT NULL,
        "description" text,
        "status" varchar(50) DEFAULT 'open' NOT NULL,
        "admin_note" text,
        "resolved_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_disputes_order_id_idx" ON "marketplace_disputes" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_disputes_status_idx" ON "marketplace_disputes" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_disputes_raised_by_idx" ON "marketplace_disputes" ("raised_by_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "a2a_service_listings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "description" text,
        "capability_type" varchar(100) NOT NULL,
        "capability_schema" jsonb,
        "latency_sla_ms" integer,
        "max_concurrent_calls" integer DEFAULT 10 NOT NULL,
        "pricing_model" varchar(50) DEFAULT 'per_call' NOT NULL,
        "price_per_call_usdc" numeric(18, 6),
        "price_per_token_usdc" numeric(18, 9),
        "price_per_second_usdc" numeric(18, 9),
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "tags" jsonb DEFAULT '[]',
        "endpoint_path" varchar(500),
        "requires_auth" boolean DEFAULT true NOT NULL,
        "total_calls" integer DEFAULT 0 NOT NULL,
        "success_rate" numeric(5, 2),
        "avg_latency_ms" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_service_listings_agent_id_idx" ON "a2a_service_listings" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_service_listings_user_id_idx" ON "a2a_service_listings" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_service_listings_capability_type_idx" ON "a2a_service_listings" ("capability_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_service_listings_status_idx" ON "a2a_service_listings" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_service_listings_pricing_model_idx" ON "a2a_service_listings" ("pricing_model");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_analytics_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_type" varchar(100) NOT NULL,
        "listing_id" uuid REFERENCES "marketplace_listings"("id") ON DELETE CASCADE,
        "user_id" uuid,
        "agent_id" uuid,
        "metadata" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_analytics_events_listing_id_idx" ON "marketplace_analytics_events" ("listing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_analytics_events_event_type_idx" ON "marketplace_analytics_events" ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_analytics_events_created_at_idx" ON "marketplace_analytics_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_analytics_events_user_id_idx" ON "marketplace_analytics_events" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "a2a_payout_queue" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "call_id" varchar(255) NOT NULL,
        "service_id" uuid NOT NULL,
        "payment_id" varchar(255),
        "tx_hash" varchar(255),
        "caller_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE SET NULL,
        "provider_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE SET NULL,
        "provider_wallet_address" varchar(255),
        "provider_payout_usdc" numeric(18, 6) NOT NULL,
        "platform_fee_usdc" numeric(18, 6) NOT NULL,
        "status" varchar(50) DEFAULT 'pending' NOT NULL,
        "error_message" text,
        "processed_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_payout_queue_status_idx" ON "a2a_payout_queue" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_payout_queue_provider_agent_idx" ON "a2a_payout_queue" ("provider_agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2a_payout_queue_call_id_idx" ON "a2a_payout_queue" ("call_id");
--> statement-breakpoint
-- New columns on marketplace_orders
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "orchestrator_agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "parent_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "escrow_payment_intent_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "released_amount" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "payment_rail" varchar(20) DEFAULT 'stripe' NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "x402_payment_id" uuid;
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "platform_fee_usdc" numeric(18, 6);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "provider_usdc_address" varchar(255);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "selected_package" varchar(100);
--> statement-breakpoint
-- New columns on marketplace_listings
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "listing_mode" varchar(10) DEFAULT 'h2a' NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "packages" jsonb DEFAULT '[]';
