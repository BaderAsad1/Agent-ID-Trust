-- Define the legacy shape for fresh databases, then perform the security rename.
-- Existing installations that already have either shape remain safe to migrate.
CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "token" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'magic_link_tokens' AND column_name = 'token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'magic_link_tokens' AND column_name = 'hashed_token'
  ) THEN
    ALTER TABLE "magic_link_tokens" RENAME COLUMN "token" TO "hashed_token";
  END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "magic_link_token_idx" ON "magic_link_tokens" ("hashed_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_email_idx" ON "magic_link_tokens" ("email");
