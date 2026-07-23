-- oauth_clients historically existed only through drizzle-kit schema pushes.
-- Create it here as part of the durable migration chain so a blank database
-- can apply this migration before the broader 0037 schema reconciliation.
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_client_id_idx"
  ON "oauth_clients" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_clients_owner_user_id_idx"
  ON "oauth_clients" ("owner_user_id");
--> statement-breakpoint
-- Add icon_url to databases where oauth_clients was previously schema-pushed.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "icon_url" varchar(2048);
