import Stripe from "stripe";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getHandleTier } from "./handle";
import { agentOwnerWhere } from "./agents";
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

export const MARKETPLACE_FEE_BPS = 250;

const PLAN_LIMITS: Record<string, { maxPublicAgents: number; maxPrivateAgents: number; agentLimit: number; maxSubagents: number }> = {
  none: { maxPublicAgents: 10, maxPrivateAgents: 10, agentLimit: 10, maxSubagents: 0 },
  starter: { maxPublicAgents: 20, maxPrivateAgents: 20, agentLimit: 20, maxSubagents: 25 },
  pro: { maxPublicAgents: 100, maxPrivateAgents: 100, agentLimit: 100, maxSubagents: 100 },
  enterprise: { maxPublicAgents: 999, maxPrivateAgents: 999, agentLimit: 999, maxSubagents: 9999 },
  free: { maxPublicAgents: 10, maxPrivateAgents: 10, agentLimit: 10, maxSubagents: 0 },
};

const PLAN_PRICES: Record<string, Record<string, number>> = {
  starter: { monthly: 2900, yearly: 29000 },
  pro: { monthly: 7900, yearly: 79000 },
  enterprise: { monthly: 0, yearly: 0 },
};

export const ENS_HANDLE_PRICING = [
  { minLength: 3, maxLength: 3, tier: "premium_3", annualCents: 9900, annualUsd: 99, isFree: false, onChainMintPrice: 0, includesOnChainMint: true },
  { minLength: 4, maxLength: 4, tier: "premium_4", annualCents: 2900, annualUsd: 29, isFree: false, onChainMintPrice: 0, includesOnChainMint: true },
  { minLength: 5, maxLength: Infinity, tier: "standard_5plus", annualCents: 0, annualUsd: 0, isFree: true, onChainMintPrice: 500, includesOnChainMint: false },
];

export function getHandlePriceCents(handle: string): number {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  const tier = ENS_HANDLE_PRICING.find(t => len >= t.minLength && len <= t.maxLength)
    ?? ENS_HANDLE_PRICING[ENS_HANDLE_PRICING.length - 1];
  return tier.annualCents;
}

type DbPlanType = "free" | "starter" | "builder" | "pro" | "team" | "enterprise";
type AppPlanType = "starter" | "pro" | "enterprise" | "none";
type PlanType = DbPlanType | "none";
type SubStatus = "active" | "past_due" | "cancelled" | "paused" | "trialing";
type BillingInterval = "monthly" | "yearly";

import { env } from "../lib/env";
import { getStripe } from "./stripe-client";

export function getPlanLimits(plan: string) {
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
  const isPaid = plan !== "none" && plan !== "free";
  const isProOrAbove = plan === "pro" || plan === "enterprise";
  const isEnterprise = plan === "enterprise";
  return {
    plan,
    agentLimit: LAUNCH_MODE ? 999 : limits.agentLimit,
    maxAgents: LAUNCH_MODE ? 999 : limits.maxPublicAgents,
    maxPublicAgents: LAUNCH_MODE ? 999 : limits.maxPublicAgents,
    maxPrivateAgents: LAUNCH_MODE ? 999 : limits.maxPrivateAgents,
    maxSubagents: LAUNCH_MODE ? 999 : limits.maxSubagents,
    publicResolution: LAUNCH_MODE || isPaid,
    canReceiveMail: LAUNCH_MODE || plan === 'starter' || plan === 'pro' || plan === 'enterprise',
    canBePublic: LAUNCH_MODE || isPaid,
    canListOnMarketplace: LAUNCH_MODE || isPaid,
    marketplaceListing: LAUNCH_MODE || isPaid,
    canUsePremiumRouting: LAUNCH_MODE || isProOrAbove,
    premiumRouting: LAUNCH_MODE || isProOrAbove,
    canUseAdvancedAuth: LAUNCH_MODE || isProOrAbove,
    analyticsAccess: LAUNCH_MODE || isProOrAbove,
    customDomain: isProOrAbove,
    canUseTeamFeatures: isEnterprise,
    fleetManagement: plan === "pro" || plan === "enterprise",
    includesStandardHandle: LAUNCH_MODE || isPaid,
    inboxAccess: LAUNCH_MODE || isPaid,
    tasksAccess: LAUNCH_MODE || isPaid,
    supportLevel: isEnterprise ? "sla" : isProOrAbove ? "priority" : isPaid ? "email" : "community",
    launchMode: LAUNCH_MODE,
  };
}

export async function getUserPlanLimits(userId: string) {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  const sub = await getActiveUserSubscription(userId);

  // creator-attribution read: counts agents the user originally provisioned for plan-limit enforcement.
  // Intentionally uses userId (original creator) rather than ownerUserId-aware helpers, since
  // plan limits should reflect how many agents the creator registered under their subscription.
  const agentCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentsTable)
    .where(and(eq(agentsTable.userId, userId), eq(agentsTable.status, "active")));
  const currentAgentCount = agentCountResult[0]?.count ?? 0;

  const canCreateAgent = LAUNCH_MODE || (limits.agentLimit > 0 && currentAgentCount < limits.agentLimit);
  const premiumHandleDiscount = plan === "pro" || plan === "enterprise" ? 10 : 0;

  return {
    ...limits,
    currentAgentCount,
    canCreateAgent,
    premiumHandleDiscount,
    subscriptionStatus: sub?.status ?? null,
    providerSubscriptionId: sub?.providerSubscriptionId ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  };
}

export function getPlanFromPriceId(priceId: string): string {
  const e = process.env;
  const priceMap: Record<string, string> = {};
  if (e.STRIPE_PRICE_STARTER_MONTHLY) priceMap[e.STRIPE_PRICE_STARTER_MONTHLY] = "starter";
  if (e.STRIPE_PRICE_STARTER_YEARLY) priceMap[e.STRIPE_PRICE_STARTER_YEARLY] = "starter";
  if (e.STRIPE_PRICE_PRO_MONTHLY) priceMap[e.STRIPE_PRICE_PRO_MONTHLY] = "pro";
  if (e.STRIPE_PRICE_PRO_YEARLY) priceMap[e.STRIPE_PRICE_PRO_YEARLY] = "pro";
  return priceMap[priceId] ?? "none";
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
  const resolvedPlan = (plan === "free" || (plan as string) === "none") ? "starter" : plan;
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
  if (!sub) return "none";
  const plan = sub.plan;
  if (plan === "free" || (plan as string) === "none") return "none";
  if (plan === "builder") return "starter";
  if (plan === "team") return "pro";
  return plan;
}

export async function getAgentPlan(agentId: string): Promise<string> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { userId: true },
  });
  if (!agent) return "none";
  return getUserPlan(agent.userId);
}

export async function activatePlanForAgent(agentId: string, plan: string, billingInterval: BillingInterval = "monthly"): Promise<void> {
  const period = { start: new Date(), end: new Date() };
  if (billingInterval === "yearly") {
    period.end.setFullYear(period.end.getFullYear() + 1);
  } else {
    period.end.setMonth(period.end.getMonth() + 1);
  }

  await db.update(agentsTable).set({
    planTier: plan,
    inboxActive: true,
    apiAccess: true,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { userId: true },
  });
  if (!agent) return;

  const existingSub = await db.select().from(agentSubscriptionsTable)
    .where(and(eq(agentSubscriptionsTable.agentId, agentId), eq(agentSubscriptionsTable.status, "active")))
    .limit(1);

  if (existingSub.length > 0) {
    await db.update(agentSubscriptionsTable).set({
      plan: plan as PlanType,
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      updatedAt: new Date(),
    }).where(eq(agentSubscriptionsTable.id, existingSub[0].id));
  } else {
    await db.insert(agentSubscriptionsTable).values({
      agentId,
      userId: agent.userId,
      plan: plan as PlanType,
      status: "active",
      provider: "stripe",
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    });
  }
}

export async function activatePlanForUser(userId: string, plan: string, subscriptionId?: string, billingInterval: BillingInterval = "monthly"): Promise<void> {
  const period = { start: new Date(), end: new Date() };
  if (billingInterval === "yearly") {
    period.end.setFullYear(period.end.getFullYear() + 1);
  } else {
    period.end.setMonth(period.end.getMonth() + 1);
  }

  await db.update(usersTable).set({ plan: plan as PlanType, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  const existingSub = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  if (existingSub.length > 0) {
    await db.update(subscriptionsTable).set({
      plan: plan as PlanType,
      providerSubscriptionId: subscriptionId ?? existingSub[0].providerSubscriptionId,
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, existingSub[0].id));
  } else {
    await db.insert(subscriptionsTable).values({
      userId,
      plan: plan as PlanType,
      status: "active",
      provider: "stripe",
      providerSubscriptionId: subscriptionId ?? null,
      billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    });
  }

  await db.update(agentSubscriptionsTable).set({
    plan: plan as PlanType,
    billingInterval,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    updatedAt: new Date(),
  }).where(and(eq(agentSubscriptionsTable.userId, userId), eq(agentSubscriptionsTable.status, "active")));
}

export async function deactivatePlanForUser(userId: string): Promise<void> {
  await db.update(usersTable).set({ plan: "free" as PlanType, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  await db.update(subscriptionsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));
  await enforceAgentLimitsForUser(userId, "free");
}

export async function createPlanCheckout(
  userId: string,
  plan: "starter" | "pro",
  billingInterval: BillingInterval,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string | null; error?: string }> {
  return createCheckoutSession(userId, plan, billingInterval, successUrl, cancelUrl);
}

export async function createHandleCheckout(
  userId: string,
  handle: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string | null; error?: string; priceCents: number }> {
  const result = await createHandleCheckoutSession(userId, handle, successUrl, cancelUrl);
  return { url: result.url, error: result.error, priceCents: result.priceCents };
}

export async function getPortalUrl(userId: string): Promise<string> {
  return getCustomerPortalUrl(userId);
}

export async function setupStripeProducts(): Promise<void> {
  const stripe = getStripe();
  const APP_URL = process.env.APP_URL || "https://getagent.id";

  logger.info("[billing] Setting up Stripe products for Starter and Pro plans");

  const starterProduct = await stripe.products.create({
    name: "Agent ID Starter",
    description: "Starter plan — 5 agents, inbox, tasks",
    metadata: { plan: "starter" },
  });

  await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 2900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "starter", interval: "monthly" },
    nickname: "Starter Monthly",
  });

  await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 29000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "starter", interval: "yearly" },
    nickname: "Starter Yearly",
  });

  const proProduct = await stripe.products.create({
    name: "Agent ID Pro",
    description: "Pro plan — 25 agents, fleet, analytics",
    metadata: { plan: "pro" },
  });

  await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 7900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "pro", interval: "monthly" },
    nickname: "Pro Monthly",
  });

  await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 79000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "pro", interval: "yearly" },
    nickname: "Pro Yearly",
  });

  logger.info("[billing] Stripe products created. Add price IDs to STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_STARTER_YEARLY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY env vars.");
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
    where: agentOwnerWhere(agentId, userId),
    columns: { id: true, handle: true, status: true, displayName: true },
  });

  if (!agent) return null;

  const agentSub = await getAgentSubscription(agentId);
  const userSub = await getActiveUserSubscription(userId);
  const rawUserPlan = userSub?.plan ?? "none";
  const userPlan = (rawUserPlan === "free") ? "none" : (rawUserPlan === "builder") ? "starter" : (rawUserPlan === "team") ? "pro" : rawUserPlan;
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
    where: agentOwnerWhere(agentId, userId),
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
  const userPlan = userSub?.plan ?? "none";
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
    where: agentOwnerWhere(agentId, userId),
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

  if (plan === "free" || plan === "none" || plan === "enterprise") {
    return { url: null, error: "INVALID_PLAN" };
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
            description: `Up to ${(PLAN_LIMITS[plan] ?? PLAN_LIMITS.none).maxPublicAgents} public agent${(PLAN_LIMITS[plan] ?? PLAN_LIMITS.none).maxPublicAgents > 1 ? "s" : ""}`,
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
  if (!userSub || userSub.plan === "none") return false;

  // creator-attribution read: checks if the subscription owner has already used their one-time
  // included-handle benefit across any agent they originally provisioned. Intentionally uses
  // userId (creator) rather than effective-owner helpers.
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
  agentId?: string,
): Promise<{ url: string | null; error?: string; priceCents: number; included?: boolean }> {
  const priceCents = getHandlePriceCents(handle);

  const included = await isEligibleForIncludedHandle(userId, handle);
  if (included) {
    // creator-attribution read: marks the included-handle benefit as used on the provisioner's agent.
    // Intentionally uses userId (original creator) since the benefit is tied to the subscription owner.
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
  const tierLabel = handleLen <= 3 ? "3-char ENS Handle" : handleLen === 4 ? "4-char ENS Handle" : "5+ char ENS Handle";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Handle: @${handle}.agentid`,
            description: `${tierLabel} — annual renewal, cancel to release`,
          },
          unit_amount: priceCents,
          recurring: { interval: "year" },
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
      ...(agentId ? { agentId } : {}),
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        type: "handle_registration",
        handle,
        ...(agentId ? { agentId } : {}),
      },
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
  const rawPlan = userSub?.plan ?? "none";
  const plan = (rawPlan === "free") ? "none" : (rawPlan === "builder") ? "starter" : (rawPlan === "team") ? "pro" : rawPlan;
  const limits = getPlanLimits(plan);

  const featurePlanMap: Record<string, string> = {
    canReceiveMail: "starter",
    canBePublic: "starter",
    canListOnMarketplace: "starter",
    canUsePremiumRouting: "pro",
    canUseAdvancedAuth: "pro",
    canUseTeamFeatures: "pro",
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

  if (sessionType === "handle_mint_request") {
    const handle = session.metadata?.handle;
    const userId = session.metadata?.userId;
    const agentIdMeta = session.metadata?.agentId;

    if (!handle || !userId || !agentIdMeta) {
      logger.warn({ sessionId: session.id }, "[billing] handle_mint_request: missing handle, userId, or agentId in metadata — skipping");
      return;
    }

    // creator-attribution read: userId here is the Stripe checkout session metadata userId
    // (the person who initiated and paid for the mint). Intentionally matches against the original
    // creator (userId) rather than effective-owner, since this is payment-provisioner validation.
    const agent = await db.query.agentsTable.findFirst({
      where: and(eq(agentsTable.id, agentIdMeta), eq(agentsTable.userId, userId)),
      columns: { id: true, handle: true, nftStatus: true },
    });

    if (!agent) {
      logger.warn({ sessionId: session.id, agentId: agentIdMeta, userId }, "[billing] handle_mint_request: agent not found — skipping");
      return;
    }

    if (
      agent.nftStatus === "anchored" ||
      agent.nftStatus === "minted" ||
      agent.nftStatus === "active" ||
      agent.nftStatus === "pending_anchor" ||
      agent.nftStatus === "pending_mint"
    ) {
      logger.info({ sessionId: session.id, agentId: agent.id, nftStatus: agent.nftStatus }, "[billing] handle_mint_request: already anchored or queued — skipping");
      return;
    }

    // Issue a claim ticket so the user can later call /claim-nft with their wallet.
    let claimTicket: string | undefined;
    try {
      const { issueClaimTicket } = await import("./claim-ticket");
      claimTicket = issueClaimTicket({ agentId: agent.id, handle: handle.toLowerCase() }) ?? undefined;
    } catch (ticketErr) {
      logger.warn({ ticketErr, agentId: agent.id }, "[billing] handle_mint_request: failed to issue claim ticket — proceeding without");
    }

    await db.update(agentsTable)
      .set({
        nftStatus: "pending_anchor",
        metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(claimTicket ?? null)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    try {
      const { nftAuditLogTable } = await import("@workspace/db/schema");
      await db.insert(nftAuditLogTable).values({
        agentId: agent.id,
        handle: handle.toLowerCase(),
        action: "queue_mint",
        chain: "base",
        status: "success",
        metadata: { source: "stripe_checkout", sessionId: session.id, userId, mintPriceCents: 500, claimTicketIssued: !!claimTicket },
      });
    } catch (auditErr) {
      logger.warn({ auditErr, agentId: agent.id }, "[billing] handle_mint_request: failed to write audit log");
    }

    logger.info({ agentId: agent.id, handle, sessionId: session.id, claimTicketIssued: !!claimTicket }, "[billing] handle_mint_request: queued for on-chain minting after payment");
    return;
  }

  if (sessionType === "handle_registration") {
    const handle = session.metadata?.handle;
    const userId = session.metadata?.userId;
    const agentIdMeta = session.metadata?.agentId;
    if (handle && userId) {
      const normalizedHandle = handle.toLowerCase();
      const { validateHandle: validateHandleFn } = await import("./agents");
      const validationError = validateHandleFn(normalizedHandle);
      if (validationError) {
        logger.warn({ handle, userId, validationError }, "[billing] Skipping handle assignment — handle failed validation in checkout completion");
        return;
      }

      const { isHandleReserved: isReservedFn, checkHandleRegistrationLimits: checkLimitsFn } = await import("./handle");
      if (isReservedFn(normalizedHandle)) {
        logger.warn({ handle, userId }, "[billing] Skipping handle assignment — handle is reserved");
        return;
      }

      const limitResult = await checkLimitsFn(userId, normalizedHandle);
      if (limitResult) {
        logger.warn({ handle, userId, reason: limitResult.message }, "[billing] Skipping handle assignment — limit check failed at checkout completion");
        return;
      }

      // creator-attribution reads: userId is from Stripe checkout metadata (the paying provisioner).
      // Intentionally uses userId (original creator) rather than effective-owner helpers —
      // these are payment-settlement lookups tied to who initiated and paid for the handle checkout.
      let agentRecord: { id: string } | undefined;
      if (agentIdMeta) {
        agentRecord = await db.query.agentsTable.findFirst({
          where: and(eq(agentsTable.id, agentIdMeta), eq(agentsTable.userId, userId)),
          columns: { id: true },
        });
      }
      if (!agentRecord) {
        agentRecord = await db.query.agentsTable.findFirst({
          where: and(eq(agentsTable.handle, normalizedHandle), eq(agentsTable.userId, userId)),
          columns: { id: true },
        });
      }
      if (agentRecord) {
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        const tier = getHandleTier(normalizedHandle);
        const handleLen = normalizedHandle.replace(/[^a-z0-9]/g, "").length;
        const isNftEligible = handleLen <= 4;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as { id?: string } | null)?.id ?? null;

        const fullAgent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.id, agentRecord.id),
          columns: { id: true, metadata: true },
        });
        const existingMeta = (fullAgent?.metadata as Record<string, unknown>) ?? {};

        await Promise.all([
          markHandlePaymentComplete(agentRecord.id),
          db.update(agentsTable)
            .set({
              handle: normalizedHandle,
              handleTier: getHandleTier(normalizedHandle).tier,
              handlePaid: true,
              handleExpiresAt: expiresAt,
              handleRegisteredAt: new Date(),
              handleStripeSubscriptionId: subscriptionId,
              nftStatus: isNftEligible ? "pending_anchor" : "none",
              nftCustodian: isNftEligible ? "platform" : null,
              metadata: {
                ...existingMeta,
                ...(isNftEligible ? { nftQueuedAt: new Date().toISOString() } : {}),
              },
              updatedAt: new Date(),
            })
            .where(eq(agentsTable.id, agentRecord.id)),
        ]);

        logger.info({ agentId: agentRecord.id, handle: normalizedHandle, tier: tier.tier, isNftEligible }, "[billing] Handle activated from checkout");

        if (isNftEligible) {
          logger.info({ agentId: agentRecord.id, handle: normalizedHandle, handleLen }, "[billing] Handle is NFT-eligible (<=4 char), attempting registerOnChain");
          try {
            const { registerOnChain } = await import("./chains/base");
            const { nftAuditLogTable } = await import("@workspace/db/schema");
            const onchainResult = await registerOnChain(normalizedHandle, tier.tier, expiresAt);

            if (onchainResult) {
              // Issue a claim ticket so user can call /claim-nft later to transfer to their wallet.
              // Keeps claim-ticket policy consistent across all NFT-eligible payment paths.
              let regClaimTicket: string | null = null;
              try {
                const { issueClaimTicket } = await import("./claim-ticket");
                regClaimTicket = issueClaimTicket({ agentId: agentRecord.id, handle: normalizedHandle }) ?? null;
              } catch {}

              await db.update(agentsTable)
                .set({
                  nftStatus: "active",
                  nftCustodian: "platform",
                  erc8004AgentId: onchainResult.agentId,
                  erc8004Chain: onchainResult.chain,
                  erc8004Registry: onchainResult.contractAddress,
                  chainRegistrations: [
                    {
                      chain: "base",
                      agentId: onchainResult.agentId,
                      txHash: onchainResult.txHash,
                      contractAddress: onchainResult.contractAddress,
                      registeredAt: new Date().toISOString(),
                      custodian: "platform",
                    },
                  ],
                  metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(regClaimTicket)}::jsonb, true)`,
                  updatedAt: new Date(),
                })
                .where(eq(agentsTable.id, agentRecord.id));

              await db.insert(nftAuditLogTable).values({
                agentId: agentRecord.id,
                handle: normalizedHandle,
                action: "register",
                chain: "base",
                txHash: onchainResult.txHash,
                contractAddress: onchainResult.contractAddress,
                custodian: "platform",
                status: "success",
                metadata: { agentId: onchainResult.agentId, tier: tier.tier, claimTicketIssued: !!regClaimTicket },
              });

              logger.info({ agentId: agentRecord.id, handle: normalizedHandle, erc8004AgentId: onchainResult.agentId, claimTicketIssued: !!regClaimTicket }, "[billing] Handle registered on-chain — claim ticket issued for custody transfer");
            } else {
              logger.info({ agentId: agentRecord.id, handle: normalizedHandle }, "[billing] On-chain anchoring disabled — nft_status=pending_anchor");
            }
          } catch (onchainErr) {
            const errMsg = onchainErr instanceof Error ? onchainErr.message : String(onchainErr);
            logger.error({ agentId: agentRecord.id, handle: normalizedHandle, error: errMsg }, "[billing] registerOnChain failed — setting nft_status=pending_anchor");

            let pendingClaimTicket: string | null = null;
            try {
              const { issueClaimTicket } = await import("./claim-ticket");
              pendingClaimTicket = issueClaimTicket({ agentId: agentRecord.id, handle: normalizedHandle }) ?? null;
            } catch {}

            await db.update(agentsTable)
              .set({
                nftStatus: "pending_anchor",
                metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(pendingClaimTicket)}::jsonb, true)`,
                updatedAt: new Date(),
              })
              .where(eq(agentsTable.id, agentRecord.id));

            try {
              const { nftAuditLogTable } = await import("@workspace/db/schema");
              await db.insert(nftAuditLogTable).values({
                agentId: agentRecord.id,
                handle: normalizedHandle,
                action: "register",
                chain: "base",
                status: "failed",
                errorMessage: errMsg,
                metadata: { tier: tier.tier, claimTicketIssued: !!pendingClaimTicket },
              });
            } catch {}
          }
        }
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

  const agentWithHandleSub = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handleStripeSubscriptionId, subscriptionId),
    columns: { id: true, handle: true, handleTier: true },
  });

  if (agentWithHandleSub) {
    const { startHandleGracePeriod } = await import("./handle");
    await startHandleGracePeriod(agentWithHandleSub.id);
    logger.info({ agentId: agentWithHandleSub.id, handle: agentWithHandleSub.handle, subscriptionId }, "[billing] Handle grace period started on payment failure");
    return;
  }

  const [sub] = await db
    .update(subscriptionsTable)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptionsTable.providerSubscriptionId, subscriptionId))
    .returning();

  if (sub?.userId) {
    await db
      .update(usersTable)
      .set({ plan: "free" as PlanType, updatedAt: new Date() })
      .where(eq(usersTable.id, sub.userId));

    await enforceAgentLimitsForUser(sub.userId, "none");
  }
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  const agentWithHandleSub = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handleStripeSubscriptionId, subscriptionId),
    columns: { id: true, handle: true, handleTier: true },
  });

  if (agentWithHandleSub) {
    const { startHandleGracePeriod } = await import("./handle");
    await startHandleGracePeriod(agentWithHandleSub.id);
    logger.info({ agentId: agentWithHandleSub.id, handle: agentWithHandleSub.handle, subscriptionId }, "[billing] Handle grace period started on subscription deletion");
    return;
  }

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
    .set({ plan: "free" as PlanType, updatedAt: new Date() })
    .where(eq(usersTable.id, sub.userId));

  await enforceAgentLimitsForUser(sub.userId, "none");
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

const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT_CONTRACT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

export interface CryptoCheckoutResult {
  paymentAddress: string;
  amount: string;
  amountUsdc: string;
  token: "USDC" | "USDT";
  tokenContract: string;
  chain: "base";
  chainId: number;
  reference: string;
  handle: string;
  expiresAt: string;
  instructions: string;
}

export async function createCryptoCheckoutSession(
  handle: string,
  userId: string,
  token: "USDC" | "USDT" = "USDC",
): Promise<CryptoCheckoutResult> {
  const platformWallet = process.env.BASE_PLATFORM_WALLET;
  if (!platformWallet) {
    throw new Error("BASE_PLATFORM_WALLET is not configured — crypto payments unavailable");
  }

  const priceCents = getHandlePriceCents(handle);
  const priceUsd = (priceCents / 100).toFixed(2);

  const reference = `agentid-${handle}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const tokenContract = token === "USDT" ? BASE_USDT_CONTRACT : BASE_USDC_CONTRACT;

  return {
    paymentAddress: platformWallet.toLowerCase(),
    amount: priceUsd,
    amountUsdc: priceUsd,
    token,
    tokenContract,
    chain: "base",
    chainId: 8453,
    reference,
    handle,
    expiresAt: expiresAt.toISOString(),
    instructions: `Send exactly ${priceUsd} ${token} to ${platformWallet} on Base (chainId 8453). Include "${reference}" in the transaction memo/data if your wallet supports it. Payment expires at ${expiresAt.toUTCString()}.`,
  };
}

export async function pollForCryptoPayment(
  handle: string,
  userId: string,
  reference: string,
  expectedAmountCents: number,
  token: "USDC" | "USDT",
  agentId?: string,
): Promise<{ confirmed: boolean; txHash?: string }> {
  const rpcUrl = process.env.BASE_RPC_URL;
  const platformWallet = process.env.BASE_PLATFORM_WALLET;

  if (!rpcUrl || !platformWallet) {
    logger.warn({ handle, reference }, "[billing] crypto-payment: BASE_RPC_URL or BASE_PLATFORM_WALLET not set — cannot verify");
    return { confirmed: false };
  }

  const { createPublicClient, http, parseAbi, formatUnits } = await import("viem");
  const { base } = await import("viem/chains");

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  const tokenContract = (token === "USDT" ? BASE_USDT_CONTRACT : BASE_USDC_CONTRACT) as `0x${string}`;
  const expectedAmount = BigInt(expectedAmountCents) * BigInt(10000);

  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock - BigInt(1000);

  const logs = await publicClient.getLogs({
    address: tokenContract,
    event: {
      type: "event",
      name: "Transfer",
      inputs: [
        { indexed: true, name: "from", type: "address" },
        { indexed: true, name: "to", type: "address" },
        { indexed: false, name: "value", type: "uint256" },
      ],
    },
    args: { to: platformWallet as `0x${string}` },
    fromBlock,
    toBlock: "latest",
  });

  for (const log of logs) {
    const value = log.args.value as bigint | undefined;
    if (!value) continue;
    if (value >= expectedAmount) {
      const txHash = log.transactionHash ?? undefined;
      logger.info({ handle, reference, txHash, value: value.toString(), expectedAmount: expectedAmount.toString() }, "[billing] crypto-payment: payment detected");

      if (agentId) {
        const { assignHandleToAgent } = await import("./handle");
        const { getHandleTier: getHandleTierFn } = await import("./handle");
        const tierInfo = getHandleTierFn(handle);
        try {
          await assignHandleToAgent(agentId, handle, { tier: tierInfo.tier, paid: true });
          logger.info({ handle, agentId }, "[billing] crypto-payment: handle reserved after payment confirmation");

          const onchainEnabled = process.env.ONCHAIN_MINTING_ENABLED === "true" || process.env.ONCHAIN_MINTING_ENABLED === "1";
          let anchoredSuccessfully = false;

          if (onchainEnabled) {
            const { registerOnChain } = await import("./chains/base");
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            const onchainResult = await registerOnChain(handle, tierInfo.tier, expiresAt).catch((err: unknown) => {
              logger.error({ handle, error: err instanceof Error ? err.message : String(err) }, "[billing] crypto-payment: registerOnChain failed after payment");
              return null;
            });
            if (onchainResult) {
              anchoredSuccessfully = true;
              // Issue a claim ticket so user can call /claim-nft to transfer to their wallet.
              // This keeps the unified claim-ticket policy consistent across Stripe + crypto paths.
              let cryptoAnchorClaimTicket: string | null = null;
              try {
                const { issueClaimTicket } = await import("./claim-ticket");
                cryptoAnchorClaimTicket = issueClaimTicket({ agentId, handle }) ?? null;
              } catch {}

              const { nftAuditLogTable } = await import("@workspace/db/schema");
              await db.update(agentsTable)
                .set({
                  nftStatus: "active",
                  erc8004AgentId: onchainResult.agentId,
                  erc8004Chain: onchainResult.chain,
                  erc8004Registry: onchainResult.contractAddress,
                  chainRegistrations: [
                    {
                      chain: "base",
                      agentId: onchainResult.agentId,
                      txHash: onchainResult.txHash,
                      contractAddress: onchainResult.contractAddress,
                      registeredAt: new Date().toISOString(),
                      custodian: "platform",
                    },
                  ],
                  nftCustodian: "platform",
                  metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(cryptoAnchorClaimTicket)}::jsonb, true)`,
                  updatedAt: new Date(),
                })
                .where(eq(agentsTable.id, agentId));

              await db.insert(nftAuditLogTable).values({
                agentId,
                handle,
                action: "register",
                chain: "base",
                txHash: onchainResult.txHash,
                contractAddress: onchainResult.contractAddress,
                custodian: "platform",
                status: "success",
                metadata: { agentId: onchainResult.agentId, tier: tierInfo.tier, paymentRef: reference, claimTicketIssued: !!cryptoAnchorClaimTicket },
              });

              logger.info({ handle, agentId, claimTicketIssued: !!cryptoAnchorClaimTicket }, "[billing] crypto-payment: on-chain anchoring completed — claim ticket issued for custody transfer");
            }
          }

          // If on-chain registration didn't succeed (disabled or failed), queue for anchor
          // and issue a claim ticket so the user can initiate custody transfer later.
          if (!anchoredSuccessfully) {
            let cryptoClaimTicket: string | null = null;
            try {
              const { issueClaimTicket } = await import("./claim-ticket");
              cryptoClaimTicket = issueClaimTicket({ agentId, handle }) ?? null;
            } catch {}

            await db.update(agentsTable)
              .set({
                nftStatus: "pending_anchor",
                nftCustodian: "platform",
                metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(cryptoClaimTicket)}::jsonb, true)`,
                updatedAt: new Date(),
              })
              .where(eq(agentsTable.id, agentId));

            logger.info({ handle, agentId, claimTicketIssued: !!cryptoClaimTicket }, "[billing] crypto-payment: on-chain anchoring not completed — queued as pending_anchor with claim ticket");
          }
        } catch (err) {
          logger.error({ handle, agentId, error: err instanceof Error ? err.message : String(err) }, "[billing] crypto-payment: post-payment processing error");
        }
      }

      return { confirmed: true, txHash };
    }
  }

  return { confirmed: false };
}
