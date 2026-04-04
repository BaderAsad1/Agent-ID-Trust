CREATE TABLE "owner_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "token" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "owner_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "owner_tokens" ADD CONSTRAINT "owner_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_tokens_token_idx" ON "owner_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "owner_tokens_user_id_idx" ON "owner_tokens" USING btree ("user_id");
