ALTER TABLE "agents" ADD COLUMN "is_reserved" boolean DEFAULT false NOT NULL;
ALTER TABLE "agents" ADD COLUMN "reserved_reason" varchar(50);

CREATE INDEX "agents_is_reserved_idx" ON "agents" ("is_reserved") WHERE is_reserved = true;

DO $$
DECLARE
  system_user_id uuid;
BEGIN
  INSERT INTO "users" ("replit_user_id", "display_name")
  VALUES ('system_reserved', 'System Reserved')
  ON CONFLICT DO NOTHING;

  SELECT "id" INTO system_user_id FROM "users" WHERE "replit_user_id" = 'system_reserved' LIMIT 1;

  INSERT INTO "agents" ("user_id", "handle", "display_name", "status", "is_reserved", "reserved_reason")
  VALUES
    -- AI brand protection handles
    (system_user_id, 'openai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'anthropic', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'claude', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'google', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'deepmind', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'meta-ai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'microsoft', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'apple', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'amazon', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'nvidia', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'huggingface', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'stability-ai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'midjourney', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'cohere', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'mistral', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'mistral-ai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'perplexity', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'replicate', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'runway', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'inflection', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'character-ai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'xai', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'grok', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'gemini', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'copilot', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'chatgpt', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'dall-e', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'sora', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'tesla', 'Reserved', 'inactive', true, 'brand_protection'),
    (system_user_id, 'replit', 'Reserved', 'inactive', true, 'brand_protection'),
    -- Platform-critical handles
    (system_user_id, 'admin', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'system', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'api', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'root', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'agent', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'agents', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'help', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'support', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'billing', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'status', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'www', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'mail', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'smtp', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'ftp', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'localhost', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'dashboard', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'settings', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'login', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'signup', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'register', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'account', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'security', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'platform', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'marketplace', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'webhook', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'webhooks', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'callback', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'oauth', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'auth', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'token', 'Reserved', 'inactive', true, 'platform'),
    (system_user_id, 'tokens', 'Reserved', 'inactive', true, 'platform')
  ON CONFLICT ("handle") DO NOTHING;
END $$;
