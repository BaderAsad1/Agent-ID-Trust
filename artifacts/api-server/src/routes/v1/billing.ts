import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  getUserSubscriptions,
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
    plans: [
      {
        id: "free",
        name: "Free",
        price: { monthly: 0, yearly: 0 },
        agentLimit: 1,
        features: ["1 agent", "Basic handle", "Inbox", "Trust score", "UUID resolution"],
        cta: "Get started free",
      },
      {
        id: "builder",
        name: "Builder",
        price: { monthly: 9, yearly: 86 },
        priceIds: {
          monthly: e.STRIPE_PRICE_BUILDER_MONTHLY ?? null,
          yearly: e.STRIPE_PRICE_BUILDER_YEARLY ?? null,
        },
        agentLimit: 5,
        features: ["5 agents", "Public handle resolution", "Marketplace listing", "Priority routing", "Email support"],
        cta: "Start building",
        popular: false,
      },
      {
        id: "pro",
        name: "Pro",
        price: { monthly: 29, yearly: 279 },
        priceIds: {
          monthly: e.STRIPE_PRICE_PRO_MONTHLY ?? null,
          yearly: e.STRIPE_PRICE_PRO_YEARLY ?? null,
        },
        agentLimit: 25,
        features: ["25 agents", "Analytics dashboard", "Custom domains", "Fleet management", "Priority support"],
        cta: "Go pro",
        popular: true,
      },
      {
        id: "team",
        name: "Team",
        price: { monthly: 99, yearly: 950 },
        priceIds: {
          monthly: e.STRIPE_PRICE_TEAM_MONTHLY ?? null,
          yearly: e.STRIPE_PRICE_TEAM_YEARLY ?? null,
        },
        agentLimit: 100,
        features: ["100 agents", "Organization namespaces", "SLA guarantee", "Enterprise support", "Custom integrations"],
        cta: "Contact sales",
        popular: false,
      },
    ],
  });
});

router.get("/subscription", requireAuth, async (req, res, next) => {
  try {
    const activeSub = await getActiveUserSubscription(req.userId!);
    const plan = activeSub?.plan ?? "free";
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
    const activeSub = await getActiveUserSubscription(req.userId!);
    const plan = activeSub?.plan ?? "free";

    res.json({
      subscriptions: subs,
      currentPlan: plan,
      limits: getPlanLimits(plan),
    });
  } catch (err) {
    next(err);
  }
});

const checkoutSchema = z.object({
  plan: z.enum(["builder", "starter", "pro", "team"]).optional(),
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
      ?? getPriceIdFromPlan(body.plan ?? "builder", body.billingInterval);
    const resolvedPlan = body.plan ?? "builder";
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
