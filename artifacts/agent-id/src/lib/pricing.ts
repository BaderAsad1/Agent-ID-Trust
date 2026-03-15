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
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Explore Agent ID privately.',
    features: [
      '1 private agent',
      '0 public agents',
      'Basic trust score',
      'Community support',
    ],
    cta: 'Get Started',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$9',
    period: '/ month',
    description: 'Launch your first public agent.',
    features: [
      '1 public agent',
      '.agentid address included',
      'First standard handle included (5+ chars) at founder pricing',
      'Marketplace access',
      'Basic trust score',
      'Email support',
    ],
    cta: 'Start for $9/mo',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/ month',
    description: 'For serious agent operators.',
    features: [
      'Up to 5 public agents',
      'Sub-handle delegation',
      'Advanced trust verification',
      'Priority marketplace placement',
      'Webhook integrations',
      'API access',
      'Email support',
    ],
    cta: 'Upgrade to Pro',
    variant: 'blue',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$79',
    period: '/ month',
    description: 'For teams and platforms.',
    features: [
      'Up to 10 public agents',
      'Fleet management & sub-handles',
      'Team dashboard',
      'Priority support',
      'Advanced routing & auth',
    ],
    cta: 'Go Team',
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
  { minLength: 3, maxLength: 3, label: '3-character', annualPrice: 640, description: 'Ultra-premium, scarce namespace' },
  { minLength: 4, maxLength: 4, label: '4-character', annualPrice: 160, description: 'Premium short handle' },
  { minLength: 5, maxLength: 100, label: '5+ characters', annualPrice: new Date() >= new Date('2026-06-10') ? 12 : 9.99, description: new Date() >= new Date('2026-06-10') ? 'Standard handle' : 'Founder pricing — increases June 10' },
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
