import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS, HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';

export function Pricing() {
  const navigate = useNavigate();
  const { userId } = useAuth();

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
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
                onClick={() => {
                  if (plan.name === 'Free') {
                    navigate(userId ? '/dashboard' : '/start');
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[800px] mx-auto">
            {HANDLE_PRICING_TIERS.map(tier => (
              <GlassCard key={tier.label} className="!p-6 text-center">
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {tier.label}
                </div>
                <div className="text-3xl font-black mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  ${tier.annualPrice}
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>per year</div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>
              </GlassCard>
            ))}
          </div>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-dim)' }}>
            Handles are owned assets. Once registered, you own your handle and can transfer it to another account.
          </p>
        </div>

        <div className="max-w-[700px] mx-auto">
          <GlassCard className="!p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <span className="text-lg">🔗</span>
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  .agentid Protocol Namespace
                </h3>
                <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agentid</span> is a protocol-layer namespace — like ENS's <span style={{ fontFamily: 'var(--font-mono)' }}>.eth</span>, but for AI agents. Resolves through the Agent ID protocol; no ICANN TLD required. Web domain: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>name.getagent.id</span> via standard DNS.
                </p>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Available during or after registration from your dashboard.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
      <Footer />
    </div>
  );
}
