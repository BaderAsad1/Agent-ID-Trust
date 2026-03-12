import './_shared/concept/concept.css';
import { useHeroAnimation } from './_shared/concept/useHeroAnimation';
import { AgentProfileCard } from './_shared/concept/AgentProfileCard';
import { SectionReveal } from './_shared/concept/SectionReveal';

const MARQUEE_ITEMS = ['OpenAI', 'Anthropic', 'LangChain', 'AutoGPT', 'CrewAI', 'Vercel AI', 'Hugging Face', 'Cohere', 'Mistral', 'Google DeepMind'];

const PROBLEMS = [
  { stat: '73%', label: 'of enterprises lack agent identity standards', desc: 'No universal way to verify, trust, or permission autonomous agents across systems.' },
  { stat: '$4.2T', label: 'projected autonomous agent economy by 2030', desc: 'Every agent will need verifiable identity, trust scoring, and capability attestation.' },
  { stat: '0', label: 'identity protocols built for agents', desc: 'DNS was built for websites. OAuth was built for humans. Nothing exists for agents.' },
];

const PLANS = [
  { name: 'Starter', price: '$0', period: '/mo', features: ['1 Agent ID', 'Basic trust score', 'Community support', 'Public profile'], highlight: false },
  { name: 'Pro', price: '$49', period: '/mo', features: ['25 Agent IDs', 'Advanced trust analytics', 'Custom domain', 'Priority support', 'API access'], highlight: true },
  { name: 'Team', price: '$199', period: '/mo', features: ['100 Agent IDs', 'Team management', 'SSO integration', 'SLA guarantee', 'Audit logs'], highlight: false },
  { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited agents', 'On-premise option', 'Dedicated support', 'Custom integrations', 'Compliance packages'], highlight: false },
];

export default function ConceptDark() {
  const phase = useHeroAnimation(94);

  return (
    <div className="concept-page concept-dark">
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-dark">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        background: 'transparent',
        filter: 'url(#grain-dark)',
        opacity: 'var(--grain-opacity)',
        mixBlendMode: 'overlay',
      }} />

      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--accent-blue)',
            animation: 'concept-pulse-pip 2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Agent ID</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {['Protocol', 'Registry', 'Marketplace', 'Docs'].map(item => (
            <span key={item} style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>{item}</span>
          ))}
          <span style={{
            fontSize: 13, fontWeight: 500, color: '#fff',
            background: 'var(--accent-blue)',
            borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
          }}>Get Started</span>
        </div>
      </nav>

      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 80, paddingBottom: 80,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '15%', left: '10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,125,243,0.08) 0%, transparent 70%)',
          animation: 'concept-drift-1 20s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '5%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,91,245,0.06) 0%, transparent 70%)',
          animation: 'concept-drift-2 25s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(120px, 15vw, 200px)',
          fontWeight: 800,
          color: 'transparent',
          WebkitTextStroke: '1px rgba(255,255,255,0.03)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>AGENT ID</div>

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 680, padding: '0 24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--accent-blue)',
            background: 'var(--accent-blue-soft)',
            border: '1px solid rgba(79,125,243,0.2)',
            borderRadius: 20, padding: '5px 14px',
            marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--trust-green)' }} />
            LIVE — 4,291 agents registered
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 5vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            marginBottom: 20,
          }}>
            Every agent needs<br />an{' '}
            <span style={{
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>identity.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 1.8vw, 19px)',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            maxWidth: 520, margin: '0 auto 40px',
          }}>
            The identity, trust, and marketplace layer for autonomous AI agents.
            DNS + OAuth + Stripe — purpose-built for the agentic internet.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 56 }}>
            <button style={{
              position: 'relative', overflow: 'hidden',
              fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-body)',
              color: '#fff', background: 'var(--accent-blue)',
              border: 'none', borderRadius: 10, padding: '13px 28px',
              cursor: 'pointer',
            }}>
              Register Your Agent
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                animation: 'concept-shimmer 3s ease-in-out infinite',
              }} />
            </button>
            <button style={{
              fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-body)',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border-color-strong)',
              borderRadius: 10, padding: '13px 28px',
              cursor: 'pointer',
            }}>View Documentation</button>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 3 }}>
          <AgentProfileCard phase={phase} />
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--section-border)', overflow: 'hidden', padding: '20px 0' }}>
        <div style={{
          display: 'flex', gap: 48,
          animation: 'concept-marquee 30s linear infinite',
          whiteSpace: 'nowrap', width: 'max-content',
        }}>
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} style={{
              fontSize: 14, fontFamily: 'var(--font-body)',
              color: 'var(--text-muted)', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border-color-strong)' }} />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section style={{ padding: '100px 32px', maxWidth: 1080, margin: '0 auto' }}>
        <SectionReveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 3.5vw, 44px)',
              fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16,
            }}>The problem is fundamental.</h2>
            <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto' }}>
              The agent economy is exploding. But there's no identity layer. No trust. No interoperability.
            </p>
          </div>
        </SectionReveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {PROBLEMS.map((p, i) => (
            <SectionReveal key={i} delay={i * 120}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 16, padding: 32,
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                  background: 'var(--stat-gradient)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  marginBottom: 8,
                }}>{p.stat}</div>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                  marginBottom: 10,
                }}>{p.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.desc}</div>
              </div>
            </SectionReveal>
          ))}
        </div>
      </section>

      <section style={{
        padding: '100px 32px',
        borderTop: '1px solid var(--section-border)',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <SectionReveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 3.5vw, 44px)',
              fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16,
            }}>Simple, transparent pricing.</h2>
            <p style={{ fontSize: 17, color: 'var(--text-secondary)' }}>Start free. Scale as your agent fleet grows.</p>
          </div>
        </SectionReveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {PLANS.map((plan, i) => (
            <SectionReveal key={plan.name} delay={i * 100}>
              <div style={{
                background: plan.highlight ? 'var(--pricing-highlight-bg)' : 'var(--bg-card)',
                border: `1px solid ${plan.highlight ? 'var(--pricing-highlight-border)' : 'var(--border-color)'}`,
                borderRadius: 16, padding: 32,
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#fff', background: 'var(--accent-blue)',
                    borderRadius: '0 0 8px 8px', padding: '3px 12px',
                  }}>Most Popular</div>
                )}
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
                  marginBottom: 16, color: 'var(--text-primary)',
                }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 24 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{plan.period}</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{
                      fontSize: 13, color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button style={{
                  width: '100%', marginTop: 24,
                  fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
                  color: plan.highlight ? '#fff' : 'var(--text-primary)',
                  background: plan.highlight ? 'var(--accent-blue)' : 'transparent',
                  border: `1px solid ${plan.highlight ? 'var(--accent-blue)' : 'var(--border-color-strong)'}`,
                  borderRadius: 8, padding: '10px 0',
                  cursor: 'pointer',
                }}>{plan.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}</button>
              </div>
            </SectionReveal>
          ))}
        </div>
      </section>

      <footer style={{
        borderTop: '1px solid var(--section-border)',
        padding: '48px 32px',
        maxWidth: 1080, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-blue)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>Agent ID</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Identity infrastructure for autonomous agents.</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Protocol', 'Documentation', 'GitHub', 'Twitter'].map(link => (
            <span key={link} style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>{link}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
