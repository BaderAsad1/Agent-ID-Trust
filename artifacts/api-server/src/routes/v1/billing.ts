import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  getUserSubscriptions,
  getUserPlan,
  getAgentBillingStatus,
  activateAgent,
  deactivateAgent,
  createCheckoutSession,
  createHandleCheckoutSession,
  getPlanLimits,
  getActiveUserSubscription,
  cancelSubscription,
  getCustomerPortalUrl,
  getPriceIdFromPlan,
} from "../../services/billing";
import { logActivity } from "../../services/activity-logger";

const router = Router();

router.get("/plans", (req, res) => {
  const e = process.env;
  res.json({
    launchMode: e.LAUNCH_MODE === "true",
    plans: ["starter", "pro", "enterprise"],
    planDetails: [
      {
        id: "starter",
        name: "Starter",
        price: { monthly: 29, yearly: 290 },
        priceIds: {
          monthly: e.STRIPE_PRICE_STARTER_MONTHLY ?? null,
          yearly: e.STRIPE_PRICE_STARTER_YEARLY ?? null,
        },
        agentLimit: 5,
        features: ["5 agents", "Inbox access", "Tasks", "Handle (5+ chars, $10/yr)", "Trust score", "Email support"],
        cta: "Start for $29/mo",
        popular: false,
      },
      {
        id: "pro",
        name: "Pro",
        price: { monthly: 79, yearly: 790 },
        priceIds: {
          monthly: e.STRIPE_PRICE_PRO_MONTHLY ?? null,
          yearly: e.STRIPE_PRICE_PRO_YEARLY ?? null,
        },
        agentLimit: 25,
        features: ["25 agents", "Fleet management", "Analytics dashboard", "Custom domains", "Priority support"],
        cta: "Go Pro",
        popular: true,
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: { monthly: null, yearly: null },
        priceIds: { monthly: null, yearly: null },
        agentLimit: null,
        features: ["Unlimited agents", "SLA guarantee", "Dedicated support", "Custom integrations", "Enterprise contract"],
        cta: "Contact sales",
        popular: false,
        contactUrl: "mailto:enterprise@getagent.id",
      },
    ],
    handlePricing: [
      { tier: "reserved_1_2", chars: "1-2", annualUsd: null, annualCents: null, note: "Reserved" },
      { tier: "premium_3", chars: "3", annualUsd: 640, annualCents: 64000, note: "On-chain premium" },
      { tier: "premium_4", chars: "4", annualUsd: 160, annualCents: 16000, note: "On-chain premium" },
      { tier: "standard_5plus", chars: "5+", annualUsd: 10, annualCents: 1000, note: "Free with active plan" },
    ],
  });
});

router.get("/subscription", requireAuth, async (req, res, next) => {
  try {
    const activeSub = await getActiveUserSubscription(req.userId!);
    const rawPlan = activeSub?.plan ?? "none";
    const plan = (rawPlan === "free" || rawPlan === "builder") ? (rawPlan === "builder" ? "starter" : "none") : (rawPlan === "team" ? "pro" : rawPlan);
    const limits = getPlanLimits(plan);

    res.json({
      plan: limits.plan,
      limits,
      subscription: activeSub
        ? {
            status: activeSub.status,
            billingInterval: activeSub.billingInterval,
            currentPeriodStart: activeSub.currentPeriodStart,
            currentPeriodEnd: activeSub.currentPeriodEnd,
            providerSubscriptionId: activeSub.providerSubscriptionId,
          }
        : null,
      launchMode: process.env.LAUNCH_MODE === "true",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const subs = await getUserSubscriptions(req.userId!);
    const currentPlan = await getUserPlan(req.userId!);

    res.json({
      subscriptions: subs,
      currentPlan,
      limits: getPlanLimits(currentPlan),
    });
  } catch (err) {
    next(err);
  }
});

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro"]).optional(),
  priceId: z.string().optional(),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
}).refine((d) => d.plan || d.priceId, { message: "priceId or plan required" });

router.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    const body = checkoutSchema.parse(req.body);
    const APP_URL = process.env.APP_URL || "https://getagent.id";

    const resolvedPriceId = body.priceId
      ?? (body.plan ? getPriceIdFromPlan(body.plan, body.billingInterval) : undefined);
    const resolvedPlan = body.plan ?? "starter";
    const successUrl = body.successUrl ?? `${APP_URL}/dashboard?upgraded=true`;
    const cancelUrl = body.cancelUrl ?? `${APP_URL}/pricing`;

    if (resolvedPriceId) {
      const { getStripe } = await import("../../services/stripe-client");
      const { db } = await import("@workspace/db");
      const { usersTable } = await import("@workspace/db/schema");
      const { eq } = await import("drizzle-orm");

      const stripe = getStripe();
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.userId!),
        columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
      });

      let customerId = user?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user?.email ?? undefined,
          name: user?.displayName ?? undefined,
          metadata: { userId: req.userId! },
        });
        customerId = customer.id;
        await db.update(usersTable)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(usersTable.id, req.userId!));
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: { userId: req.userId!, plan: resolvedPlan, billingInterval: body.billingInterval },
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        subscription_data: { metadata: { userId: req.userId! } },
      });

      return res.json({ url: session.url });
    }

    const result = await createCheckoutSession(
      req.userId!,
      resolvedPlan,
      body.billingInterval,
      successUrl,
      cancelUrl,
    );

    if (result.error) {
      throw new AppError(400, result.error, `Checkout failed: ${result.error}`);
    }

    res.json({ url: result.url });
  } catch (err: unknown) {
    if (err instanceof AppError) return next(err);
    if (err instanceof z.ZodError) {
      return next(new AppError(400, "VALIDATION_ERROR", "Invalid input", err.issues));
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "STRIPE_SECRET_KEY is not configured") {
      return next(new AppError(503, "STRIPE_NOT_CONFIGURED", "Payment processing is not yet configured"));
    }
    next(err);
  }
});

router.post("/portal", requireAuth, async (req, res, next) => {
  try {
    const url = await getCustomerPortalUrl(req.userId!);
    res.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("No Stripe customer")) {
      return next(new AppError(404, "NO_SUBSCRIPTION", "No active subscription found"));
    }
    if (message === "STRIPE_SECRET_KEY is not configured") {
      return next(new AppError(503, "STRIPE_NOT_CONFIGURED", "Payment processing is not yet configured"));
    }
    next(err);
  }
});

router.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    await cancelSubscription(req.userId!);
    res.json({ message: "Subscription will cancel at end of billing period" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "STRIPE_SECRET_KEY is not configured") {
      return next(new AppError(503, "STRIPE_NOT_CONFIGURED", "Payment processing is not yet configured"));
    }
    next(err);
  }
});

const handleCheckoutSchema = z.object({
  handle: z.string().min(3).max(100),
  agentId: z.string().uuid().optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/handle-checkout", requireAuth, async (req, res, next) => {
  try {
    const body = handleCheckoutSchema.parse(req.body);
    const normalizedHandle = body.handle.toLowerCase();

    const result = await createHandleCheckoutSession(
      req.userId!,
      normalizedHandle,
      body.successUrl,
      body.cancelUrl,
      body.agentId,
    );

    if (result.error) {
      throw new AppError(400, result.error, `Handle checkout failed: ${result.error}`);
    }

    const effectivePrice = result.priceCents;
    res.json({
      url: result.url,
      handle: normalizedHandle,
      priceCents: effectivePrice,
      priceDollars: effectivePrice / 100,
      included: result.included ?? false,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) return next(err);
    if (err instanceof z.ZodError) {
      return next(new AppError(400, "VALIDATION_ERROR", "Invalid input", err.issues));
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "STRIPE_SECRET_KEY is not configured") {
      return next(new AppError(503, "STRIPE_NOT_CONFIGURED", "Payment processing is not yet configured. Handle registered with payment pending."));
    }
    next(err);
  }
});

router.post("/agents/:agentId/activate", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await activateAgent(agentId, req.userId!);

    if (!result.success) {
      const statusCode = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      throw new AppError(statusCode, result.error!, result.error!);
    }

    await logActivity({
      agentId,
      eventType: "agent.status_changed",
      payload: { action: "activated", plan: result.subscription?.plan },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ subscription: result.subscription });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:agentId/deactivate", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await deactivateAgent(agentId, req.userId!);

    if (!result.success) {
      throw new AppError(404, result.error!, result.error!);
    }

    await logActivity({
      agentId,
      eventType: "agent.status_changed",
      payload: { action: "deactivated" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Agent deactivated. Identity preserved." });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/:agentId/status", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const status = await getAgentBillingStatus(agentId, req.userId!);

    if (!status) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
