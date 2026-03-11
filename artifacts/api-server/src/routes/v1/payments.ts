import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  createPaymentIntent,
  authorizePaymentIntent,
  listProviders,
  getPaymentLedger,
} from "../../services/payment-providers";

const router = Router();

const createIntentSchema = z.object({
  provider: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  targetType: z.string(),
  targetId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const authorizeSchema = z.object({
  paymentIntentId: z.string().uuid(),
  authorizationType: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.get("/providers", (_req, res, next) => {
  try {
    const providers = listProviders();
    res.json({ providers });
  } catch (err) {
    next(err);
  }
});

router.post("/intents", requireAuth, async (req, res, next) => {
  try {
    const parsed = createIntentSchema.parse(req.body);
    const result = await createPaymentIntent(parsed.provider, {
      amount: parsed.amount,
      currency: parsed.currency,
      initiatorType: "user",
      initiatorId: req.userId!,
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      metadata: parsed.metadata,
    });
    if (!result.success) {
      const code = result.error === "PROVIDER_NOT_FOUND" ? 404
        : result.error === "PROVIDER_NOT_AVAILABLE" ? 503 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.intent);
  } catch (err) {
    next(err);
  }
});

router.post("/authorize", requireAuth, async (req, res, next) => {
  try {
    const parsed = authorizeSchema.parse(req.body);
    const result = await authorizePaymentIntent(
      parsed.paymentIntentId,
      parsed.authorizationType,
      parsed.metadata,
    );
    if (!result.success) {
      const code = result.error === "INTENT_NOT_FOUND" ? 404 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.authorization);
  } catch (err) {
    next(err);
  }
});

router.get("/ledger", requireAuth, async (req, res, next) => {
  try {
    const accountType = (req.query.accountType as string) ?? "user";
    const accountId = (req.query.accountId as string) ?? req.userId!;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await getPaymentLedger(accountType, accountId, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
