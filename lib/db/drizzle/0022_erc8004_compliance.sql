-- ERC-8004 compliance migration
-- Adds erc8004_agent_id, erc8004_chain, erc8004_registry, chain_registrations columns to agents table
-- Creates nft_audit_log table for on-chain operation tracking

--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "erc8004_agent_id" integer;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "erc8004_chain" varchar(100);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "erc8004_registry" varchar(255);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "chain_registrations" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nft_audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_id" uuid,
        "handle" varchar(100),
        "chain" varchar(100),
        "operation" varchar(50) NOT NULL,
        "tx_hash" varchar(255),
        "erc8004_agent_id" integer,
        "from_address" varchar(255),
        "to_address" varchar(255),
        "metadata" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nft_audit_log" ADD CONSTRAINT "nft_audit_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nft_audit_log_agent_id_idx" ON "nft_audit_log" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nft_audit_log_handle_idx" ON "nft_audit_log" USING btree ("handle");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nft_audit_log_chain_idx" ON "nft_audit_log" USING btree ("chain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nft_audit_log_created_at_idx" ON "nft_audit_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nft_audit_log_erc8004_agent_id_idx" ON "nft_audit_log" USING btree ("erc8004_agent_id");
