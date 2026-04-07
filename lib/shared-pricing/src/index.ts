export interface HandlePricingTier {
  minLength: number;
  maxLength: number | undefined;
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
  isReserved: boolean;
  includedWithPaidPlan: boolean;
  isFree: boolean;
  onChainMintPrice: number;
  onChainMintPriceDollars: number;
  includesOnChainMint: boolean;
}

export const HANDLE_PRICING_TIERS: HandlePricingTier[] = [
  {
    minLength: 1, maxLength: 2, tier: "reserved_1_2",
    annualPriceUsd: 0, annualPriceCents: 0,
    description: "1–2 character handles are reserved — not available",
    isReserved: true, includedWithPaidPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: false,
  },
  {
    minLength: 3, maxLength: 3, tier: "premium_3",
    annualPriceUsd: 99, annualPriceCents: 9900,
    description: "Ultra-premium 3-character handle — includes on-chain mint",
    isReserved: false, includedWithPaidPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: true,
  },
  {
    minLength: 4, maxLength: 4, tier: "premium_4",
    annualPriceUsd: 29, annualPriceCents: 2900,
    description: "Premium 4-character handle — includes on-chain mint",
    isReserved: false, includedWithPaidPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: true,
  },
  {
    minLength: 5, maxLength: undefined, tier: "standard_5plus",
    annualPriceUsd: 0, annualPriceCents: 0,
    description: "Standard handle (5+ characters) — included with Starter or Pro plan; no standalone purchase price; Enterprise: custom/sales-led entitlement",
    isReserved: false, includedWithPaidPlan: true, isFree: false,
    onChainMintPrice: 500, onChainMintPriceDollars: 5, includesOnChainMint: false,
  },
];

export function getHandlePricingTier(handle: string): HandlePricingTier {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  return HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= (t.maxLength ?? Infinity)) ?? HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
}

/**
 * Returns true if the plan includes exactly 1 standard handle (5+ chars) as a defined,
 * automatic benefit — no extra charge, no sales involvement required.
 * - Starter: 1 included standard handle (automatic)
 * - Pro: 1 included standard handle (automatic)
 * - Enterprise: NOT covered here — see hasCustomHandleEntitlement()
 * - Free / none: no included handles
 */
export function isEligibleForIncludedHandle(plan: string): boolean {
  return plan === "starter" || plan === "pro";
}

/**
 * Returns true for plans whose handle entitlements are managed via a custom/sales-led
 * contract rather than the standard automatic-inclusion model.
 * Enterprise customers get handle access as part of their bespoke agreement;
 * the exact count is determined at sales time, not by this function.
 */
export function hasCustomHandleEntitlement(plan: string): boolean {
  return plan === "enterprise";
}

/**
 * Returns true if the plan allows claiming any form of included/custom-handled standard
 * handle — covers both the automatic (Starter/Pro) and custom (Enterprise) cases.
 * Use this for access-gate checks; use isEligibleForIncludedHandle() for quota checks.
 */
export function isAllowedHandleAccess(plan: string): boolean {
  return isEligibleForIncludedHandle(plan) || hasCustomHandleEntitlement(plan);
}
