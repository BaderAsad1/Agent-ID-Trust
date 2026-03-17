import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS, HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';

export function Pricing() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  const getDisplayPrice = (plan: typeof PRICING_PLANS[number]) => {
    if (plan.enterprise) return 'Tailored';
    if (billing === 'yearly' && plan.yearlyPrice) return plan.yearlyPrice;
    return plan.price;
  };

  const getPeriod = (plan: typeof PRICING_PLANS[number]) => {
    if (plan.enterprise) return '';
    return billing === 'yearly' ? '/ year' : '/ month';
  };

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Identity infrastructure for AI agents
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Starter, Pro, and Enterprise — no free plan.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={() => setBilling('monthly')}
            className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
            style={{
              background: billing === 'monthly' ? 'rgba(79,125,243,0.15)' : 'transparent',
              color: billing === 'monthly' ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${billing === 'monthly' ? 'rgba(79,125,243,0.3)' : 'var(--border-color)'}`,
            }}
          >Monthly</button>
          <button
            onClick={() => setBilling('yearly')}
            className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2"
            style={{
              background: billing === 'yearly' ? 'rgba(79,125,243,0.15)' : 'transparent',
              color: billing === 'yearly' ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${billing === 'yearly' ? 'rgba(79,125,243,0.3)' : 'var(--border-color)'}`,
            }}
          >
            Yearly
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Save ~17%</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {PRICING_PLANS.map(plan => (
            <GlassCard
              key={plan.name}
              className={`!p-8 flex flex-col ${plan.highlight ? '!border-[var(--accent)]' : ''}`}
            >
              {plan.highlight && (
                <div className="text-xs font-semibold px-3 py-1 rounded-full mb-4 self-start" style={{ background: 'rgba(79,125,243,0.1)', color: 'var(--accent)' }}>
                  Most popular
                </div>
              )}
              <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{getDisplayPrice(plan)}</span>
                {getPeriod(plan) && <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{getPeriod(plan)}</span>}
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <PrimaryButton
                variant={plan.variant}
                className="w-full"
                onClick={() => {
                  if (plan.enterprise) {
                    window.location.href = `mailto:${plan.contactEmail}`;
                  } else if (userId) {
                    navigate('/dashboard/settings');
                  } else {
                    navigate(`/start?plan=${plan.name.toLowerCase()}`);
                  }
                }}
              >
                {plan.cta}
              </PrimaryButton>
            </GlassCard>
          ))}
        </div>

        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Handle name pricing
            </h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
              Shorter handles are scarcer and priced at a premium — just like ENS domains. Handles are owned assets, not subscriptions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-[900px] mx-auto">
            {HANDLE_PRICING_TIERS.map(tier => (
              <GlassCard key={tier.label} className="!p-6 text-center">
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {tier.label}
                </div>
                <div className="text-3xl font-black mb-1" style={{ color: tier.reserved ? 'var(--text-dim)' : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {tier.reserved ? 'Reserved' : `$${tier.annualPrice}`}
                </div>
                {!tier.reserved && <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>per year</div>}
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>
              </GlassCard>
            ))}
          </div>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-dim)' }}>
            Grace period: 90 days after expiry · Post-grace: 21-day decreasing premium auction · Handle loss never affects UUID machine identity
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
