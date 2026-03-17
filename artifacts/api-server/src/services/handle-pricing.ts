export interface HandlePricingResult {
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
  isReserved: boolean;
  isFreeWithPlan: boolean;
}

const TIERS = [
  { minLength: 1, maxLength: 2, tier: "reserved", annualPriceUsd: 0, annualPriceCents: 0, description: "1–2 character handles are reserved — not available", isReserved: true, isFreeWithPlan: false },
  { minLength: 3, maxLength: 3, tier: "ultra-premium", annualPriceUsd: 640, annualPriceCents: 64000, description: "Ultra-premium 3-character handle — on-chain NFT on Base", isReserved: false, isFreeWithPlan: false },
  { minLength: 4, maxLength: 4, tier: "premium", annualPriceUsd: 160, annualPriceCents: 16000, description: "Premium 4-character handle — on-chain NFT on Base", isReserved: false, isFreeWithPlan: false },
  { minLength: 5, maxLength: Infinity, tier: "standard", annualPriceUsd: 10, annualPriceCents: 1000, description: "Standard handle (5+ characters) — included free with any active plan", isReserved: false, isFreeWithPlan: true },
];

export function getHandlePricing(handle: string): HandlePricingResult {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  const match = TIERS.find(t => len >= t.minLength && len <= t.maxLength) ?? TIERS[TIERS.length - 1];
  return {
    tier: match.tier,
    annualPriceUsd: match.annualPriceUsd,
    annualPriceCents: match.annualPriceCents,
    description: match.description,
    isReserved: match.isReserved,
    isFreeWithPlan: match.isFreeWithPlan,
  };
}

export const HANDLE_PRICING_TIERS = TIERS.map(t => ({
  minLength: t.minLength,
  maxLength: t.maxLength === Infinity ? undefined : t.maxLength,
  tier: t.tier,
  annualPriceUsd: t.annualPriceUsd,
  annualPriceCents: t.annualPriceCents,
  description: t.description,
  isReserved: t.isReserved,
  isFreeWithPlan: t.isFreeWithPlan,
}));
