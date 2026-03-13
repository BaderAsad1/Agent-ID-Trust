import Stripe from "stripe";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  subscriptionsTable,
  agentSubscriptionsTable,
  agentsTable,
  webhookEventsTable,
  type Subscription,
  type AgentSubscription,
} from "@workspace/db/schema";

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  pro: 5,
  team: 10,
};

const PLAN_PRICES: Record<string, Record<string, number>> = {
  starter: { monthly: 900, yearly: 9000 },
  pro: { monthly: 2900, yearly: 29000 },
  team: { monthly: 7900, yearly: 79000 },
};

type PlanType = "free" | "starter" | "pro" | "team";
type SubStatus = "active" | "past_due" | "cancelled" | "paused" | "trialing";
type BillingInterval = "monthly" | "yearly";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key, { apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion });
}

export function getPlanLimits(plan: string) {
  return {
    maxAgents: PLAN_LIMITS[plan] ?? 1,
    canListOnMarketplace: plan !== "free",
    canUsePremiumRouting: plan === "pro" || plan === "team",
    canUseAdvancedAuth: plan === "pro" || plan === "team",
    canUseTeamFeatures: plan === "team",
  };
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
    columns: { id: true, status: true },
  });

  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };

  const existingSub = await getAgentSubscription(agentId);
  if (existingSub && existingSub.status === "active") {
    return { success: true, subscription: existingSub };
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
            description: `Up to ${PLAN_LIMITS[plan]} active agent${PLAN_LIMITS[plan] > 1 ? "s" : ""}`,
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
  feature: "canListOnMarketplace" | "canUsePremiumRouting" | "canUseAdvancedAuth" | "canUseTeamFeatures",
): Promise<{ allowed: boolean; currentPlan: string; requiredPlan: string }> {
  const userSub = await getActiveUserSubscription(userId);
  const plan = userSub?.plan ?? "free";
  const limits = getPlanLimits(plan);

  const featurePlanMap: Record<string, string> = {
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

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
        console.error("[billing] Failed to cancel previous subscription", {
          userId,
          oldSubscriptionId: oldSubId,
          newSubscriptionId: subscriptionId,
          error: err instanceof Error ? err.message : String(err),
        });
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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
