-- Handle foundations migration: NFT/subscription columns, new tables for registration log and OWS wallets
-- Note: stripe_customer_id on users and the subscriptions table already exist from earlier migrations
-- (0000 and 0003). This migration only adds the new columns and tables not previously defined.
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "chain_mints" jsonb DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "nft_status" varchar(20) DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "paid_through" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "grace_period_ends" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_status" varchar(20) DEFAULT 'active';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "handle_registration_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "handle" varchar(100) NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handle_registration_log" ADD CONSTRAINT "handle_registration_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handle_registration_log_user_id_idx" ON "handle_registration_log" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handle_registration_log_created_at_idx" ON "handle_registration_log" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_ows_wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "network" varchar(50) NOT NULL,
        "address" varchar(255) NOT NULL,
        "provider_wallet_id" varchar(255),
        "provider_policy_id" varchar(255),
        "is_self_custodial" boolean DEFAULT false NOT NULL,
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "metadata" text,
        "provisioned_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_ows_wallets" ADD CONSTRAINT "agent_ows_wallets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_ows_wallets" ADD CONSTRAINT "agent_ows_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallets_agent_id_idx" ON "agent_ows_wallets" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallets_user_id_idx" ON "agent_ows_wallets" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ows_wallets_agent_network_idx" ON "agent_ows_wallets" USING btree ("agent_id", "network");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_ows_wallets_address_idx" ON "agent_ows_wallets" USING btree ("address");
