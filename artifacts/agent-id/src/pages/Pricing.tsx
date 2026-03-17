import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS, HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';

export function Pricing() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  const getDisplayPrice = (plan: typeof PRICING_PLANS[number]) => {
    if (plan.price === null) return null;
    if (billing === 'yearly' && plan.yearlyPriceMonthly) return plan.yearlyPriceMonthly;
    return plan.price;
  };

  const getYearlySavings = (plan: typeof PRICING_PLANS[number]): number | null => {
    if (!plan.price || !plan.yearlyPrice) return null;
    const monthly = parseInt(plan.price.replace('$', ''), 10);
    const yearly = parseInt(plan.yearlyPrice.replace('$', ''), 10);
    return monthly * 12 - yearly;
  };

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Simple pricing. Serious infrastructure.
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Three tiers — no free plan. Every agent gets a permanent UUID identity at registration, regardless of plan.
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
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Save up to 17%</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PRICING_PLANS.map(plan => {
            const displayPrice = getDisplayPrice(plan);
            const savings = getYearlySavings(plan);
            return (
              <GlassCard
                key={plan.name}
                className={`!p-8 flex flex-col ${plan.highlight ? "!border-[var(--accent)]" : ""}`}
              >
                {plan.highlight && (
                  <div className="text-xs font-semibold px-3 py-1 rounded-full mb-4 self-start" style={{ background: 'rgba(79,125,243,0.1)', color: 'var(--accent)' }}>
                    Most popular
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  {displayPrice ? (
                    <>
                      <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{displayPrice}</span>
                      {!plan.contactOnly && <span className="text-sm" style={{ color: 'var(--text-dim)' }}>/ mo</span>}
                    </>
                  ) : (
                    <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Contact us</span>
                  )}
                </div>
                {billing === 'yearly' && plan.yearlyPrice && !plan.contactOnly && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>billed {plan.yearlyPrice}/yr</span>
                    {savings !== null && savings > 0 && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                        Save ${savings}/yr
                      </span>
                    )}
                  </div>
                )}
                {billing === 'monthly' && !plan.contactOnly && plan.price && (
                  <div className="mb-2 h-5" />
                )}
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
                    if (plan.contactOnly) {
                      window.location.href = 'mailto:enterprise@getagent.id';
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
            );
          })}
        </div>

        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Handle pricing
            </h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
              Shorter handles are scarcer and priced accordingly. 5+ character handles are included with any active plan. 3 and 4-character handles are premium, with pricing that reflects their scarcity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[800px] mx-auto">
            {HANDLE_PRICING_TIERS.map(tier => (
              <GlassCard key={tier.label} className="!p-6 text-center">
                <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {tier.label}
                </div>
                {tier.annualPrice !== null ? (
                  <>
                    <div className="text-3xl font-black mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                      ${tier.annualPrice}
                    </div>
                    <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>per year</div>
                  </>
                ) : (
                  <div className="text-lg font-bold mb-3" style={{ color: 'var(--text-dim)' }}>Reserved</div>
                )}
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>
              </GlassCard>
            ))}
          </div>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-dim)' }}>
            Grace period: 90 days after expiry · Post-grace: 21-day decreasing premium auction · Handle loss never affects UUID machine identity
          </p>
        </div>

        <div className="mb-16 max-w-[700px] mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              How identity works
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Two distinct identity layers — never conflated.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard className="!p-5">
              <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-dim)' }}>Machine Identity</div>
              <div className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>UUID (permanent)</div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Every agent gets a permanent UUID at registration — like an IP address. It never expires and always resolves, regardless of handle status.
              </p>
              <div className="mt-3 text-xs font-mono" style={{ color: 'var(--accent)' }}>did:agentid:&lt;uuid&gt;</div>
            </GlassCard>
            <GlassCard className="!p-5">
              <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-dim)' }}>Handle Identity</div>
              <div className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Handle (expiring alias)</div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                A handle is a paid, annual alias — like a domain name. Renew it or lose it. 5+ character handles are included with any active plan; 3–4 character handles are premium short handles priced by scarcity.
              </p>
              <div className="mt-3 text-xs font-mono" style={{ color: 'var(--accent)' }}>did:agentid:&lt;handle&gt;</div>
            </GlassCard>
          </div>
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
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agentid</span> is a protocol-layer namespace purpose-built for AI agents. Handles resolve through the Agent ID protocol — no ICANN TLD required. Web access available at <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>name.getagent.id</span> via standard DNS.
                </p>
                <a
                  href="mailto:enterprise@getagent.id"
                  className="text-xs flex items-center gap-1"
                  style={{ color: 'var(--accent)' }}
                >
                  Enterprise pricing — contact us <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
      <Footer />
    </div>
  );
}
