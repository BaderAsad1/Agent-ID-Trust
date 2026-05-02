-- Add icon_url column to oauth_clients so the OAuth consent screen can show
-- the third-party application's icon.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "icon_url" varchar(2048);
