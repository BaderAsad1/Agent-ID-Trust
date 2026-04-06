import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { useSEO } from '@/lib/useSEO';

const FAQ_ITEMS = [
  {
    q: 'What does the Free plan include?',
    a: 'One agent with a permanent UUID identity, trust scoring, a public ERC-8004 agent card, and full access to the SDK, MCP server, and REST API. Handles require a paid plan (Starter, Pro, or Enterprise custom entitlement).',
  },
  {
    q: "What's the difference between a UUID and a handle?",
    a: "Every agent gets a UUID, the permanent machine identifier that never expires. A handle like openclaw.agentid is the human-readable name that maps to it. Think IP address vs domain name. UUIDs are included on all plans; handles require a paid plan and renew annually, with standard 5+ character handles included on Starter and Pro.",
  },
  {
    q: 'Can I buy a handle without a paid plan?',
    a: 'Handles require a paid plan. Standard handles (5+ characters) are included with Starter or Pro; Enterprise handle access is provisioned via custom entitlement. Premium handles (4-character at $29/yr, 3-character at $99/yr) require payment and a paid plan. Free plan agents receive a UUID identity only; handles are not available on the Free plan.',
  },
  {
    q: "What happens if I don't renew a handle?",
    a: "Your agent's UUID identity is permanent, it never expires and always resolves. Only handles are annual. After expiry you get a 90-day grace period before the handle becomes available for re-registration.",
  },
  {
    q: 'Can I upgrade or downgrade anytime?',
    a: 'Yes. Plan changes take effect immediately and are prorated. Your agents keep their UUID identities and registered handles regardless of plan changes.',
  },
  {
    q: 'Can my agent register itself?',
    a: 'Yes. The SDK supports fully autonomous registration. Your agent generates its own keys, registers, and receives a signed identity in two API calls. No human interaction required.',
  },
  {
    q: 'Is Agent ID on-chain?',
    a: 'Agent ID follows the ERC-8004 standard - a published spec for on-chain agent identity cards, similar to how ERC-20 defined fungible tokens. Every agent gets an ERC-8004-compliant identity card automatically. Handles can optionally be minted as on-chain NFTs (available now for 3–4 character premium handles), but the identity itself is valid on or off chain.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #1a1f30' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', gap: 16 }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e8f0', fontFamily: "'Inter', sans-serif" }}>{q}</span>
        {open
          ? <ChevronUp style={{ width: 16, height: 16, flexShrink: 0, color: '#3a4258' }} />
          : <ChevronDown style={{ width: 16, height: 16, flexShrink: 0, color: '#3a4258' }} />}
      </button>
      {open && (
        <p style={{ paddingBottom: 16, fontSize: 14, color: '#8690a8', lineHeight: 1.65, margin: 0, fontFamily: "'Inter', sans-serif" }}>{a}</p>
      )}
    </div>
  );
}

const HANDLE_TABLE_ROWS = [
  { label: '5+ chars', price: 'Included', example: 'openclaw.agentid', note: '1 included with Starter & Pro; Enterprise: custom/sales-led' },
  { label: '4 chars', price: '$29/year', example: 'flux.agentid', note: 'Max 2 per account' },
  { label: '3 chars', price: '$99/year', example: 'kai.agentid', note: 'Max 1 per account' },
];

export function Pricing() {
  useSEO({
    title: 'Pricing',
    description: 'Free to start. Starter from $29/mo. Full identity, trust scoring, and SDK on every plan. Handles and inbox with paid plans.',
    canonical: '/pricing',
  });
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    api.meta.stats().then(s => setAgentCount(s.agentCount)).catch(() => {});
  }, []);

  const handleCta = async (plan: typeof PRICING_PLANS[number]) => {
    if (plan.contactOnly) {
      window.location.href = 'mailto:team@getagent.id';
      return;
    }
    if (plan.name === 'Free') {
      navigate(userId ? '/dashboard' : '/get-started');
      return;
    }
    if (!userId) {
      navigate(`/get-started?plan=${plan.name.toLowerCase()}`);
      return;
    }
    try {
      setLoadingPlan(plan.name);
      const base = window.location.origin;
      const result = await api.billing.checkout({
        plan: plan.name.toLowerCase() as 'starter' | 'pro',
        billingInterval: billing,
        successUrl: `${base}/dashboard?upgraded=true`,
        cancelUrl: `${base}/pricing`,
      });
      if (result.url) window.location.href = result.url;
    } catch {
      navigate('/dashboard/settings');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div style={{ background: '#050711', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#e8e8f0', paddingTop: 64 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 32px 80px', position: 'relative' }}>

        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse, rgba(79,125,243,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: 580, margin: '0 auto 48px' }}>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 900, lineHeight: 1.08, margin: '0 0 14px', letterSpacing: '-0.03em', background: 'linear-gradient(160deg, #e8e8f0 40%, #8690a8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Identity for every agent.
            </h1>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#c4cde0', margin: '0 0 10px' }}>Free to start. Scales with your fleet.</p>
            <p style={{ fontSize: 14, color: '#8690a8', lineHeight: 1.6, margin: 0 }}>
              Every agent gets a permanent machine identity at registration. It never expires, even on the free plan.
            </p>
          </div>

          {/* Billing toggle - pill switch */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 48 }}>
            <span style={{ fontSize: 13, color: billing === 'monthly' ? '#e8e8f0' : '#3a4258', fontWeight: 500 }}>Monthly</span>
            <button
              onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
              aria-label="Toggle billing period"
              style={{ width: 44, height: 24, minHeight: 'unset', borderRadius: 12, border: 'none', appearance: 'none', WebkitAppearance: 'none', background: billing === 'yearly' ? '#4f7df3' : '#1a1f30', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', top: 3, left: billing === 'yearly' ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
            <span style={{ fontSize: 13, color: billing === 'yearly' ? '#e8e8f0' : '#3a4258', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              Annual
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: '#34d399', letterSpacing: '0.04em' }}>SAVE 17%</span>
            </span>
          </div>

          {/* Plan cards - Gravity grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end', marginBottom: 48 }}>
            {PRICING_PLANS.map(plan => {
              const isH = plan.highlight;
              const isLoading = loadingPlan === plan.name;
              const showYearly = billing === 'yearly' && plan.yearlyPrice;

              return (
                <div
                  key={plan.name}
                  style={{
                    background: isH ? 'linear-gradient(160deg, #0e152e 0%, #0c1228 100%)' : '#0c0f1e',
                    border: `1px solid ${isH ? 'rgba(79,125,243,0.4)' : '#1a1f30'}`,
                    borderRadius: 18,
                    padding: isH ? '32px 26px' : '24px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    boxShadow: isH ? '0 0 0 1px rgba(79,125,243,0.1), 0 16px 48px rgba(79,125,243,0.1), inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
                    cursor: 'default',
                  }}
                >
                  {/* Top glow line */}
                  {isH && <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(79,125,243,0.7), transparent)', borderRadius: 1 }} />}

                  {/* Most popular badge */}
                  {isH && (
                    <div style={{ position: 'absolute', top: -11, left: 22, background: 'linear-gradient(135deg, #4f7df3, #6c8ff7)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.08em' }}>
                      MOST POPULAR
                    </div>
                  )}

                  {/* Plan header */}
                  <div style={{ marginBottom: isH ? 20 : 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: isH ? '#4f7df3' : '#3a4258', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 3px' }}>
                          {isH ? 'Most popular' : plan.contactOnly ? 'Custom' : plan.price === '$0' ? 'Start' : 'Scale'}
                        </p>
                        <p style={{ fontSize: isH ? 17 : 14, fontWeight: 700, color: '#e8e8f0', margin: 0 }}>{plan.name}</p>
                      </div>
                    </div>

                    {/* Price */}
                    {plan.price !== null ? (
                      showYearly ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                            <span style={{ fontSize: isH ? 36 : 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e8f0' }}>{plan.yearlyPrice}</span>
                            <span style={{ fontSize: 12, color: '#3a4258' }}>/yr</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: '#3a4258' }}>{plan.yearlyPriceMonthly}/mo equivalent</span>
                            {plan.yearlySavings && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 12, background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                                save {plan.yearlySavings}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                          <span style={{ fontSize: isH ? 36 : 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e8f0' }}>{plan.price}</span>
                          <span style={{ fontSize: 12, color: '#3a4258' }}>/mo</span>
                        </div>
                      )
                    ) : (
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e8f0', marginTop: 4 }}>Custom</div>
                    )}
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: 11, color: '#8690a8', lineHeight: 1.6, marginBottom: 18, fontStyle: 'italic' }}>{plan.description}</p>

                  {/* Features */}
                  <ul style={{ listStyle: 'none', padding: 0, margin: `0 0 ${isH ? 24 : 18}px`, display: 'flex', flexDirection: 'column', gap: isH ? 9 : 7, flex: 1 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: isH ? '#c4cde0' : '#8690a8', lineHeight: 1.4 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                          <path d="M2 6l3 3 5-5" stroke={isH ? '#4f7df3' : '#34d399'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <button
                    onClick={() => handleCta(plan)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: isH ? '12px 0' : '9px 0',
                      borderRadius: 10,
                      border: isH ? 'none' : '1px solid #1a1f30',
                      background: isH ? 'linear-gradient(135deg, #4f7df3 0%, #6e93f5 100%)' : 'transparent',
                      color: isH ? '#fff' : '#8690a8',
                      fontSize: isH ? 13 : 12,
                      fontWeight: isH ? 700 : 500,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      boxShadow: isH ? '0 4px 16px rgba(79,125,243,0.3)' : 'none',
                      transition: 'all 0.15s',
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? 'Redirecting…' : plan.cta}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Trust line */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#3a4258', marginBottom: 56 }}>
            No credit card required for Free · Cancel or change plans anytime
          </p>

          {/* Social proof */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, paddingBottom: 56, borderBottom: '1px solid #1a1f30', marginBottom: 72, flexWrap: 'wrap' }}>
            {[
              { num: agentCount ? `${agentCount.toLocaleString()}+` : '', label: 'Agents registered' },
              { num: 'ERC-8004', label: 'Standard compliant' },
              { num: '99.9%', label: 'API uptime' },
              { num: '25+', label: 'Chains supported' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#c4cde0', letterSpacing: '-0.02em' }}>{s.num}</div>
                <div style={{ fontSize: 11, color: '#3a4258', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Handle pricing table */}
          <div style={{ marginBottom: 72 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px', color: '#e8e8f0' }}>
              .agentid Handles
            </h2>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#8690a8', marginBottom: 6 }}>Give your agent a name.</p>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#3a4258', marginBottom: 28, maxWidth: 480, margin: '0 auto 28px' }}>
              Handles require a paid plan. Standard handles are included with Starter or Pro; Enterprise access is provisioned via custom entitlement.
            </p>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #1a1f30', maxWidth: 720, margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 1.4fr', padding: '10px 20px', background: '#131729', color: '#3a4258', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span>Length</span>
                <span>Price</span>
                <span>Example</span>
                <span>Limits</span>
              </div>
              {HANDLE_TABLE_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 1.4fr', padding: '14px 20px', background: i % 2 === 0 ? '#0c0f1e' : '#050711', borderTop: '1px solid #1a1f30', alignItems: 'center' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#4f7df3' }}>{row.price}</span>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#8690a8' }}>{row.example}</span>
                  <span style={{ fontSize: 11, color: '#3a4258' }}>{row.note}</span>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#3a4258', marginTop: 12 }}>
              On-chain NFT minting available now for premium handles (3-4 char). All handles coming soon.
            </p>
          </div>

          {/* FAQ */}
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 28px', color: '#e8e8f0' }}>
              Frequently asked questions
            </h2>
            <div>
              {FAQ_ITEMS.map(item => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
