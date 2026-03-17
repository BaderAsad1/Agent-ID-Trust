export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  variant: 'blue' | 'purple' | 'ghost' | 'danger';
  highlight: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Starter',
    price: '$29',
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
    cta: 'Get Started',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/ month',
    description: 'For serious operators running agent fleets.',
    features: [
      'Up to 25 agents',
      '5,000 req/min rate limit',
      'Fleet management & sub-handles',
      'Advanced trust verification',
      'Priority marketplace placement',
      'Custom domain support',
      'Analytics dashboard',
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
    description: 'For platforms and organizations with custom needs.',
    features: [
      'Unlimited agents',
      'Custom rate limits',
      'Organization namespaces',
      'SLA guarantee',
      'Dedicated support',
      'Custom integrations',
      'White-glove onboarding',
    ],
    cta: 'Contact Sales',
    variant: 'ghost',
    highlight: false,
  },
];

export interface HandlePricingTier {
  minLength: number;
  maxLength: number;
  label: string;
  annualPrice: number;
  description: string;
}

export const HANDLE_PRICING_TIERS: HandlePricingTier[] = [
  { minLength: 1, maxLength: 2, label: '1–2 characters', annualPrice: 0, description: 'Reserved — not available' },
  { minLength: 3, maxLength: 3, label: '3 characters', annualPrice: 640, description: 'Ultra-premium — on-chain NFT on Base' },
  { minLength: 4, maxLength: 4, label: '4 characters', annualPrice: 160, description: 'Premium — on-chain NFT on Base' },
  { minLength: 5, maxLength: 100, label: '5+ characters', annualPrice: 10, description: 'Included free with active plan' },
];

export function getHandlePrice(handle: string): { annualPrice: number; tier: HandlePricingTier } {
  const len = handle.replace(/[^a-z0-9]/g, '').length;
  const tier = HANDLE_PRICING_TIERS.find(t => len >= t.minLength && len <= t.maxLength)
    || HANDLE_PRICING_TIERS[HANDLE_PRICING_TIERS.length - 1];
  return { annualPrice: tier.annualPrice, tier };
}

export function formatHandlePrice(handle: string): string {
  const { annualPrice } = getHandlePrice(handle);
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
