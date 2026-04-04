CREATE TYPE "public"."account_type" AS ENUM('user', 'agent', 'platform');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'active', 'inactive', 'suspended', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('pending', 'accepted', 'rejected', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'queued', 'delivered', 'failed', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'provisioning', 'active', 'failed', 'deprovisioned');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."initiator_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'filled', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."key_status" AS ENUM('active', 'revoked', 'rotated');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."mail_webhook_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."message_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('fixed', 'hourly', 'per_task', 'custom');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sender_type" AS ENUM('agent', 'user', 'system', 'external');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'starter', 'pro', 'team');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'cancelled', 'paused', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'archived', 'closed');--> statement-breakpoint
CREATE TYPE "public"."transfer_asset_type" AS ENUM('transferable', 'buyer_must_reconnect', 'excluded_by_default');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'listed', 'pending_acceptance', 'hold_pending', 'transfer_pending', 'in_handoff', 'completed', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_type" AS ENUM('sale', 'private_transfer', 'internal_reassignment');--> statement-breakpoint
CREATE TYPE "public"."transport_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('unverified', 'basic', 'verified', 'trusted', 'elite');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('key_challenge', 'github', 'wallet', 'manual');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'pending_verification', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replit_user_id" varchar(255) NOT NULL,
	"email" varchar(255),
	"display_name" varchar(255),
	"avatar_url" text,
	"username" varchar(255),
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"metadata" jsonb,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"hashed_key" varchar(255) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"avatar_seed" varchar(255),
	"avatar_url" text,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"endpoint_url" text,
	"endpoint_secret" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"protocols" jsonb DEFAULT '[]'::jsonb,
	"auth_methods" jsonb DEFAULT '[]'::jsonb,
	"payment_methods" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"trust_breakdown" jsonb,
	"trust_tier" "trust_tier" DEFAULT 'unverified' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_method" "verification_method",
	"verified_at" timestamp with time zone,
	"parent_agent_id" uuid,
	"lineage_depth" integer DEFAULT 0 NOT NULL,
	"sponsored_by" uuid,
	"tasks_received" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"transfer_status" "transfer_status",
	"transferred_at" timestamp with time zone,
	"historical_agent_reputation" real,
	"current_operator_reputation" real,
	"effective_live_trust" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"kid" varchar(255) NOT NULL,
	"key_type" varchar(50) NOT NULL,
	"public_key" text,
	"jwk" jsonb,
	"use" varchar(50) DEFAULT 'sig' NOT NULL,
	"status" "key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"challenge" text NOT NULL,
	"method" varchar(50) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"domain" varchar(255) NOT NULL,
	"base_domain" varchar(255) NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"provider_metadata" jsonb,
	"dns_records" jsonb,
	"provisioned_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"signature" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"delta" integer NOT NULL,
	"reason" text,
	"source" varchar(255),
	"attestation_type" varchar(100),
	"confidence_level" real,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revocable" boolean DEFAULT false,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" varchar(50),
	"provider_subscription_id" varchar(255),
	"billing_interval" "billing_interval",
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_agent_id" uuid NOT NULL,
	"sender_agent_id" uuid,
	"sender_user_id" uuid,
	"task_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"delivery_status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"business_status" "business_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"forwarded_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"related_order_id" uuid,
	"originating_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"endpoint_url" text,
	"request_signature" text,
	"response_code" integer,
	"response_body" text,
	"error_message" text,
	"metadata" jsonb,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"pitch" text,
	"price_type" "price_type" DEFAULT 'fixed' NOT NULL,
	"price_amount" numeric(12, 2),
	"delivery_hours" integer,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"total_hires" integer DEFAULT 0 NOT NULL,
	"avg_rating" numeric(3, 2),
	"review_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"task_description" text,
	"price_amount" numeric(12, 2) NOT NULL,
	"platform_fee" numeric(12, 2) NOT NULL,
	"seller_payout" numeric(12, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"payment_provider" varchar(50),
	"provider_payment_reference" varchar(255),
	"deadline_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poster_user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"budget_min" numeric(12, 2),
	"budget_max" numeric(12, 2),
	"budget_fixed" numeric(12, 2),
	"deadline_hours" integer,
	"required_capabilities" jsonb DEFAULT '[]'::jsonb,
	"min_trust_score" integer,
	"verified_only" boolean DEFAULT false NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"proposals_count" integer DEFAULT 0 NOT NULL,
	"accepted_proposal_id" uuid,
	"linked_task_id" uuid,
	"linked_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"approach" text,
	"price_amount" numeric(12, 2),
	"delivery_hours" integer,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" varchar(50),
	"provider_customer_id" varchar(255),
	"provider_subscription_id" varchar(255),
	"billing_interval" "billing_interval",
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"initiator_type" "initiator_type" NOT NULL,
	"initiator_id" uuid NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"provider_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"authorization_type" varchar(50) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"related_order_id" uuid,
	"related_task_id" uuid,
	"provider" varchar(50) NOT NULL,
	"direction" "payment_direction" NOT NULL,
	"account_type" "account_type" NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"entry_type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"related_order_id" uuid,
	"seller_user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"provider_event_id" varchar(255),
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" varchar(50) NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_inboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"address" varchar(255) NOT NULL,
	"address_local_part" varchar(128),
	"address_domain" varchar(128),
	"display_name" varchar(255),
	"status" "inbox_status" DEFAULT 'active' NOT NULL,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"auto_respond" boolean DEFAULT false NOT NULL,
	"auto_respond_message" text,
	"routing_rules" jsonb DEFAULT '[]'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"retention_policy" jsonb,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"inbox_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"sender_agent_id" uuid,
	"sender_user_id" uuid,
	"sender_address" varchar(255),
	"recipient_address" varchar(255),
	"subject" varchar(500),
	"body" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"snippet" varchar(300),
	"body_format" varchar(20) DEFAULT 'text' NOT NULL,
	"headers" jsonb,
	"structured_payload" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"delivery_status" "message_delivery_status" DEFAULT 'queued' NOT NULL,
	"sender_trust_score" integer,
	"sender_verified" boolean DEFAULT false NOT NULL,
	"provenance_chain" jsonb,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"spam_metadata" jsonb,
	"payment_metadata" jsonb,
	"originating_task_id" uuid,
	"converted_task_id" uuid,
	"in_reply_to_id" uuid,
	"external_message_id" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"subject" varchar(500),
	"status" "thread_status" DEFAULT 'open' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"participant_agent_ids" jsonb DEFAULT '[]'::jsonb,
	"participant_user_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_transport_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" uuid NOT NULL,
	"provider" varchar(100) NOT NULL,
	"raw_payload" jsonb,
	"status" "transport_status" DEFAULT 'pending' NOT NULL,
	"processed_message_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret_encrypted" text,
	"events" jsonb DEFAULT '[]'::jsonb,
	"status" "mail_webhook_status" DEFAULT 'active' NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_url" text,
	"checksum" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_label_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7),
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"provider" varchar(100) NOT NULL,
	"status" "transport_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"provider_message_id" varchar(500),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid,
	"status" "transfer_status" DEFAULT 'draft' NOT NULL,
	"transfer_type" "transfer_type" NOT NULL,
	"asking_price" integer,
	"agreed_price" integer,
	"currency" varchar(10) DEFAULT 'USD',
	"hold_provider" varchar(100),
	"hold_status" varchar(50),
	"hold_reference" varchar(255),
	"notes" text,
	"metadata" jsonb,
	"listed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"hold_funded_at" timestamp with time zone,
	"handoff_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_transfer_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"asset_name" varchar(255) NOT NULL,
	"asset_category" "transfer_asset_type" NOT NULL,
	"description" text,
	"reconnected_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_transfer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"actor_id" uuid,
	"actor_type" varchar(20),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_transfer_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"pre_transfer_trust_score" integer NOT NULL,
	"pre_transfer_trust_tier" varchar(50) NOT NULL,
	"pre_transfer_trust_breakdown" jsonb,
	"historical_agent_reputation" real NOT NULL,
	"current_operator_reputation" real NOT NULL,
	"effective_live_trust" real NOT NULL,
	"transfer_adjustment_factor" real,
	"continuity_quality_score" real,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_operator_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"transfer_id" uuid,
	"operator_handle" varchar(255),
	"verification_status" varchar(50),
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_verification_challenges" ADD CONSTRAINT "agent_verification_challenges_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_domains" ADD CONSTRAINT "agent_domains_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity_log" ADD CONSTRAINT "agent_activity_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reputation_events" ADD CONSTRAINT "agent_reputation_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_subscriptions" ADD CONSTRAINT "agent_subscriptions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_subscriptions" ADD CONSTRAINT "agent_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recipient_agent_id_agents_id_fk" FOREIGN KEY ("recipient_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_poster_user_id_users_id_fk" FOREIGN KEY ("poster_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_job_id_job_posts_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_proposals" ADD CONSTRAINT "job_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_ledger" ADD CONSTRAINT "payout_ledger_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_inboxes" ADD CONSTRAINT "agent_inboxes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_inbox_id_agent_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."agent_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_originating_task_id_tasks_id_fk" FOREIGN KEY ("originating_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_converted_task_id_tasks_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_inbox_id_agent_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."agent_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_transport_events" ADD CONSTRAINT "inbound_transport_events_inbox_id_agent_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."agent_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_webhooks" ADD CONSTRAINT "inbox_webhooks_inbox_id_agent_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."agent_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_webhooks" ADD CONSTRAINT "inbox_webhooks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_label_assignments" ADD CONSTRAINT "message_label_assignments_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_label_assignments" ADD CONSTRAINT "message_label_assignments_label_id_message_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."message_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message_deliveries" ADD CONSTRAINT "outbound_message_deliveries_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfer_assets" ADD CONSTRAINT "agent_transfer_assets_transfer_id_agent_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."agent_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfer_events" ADD CONSTRAINT "agent_transfer_events_transfer_id_agent_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."agent_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfer_snapshots" ADD CONSTRAINT "agent_transfer_snapshots_transfer_id_agent_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."agent_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_transfer_snapshots" ADD CONSTRAINT "agent_transfer_snapshots_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operator_history" ADD CONSTRAINT "agent_operator_history_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operator_history" ADD CONSTRAINT "agent_operator_history_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operator_history" ADD CONSTRAINT "agent_operator_history_transfer_id_agent_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."agent_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_replit_user_id_idx" ON "users" USING btree ("replit_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_user_idx" ON "user_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "api_keys_owner_idx" ON "api_keys" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_handle_idx" ON "agents" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "agents_handle_lower_idx" ON "agents" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_verification_status_idx" ON "agents" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "agents_trust_score_idx" ON "agents" USING btree ("trust_score");--> statement-breakpoint
CREATE INDEX "agent_keys_agent_id_idx" ON "agent_keys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_keys_kid_idx" ON "agent_keys" USING btree ("kid");--> statement-breakpoint
CREATE INDEX "agent_verification_challenges_agent_id_idx" ON "agent_verification_challenges" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_domains_domain_idx" ON "agent_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "agent_domains_agent_id_idx" ON "agent_domains" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_domains_status_idx" ON "agent_domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_activity_log_agent_id_idx" ON "agent_activity_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_activity_log_event_type_idx" ON "agent_activity_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_activity_log_created_at_idx" ON "agent_activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_reputation_events_agent_id_idx" ON "agent_reputation_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_reputation_events_created_at_idx" ON "agent_reputation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_reputation_events_event_type_idx" ON "agent_reputation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_subscriptions_agent_id_idx" ON "agent_subscriptions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_subscriptions_user_id_idx" ON "agent_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_subscriptions_status_idx" ON "agent_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_recipient_agent_id_idx" ON "tasks" USING btree ("recipient_agent_id");--> statement-breakpoint
CREATE INDEX "tasks_sender_agent_id_idx" ON "tasks" USING btree ("sender_agent_id");--> statement-breakpoint
CREATE INDEX "tasks_sender_user_id_idx" ON "tasks" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "tasks_delivery_status_idx" ON "tasks" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "tasks_business_status_idx" ON "tasks" USING btree ("business_status");--> statement-breakpoint
CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "delivery_receipts_task_id_idx" ON "delivery_receipts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "delivery_receipts_status_idx" ON "delivery_receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_listings_agent_id_idx" ON "marketplace_listings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_user_id_idx" ON "marketplace_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_category_idx" ON "marketplace_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_listings_status_idx" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_listings_featured_idx" ON "marketplace_listings" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "marketplace_listings_cat_status_created_idx" ON "marketplace_listings" USING btree ("category","status","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_listings_cat_status_rating_idx" ON "marketplace_listings" USING btree ("category","status","avg_rating");--> statement-breakpoint
CREATE INDEX "marketplace_orders_listing_id_idx" ON "marketplace_orders" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_buyer_user_id_idx" ON "marketplace_orders" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_seller_user_id_idx" ON "marketplace_orders" USING btree ("seller_user_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_agent_id_idx" ON "marketplace_orders" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_status_idx" ON "marketplace_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_reviews_order_id_idx" ON "marketplace_reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_listing_id_idx" ON "marketplace_reviews" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_agent_id_idx" ON "marketplace_reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_reviewer_id_idx" ON "marketplace_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "job_posts_poster_user_id_idx" ON "job_posts" USING btree ("poster_user_id");--> statement-breakpoint
CREATE INDEX "job_posts_category_idx" ON "job_posts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "job_posts_status_idx" ON "job_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_proposals_job_id_idx" ON "job_proposals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_proposals_agent_id_idx" ON "job_proposals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "job_proposals_user_id_idx" ON "job_proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_proposals_status_idx" ON "job_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_provider_sub_id_idx" ON "subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "payment_intents_initiator_idx" ON "payment_intents" USING btree ("initiator_type","initiator_id");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "payment_authorizations_intent_id_idx" ON "payment_authorizations" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_authorizations_status_idx" ON "payment_authorizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_ledger_order_id_idx" ON "payment_ledger" USING btree ("related_order_id");--> statement-breakpoint
CREATE INDEX "payment_ledger_task_id_idx" ON "payment_ledger" USING btree ("related_task_id");--> statement-breakpoint
CREATE INDEX "payment_ledger_account_idx" ON "payment_ledger" USING btree ("account_type","account_id");--> statement-breakpoint
CREATE INDEX "payment_ledger_created_at_idx" ON "payment_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payout_ledger_seller_user_id_idx" ON "payout_ledger" USING btree ("seller_user_id");--> statement-breakpoint
CREATE INDEX "payout_ledger_order_id_idx" ON "payout_ledger" USING btree ("related_order_id");--> statement-breakpoint
CREATE INDEX "payout_ledger_status_idx" ON "payout_ledger" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_idx" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_event_type_idx" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_inboxes_address_idx" ON "agent_inboxes" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_inboxes_agent_id_idx" ON "agent_inboxes" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_inboxes_status_idx" ON "agent_inboxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_id_idx" ON "agent_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agent_messages_inbox_id_idx" ON "agent_messages" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "agent_messages_agent_id_idx" ON "agent_messages" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_messages_direction_idx" ON "agent_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "agent_messages_sender_agent_id_idx" ON "agent_messages" USING btree ("sender_agent_id");--> statement-breakpoint
CREATE INDEX "agent_messages_sender_user_id_idx" ON "agent_messages" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "agent_messages_delivery_status_idx" ON "agent_messages" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "agent_messages_created_at_idx" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_is_read_idx" ON "agent_messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "agent_threads_inbox_id_idx" ON "agent_threads" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "agent_threads_agent_id_idx" ON "agent_threads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_threads_status_idx" ON "agent_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_threads_last_message_at_idx" ON "agent_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "inbound_transport_events_inbox_id_idx" ON "inbound_transport_events" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "inbound_transport_events_status_idx" ON "inbound_transport_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbound_transport_events_created_at_idx" ON "inbound_transport_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inbox_webhooks_inbox_id_idx" ON "inbox_webhooks" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "inbox_webhooks_agent_id_idx" ON "inbox_webhooks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "inbox_webhooks_status_idx" ON "inbox_webhooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_events_message_id_idx" ON "message_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_events_event_type_idx" ON "message_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "message_events_created_at_idx" ON "message_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "message_label_assignments_message_id_idx" ON "message_label_assignments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_label_assignments_label_id_idx" ON "message_label_assignments" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_label_assignments_unique_idx" ON "message_label_assignments" USING btree ("message_id","label_id");--> statement-breakpoint
CREATE INDEX "message_labels_agent_id_idx" ON "message_labels" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_labels_agent_name_idx" ON "message_labels" USING btree ("agent_id","name");--> statement-breakpoint
CREATE INDEX "outbound_deliveries_message_id_idx" ON "outbound_message_deliveries" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "outbound_deliveries_status_idx" ON "outbound_message_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbound_deliveries_created_at_idx" ON "outbound_message_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_transfers_agent_id_idx" ON "agent_transfers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_transfers_seller_id_idx" ON "agent_transfers" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "agent_transfers_buyer_id_idx" ON "agent_transfers" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "agent_transfers_status_idx" ON "agent_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_transfer_assets_transfer_id_idx" ON "agent_transfer_assets" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "agent_transfer_assets_category_idx" ON "agent_transfer_assets" USING btree ("asset_category");--> statement-breakpoint
CREATE INDEX "agent_transfer_events_transfer_id_idx" ON "agent_transfer_events" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "agent_transfer_events_event_type_idx" ON "agent_transfer_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_transfer_snapshots_transfer_id_idx" ON "agent_transfer_snapshots" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "agent_transfer_snapshots_agent_id_idx" ON "agent_transfer_snapshots" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_operator_history_agent_id_idx" ON "agent_operator_history" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_operator_history_operator_id_idx" ON "agent_operator_history" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "agent_operator_history_transfer_id_idx" ON "agent_operator_history" USING btree ("transfer_id");