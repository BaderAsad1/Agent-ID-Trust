CREATE TABLE IF NOT EXISTS "mpp_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_id" uuid NOT NULL,
        "idempotency_key" varchar(255) NOT NULL,
        "amount_cents" integer NOT NULL,
        "currency" varchar(3) DEFAULT 'usd' NOT NULL,
        "payment_type" varchar(100) NOT NULL,
        "resource_id" varchar(255),
        "stripe_payment_intent_id" varchar(255),
        "stripe_customer_id" varchar(255),
        "payer_agent_id" uuid,
        "status" varchar(50) DEFAULT 'pending' NOT NULL,
        "trust_tier_at_payment" varchar(50),
        "error_message" text,
        "metadata" jsonb,
        "verified_at" timestamp with time zone,
        "captured_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mpp_payments" ADD CONSTRAINT "mpp_payments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mpp_payments_idempotency_key_idx" ON "mpp_payments" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mpp_payments_stripe_pi_type_idx" ON "mpp_payments" USING btree ("stripe_payment_intent_id", "payment_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mpp_payments_agent_id_idx" ON "mpp_payments" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mpp_payments_status_idx" ON "mpp_payments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mpp_payments_stripe_pi_idx" ON "mpp_payments" USING btree ("stripe_payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mpp_payments_payer_agent_idx" ON "mpp_payments" USING btree ("payer_agent_id");
