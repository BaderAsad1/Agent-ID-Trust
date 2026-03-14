import type { AnimationPhase } from './useHeroAnimation';

function Identicon({ visible }: { visible: boolean }) {
  const cells = [
    [1,0,1,0,1],
    [0,1,1,1,0],
    [1,1,0,1,1],
    [0,1,1,1,0],
    [1,0,1,0,1],
  ];
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'linear-gradient(135deg, var(--accent-blue), #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.5, padding: 5,
      transform: visible ? 'scale(1)' : 'scale(0.2)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.7s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{
          borderRadius: 1.5,
          background: on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.08)',
        }} />
      ))}
    </div>
  );
}

function TrustMeter({ phase }: { phase: AnimationPhase }) {
  const size = 56;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = phase.trustRing ? circ - (phase.trustCount / 100) * circ : circ;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{
        transform: 'rotate(-90deg)',
        animation: phase.alive ? 'concept-ring-pulse 4s ease-in-out infinite' : 'none',
      }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--border-color)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--trust-green)" strokeWidth="2"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.6s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
        color: 'var(--trust-green)',
        opacity: phase.trustRing ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}>{phase.trustCount}</span>
    </div>
  );
}

function VerificationSeal({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'absolute', top: 20, right: 20,
      width: 52, height: 52,
      opacity: visible ? 1 : 0,
      animation: visible ? 'concept-seal-stamp 0.6s ease-out forwards' : 'none',
    }}>
      <svg viewBox="0 0 52 52" width="52" height="52">
        <circle cx="26" cy="26" r="24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.4" />
        <circle cx="26" cy="26" r="18" fill="var(--seal-color)" stroke="var(--accent-blue)" strokeWidth="0.5" opacity="0.6" />
        <path d="M26 14l2.5 5 5.5.8-4 3.9.9 5.5L26 26.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z"
          fill="var(--accent-blue)" opacity="0.7" />
        <text x="26" y="38" textAnchor="middle" fontSize="5" fontFamily="var(--font-mono)"
          fill="var(--text-muted)" fontWeight="600">VERIFIED</text>
      </svg>
    </div>
  );
}

const ATTESTATIONS = [
  { label: 'Code Execution', icon: '>' },
  { label: 'API Access', icon: '~' },
  { label: 'Data Analysis', icon: '#' },
  { label: 'Payments', icon: '$' },
  { label: 'Messaging', icon: '@' },
];

export function AgentCredential({ phase }: { phase: AnimationPhase }) {
  return (
    <div style={{
      position: 'relative',
      width: 360, maxWidth: '88vw',
      borderRadius: 16,
      border: '1px solid var(--border-credential)',
      background: 'var(--bg-card)',
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      opacity: phase.frame ? 1 : 0,
      transform: phase.frame ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
      filter: phase.frame ? 'blur(0px)' : 'blur(10px)',
      transition: 'opacity 1s ease, transform 1s cubic-bezier(0.25,0.46,0.45,0.94), filter 1s ease',
      animation: phase.alive ? 'concept-breathe 5s ease-in-out infinite, concept-float 8s ease-in-out infinite' : 'none',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        height: 1,
        background: 'var(--accent-gradient)',
        animation: phase.alive ? 'concept-topline 1.5s ease-out forwards' : 'none',
        width: phase.alive ? undefined : 0,
        opacity: phase.alive ? undefined : 0,
      }} />

      <VerificationSeal visible={phase.verification} />

      <div style={{ padding: '24px 28px 0' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--text-label)',
          marginBottom: 16,
          opacity: phase.emblem ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}>AGENT IDENTITY CREDENTIAL</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Identicon visible={phase.identity} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              opacity: phase.identity ? 1 : 0,
              transform: phase.identity ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
            }}>Atlas-7</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--accent-blue)', letterSpacing: '0.01em',
              opacity: phase.handle ? 1 : 0,
              transform: phase.handle ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>getagent.id/atlas-7</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--credential-divider)',
          paddingTop: 16, marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px',
          opacity: phase.domain ? 1 : 0,
          transform: phase.domain ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 4,
            }}>DOMAIN</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-secondary)',
            }}>atlas-7.agent.id</div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 4,
            }}>STATUS</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--trust-green)',
                boxShadow: '0 0 6px var(--trust-glow)',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--trust-green)', fontWeight: 500,
              }}>Active</span>
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 4,
            }}>ISSUED</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-secondary)',
            }}>2026-03-12</div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 4,
            }}>SERIAL</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-muted)',
            }}>AID-0x7f3a…c91e</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--credential-divider)',
          paddingTop: 14, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 16,
          opacity: phase.trustRing ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          <TrustMeter phase={phase} />
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 3,
            }}>TRUST LEVEL</div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              color: 'var(--text-secondary)', lineHeight: 1.4,
            }}>Verified identity &middot; 1.2M invocations &middot; 99.97% uptime</div>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--credential-divider)',
        padding: '12px 28px 16px',
        opacity: phase.capabilities ? 1 : 0,
        transform: phase.capabilities ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--text-label)', marginBottom: 8,
        }}>CAPABILITY ATTESTATIONS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {ATTESTATIONS.map((att, i) => (
            <span key={att.label} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              background: 'var(--chip-bg)',
              border: '1px solid var(--chip-border)',
              borderRadius: 4, padding: '3px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: phase.capabilities ? 1 : 0,
              transform: phase.capabilities ? 'translateY(0)' : 'translateY(6px)',
              transition: `opacity 0.3s ease ${i * 60}ms, transform 0.3s ease ${i * 60}ms`,
            }}>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{att.icon}</span>
              {att.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--credential-divider)',
        padding: '12px 28px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: phase.capabilities ? 1 : 0,
        transform: phase.capabilities ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-label)', marginBottom: 3,
          }}>MARKETPLACE</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)',
          }}>Listed &middot; 4.9 &#9733;</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-label)', marginBottom: 3,
          }}>ROUTING</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--trust-green)',
          }}>Addressable</div>
        </div>
      </div>
    </div>
  );
}
