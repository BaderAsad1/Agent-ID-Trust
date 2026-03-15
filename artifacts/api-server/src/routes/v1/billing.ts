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
