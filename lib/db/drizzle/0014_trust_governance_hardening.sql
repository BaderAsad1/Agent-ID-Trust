CREATE TYPE "public"."trust_event_direction" AS ENUM('positive', 'negative');--> statement-breakpoint
CREATE TYPE "public"."appeal_status" AS ENUM('pending', 'under_review', 'approved', 'rejected');--> statement-breakpoint

-- Some early environments created organization tables with schema push before
-- migrations were introduced. Define the pre-trust organization shape here so
-- a brand-new database can replay the migration chain deterministically.
CREATE TABLE IF NOT EXISTS "public"."agent_organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(100) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "description" text,
  "avatar_url" text,
  "website_url" text,
  "plan" "subscription_plan" DEFAULT 'free' NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agent_organizations_slug_idx" ON "public"."agent_organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_organizations_owner_user_id_idx" ON "public"."agent_organizations" USING btree ("owner_user_id");--> statement-breakpoint

ALTER TABLE "public"."agent_organizations"
  ADD COLUMN IF NOT EXISTS "trust_score" real,
  ADD COLUMN IF NOT EXISTS "trust_tier" "trust_tier",
  ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "verification_method" "verification_method";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."org_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."agent_organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "role" varchar(50) DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "org_members_org_user_idx" ON "public"."org_members" USING btree ("org_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_members_org_id_idx" ON "public"."org_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_members_user_id_idx" ON "public"."org_members" USING btree ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."org_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."agent_organizations"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "public"."agents"("id") ON DELETE CASCADE,
  "added_by_user_id" uuid NOT NULL REFERENCES "public"."users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "org_agents_org_agent_idx" ON "public"."org_agents" USING btree ("org_id", "agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_agents_org_id_idx" ON "public"."org_agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_agents_agent_id_idx" ON "public"."org_agents" USING btree ("agent_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."org_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."agent_organizations"("id") ON DELETE CASCADE,
  "policy_type" varchar(100) NOT NULL,
  "config" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "org_policies_org_id_idx" ON "public"."org_policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_policies_policy_type_idx" ON "public"."org_policies" USING btree ("policy_type");--> statement-breakpoint

CREATE TABLE "public"."trust_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "public"."agents"("id") ON DELETE CASCADE,
  "direction" "trust_event_direction" NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "weight" integer NOT NULL DEFAULT 1,
  "source_agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE SET NULL,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "public"."human_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "action" varchar(255) NOT NULL,
  "resource_type" varchar(100),
  "resource_id" varchar(255),
  "hashed_ip" varchar(64),
  "user_agent" text,
  "body_metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "public"."agent_appeals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "public"."agents"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "evidence" jsonb,
  "status" "appeal_status" DEFAULT 'pending' NOT NULL,
  "review_notes" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "trust_events_agent_id_idx" ON "public"."trust_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "trust_events_created_at_idx" ON "public"."trust_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trust_events_direction_idx" ON "public"."trust_events" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "trust_events_event_type_idx" ON "public"."trust_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "human_audit_log_user_id_idx" ON "public"."human_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "human_audit_log_created_at_idx" ON "public"."human_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "human_audit_log_action_idx" ON "public"."human_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "human_audit_log_resource_idx" ON "public"."human_audit_log" USING btree ("resource_type", "resource_id");--> statement-breakpoint
CREATE INDEX "agent_appeals_agent_id_idx" ON "public"."agent_appeals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_appeals_status_idx" ON "public"."agent_appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_appeals_created_at_idx" ON "public"."agent_appeals" USING btree ("created_at");
