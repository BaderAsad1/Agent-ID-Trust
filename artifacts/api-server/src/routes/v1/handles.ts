import { Router } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { validateHandle, isHandleAvailable } from "../../services/agents";

const router = Router();

const HANDLE_PRICING_TIERS = [
  { minLength: 3, maxLength: 3, label: "3-character", annualPrice: 640, description: "Ultra-premium, scarce namespace" },
  { minLength: 4, maxLength: 4, label: "4-character", annualPrice: 160, description: "Premium short handle" },
  { minLength: 5, maxLength: 100, label: "5+ characters", annualPrice: 5, description: "Standard handle" },
];

function getHandlePrice(handle: string) {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  const tier = HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= t.maxLength)
    || HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
  return { annualPrice: tier.annualPrice, tier };
}

const checkHandleSchema = z.object({
  handle: z.string().min(1).max(100),
});

router.get("/check", async (req, res, next) => {
  try {
    const parsed = checkHandleSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "handle query parameter is required");
    }

    const { handle } = parsed.data;
    const normalized = handle.toLowerCase();
    const validationError = validateHandle(normalized);
    if (validationError) {
      res.json({ available: false, handle: normalized, reason: validationError });
      return;
    }

    const available = await isHandleAvailable(normalized);
    const { annualPrice, tier } = getHandlePrice(normalized);

    res.json({
      available,
      handle: normalized,
      pricing: {
        annualPrice,
        tierLabel: tier.label,
        description: tier.description,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/pricing", (_req, res) => {
  res.json({ tiers: HANDLE_PRICING_TIERS });
});

export default router;
