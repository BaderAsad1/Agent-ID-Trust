import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import {
  getUserSubscriptions,
  getAgentBillingStatus,
  activateAgent,
  deactivateAgent,
  createCheckoutSession,
  createHandleCheckoutSession,
  getHandlePriceCents,
  getPlanLimits,
  getActiveUserSubscription,
} from "../../services/billing";
import { logActivity } from "../../services/activity-logger";

const router = Router();

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
  plan: z.enum(["starter", "pro", "team"]),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    const body = checkoutSchema.parse(req.body);

    const result = await createCheckoutSession(
      req.userId!,
      body.plan,
      body.billingInterval,
      body.successUrl,
      body.cancelUrl,
    );

    if (result.error) {
      res.status(400).json({ code: result.error, message: `Checkout failed: ${result.error}` });
      return;
    }

    res.json({ url: result.url });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "STRIPE_SECRET_KEY is not configured") {
      res.status(503).json({
        code: "STRIPE_NOT_CONFIGURED",
        message: "Payment processing is not yet configured",
      });
      return;
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
    const priceCents = getHandlePriceCents(normalizedHandle);

    const result = await createHandleCheckoutSession(
      req.userId!,
      normalizedHandle,
      body.successUrl,
      body.cancelUrl,
    );

    if (result.error) {
      res.status(400).json({ code: result.error, message: `Handle checkout failed: ${result.error}` });
      return;
    }

    res.json({
      url: result.url,
      handle: normalizedHandle,
      priceCents,
      priceDollars: priceCents / 100,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ code: "VALIDATION_ERROR", errors: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "STRIPE_SECRET_KEY is not configured") {
      res.status(503).json({
        code: "STRIPE_NOT_CONFIGURED",
        message: "Payment processing is not yet configured. Handle registered with payment pending.",
      });
      return;
    }
    next(err);
  }
});

router.post("/agents/:agentId/activate", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await activateAgent(agentId, req.userId!);

    if (!result.success) {
      const statusCode = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      res.status(statusCode).json({ code: result.error, message: result.error });
      return;
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

router.post("/agents/:agentId/deactivate", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await deactivateAgent(agentId, req.userId!);

    if (!result.success) {
      res.status(404).json({ code: result.error, message: result.error });
      return;
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

router.get("/agents/:agentId/status", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const status = await getAgentBillingStatus(agentId, req.userId!);

    if (!status) {
      res.status(404).json({ code: "NOT_FOUND", message: "Agent not found" });
      return;
    }

    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
