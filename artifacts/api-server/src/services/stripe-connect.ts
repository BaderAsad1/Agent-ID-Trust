/**
 * Stripe Connect service — agent onboarding, marketplace payouts, and task escrow.
 *
 * Marketplace order payouts (completeOrder + milestone release):
 * When the seller agent has an active Connect account, payouts are sent via
 * Stripe Connect transfers (idempotent, recorded in payout_ledger). When Connect
 * is missing or inactive at completion time, payouts fall back to
 * `pending_manual_payout` — but listing publish is now gated on active Connect,
 * so this fallback should be rare (legacy listings only).
 *
 * Task-payment flow (createTaskPaymentIntent / captureTaskPayment):
 * Supports automated Stripe Connect transfer to the seller's connected account
 * on capture, only when the recipient has an active Connect account.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, tasksTable } from "@workspace/db/schema";
import { getStripe } from "./stripe-client";

export async function createConnectAccount(agentId: string, userId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, userId: true, ownerUserId: true, handle: true, displayName: true, stripeConnectAccountId: true },
  });

  if (!agent) throw new Error("AGENT_NOT_FOUND");
  const effectiveOwner = agent.ownerUserId ?? agent.userId;
  if (effectiveOwner !== userId) throw new Error("NOT_OWNER");

  if (agent.stripeConnectAccountId) {
    return { accountId: agent.stripeConnectAccountId, alreadyExists: true };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    metadata: {
      agentId,
      agentHandle: agent.handle,
    },
    capabilities: {
      transfers: { requested: true },
    },
  });

  await db
    .update(agentsTable)
    .set({
      stripeConnectAccountId: account.id,
      stripeConnectStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));

  return { accountId: account.id, alreadyExists: false };
}

export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function getConnectAccountStatus(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
  });

  if (!agent) throw new Error("AGENT_NOT_FOUND");

  if (!agent.stripeConnectAccountId) {
    return { status: "not_connected", chargesEnabled: false, payoutsEnabled: false };
  }

  const stripe = getStripe();
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(agent.stripeConnectAccountId);
  } catch (err) {
    // Stripe rejected the cached account id (deleted, restricted, or invalid).
    // Fall back to the cached status so UI gating still works instead of 500'ing.
    const cachedStatus = agent.stripeConnectStatus ?? "pending";
    return {
      status: cachedStatus,
      chargesEnabled: cachedStatus === "active",
      payoutsEnabled: cachedStatus === "active",
      accountId: agent.stripeConnectAccountId,
      stale: true,
      error: err instanceof Error ? err.message : "stripe_account_unavailable",
    };
  }

  const status = account.charges_enabled && account.payouts_enabled
    ? "active"
    : account.details_submitted
      ? "pending_verification"
      : "pending";

  if (agent.stripeConnectStatus !== status) {
    await db
      .update(agentsTable)
      .set({ stripeConnectStatus: status, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));
  }

  return {
    status,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    accountId: agent.stripeConnectAccountId,
  };
}

export async function handleConnectAccountUpdated(accountId: string) {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);

  const status = account.charges_enabled && account.payouts_enabled
    ? "active"
    : account.details_submitted
      ? "pending_verification"
      : "pending";

  await db
    .update(agentsTable)
    .set({ stripeConnectStatus: status, updatedAt: new Date() })
    .where(eq(agentsTable.stripeConnectAccountId, accountId));
}

/**
 * Creates a Stripe PaymentIntent with capture_method="manual" for task payment.
 *
 * IMPORTANT — Escrow semantics:
 * This places a Stripe-authorized hold on the buyer's payment method.
 * It is NOT a guaranteed escrow — the hold is a pre-authorization that Stripe may
 * expire (typically after 7 days). Capture must be called before expiry.
 * On completion, funds are transferred to the recipient's Stripe Connect account
 * when captureTaskPayment() is called. Cancellation releases the hold via cancelTaskPayment().
 *
 * Automated payouts to sellers via Stripe Connect are supported only when the
 * recipient agent has an active Connect account (chargesEnabled + payoutsEnabled).
 */
export async function createTaskPaymentIntent(
  amountCents: number,
  recipientAgentId: string,
  taskId: string,
) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, recipientAgentId),
    columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
  });

  if (!agent?.stripeConnectAccountId || agent.stripeConnectStatus !== "active") {
    throw new Error("RECIPIENT_CONNECT_REQUIRED");
  }

  const stripe = getStripe();
  const platformFee = Math.round(amountCents * 0.1);

  const params: Stripe.PaymentIntentCreateParams = {
    amount: amountCents,
    currency: "usd",
    capture_method: "manual",
    application_fee_amount: platformFee,
    transfer_data: {
      destination: agent.stripeConnectAccountId,
    },
    metadata: {
      taskId,
      recipientAgentId,
      type: "task_escrow",
    },
  };

  const paymentIntent = await stripe.paymentIntents.create(params);

  await db
    .update(tasksTable)
    .set({
      paymentIntentId: paymentIntent.id,
      paymentAmount: amountCents,
      paymentStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, taskId));

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * Captures the Stripe-authorized hold for a task payment, transferring funds to
 * the seller's connected account. Must be called before the hold expires (~7 days).
 */
export async function captureTaskPayment(taskId: string) {
  const task = await db.query.tasksTable.findFirst({
    where: eq(tasksTable.id, taskId),
    columns: { paymentIntentId: true, paymentStatus: true },
  });

  if (!task?.paymentIntentId) return;
  if (task.paymentStatus === "captured") return;

  const stripe = getStripe();
  await stripe.paymentIntents.capture(task.paymentIntentId);
  await db
    .update(tasksTable)
    .set({ paymentStatus: "captured", updatedAt: new Date() })
    .where(eq(tasksTable.id, taskId));
}

/**
 * Cancels (releases) the Stripe-authorized hold for a task payment.
 * No funds are moved; the pre-authorization is voided on Stripe's side.
 */
export async function cancelTaskPayment(taskId: string) {
  const task = await db.query.tasksTable.findFirst({
    where: eq(tasksTable.id, taskId),
    columns: { paymentIntentId: true, paymentStatus: true },
  });

  if (!task?.paymentIntentId) return;
  if (task.paymentStatus === "cancelled" || task.paymentStatus === "captured") return;

  const stripe = getStripe();
  await stripe.paymentIntents.cancel(task.paymentIntentId);
  await db
    .update(tasksTable)
    .set({ paymentStatus: "cancelled", updatedAt: new Date() })
    .where(eq(tasksTable.id, taskId));
}
