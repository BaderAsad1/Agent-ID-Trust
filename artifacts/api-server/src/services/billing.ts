import Stripe from "stripe";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../middlewares/request-logger";
import {
  usersTable,
  subscriptionsTable,
  agentSubscriptionsTable,
  agentsTable,
  webhookEventsTable,
  auditEventsTable,
  type Subscription,
  type AgentSubscription,
} from "@workspace/db/schema";

const LAUNCH_MODE = process.env.LAUNCH_MODE === "true";

const PLAN_LIMITS: Record<string, { maxPublicAgents: number; maxPrivateAgents: number; agentLimit: number; maxSubagents: number }> = {
  free: { maxPublicAgents: 0, maxPrivateAgents: 1, agentLimit: 1, maxSubagents: 5 },
  starter: { maxPublicAgents: 1, maxPrivateAgents: 1, agentLimit: 1, maxSubagents: 5 },
  builder: { maxPublicAgents: 5, maxPrivateAgents: 5, agentLimit: 5, maxSubagents: 25 },
  pro: { maxPublicAgents: 25, maxPrivateAgents: 25, agentLimit: 25, maxSubagents: 100 },
  team: { maxPublicAgents: 100, maxPrivateAgents: 100, agentLimit: 100, maxSubagents: 500 },
};

const PLAN_PRICES: Record<string, Record<string, number>> = {
  starter: { monthly: 900, yearly: 8600 },
  builder: { monthly: 900, yearly: 8600 },
  pro: { monthly: 2900, yearly: 27900 },
  team: { monthly: 9900, yearly: 95000 },
};

import { getHandlePricing as _getHandlePricingService } from "./handle-pricing";

const HANDLE_PRICING_TIERS = [
  { minLength: 3, maxLength: 3, annualPriceCents: 99900 },
  { minLength: 4, maxLength: 4, annualPriceCents: 19900 },
  { minLength: 5, maxLength: 5, annualPriceCents: 4900 },
  { minLength: 6, maxLength: 100, annualPriceCents: 900 },
];

export function getHandlePriceCents(handle: string): number {
  return _getHandlePricingService(handle).annualPriceCents;
}

type PlanType = "free" | "starter" | "builder" | "pro" | "team";
type SubStatus = "active" | "past_due" | "cancelled" | "paused" | "trialing";
type BillingInterval = "monthly" | "yearly";

import { env } from "../lib/env";
import { getStripe } from "./stripe-client";

export function getPlanLimits(plan: string) {
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const effectivePlan = LAUNCH_MODE ? "free" : plan;
  return {
    plan: effectivePlan,
    agentLimit: LAUNCH_MODE ? 999 : limits.agentLimit,
    maxAgents: LAUNCH_MODE ? 999 : limits.maxPublicAgents,
    maxPublicAgents: LAUNCH_MODE ? 999 : limits.maxPublicAgents,
    maxPrivateAgents: LAUNCH_MODE ? 999 : limits.maxPrivateAgents,
    maxSubagents: LAUNCH_MODE ? 999 : limits.maxSubagents,
    publicResolution: LAUNCH_MODE || plan !== "free",
    canReceiveMail: true,
    canBePublic: LAUNCH_MODE || plan !== "free",
    canListOnMarketplace: LAUNCH_MODE || plan !== "free",
    marketplaceListing: LAUNCH_MODE || plan !== "free",
    canUsePremiumRouting: LAUNCH_MODE || plan === "builder" || plan === "pro" || plan === "team",
    premiumRouting: LAUNCH_MODE || plan === "builder" || plan === "pro" || plan === "team",
    canUseAdvancedAuth: LAUNCH_MODE || plan === "pro" || plan === "team",
    analyticsAccess: LAUNCH_MODE || plan === "pro" || plan === "team",
    customDomain: plan === "pro" || plan === "team",
    canUseTeamFeatures: plan === "team",
    fleetManagement: plan === "team",
    includesStandardHandle: LAUNCH_MODE || plan !== "free",
    supportLevel: plan === "team" ? "sla" : plan === "pro" ? "priority" : plan === "builder" || plan === "starter" ? "email" : "community",
    launchMode: LAUNCH_MODE,
  };
}

export async function getUserPlanLimits(userId: string) {
  const sub = await getActiveUserSubscription(userId);
  const plan = sub?.plan ?? "free";
  return getPlanLimits(plan);
}

export function getPlanFromPriceId(priceId: string): string {
  const e = process.env;
  const priceMap: Record<string, string> = {};
  if (e.STRIPE_PRICE_BUILDER_MONTHLY) priceMap[e.STRIPE_PRICE_BUILDER_MONTHLY] = "builder";
  if (e.STRIPE_PRICE_BUILDER_YEARLY) priceMap[e.STRIPE_PRICE_BUILDER_YEARLY] = "builder";
  if (e.STRIPE_PRICE_PRO_MONTHLY) priceMap[e.STRIPE_PRICE_PRO_MONTHLY] = "pro";
  if (e.STRIPE_PRICE_PRO_YEARLY) priceMap[e.STRIPE_PRICE_PRO_YEARLY] = "pro";
  if (e.STRIPE_PRICE_TEAM_MONTHLY) priceMap[e.STRIPE_PRICE_TEAM_MONTHLY] = "team";
  if (e.STRIPE_PRICE_TEAM_YEARLY) priceMap[e.STRIPE_PRICE_TEAM_YEARLY] = "team";
  return priceMap[priceId] ?? "free";
}

export function getPriceIdFromPlan(plan: string, interval: "monthly" | "yearly"): string | undefined {
  const e = process.env;
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}` as keyof typeof e;
  return e[key] as string | undefined;
}

export async function cancelSubscription(userId: string): Promise<void> {
  const sub = await getActiveUserSubscription(userId);
  if (!sub?.providerSubscriptionId) return;
  const stripe = getStripe();
  await stripe.subscriptions.update(sub.providerSubscriptionId, { cancel_at_period_end: true });
  await db.update(subscriptionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, sub.id));
}

export async function getCustomerPortalUrl(userId: string): Promise<string> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) throw new Error("No Stripe customer found for user");
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL || "https://getagent.id"}/dashboard`,
  });
  return session.url;
}

export async function handleSubscriptionCreatedOrUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId ?? "") as PlanType;
  const resolvedPlan = plan === "free" ? "builder" : plan;
  const billingInterval: BillingInterval = subscription.items.data[0]?.price.recurring?.interval === "year" ? "yearly" : "monthly";
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;

  await db.update(usersTable)
    .set({ plan: resolvedPlan, stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  const existingSub = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  const item = subscription.items.data[0];
  const periodStart = new Date((item?.current_period_start ?? subscription.start_date) * 1000);
  const periodEnd = new Date((item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000);

  if (existingSub.length > 0) {
    await db.update(subscriptionsTable)
      .set({
        plan: resolvedPlan,
        provider: "stripe",
        providerCustomerId: customerId,
        providerSubscriptionId: subscription.id,
        billingInterval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, existingSub[0].id));
  } else {
    await db.insert(subscriptionsTable).values({
      userId,
      plan: resolvedPlan,
      status: "active",
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      billingInterval,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  }

  logger.info({ userId, plan: resolvedPlan, status: subscription.status }, "[billing] Subscription upserted from webhook");
}

export async function getUserSubscriptions(userId: string): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt));
}

export async function getActiveUserSubscription(userId: string): Promise<Subscription | null> {
  const sub = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
      ),
    )
    .limit(1);
  return sub[0] ?? null;
}

export async function getUserPlan(userId: string): Promise<string> {
  const sub = await getActiveUserSubscription(userId);
  return sub?.plan ?? "free";
}

export async function getAgentPlan(agentId: string): Promise<string> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { userId: true },
  });
  if (!agent) return "free";
  return getUserPlan(agent.userId);
}

export async function getAgentSubscription(agentId: string): Promise<AgentSubscription | null> {
  const sub = await db
    .select()
    .from(agentSubscriptionsTable)
    .where(eq(agentSubscriptionsTable.agentId, agentId))
    .orderBy(desc(agentSubscriptionsTable.createdAt))
    .limit(1);
  return sub[0] ?? null;
}

export async function getAgentBillingStatus(agentId: string, userId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true, handle: true, status: true, displayName: true },
  });

  if (!agent) return null;

  const agentSub = await getAgentSubscription(agentId);
  const userSub = await getActiveUserSubscription(userId);
  const userPlan = userSub?.plan ?? "free";
  const limits = getPlanLimits(userPlan);

  return {
    agentId: agent.id,
    handle: agent.handle,
    displayName: agent.displayName,
    agentStatus: agent.status,
    subscription: agentSub
      ? {
          plan: agentSub.plan,
          status: agentSub.status,
          billingInterval: agentSub.billingInterval,
          currentPeriodStart: agentSub.currentPeriodStart,
          currentPeriodEnd: agentSub.currentPeriodEnd,
        }
      : null,
    userPlan,
    limits,
    isActive: agent.status === "active",
    canListOnMarketplace: limits.canListOnMarketplace && agent.status === "active",
  };
}

export async function countActiveAgentSubscriptions(userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentSubscriptionsTable)
    .where(
      and(
        eq(agentSubscriptionsTable.userId, userId),
        eq(agentSubscriptionsTable.status, "active"),
      ),
    );
  return result[0]?.count ?? 0;
}

export async function activateAgent(
  agentId: string,
  userId: string,
): Promise<{ success: boolean; error?: string; subscription?: AgentSubscription }> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true, status: true, metadata: true },
  });

  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };

  const existingSub = await getAgentSubscription(agentId);
  if (existingSub && existingSub.status === "active") {
    return { success: true, subscription: existingSub };
  }

  const agentMeta = agent.metadata as Record<string, unknown> | null;
  const handlePricing = agentMeta?.handlePricing as Record<string, unknown> | null;
  if (handlePricing && handlePricing.paymentStatus === "pending") {
    return {
      success: false,
      error: "HANDLE_PAYMENT_REQUIRED",
    };
  }

  const userSub = await getActiveUserSubscription(userId);
  const userPlan = userSub?.plan ?? "free";
  const limits = getPlanLimits(userPlan);

  const activeCount = await countActiveAgentSubscriptions(userId);
  if (activeCount >= limits.maxAgents) {
    return {
      success: false,
      error: "AGENT_LIMIT_REACHED",
    };
  }

  const periodStart = userSub?.currentPeriodStart ?? new Date();
  const periodEnd = userSub?.currentPeriodEnd ?? (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  })();

  const [sub] = await db
    .insert(agentSubscriptionsTable)
    .values({
      agentId,
      userId,
      plan: userPlan as PlanType,
      status: "active",
      provider: "stripe",
      providerSubscriptionId: userSub?.providerSubscriptionId ?? null,
      billingInterval: userSub?.billingInterval ?? "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })
    .returning();

  await db
    .update(agentsTable)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(agentsTable.id, agentId));

  return { success: true, subscription: sub };
}

export async function deactivateAgent(
  agentId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true },
  });

  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };

  await db
    .update(agentSubscriptionsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(agentSubscriptionsTable.agentId, agentId),
        eq(agentSubscriptionsTable.status, "active"),
      ),
    );

  await db
    .update(agentsTable)
    .set({ status: "inactive", isPublic: false, updatedAt: new Date() })
    .where(eq(agentsTable.id, agentId));

  return { success: true };
}

export async function createCheckoutSession(
  userId: string,
  plan: string,
  billingInterval: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string | null; error?: string }> {
  const stripe = getStripe();

  if (plan === "free") {
    return { url: null, error: "CANNOT_CHECKOUT_FREE" };
  }

  const prices = PLAN_PRICES[plan];
  if (!prices) return { url: null, error: "INVALID_PLAN" };

  const priceAmount = prices[billingInterval];
  if (!priceAmount) return { url: null, error: "INVALID_INTERVAL" };

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
  });

  if (!user) return { url: null, error: "USER_NOT_FOUND" };

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.displayName ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;

    await db
      .update(usersTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Agent ID ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
            description: `Up to ${(PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).maxPublicAgents} public agent${(PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).maxPublicAgents > 1 ? "s" : ""}`,
          },
          unit_amount: priceAmount,
          recurring: {
            interval: billingInterval === "yearly" ? "year" : "month",
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      plan,
      billingInterval,
    },
  });

  return { url: session.url };
}

export async function isEligibleForIncludedHandle(userId: string, handle: string): Promise<boolean> {
  const handleLen = handle.replace(/[^a-z0-9]/g, "").length;
  if (handleLen < 5) return false;

  const userSub = await getActiveUserSubscription(userId);
  if (!userSub || userSub.plan === "free") return false;

  const existingAgents = await db
    .select({ id: agentsTable.id, metadata: agentsTable.metadata })
    .from(agentsTable)
    .where(eq(agentsTable.userId, userId));

  const alreadyUsedBenefit = existingAgents.some((a) => {
    const meta = a.metadata as Record<string, unknown> | null;
    const hp = meta?.handlePricing as Record<string, unknown> | undefined;
    return hp?.paymentStatus === "paid" || hp?.paymentStatus === "included";
  });
  if (alreadyUsedBenefit) return false;

  const subAge = Date.now() - new Date(userSub.createdAt).getTime();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  return subAge < oneYear;
}

export async function createHandleCheckoutSession(
  userId: string,
  handle: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string | null; error?: string; priceCents: number; included?: boolean }> {
  const priceCents = getHandlePriceCents(handle);

  const included = await isEligibleForIncludedHandle(userId, handle);
  if (included) {
    const agent = await db.query.agentsTable.findFirst({
      where: and(eq(agentsTable.handle, handle.toLowerCase()), eq(agentsTable.userId, userId)),
      columns: { id: true, metadata: true },
    });
    if (agent) {
      const meta = (agent.metadata as Record<string, unknown>) || {};
      const handlePricing = (meta.handlePricing as Record<string, unknown>) || {};
      await db
        .update(agentsTable)
        .set({
          metadata: { ...meta, handlePricing: { ...handlePricing, paymentStatus: "included", includedAt: new Date().toISOString() } },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));
    }
    return { url: successUrl, priceCents: 0, included: true };
  }

  const stripe = getStripe();

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
  });

  if (!user) return { url: null, error: "USER_NOT_FOUND", priceCents };

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.displayName ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;

    await db
      .update(usersTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  const handleLen = handle.replace(/[^a-z0-9]/g, "").length;
  const tierLabel = handleLen <= 3 ? "Ultra-Premium (3-char)" : handleLen === 4 ? "Premium (4-char)" : "Standard";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Handle Registration: @${handle}`,
            description: `${tierLabel} .agentid handle — owned asset`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      type: "handle_registration",
      handle,
      priceCents: String(priceCents),
    },
  });

  return { url: session.url, priceCents };
}

export async function claimWebhookEvent(
  provider: string,
  eventType: string,
  eventId: string,
  payload: unknown,
): Promise<"claimed" | "already_processed" | "retrying"> {
  const existing = await db
    .select({ id: webhookEventsTable.id, status: webhookEventsTable.status })
    .from(webhookEventsTable)
    .where(
      and(
        eq(webhookEventsTable.provider, provider),
        eq(webhookEventsTable.providerEventId, eventId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === "processed" || row.status === "skipped") {
      return "already_processed";
    }
    await db
      .update(webhookEventsTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(webhookEventsTable.id, row.id));
    return "retrying";
  }

  const inserted = await db
    .insert(webhookEventsTable)
    .values({
      provider,
      eventType,
      providerEventId: eventId,
      payload,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEventsTable.id });

  if (inserted.length === 0) {
    return "already_processed";
  }
  return "claimed";
}

export async function finalizeWebhookEvent(
  provider: string,
  eventId: string,
  status: "processed" | "failed" | "skipped",
) {
  await db
    .update(webhookEventsTable)
    .set({
      status,
      processedAt: status === "processed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookEventsTable.provider, provider),
        eq(webhookEventsTable.providerEventId, eventId),
      ),
    );
}

export async function requirePlanFeature(
  userId: string,
  feature: "canReceiveMail" | "canBePublic" | "canListOnMarketplace" | "canUsePremiumRouting" | "canUseAdvancedAuth" | "canUseTeamFeatures",
): Promise<{ allowed: boolean; currentPlan: string; requiredPlan: string }> {
  const userSub = await getActiveUserSubscription(userId);
  const plan = userSub?.plan ?? "free";
  const limits = getPlanLimits(plan);

  const featurePlanMap: Record<string, string> = {
    canReceiveMail: "free",
    canBePublic: "starter",
    canListOnMarketplace: "starter",
    canUsePremiumRouting: "pro",
    canUseAdvancedAuth: "pro",
    canUseTeamFeatures: "team",
  };

  return {
    allowed: limits[feature],
    currentPlan: plan,
    requiredPlan: featurePlanMap[feature],
  };
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (ref) {
    return typeof ref === "string" ? ref : ref.id;
  }
  const legacy = (invoice as unknown as Record<string, unknown>).subscription;
  if (legacy) {
    return typeof legacy === "string" ? legacy : (legacy as { id?: string }).id ?? null;
  }
  return null;
}

function computePeriodDates(billingInterval: string): { start: Date; end: Date } {
  const start = new Date();
  const end = new Date(start);
  if (billingInterval === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return { start, end };
}

export async function markHandlePaymentComplete(agentId: string): Promise<void> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, metadata: true },
  });
  if (!agent) return;

  const meta = (agent.metadata as Record<string, unknown>) || {};
  const handlePricing = (meta.handlePricing as Record<string, unknown>) || {};

  await db
    .update(agentsTable)
    .set({
      metadata: {
        ...meta,
        handlePricing: {
          ...handlePricing,
          paymentStatus: "paid",
          paidAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const sessionType = session.metadata?.type;

  if (sessionType === "handle_registration") {
    const handle = session.metadata?.handle;
    const userId = session.metadata?.userId;
    if (handle && userId) {
      const agent = await db.query.agentsTable.findFirst({
        where: and(eq(agentsTable.handle, handle), eq(agentsTable.userId, userId)),
        columns: { id: true },
      });
      if (agent) {
        await markHandlePaymentComplete(agent.id);
      }
    }
    return;
  }

  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan as PlanType;
  const billingInterval = (session.metadata?.billingInterval ?? "monthly") as BillingInterval;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (!userId || !plan || !subscriptionId) return;

  const period = computePeriodDates(billingInterval);
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;

  await db
    .update(usersTable)
    .set({
      plan,
      stripeCustomerId: customerId,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  const existingSub = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
      ),
    )
    .limit(1);

  if (existingSub.length > 0) {
    const oldSubId = existingSub[0].providerSubscriptionId;
    if (oldSubId && oldSubId !== subscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(oldSubId, { prorate: true });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error({
          userId,
          subscriptionId: oldSubId,
          newSubscriptionId: subscriptionId,
          error: errorMessage,
          stack: errorStack,
        }, "[billing] Failed to cancel previous subscription");
        await Promise.all([
          db.insert(webhookEventsTable).values({
            provider: "stripe",
            eventType: "subscription.cancel_failed",
            providerEventId: `cancel_fail_${oldSubId}_${Date.now()}`,
            payload: {
              userId,
              subscriptionId: oldSubId,
              newSubscriptionId: subscriptionId,
              error: errorMessage,
              stack: errorStack,
            },
            status: "failed",
          }),
          db.insert(auditEventsTable).values({
            actorType: "user",
            actorId: userId,
            eventType: "billing.subscription_cancel_failed",
            payload: {
              subscriptionId: oldSubId,
              newSubscriptionId: subscriptionId,
              error: errorMessage,
            },
          }),
        ]).catch(() => {});
        throw new Error(`Failed to cancel previous subscription ${oldSubId}: ${errorMessage}`);
      }
    }

    await db
      .update(subscriptionsTable)
      .set({
        plan,
        provider: "stripe",
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        billingInterval,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, existingSub[0].id));
  } else {
    await db.insert(subscriptionsTable).values({
      userId,
      plan,
      status: "active",
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    });
  }

  await db
    .update(agentSubscriptionsTable)
    .set({
      plan,
      providerSubscriptionId: subscriptionId,
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentSubscriptionsTable.userId, userId),
        eq(agentSubscriptionsTable.status, "active"),
      ),
    );

  await enforceAgentLimitsForUser(userId, plan);
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  const existingSub = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.providerSubscriptionId, subscriptionId))
    .limit(1);

  const billingInterval = existingSub[0]?.billingInterval ?? "monthly";
  const period = computePeriodDates(billingInterval);

  await db
    .update(subscriptionsTable)
    .set({
      status: "active",
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.providerSubscriptionId, subscriptionId));

  if (existingSub[0]?.userId) {
    await db
      .update(usersTable)
      .set({ plan: existingSub[0].plan, updatedAt: new Date() })
      .where(eq(usersTable.id, existingSub[0].userId));

    const agentSubs = await db
      .update(agentSubscriptionsTable)
      .set({
        status: "active",
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentSubscriptionsTable.userId, existingSub[0].userId),
          eq(agentSubscriptionsTable.providerSubscriptionId, subscriptionId),
        ),
      )
      .returning({ agentId: agentSubscriptionsTable.agentId });

    if (agentSubs.length > 0) {
      const agentIds = agentSubs.map((s) => s.agentId);
      await db
        .update(agentsTable)
        .set({ status: "active", updatedAt: new Date() })
        .where(inArray(agentsTable.id, agentIds));
    }
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  const [sub] = await db
    .update(subscriptionsTable)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptionsTable.providerSubscriptionId, subscriptionId))
    .returning();

  if (sub?.userId) {
    await db
      .update(usersTable)
      .set({ plan: "free", updatedAt: new Date() })
      .where(eq(usersTable.id, sub.userId));

    await enforceAgentLimitsForUser(sub.userId, "free");
  }
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  const [sub] = await db
    .update(subscriptionsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptionsTable.providerSubscriptionId, subscriptionId))
    .returning();

  if (!sub?.userId) return;

  const currentActiveSub = await getActiveUserSubscription(sub.userId);
  if (currentActiveSub) return;

  await db
    .update(usersTable)
    .set({ plan: "free", updatedAt: new Date() })
    .where(eq(usersTable.id, sub.userId));

  await enforceAgentLimitsForUser(sub.userId, "free");
}

async function enforceAgentLimitsForUser(userId: string, plan: string) {
  const limits = getPlanLimits(plan);
  const activeAgentSubs = await db
    .select({ id: agentSubscriptionsTable.id, agentId: agentSubscriptionsTable.agentId })
    .from(agentSubscriptionsTable)
    .where(
      and(
        eq(agentSubscriptionsTable.userId, userId),
        eq(agentSubscriptionsTable.status, "active"),
      ),
    )
    .orderBy(desc(agentSubscriptionsTable.createdAt));

  const excessSubs = activeAgentSubs.slice(limits.maxAgents);
  if (excessSubs.length > 0) {
    const excessSubIds = excessSubs.map(s => s.id);
    const excessAgentIds = excessSubs.map(s => s.agentId);

    await db
      .update(agentSubscriptionsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(inArray(agentSubscriptionsTable.id, excessSubIds));

    await db
      .update(agentsTable)
      .set({ status: "inactive", isPublic: false, updatedAt: new Date() })
      .where(inArray(agentsTable.id, excessAgentIds));
  }
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = env().STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
