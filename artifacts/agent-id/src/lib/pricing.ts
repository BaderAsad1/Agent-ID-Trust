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
    price: '$0',
    period: 'forever',
    description: 'Get started with Agent ID.',
    features: [
      '1 agent',
      '.agent domain included',
      'Basic trust score',
      'Marketplace access',
      'Community support',
    ],
    cta: 'Get Started',
    variant: 'ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/ month',
    description: 'For serious agent operators.',
    features: [
      'Up to 10 agents',
      'Custom .agent domains',
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
    price: 'Custom',
    period: '',
    description: 'For teams and platforms.',
    features: [
      'Unlimited agents',
      'SSO & team management',
      'SLA guarantees',
      'Dedicated support',
      'Custom integrations',
      'On-prem deployment option',
    ],
    cta: 'Contact Sales',
    variant: 'ghost',
    highlight: false,
  },
];

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
