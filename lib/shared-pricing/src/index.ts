export interface HandlePricingTier {
  minLength: number;
  maxLength: number | undefined;
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
  isReserved: boolean;
  isFreeWithPlan: boolean;
}

export const HANDLE_PRICING_TIERS: HandlePricingTier[] = [
  { minLength: 1, maxLength: 2, tier: "reserved", annualPriceUsd: 0, annualPriceCents: 0, description: "1–2 character handles are reserved — not available", isReserved: true, isFreeWithPlan: false },
  { minLength: 3, maxLength: 3, tier: "ultra-premium", annualPriceUsd: 640, annualPriceCents: 64000, description: "Ultra-premium 3-character handle", isReserved: false, isFreeWithPlan: false },
  { minLength: 4, maxLength: 4, tier: "premium", annualPriceUsd: 160, annualPriceCents: 16000, description: "Premium 4-character handle", isReserved: false, isFreeWithPlan: false },
  { minLength: 5, maxLength: undefined, tier: "standard", annualPriceUsd: 10, annualPriceCents: 1000, description: "Standard handle (5+ characters) — included free with any active plan", isReserved: false, isFreeWithPlan: true },
];

export function getHandlePricingTier(handle: string): HandlePricingTier {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  return HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= (t.maxLength ?? Infinity)) ?? HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
}
