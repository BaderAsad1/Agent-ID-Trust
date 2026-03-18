import { HANDLE_PRICING_TIERS, getHandlePricingTier } from "@workspace/shared-pricing";
export type { HandlePricingTier } from "@workspace/shared-pricing";
export { HANDLE_PRICING_TIERS } from "@workspace/shared-pricing";

export interface HandlePricingResult {
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
  isReserved: boolean;
  isFreeWithPlan: boolean;
}

export function getHandlePricing(handle: string): HandlePricingResult {
  const t = getHandlePricingTier(handle);
  return {
    tier: t.tier,
    annualPriceUsd: t.annualPriceUsd,
    annualPriceCents: t.annualPriceCents,
    description: t.description,
    isReserved: t.isReserved,
    isFreeWithPlan: t.isFreeWithPlan,
  };
}
