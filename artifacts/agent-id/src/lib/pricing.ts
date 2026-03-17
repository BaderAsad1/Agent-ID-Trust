export interface PricingPlan {
  name: string;
  price: string;
  yearlyPrice?: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  variant: 'blue' | 'purple' | 'ghost' | 'danger';
  highlight: boolean;
  enterprise?: boolean;
  contactEmail?: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Starter',
    price: '$29',
    yearlyPrice: '$290',
    period: '/ month',
    description: 'For individual operators launching their first agents.',
    features: [
      'Up to 5 agents',
      '1,000 req/min rate limit',
      '.agentid address included',
      '5+ char handle included ($10/yr value)',
      'Marketplace listing',
      'Trust score & verification',
      'Email support',
    ],
    cta: 'Get started',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$79',
    yearlyPrice: '$790',
    period: '/ month',
    description: 'For serious agent operators and growing fleets.',
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
    cta: 'Upgrade to Pro',
    variant: 'blue',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Tailored',
    period: '',
    description: 'Custom agent count, rate limits, and pricing per your needs.',
    features: [
      'Custom agent count',
      'Tailored rate limits',
      'Dedicated infrastructure',
      'SLA guarantee',
      'Enterprise support',
      'Custom integrations',
    ],
    cta: 'Contact us',
    variant: 'ghost',
    highlight: false,
    enterprise: true,
    contactEmail: 'sales@getagent.id',
  },
];

export interface HandlePricingTier {
  minLength: number;
  maxLength: number;
  label: string;
  annualPrice: number;
  description: string;
  reserved?: boolean;
}

export const HANDLE_PRICING_TIERS: HandlePricingTier[] = [
  { minLength: 1, maxLength: 2, label: '1-2 characters', annualPrice: 0, description: 'Reserved — not available', reserved: true },
  { minLength: 3, maxLength: 3, label: '3 characters', annualPrice: 640, description: 'Ultra-premium, scarce namespace · on-chain NFT on Base' },
  { minLength: 4, maxLength: 4, label: '4 characters', annualPrice: 160, description: 'Premium short handle · on-chain NFT on Base' },
  { minLength: 5, maxLength: 100, label: '5+ characters', annualPrice: 10, description: 'Standard handle · included free with any active plan' },
];

export function getHandlePrice(handle: string): { annualPrice: number; tier: HandlePricingTier } {
  const len = handle.replace(/[^a-z0-9]/g, '').length;
  const tier = HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= t.maxLength)
    || HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
  return { annualPrice: tier.reserved ? 0 : tier.annualPrice, tier };
}

export function formatHandlePrice(handle: string): string {
  const { annualPrice, tier } = getHandlePrice(handle);
  if (tier.reserved) return 'Reserved';
  return `$${annualPrice}/yr`;
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
