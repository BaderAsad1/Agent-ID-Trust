import { type ReactNode } from 'react';
import './concept.css';
import { useHeroAnimation } from './useHeroAnimation';
import { AgentCredential } from './AgentCredential';
import { NetworkContext } from './NetworkContext';
import { SectionReveal } from './SectionReveal';

const MARQUEE_ITEMS = ['OpenAI', 'Anthropic', 'LangChain', 'AutoGPT', 'CrewAI', 'Vercel AI SDK', 'Hugging Face', 'Cohere', 'Mistral', 'Google DeepMind', 'AWS Bedrock', 'Microsoft Copilot'];

const PROBLEMS = [
  { stat: '73%', label: 'of enterprises cannot verify an agent\'s identity', desc: 'Agents interact across organizational boundaries with no standard identity, no trust chain, and no accountability.' },
  { stat: '$4.2T', label: 'projected autonomous economy by 2030', desc: 'Every transaction, every API call, every decision — made by agents that carry no verifiable credential.' },
  { stat: '0', label: 'identity primitives built for agents', desc: 'DNS was built for websites. OAuth was built for humans. The agent internet has no identity layer.' },
];

const PLANS = [
  { name: 'Starter', price: '$29', period: '/mo', features: ['5 agents', '1,000 req/min', 'Handle included', 'Marketplace access', 'Email support'], highlight: false },
  { name: 'Pro', price: '$79', period: '/mo', features: ['25 agents', '5,000 req/min', 'Fleet management', 'Custom domains', 'Priority support'], highlight: true },
  { name: 'Enterprise', price: 'Tailored', period: '', features: ['Custom agent limits', 'Custom rate limits', 'SLA guarantee', 'Dedicated support', 'Custom integrations'], highlight: false },
];

interface ConceptPageProps {
  theme: 'dark' | 'light';
  heroBackground: ReactNode;
}

export function ConceptPage({ theme, heroBackground }: ConceptPageProps) {
  const phase = useHeroAnimation(94);
  const grainId = `grain-${theme}`;

  return (
    <div className={`concept-page concept-${theme}`}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        background: 'transparent',
        filter: `url(#${grainId})`,
        opacity: 'var(--grain-opacity)',
        mixBlendMode: theme === 'dark' ? 'overlay' : 'multiply',
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
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent-blue)',
            animation: 'concept-pulse-pip 2.5s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Agent ID</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {['Protocol', 'Registry', 'Marketplace', 'Docs'].map(item => (
            <span key={item} style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>{item}</span>
          ))}
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#fff',
            background: 'var(--accent-blue)',
            borderRadius: 8, padding: '7px 18px', cursor: 'pointer',
          }}>Claim Your Agent ID</span>
        </div>
      </nav>

      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 56,
        overflow: 'hidden',
      }}>
        {heroBackground}

        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(100px, 14vw, 180px)',
          fontWeight: 800,
          color: 'transparent',
          WebkitTextStroke: '1px var(--watermark-stroke)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          animation: 'concept-watermark-drift 8s ease-in-out infinite',
        }}>AGENT ID</div>

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 640, padding: '0 24px', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--accent-blue)',
            background: 'var(--accent-blue-soft)',
            border: '1px solid var(--border-credential)',
            borderRadius: 20, padding: '5px 14px',
            marginBottom: 32, letterSpacing: '0.03em',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--trust-green)', boxShadow: '0 0 4px var(--trust-glow)' }} />
            PROTOCOL LIVE — 4,291 CREDENTIALS ISSUED
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 4.5vw, 56px)',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: 20,
          }}>
            The identity primitive<br />for the{' '}
            <span style={{
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>autonomous internet.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 1.6vw, 18px)',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            maxWidth: 480, margin: '0 auto 36px',
          }}>
            Agents are becoming first-class participants on the internet.
            They need a credential that makes them verifiable, routable, trustable, and billable.
            Agent ID is that credential.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={{
              position: 'relative', overflow: 'hidden',
              fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)',
              color: '#fff', background: 'var(--accent-blue)',
              border: 'none', borderRadius: 10, padding: '13px 28px',
              cursor: 'pointer', letterSpacing: '-0.01em',
            }}>
              Claim Your Agent ID
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
                animation: 'concept-shimmer 4s ease-in-out infinite',
              }} />
            </button>
            <button style={{
              fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border-color-strong)',
              borderRadius: 10, padding: '13px 28px',
              cursor: 'pointer',
            }}>Explore the Primitive</button>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, width: 900, maxWidth: '100vw', height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <NetworkContext phase={phase} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <AgentCredential phase={phase} />
          </div>
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--section-border)', overflow: 'hidden', padding: '18px 0' }}>
        <div style={{
          display: 'flex', gap: 48,
          animation: 'concept-marquee 35s linear infinite',
          whiteSpace: 'nowrap', width: 'max-content',
        }}>
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} style={{
              fontSize: 13, fontFamily: 'var(--font-body)',
              color: 'var(--text-muted)', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-color-strong)' }} />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section style={{ padding: '100px 32px', maxWidth: 1080, margin: '0 auto' }}>
        <SectionReveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 16,
            }}>THE PROBLEM</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.2vw, 40px)',
              fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 16, lineHeight: 1.15,
            }}>Billions of agents. Zero identity infrastructure.</h2>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
              The autonomous internet is arriving without the most basic prerequisite: a way to know who — or what — you're dealing with.
            </p>
          </div>
        </SectionReveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {PROBLEMS.map((p, i) => (
            <SectionReveal key={i} delay={i * 120}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 14, padding: 28,
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
                  background: 'var(--stat-gradient)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  marginBottom: 8,
                }}>{p.stat}</div>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                  marginBottom: 8, lineHeight: 1.4,
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
        maxWidth: 1120, margin: '0 auto',
      }}>
        <SectionReveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 16,
            }}>PRICING</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.2vw, 40px)',
              fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 16,
            }}>Issue credentials. Scale trust.</h2>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Start with one agent. Scale to your entire fleet.</p>
          </div>
        </SectionReveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {PLANS.map((plan, i) => (
            <SectionReveal key={plan.name} delay={i * 100}>
              <div style={{
                background: plan.highlight ? 'var(--pricing-highlight-bg)' : 'var(--bg-card)',
                border: `1px solid ${plan.highlight ? 'var(--pricing-highlight-border)' : 'var(--border-color)'}`,
                borderRadius: 14, padding: 28,
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#fff', background: 'var(--accent-blue)',
                    borderRadius: '0 0 6px 6px', padding: '3px 12px',
                  }}>Recommended</div>
                )}
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600,
                  marginBottom: 14, color: 'var(--text-primary)',
                }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 20 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{plan.period}</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{
                      fontSize: 12, color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button style={{
                  width: '100%', marginTop: 20,
                  fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
                  color: plan.highlight ? '#fff' : 'var(--text-primary)',
                  background: plan.highlight ? 'var(--accent-blue)' : 'transparent',
                  border: `1px solid ${plan.highlight ? 'var(--accent-blue)' : 'var(--border-color-strong)'}`,
                  borderRadius: 8, padding: '10px 0',
                  cursor: 'pointer',
                }}>{plan.name === 'Enterprise' ? 'Contact Sales' : 'Register an Agent'}</button>
              </div>
            </SectionReveal>
          ))}
        </div>
      </section>

      <footer style={{
        borderTop: '1px solid var(--section-border)',
        padding: '40px 32px',
        maxWidth: 1080, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-blue)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700 }}>Agent ID</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>The identity primitive for autonomous agents.</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Protocol', 'Registry', 'Documentation', 'GitHub'].map(link => (
            <span key={link} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>{link}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
