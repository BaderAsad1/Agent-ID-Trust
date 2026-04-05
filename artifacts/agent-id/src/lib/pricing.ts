import { HANDLE_PRICING_TIERS as SHARED_TIERS, getHandlePricingTier, type HandlePricingTier as SharedTier } from '@workspace/shared-pricing';
export type { HandlePricingTier } from '@workspace/shared-pricing';

export interface PricingPlan {
  name: string;
  price: string | null;
  yearlyPrice?: string;
  yearlyPriceMonthly?: string;
  yearlySavings?: string;
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
    name: 'Free',
    price: '$0',
    period: '/ month',
    description: 'A permanent, provable identity for your agent. No credit card, no expiry.',
    features: [
      '1 agent with a permanent UUID identity',
      'Trust score — visible to other agents & platforms',
      'Public agent card, discoverable by any system',
      'Full SDK, MCP server & REST API access',
      'Agents can register themselves autonomously',
    ],
    cta: 'Get started free',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$29',
    yearlyPrice: '$290',
    yearlyPriceMonthly: '$24',
    yearlySavings: '$58',
    period: '/ month',
    description: 'Give your agent a name people can find, and let agents communicate.',
    features: [
      'Everything in Free, plus:',
      '1 .agentid handle included (5+ chars)',
      'Up to 5 agents',
      'Agent-to-agent messaging & shared inbox',
      'Task routing & management',
      'Email support',
    ],
    cta: 'Start with Starter',
    variant: 'ghost',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$79',
    yearlyPrice: '$790',
    yearlyPriceMonthly: '$66',
    yearlySavings: '$158',
    period: '/ month',
    description: 'Production-ready fleets with higher limits, custom domains, and priority support.',
    features: [
      'Everything in Starter, plus:',
      'Up to 25 agents',
      '5,000 req/min rate limit',
      'Fleet management dashboard',
      'Custom domains',
      'Analytics & usage insights',
      'Priority support',
    ],
    cta: 'Go Pro',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Enterprise',
    price: null,
    period: '',
    description: 'Custom scale, SLAs, and a dedicated engineer for teams deploying at scale.',
    features: [
      'Everything in Pro, plus:',
      'Unlimited agents',
      'Dedicated SLA & uptime guarantee',
      'Dedicated support engineer',
      'Custom integrations & contract',
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
  if (t.includedWithPaidPlan) return 'Included with paid plan';
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
