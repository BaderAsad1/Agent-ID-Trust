DO $$ BEGIN
 CREATE TYPE "public"."agent_report_reason" AS ENUM('spam', 'impersonation', 'malicious', 'scam', 'terms_violation', 'fake_identity', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."agent_report_status" AS ENUM('pending', 'reviewing', 'resolved', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "agent_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_agent_id" uuid NOT NULL,
  "reporter_agent_id" uuid,
  "reporter_user_id" uuid,
  "reason" "agent_report_reason" NOT NULL,
  "description" text,
  "evidence" text,
  "status" "agent_report_status" DEFAULT 'pending' NOT NULL,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "resolution" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_subject_agent_id_agents_id_fk" FOREIGN KEY ("subject_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_reporter_agent_id_agents_id_fk" FOREIGN KEY ("reporter_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "agent_reports_subject_agent_id_idx" ON "agent_reports" ("subject_agent_id");
CREATE INDEX IF NOT EXISTS "agent_reports_reporter_user_id_idx" ON "agent_reports" ("reporter_user_id");
CREATE INDEX IF NOT EXISTS "agent_reports_reporter_agent_id_idx" ON "agent_reports" ("reporter_agent_id");
CREATE INDEX IF NOT EXISTS "agent_reports_status_idx" ON "agent_reports" ("status");
CREATE INDEX IF NOT EXISTS "agent_reports_created_at_idx" ON "agent_reports" ("created_at");
