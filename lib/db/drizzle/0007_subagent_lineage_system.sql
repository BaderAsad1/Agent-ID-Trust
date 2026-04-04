CREATE TYPE "public"."agent_type" AS ENUM('primary', 'subagent', 'ephemeral');--> statement-breakpoint
CREATE TABLE "agent_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"ancestor_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_type" "agent_type" DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "max_subagents" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "subagent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "ttl_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "spawned_by_key_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_lineage" ADD CONSTRAINT "agent_lineage_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_lineage" ADD CONSTRAINT "agent_lineage_ancestor_id_agents_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_lineage_agent_id_idx" ON "agent_lineage" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_lineage_ancestor_id_idx" ON "agent_lineage" USING btree ("ancestor_id");--> statement-breakpoint
CREATE INDEX "agents_parent_agent_id_idx" ON "agents" USING btree ("parent_agent_id");--> statement-breakpoint
CREATE INDEX "agents_agent_type_idx" ON "agents" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "agents_ttl_expires_at_idx" ON "agents" USING btree ("ttl_expires_at");
