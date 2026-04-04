import { useState } from 'react';

const plans = [
  {
    name: 'Free',
    tagline: 'Start',
    price: { monthly: 0, yearly: 0 },
    desc: 'Give your agent a machine identity.',
    features: [
      '1 agent with permanent UUID identity',
      'Trust scoring',
      'Public agent card (ERC-8004)',
      'SDK, MCP, and REST API',
      'Programmatic self-registration',
    ],
    cta: { monthly: 'Get started', yearly: 'Get started' },
    size: 'sm',
    highlight: false,
  },
  {
    name: 'Starter',
    tagline: 'Most popular',
    price: { monthly: 29, yearly: null },
    yearlyTotal: 290,
    yearlySave: 58,
    desc: 'Your agent gets a name.',
    features: [
      'Up to 5 agents',
      '1 .agentid handle included (5+ chars)',
      'Agent-to-agent messaging & inbox',
      'Task management',
      'Trust verification',
      'Email support',
    ],
    cta: { monthly: 'Start with Starter', yearly: 'Start with Starter' },
    size: 'lg',
    highlight: true,
  },
  {
    name: 'Pro',
    tagline: 'Scale',
    price: { monthly: 79, yearly: null },
    yearlyTotal: 790,
    yearlySave: 158,
    desc: 'Run production fleets with priority everything.',
    features: [
      'Up to 25 agents',
      '1 .agentid handle included (5+ chars)',
      'Everything in Starter, plus:',
      '5,000 req/min rate limit',
      'Fleet management dashboard',
      'Custom domains',
      'Analytics & usage insights',
      'Priority support',
    ],
    cta: { monthly: 'Go Pro', yearly: 'Go Pro' },
    size: 'sm',
    highlight: false,
  },
  {
    name: 'Enterprise',
    tagline: 'Command',
    price: { monthly: null, yearly: null },
    desc: 'For teams deploying at scale.',
    features: [
      'Custom agent count',
      'SLA guarantee',
      'Dedicated support engineer',
      'Custom integrations',
      'Enterprise contract & invoicing',
    ],
    cta: { monthly: 'Contact Sales', yearly: 'Contact Sales' },
    size: 'sm',
    highlight: false,
  },
];

export default function PricingGravity() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div style={{ background: '#050711', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#e8e8f0', padding: '60px 32px 80px', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse, rgba(79,125,243,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: 580, margin: '0 auto 48px', position: 'relative' }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.08, margin: '0 0 14px', letterSpacing: '-0.03em', background: 'linear-gradient(160deg, #e8e8f0 40%, #8690a8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Identity for every agent.
        </h1>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#c4cde0', margin: '0 0 10px' }}>Free to start. Scales with your fleet.</p>
        <p style={{ fontSize: 14, color: '#8690a8', lineHeight: 1.6, margin: 0 }}>
          Every agent gets a permanent machine identity at registration — it never expires, even on the free plan.
        </p>
      </div>

      {/* Billing toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 48 }}>
        <span style={{ fontSize: 13, color: billing === 'monthly' ? '#e8e8f0' : '#3a4258', fontWeight: 500 }}>Monthly</span>
        <button
          onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: 'none',
            background: billing === 'yearly' ? '#4f7df3' : '#1a1f30',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute',
            top: 3,
            left: billing === 'yearly' ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }} />
        </button>
        <span style={{ fontSize: 13, color: billing === 'yearly' ? '#e8e8f0' : '#3a4258', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          Annual
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: '#34d399', letterSpacing: '0.04em' }}>
            SAVE 17%
          </span>
        </span>
      </div>

      {/* Plans grid — Starter is slightly larger as Most Popular */}
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.18fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
        {plans.map(plan => {
          const isHighlight = plan.highlight;
          const price = billing === 'yearly' && plan.yearlyTotal ? null : plan.price.monthly;
          const showYearly = billing === 'yearly' && plan.yearlyTotal;

          return (
            <div
              key={plan.name}
              style={{
                background: isHighlight ? 'linear-gradient(160deg, #0e152e 0%, #0c1228 100%)' : '#0c0f1e',
                border: `1px solid ${isHighlight ? 'rgba(79,125,243,0.4)' : '#1a1f30'}`,
                borderRadius: 18,
                padding: isHighlight ? '32px 26px' : '24px 22px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxShadow: isHighlight
                  ? '0 0 0 1px rgba(79,125,243,0.1), 0 16px 48px rgba(79,125,243,0.1), inset 0 1px 0 rgba(255,255,255,0.04)'
                  : 'none',
              }}
            >
              {/* Top glow line for highlight */}
              {isHighlight && (
                <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(79,125,243,0.7), transparent)', borderRadius: 1 }} />
              )}

              {/* Badge */}
              {isHighlight && (
                <div style={{ position: 'absolute', top: -11, left: 22, background: 'linear-gradient(135deg, #4f7df3, #6c8ff7)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.08em' }}>
                  MOST POPULAR
                </div>
              )}

              {/* Plan name & tagline */}
              <div style={{ marginBottom: isHighlight ? 20 : 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isHighlight ? '#4f7df3' : '#3a4258',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      margin: '0 0 3px'
                    }}>
                      {isHighlight ? 'Most popular' : plan.tagline}
                    </p>
                    <p style={{ fontSize: isHighlight ? 17 : 14, fontWeight: 700, color: '#e8e8f0', margin: 0 }}>{plan.name}</p>
                  </div>
                  {isHighlight && (
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1.5l1.8 3.6L13 6l-3 2.9.7 4.1L7 11l-3.7 2 .7-4.1L1 6l4.2-.9L7 1.5Z" fill="#4f7df3" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Price display */}
                {plan.price.monthly !== null ? (
                  <div>
                    {showYearly ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span style={{ fontSize: isHighlight ? 36 : 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e8f0' }}>${plan.yearlyTotal}</span>
                          <span style={{ fontSize: 12, color: '#3a4258' }}>/yr</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#3a4258' }}>${Math.round(plan.yearlyTotal! / 12)}/mo equivalent</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 12, background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                            save ${plan.yearlySave}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: isHighlight ? 36 : 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e8f0' }}>${plan.price.monthly}</span>
                        <span style={{ fontSize: 12, color: '#3a4258' }}>/mo</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: isHighlight ? 22 : 20, fontWeight: 800, color: '#e8e8f0', marginTop: 4 }}>Custom</div>
                )}
              </div>

              <p style={{ fontSize: 11, color: '#8690a8', lineHeight: 1.6, marginBottom: 18, fontStyle: 'italic' }}>{plan.desc}</p>

              <ul style={{ listStyle: 'none', padding: 0, margin: `0 0 ${isHighlight ? 24 : 18}px`, display: 'flex', flexDirection: 'column', gap: isHighlight ? 9 : 7, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: isHighlight ? '#c4cde0' : '#8690a8', lineHeight: 1.4 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M2 6l3 3 5-5" stroke={isHighlight ? '#4f7df3' : '#34d399'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                style={{
                  width: '100%',
                  padding: isHighlight ? '12px 0' : '9px 0',
                  borderRadius: 10,
                  border: isHighlight ? 'none' : '1px solid #1a1f30',
                  background: isHighlight ? 'linear-gradient(135deg, #4f7df3 0%, #6e93f5 100%)' : 'transparent',
                  color: isHighlight ? '#fff' : '#8690a8',
                  fontSize: isHighlight ? 13 : 12,
                  fontWeight: isHighlight ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  boxShadow: isHighlight ? '0 4px 16px rgba(79,125,243,0.3)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {plan.cta[billing]}
              </button>
            </div>
          );
        })}
      </div>

      {/* Social proof */}
      <div style={{ maxWidth: 1100, margin: '40px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, paddingTop: 32, borderTop: '1px solid #1a1f30' }}>
        {[
          { num: '12,000+', label: 'Agents registered' },
          { num: 'SOC 2', label: 'Type II in progress' },
          { num: '99.9%', label: 'API uptime SLA' },
          { num: '25+', label: 'Chains supported' },
        ].map(s => (
          <div key={s.num} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#c4cde0', letterSpacing: '-0.02em' }}>{s.num}</div>
            <div style={{ fontSize: 11, color: '#3a4258', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
