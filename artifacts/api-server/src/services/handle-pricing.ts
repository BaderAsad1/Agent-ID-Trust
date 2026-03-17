export interface HandlePricingResult {
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
}

const TIERS = [
  { minLength: 3, maxLength: 3, tier: "ultra-premium", annualPriceUsd: 999, description: "Ultra-premium 3-character handle" },
  { minLength: 4, maxLength: 4, tier: "premium", annualPriceUsd: 199, description: "Premium 4-character handle" },
  { minLength: 5, maxLength: 5, tier: "standard-plus", annualPriceUsd: 49, description: "Standard-plus 5-character handle" },
  { minLength: 6, maxLength: Infinity, tier: "standard", annualPriceUsd: 9, description: "Standard handle (6+ characters)" },
];

export function getHandlePricing(handle: string): HandlePricingResult {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  const match = TIERS.find(t => len >= t.minLength && len <= t.maxLength) ?? TIERS[TIERS.length - 1];
  return {
    tier: match.tier,
    annualPriceUsd: match.annualPriceUsd,
    annualPriceCents: match.annualPriceUsd * 100,
    description: match.description,
  };
}

export const HANDLE_PRICING_TIERS = TIERS.map(t => ({
  minLength: t.minLength,
  maxLength: t.maxLength === Infinity ? undefined : t.maxLength,
  tier: t.tier,
  annualPriceUsd: t.annualPriceUsd,
  description: t.description,
}));
