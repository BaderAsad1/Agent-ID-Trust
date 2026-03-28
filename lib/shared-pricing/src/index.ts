export interface HandlePricingTier {
  minLength: number;
  maxLength: number | undefined;
  tier: string;
  annualPriceUsd: number;
  annualPriceCents: number;
  description: string;
  isReserved: boolean;
  isFreeWithPlan: boolean;
  isFree: boolean;
  onChainMintPrice: number;
  onChainMintPriceDollars: number;
  includesOnChainMint: boolean;
}

export const HANDLE_PRICING_TIERS: HandlePricingTier[] = [
  {
    minLength: 1, maxLength: 2, tier: "reserved",
    annualPriceUsd: 0, annualPriceCents: 0,
    description: "1–2 character handles are reserved — not available",
    isReserved: true, isFreeWithPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: false,
  },
  {
    minLength: 3, maxLength: 3, tier: "ultra-premium",
    annualPriceUsd: 99, annualPriceCents: 9900,
    description: "Ultra-premium 3-character handle — includes on-chain mint",
    isReserved: false, isFreeWithPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: true,
  },
  {
    minLength: 4, maxLength: 4, tier: "premium",
    annualPriceUsd: 29, annualPriceCents: 2900,
    description: "Premium 4-character handle — includes on-chain mint",
    isReserved: false, isFreeWithPlan: false, isFree: false,
    onChainMintPrice: 0, onChainMintPriceDollars: 0, includesOnChainMint: true,
  },
  {
    minLength: 5, maxLength: undefined, tier: "standard",
    annualPriceUsd: 0, annualPriceCents: 0,
    description: "Standard handle (5+ characters) — free for any authenticated user",
    isReserved: false, isFreeWithPlan: false, isFree: true,
    onChainMintPrice: 500, onChainMintPriceDollars: 5, includesOnChainMint: false,
  },
];

export function getHandlePricingTier(handle: string): HandlePricingTier {
  const len = handle.replace(/[^a-z0-9]/g, "").length;
  return HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= (t.maxLength ?? Infinity)) ?? HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
}
