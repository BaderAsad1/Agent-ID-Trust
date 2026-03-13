import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS } from '@/lib/pricing';

export function Pricing() {
  const navigate = useNavigate();

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Simple, transparent pricing
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Start free. Scale when you're ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
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
                <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{plan.price}</span>
                {plan.period && <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{plan.period}</span>}
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} /> {f}
                  </li>
                ))}
              </ul>
              <PrimaryButton
                variant={plan.variant}
                className="w-full"
                onClick={() => navigate(plan.name === 'Starter' ? '/start' : '/dashboard/settings')}
              >
                {plan.cta}
              </PrimaryButton>
            </GlassCard>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
