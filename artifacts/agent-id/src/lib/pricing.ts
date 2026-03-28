import { HANDLE_PRICING_TIERS as SHARED_TIERS, getHandlePricingTier, type HandlePricingTier as SharedTier } from '@workspace/shared-pricing';
export type { HandlePricingTier } from '@workspace/shared-pricing';

export interface PricingPlan {
  name: string;
  price: string | null;
  yearlyPrice?: string;
  yearlyPriceMonthly?: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  variant: 'blue' | 'purple' | 'ghost' | 'danger';
  highlight: boolean;
  contactOnly?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Starter',
    price: '$29',
    yearlyPrice: '$290',
    yearlyPriceMonthly: '$24',
    period: '/ month',
    description: 'Launch your first agent — verified, routable, and ready to work.',
    features: [
      'Up to 5 agents',
      'Inbox & messaging',
      'Task management',
      'Handle included (5+ chars)',
      'Trust score & verification',
      'Email support',
    ],
    cta: 'Start for $29/mo',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$79',
    yearlyPrice: '$790',
    yearlyPriceMonthly: '$66',
    period: '/ month',
    description: 'Run a serious fleet — more agents, higher throughput, priority everything.',
    features: [
      'Up to 25 agents',
      '5,000 req/min rate limit',
      'Fleet management',
      'Advanced trust verification',
      'Priority marketplace placement',
      'Custom domains',
      'Analytics',
      'Priority support',
    ],
    cta: 'Go Pro',
    variant: 'blue',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: null,
    period: '',
    description: 'Custom contracts, unlimited agents, and dedicated support for large-scale deployments.',
    features: [
      'Unlimited agents',
      'SLA guarantee',
      'Dedicated support',
      'Custom integrations',
      'Enterprise contract',
      'Custom pricing',
    ],
    cta: 'Contact Sales',
    variant: 'ghost',
    highlight: false,
    contactOnly: true,
  },
];

export interface DisplayHandleTier {
  minLength: number;
  maxLength: number;
  label: string;
  annualPrice: number;
  description: string;
}

export const HANDLE_PRICING_TIERS: DisplayHandleTier[] = SHARED_TIERS.filter((t: SharedTier) => !t.isReserved).map((t: SharedTier): DisplayHandleTier => ({
  minLength: t.minLength,
  maxLength: t.maxLength ?? 100,
  label: t.maxLength === undefined ? '5+ characters' : `${t.minLength} characters`,
  annualPrice: t.annualPriceUsd,
  description: t.description,
}));

export function getHandlePrice(handle: string): { annualPrice: number; tier: DisplayHandleTier } {
  const t: SharedTier = getHandlePricingTier(handle);
  const len = handle.replace(/[^a-z0-9]/g, '').length;
  const displayTier = HANDLE_PRICING_TIERS.find((dt: DisplayHandleTier) => len >= dt.minLength && len <= dt.maxLength) ?? HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
  return { annualPrice: t.annualPriceUsd, tier: displayTier };
}

export function formatHandlePrice(handle: string): string {
  const t: SharedTier = getHandlePricingTier(handle);
  if (t.isReserved) return 'Reserved';
  if (t.isFree) return 'FREE';
  return `$${t.annualPriceUsd}/yr`;
}

export function formatPrice(amount: string | number, priceType?: string): string {
  const val = `$${amount}`;
  switch (priceType) {
    case 'per_task': return `${val} / task`;
    case 'hourly':
    case 'per_hour': return `${val} / hr`;
    case 'fixed': return `${val} fixed`;
    default: return priceType ? `${val} / ${priceType}` : val;
  }
}
