import { pgEnum } from "drizzle-orm/pg-core";

export const agentStatusEnum = pgEnum("agent_status", [
  "draft",
  "active",
  "inactive",
  "suspended",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
  "failed",
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "key_challenge",
  "github",
  "wallet",
  "manual",
]);

export const trustTierEnum = pgEnum("trust_tier", [
  "unverified",
  "basic",
  "verified",
  "trusted",
  "elite",
]);

export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "provisioning",
  "active",
  "failed",
  "deprovisioned",
]);

export const keyStatusEnum = pgEnum("key_status", [
  "active",
  "revoked",
  "rotated",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "queued",
  "delivered",
  "failed",
  "acknowledged",
]);

export const businessStatusEnum = pgEnum("business_status", [
  "pending",
  "accepted",
  "rejected",
  "completed",
  "failed",
  "cancelled",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "paused",
  "closed",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "open",
  "filled",
  "closed",
  "expired",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "paused",
  "trialing",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "starter",
  "pro",
  "team",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "monthly",
  "yearly",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "cancelled",
]);

export const paymentDirectionEnum = pgEnum("payment_direction", [
  "inbound",
  "outbound",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const webhookStatusEnum = pgEnum("webhook_status", [
  "pending",
  "processed",
  "failed",
  "skipped",
]);

export const priceTypeEnum = pgEnum("price_type", [
  "fixed",
  "hourly",
  "per_task",
  "custom",
]);

export const ownerTypeEnum = pgEnum("owner_type", ["user", "agent"]);

export const initiatorTypeEnum = pgEnum("initiator_type", [
  "user",
  "agent",
  "system",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "user",
  "agent",
  "platform",
]);
