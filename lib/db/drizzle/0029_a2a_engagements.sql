CREATE TABLE IF NOT EXISTS "a2a_engagements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL REFERENCES "a2a_service_listings"("id") ON DELETE CASCADE,
  "service_handle" varchar(255) NOT NULL,
  "service_name" varchar(255) NOT NULL,
  "spending_cap_usdc" numeric(18, 6) NOT NULL DEFAULT '10',
  "total_spent_usdc" numeric(18, 6) NOT NULL DEFAULT '0',
  "call_count" integer NOT NULL DEFAULT 0,
  "status" varchar(50) NOT NULL DEFAULT 'active',
  "payment_model" varchar(50) NOT NULL DEFAULT 'per_call',
  "price_per_unit" numeric(18, 6) NOT NULL DEFAULT '0.01',
  "currency" varchar(10) NOT NULL DEFAULT 'USDC',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "a2a_engagements_agent_id_idx" ON "a2a_engagements" ("agent_id");
CREATE INDEX IF NOT EXISTS "a2a_engagements_user_id_idx" ON "a2a_engagements" ("user_id");
CREATE INDEX IF NOT EXISTS "a2a_engagements_service_id_idx" ON "a2a_engagements" ("service_id");
CREATE INDEX IF NOT EXISTS "a2a_engagements_status_idx" ON "a2a_engagements" ("status");
