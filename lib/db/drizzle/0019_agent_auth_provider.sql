-- Phase 1-3: Agent Auth Provider migration
-- Adds auth_nonces, agentid_sessions, oauth_clients, oauth_tokens,
-- oauth_authorization_codes, org_policies, audit_events tables.
-- Also makes oauth_clients.client_secret_hash nullable (public clients).

-- Auth nonces: challenge/response nonces for PoP JWT and signed-assertion flows
CREATE TABLE IF NOT EXISTS "auth_nonces" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "nonce" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "audience" varchar(500),
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "auth_nonces_nonce_idx" ON "auth_nonces" ("nonce");
CREATE INDEX IF NOT EXISTS "auth_nonces_agent_id_idx" ON "auth_nonces" ("agent_id");
CREATE INDEX IF NOT EXISTS "auth_nonces_expires_at_idx" ON "auth_nonces" ("expires_at");

-- AgentID sessions: short-lived session JWTs issued after challenge/response auth
CREATE TABLE IF NOT EXISTS "agentid_sessions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "session_id" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "audience" varchar(500),
  "scopes" jsonb DEFAULT '[]',
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
);

CREATE INDEX IF NOT EXISTS "agentid_sessions_session_id_idx" ON "agentid_sessions" ("session_id");
CREATE INDEX IF NOT EXISTS "agentid_sessions_agent_id_idx" ON "agentid_sessions" ("agent_id");
CREATE INDEX IF NOT EXISTS "agentid_sessions_expires_at_idx" ON "agentid_sessions" ("expires_at");

-- OAuth clients: registered OAuth 2.0 clients (public or confidential)
CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "client_id" varchar(64) NOT NULL UNIQUE,
  "client_secret_hash" varchar(255),
  "name" varchar(255) NOT NULL,
  "description" text,
  "redirect_uris" jsonb DEFAULT '[]' NOT NULL,
  "allowed_scopes" jsonb DEFAULT '[]' NOT NULL,
  "grant_types" jsonb DEFAULT '["authorization_code"]' NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_client_id_idx" ON "oauth_clients" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_clients_owner_user_id_idx" ON "oauth_clients" ("owner_user_id");

-- OAuth authorization codes: PKCE authorization codes
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "code" varchar(128) NOT NULL UNIQUE,
  "client_id" varchar(64) NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "redirect_uri" varchar(2048),
  "scopes" jsonb DEFAULT '[]' NOT NULL,
  "code_challenge" varchar(256),
  "code_challenge_method" varchar(10),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_auth_codes_code_idx" ON "oauth_authorization_codes" ("code");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_client_id_idx" ON "oauth_authorization_codes" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_agent_id_idx" ON "oauth_authorization_codes" ("agent_id");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_expires_at_idx" ON "oauth_authorization_codes" ("expires_at");

-- OAuth tokens: access and refresh tokens
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "token_id" varchar(128) NOT NULL UNIQUE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "client_id" varchar(64) REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "access_token_hash" varchar(255) NOT NULL,
  "refresh_token_hash" varchar(255),
  "scopes" jsonb DEFAULT '[]' NOT NULL,
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
);

CREATE INDEX IF NOT EXISTS "oauth_tokens_token_id_idx" ON "oauth_tokens" ("token_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_agent_id_idx" ON "oauth_tokens" ("agent_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_client_id_idx" ON "oauth_tokens" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_access_token_hash_idx" ON "oauth_tokens" ("access_token_hash");
CREATE INDEX IF NOT EXISTS "oauth_tokens_refresh_token_hash_idx" ON "oauth_tokens" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "oauth_tokens_expires_at_idx" ON "oauth_tokens" ("expires_at");

-- Org policies: organizational policy engine (MFA, IP allow-list, SSO requirements, etc.)
CREATE TABLE IF NOT EXISTS "org_policies" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "agent_organizations"("id") ON DELETE CASCADE,
  "policy_type" varchar(100) NOT NULL,
  "config" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "org_policies_org_id_idx" ON "org_policies" ("org_id");
CREATE INDEX IF NOT EXISTS "org_policies_policy_type_idx" ON "org_policies" ("policy_type");

-- Agent claim history: ownership chain audit log for agent claims, disputes, and transfers
CREATE TABLE IF NOT EXISTS "agent_claim_history" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
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
);

CREATE INDEX IF NOT EXISTS "agent_claim_history_agent_id_idx" ON "agent_claim_history" ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_claim_history_action_idx" ON "agent_claim_history" ("action");
CREATE INDEX IF NOT EXISTS "agent_claim_history_created_at_idx" ON "agent_claim_history" ("created_at");

-- Audit events: audit_events table already exists from an earlier migration.
-- Add new dedicated operational columns for direct filtering (not embedded in payload).
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "target_type" varchar(50);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "target_id" varchar(255);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "ip_address" varchar(64);
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);

CREATE INDEX IF NOT EXISTS "audit_events_target_idx" ON "audit_events" ("target_type", "target_id");
