import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const PLAN_STORAGE_KEY = 'agent-id-wizard-plan';

interface PlanOption {
  id: 'free' | 'starter' | 'pro';
  name: string;
  price: string;
  pricePeriod: string;
  badge?: string;
  recommended?: boolean;
  anchor?: string;
  benefits: string[];
  handleNote: string;
}

const PLANS: PlanOption[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    pricePeriod: 'forever',
    anchor: 'Free forever',
    benefits: [
      'Permanent UUID identity for your agent',
      'Public agent card (ERC-8004 compliant)',
      'Trust scoring out of the box',
      'Full SDK, MCP server & REST API access',
      'Self-registration — no human required',
    ],
    handleNote: 'Upgrade to Starter or Pro to claim a .agentid handle',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    pricePeriod: '/ month',
    recommended: true,
    badge: 'Most popular',
    benefits: [
      '1 included .agentid handle (5+ characters)',
      'Up to 5 agents',
      'Agent-to-agent messaging & inbox',
      'Task management dashboard',
      'Trust verification badge',
      'Email support',
    ],
    handleNote: '1 handle included — no additional fee for 5+ char handles',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$79',
    pricePeriod: '/ month',
    benefits: [
      '1 included .agentid handle (5+ characters) at signup',
      'Up to 25 agents',
      'Fleet management dashboard',
      '5,000 req/min rate limit',
      'Custom domains & analytics',
      'Priority support',
    ],
    handleNote: '1 handle included at signup — no fee for 5+ char handles',
  },
];

export function OnboardingPlan() {
  const navigate = useNavigate();
  const { agents, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<'free' | 'starter' | 'pro' | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (agents && agents.length > 0) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, agents, navigate]);

  function handleSelect(planId: 'free' | 'starter' | 'pro') {
    setSelected(planId);
    sessionStorage.setItem(PLAN_STORAGE_KEY, planId);
    navigate('/get-started');
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050711' }}>
        <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px 80px',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#e8e8f0',
    }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 40 }}>
        <div style={{ width: 8, height: 4, borderRadius: 2, background: 'rgba(79,125,243,0.3)' }} />
        <div style={{ width: 24, height: 4, borderRadius: 2, background: '#4f7df3' }} />
        <div style={{ width: 8, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }} />
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 560 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(79,125,243,0.7)',
          textTransform: 'uppercase', marginBottom: 12,
        }}>
          Step 2 of 3
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em',
          lineHeight: 1.1, margin: '0 0 16px',
          background: 'linear-gradient(135deg, #ffffff 30%, rgba(232,232,240,0.6) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Choose your plan
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(232,232,240,0.45)', margin: 0, lineHeight: 1.6 }}>
          Start free — upgrade anytime. Every agent gets a permanent identity on all plans.
        </p>
      </div>

      {/* Plan cards */}
      <div className="onboarding-plan-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        width: '100%',
        maxWidth: 900,
        marginBottom: 32,
      }}>
        {PLANS.map((plan) => {
          const isRec = plan.recommended;
          const isSel = selected === plan.id;

          return (
            <button
              key={plan.id}
              onClick={() => handleSelect(plan.id)}
              style={{
                position: 'relative',
                background: isRec
                  ? 'linear-gradient(160deg, #0e152e 0%, #0c1228 100%)'
                  : isSel
                    ? 'rgba(79,125,243,0.06)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isRec ? 'rgba(79,125,243,0.4)' : isSel ? 'rgba(79,125,243,0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 18,
                padding: isRec ? '28px 24px' : '24px 22px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: '#e8e8f0',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isRec
                  ? '0 0 0 1px rgba(79,125,243,0.1), 0 16px 48px rgba(79,125,243,0.1), inset 0 1px 0 rgba(255,255,255,0.04)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isRec) {
                  e.currentTarget.style.borderColor = 'rgba(79,125,243,0.3)';
                  e.currentTarget.style.background = 'rgba(79,125,243,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRec) {
                  e.currentTarget.style.borderColor = isSel ? 'rgba(79,125,243,0.3)' : 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.background = isSel ? 'rgba(79,125,243,0.06)' : 'rgba(255,255,255,0.02)';
                }
              }}
            >
              {/* Top glow for recommended */}
              {isRec && (
                <div style={{
                  position: 'absolute', top: 0, left: '20%', right: '20%',
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(79,125,243,0.7), transparent)',
                  borderRadius: 1,
                }} />
              )}

              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: 'absolute', top: -11, left: 20,
                  background: 'linear-gradient(135deg, #4f7df3, #6c8ff7)',
                  color: '#fff', fontSize: 9, fontWeight: 800,
                  padding: '3px 10px', borderRadius: 20, letterSpacing: '0.08em',
                }}>
                  {plan.badge.toUpperCase()}
                </div>
              )}

              {/* Plan name & price */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: isRec ? '#4f7df3' : 'rgba(232,232,240,0.3)',
                  marginBottom: 4,
                }}>
                  {plan.anchor ?? plan.name}
                </div>
                <div style={{ fontSize: isRec ? 17 : 14, fontWeight: 700 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 10 }}>
                  <span style={{ fontSize: isRec ? 36 : 28, fontWeight: 800, letterSpacing: '-0.04em' }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)' }}>{plan.pricePeriod}</span>
                </div>
              </div>

              {/* Benefits */}
              <ul style={{
                listStyle: 'none', padding: 0, margin: '0 0 20px',
                display: 'flex', flexDirection: 'column', gap: isRec ? 9 : 7, flex: 1,
              }}>
                {plan.benefits.map((b) => (
                  <li key={b} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 7,
                    fontSize: 12, color: isRec ? '#c4cde0' : 'rgba(232,232,240,0.5)',
                    lineHeight: 1.45,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M2 6l3 3 5-5" stroke={isRec ? '#4f7df3' : '#34d399'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {b}
                  </li>
                ))}
              </ul>

              {/* Handle note pill */}
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: plan.id === 'free'
                  ? 'rgba(239,68,68,0.06)'
                  : 'rgba(52,211,153,0.06)',
                border: `1px solid ${plan.id === 'free' ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'}`,
                fontSize: 11,
                color: plan.id === 'free' ? 'rgba(232,232,240,0.4)' : '#34d399',
                marginBottom: 16,
              }}>
                {plan.handleNote}
              </div>

              {/* CTA */}
              <div style={{
                width: '100%', padding: isRec ? '12px 0' : '10px 0',
                borderRadius: 10, textAlign: 'center',
                background: isRec
                  ? 'linear-gradient(135deg, #4f7df3 0%, #6e93f5 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: isRec ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: isRec ? '#fff' : 'rgba(232,232,240,0.6)',
                fontSize: isRec ? 13 : 12, fontWeight: isRec ? 700 : 500,
                boxShadow: isRec ? '0 4px 16px rgba(79,125,243,0.3)' : 'none',
              }}>
                {plan.id === 'free' ? 'Continue with Free' : plan.id === 'starter' ? 'Choose Starter' : 'Choose Pro'}
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: 'rgba(232,232,240,0.25)', textAlign: 'center' }}>
        No credit card required · Cancel or change plans anytime · Agent UUID identity included on all plans
      </p>

      <style>{`
        @media (max-width: 768px) {
          .onboarding-plan-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
