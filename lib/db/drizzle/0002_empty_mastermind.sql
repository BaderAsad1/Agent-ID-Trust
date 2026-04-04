CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"serial_number" varchar(20) NOT NULL,
	"credential_json" jsonb NOT NULL,
	"signature" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_credentials_agent_id_idx" ON "agent_credentials" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_credentials_serial_number_idx" ON "agent_credentials" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "agent_credentials_is_active_idx" ON "agent_credentials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "agent_credentials_expires_at_idx" ON "agent_credentials" USING btree ("expires_at");