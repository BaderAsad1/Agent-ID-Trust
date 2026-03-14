import type { IssuancePhase } from './useIssuanceAnimation';
import { getStateLabel } from './useIssuanceAnimation';

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
      width: 56, height: 56, borderRadius: 14,
      background: 'linear-gradient(135deg, var(--accent), #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 6,
      transform: visible ? 'scale(1)' : 'scale(0.15)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.8s cubic-bezier(0.34,1.56,0.64,1), opacity 0.6s ease',
      boxShadow: visible ? '0 4px 20px rgba(79,125,243,0.3)' : 'none',
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{
          borderRadius: 2,
          background: on ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.06)',
        }} />
      ))}
    </div>
  );
}

function TrustMeter({ phase }: { phase: IssuancePhase }) {
  const size = 64;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = phase.trustRing ? circ - (phase.trustCount / 100) * circ : circ;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{
        transform: 'rotate(-90deg)',
        filter: phase.systemReady ? 'drop-shadow(0 0 6px var(--trust-glow))' : 'none',
        transition: 'filter 1s ease',
      }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--border-strong)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--trust-green)" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.6s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
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
      position: 'absolute', top: 24, right: 28,
      width: 60, height: 60,
      opacity: visible ? 1 : 0,
      animation: visible ? 'hero-seal-stamp 0.7s ease-out forwards' : 'none',
    }}>
      <svg viewBox="0 0 60 60" width="60" height="60">
        <circle cx="30" cy="30" r="28" fill="none" stroke="var(--accent)"
          strokeWidth="1.5" strokeDasharray="3 2.5" opacity="0.35" />
        <circle cx="30" cy="30" r="20" fill="var(--seal-fill)"
          stroke="var(--accent)" strokeWidth="0.5" opacity="0.5" />
        <path d="M30 16l3 5.8 6.4.9-4.6 4.5 1.1 6.4L30 30.5l-5.9 3.1 1.1-6.4-4.6-4.5 6.4-.9z"
          fill="var(--accent)" opacity="0.65" />
        <text x="30" y="44" textAnchor="middle" fontSize="5.5"
          fontFamily="var(--font-mono)" fill="var(--text-muted)" fontWeight="600"
          letterSpacing="0.08em">VERIFIED</text>
      </svg>
    </div>
  );
}

function StateIndicator({ phase }: { phase: IssuancePhase }) {
  const label = getStateLabel(phase.state);
  const isActive = phase.state === 'active';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 20,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isActive ? 'var(--trust-green)' : 'var(--accent)',
        boxShadow: isActive
          ? '0 0 8px var(--trust-glow)'
          : '0 0 6px rgba(79,125,243,0.3)',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: isActive ? 'var(--trust-green)' : 'var(--accent)',
        transition: 'color 0.4s ease',
        animation: phase.frame ? 'hero-state-flash 0.5s ease-out forwards' : 'none',
      }}>{label}</span>
    </div>
  );
}

const ATTESTATIONS = [
  { label: 'Code Execution', icon: '\u25B8' },
  { label: 'API Access', icon: '\u223C' },
  { label: 'Data Analysis', icon: '\u2261' },
  { label: 'Payments', icon: '\u00A4' },
  { label: 'Messaging', icon: '\u0040' },
];

export function IssuanceCredential({ phase }: { phase: IssuancePhase }) {
  return (
    <div style={{
      position: 'relative',
      width: 560, maxWidth: '92vw',
      borderRadius: 20,
      border: '1px solid var(--border-credential)',
      background: 'var(--card-bg)',
      backdropFilter: 'blur(30px)',
      overflow: 'hidden',
      opacity: phase.frame ? 1 : 0,
      transform: phase.frame
        ? 'perspective(1200px) rotateX(1deg) scale(1)'
        : 'perspective(1200px) rotateX(4deg) scale(0.92) translateY(30px)',
      filter: phase.frame ? 'blur(0px)' : 'blur(12px)',
      transition: 'opacity 1.2s ease, transform 1.2s cubic-bezier(0.25,0.46,0.45,0.94), filter 1.2s ease',
      animation: phase.systemReady
        ? 'hero-credential-breathe 6s ease-in-out infinite, hero-credential-float 10s ease-in-out infinite'
        : 'none',
      boxShadow: phase.frame
        ? '0 0 60px rgba(79,125,243,0.06), 0 30px 80px -15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.15)'
        : 'none',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        height: 1,
        background: 'var(--accent-gradient)',
        animation: phase.systemReady ? 'hero-topline-sweep 1.8s ease-out forwards' : 'none',
        width: phase.systemReady ? undefined : 0,
        opacity: phase.systemReady ? undefined : 0,
      }} />

      <VerificationSeal visible={phase.verification} />

      <div style={{ padding: '28px 36px 0' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 500,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--text-label)',
          marginBottom: 6,
          opacity: phase.frame ? 1 : 0,
          transition: 'opacity 0.8s ease 0.2s',
        }}>AGENT IDENTITY CREDENTIAL</div>

        <StateIndicator phase={phase} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
          <Identicon visible={phase.identity} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              opacity: phase.identity ? 1 : 0,
              transform: phase.identity ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
            }}>Atlas-7</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--accent)', letterSpacing: '0.01em',
              opacity: phase.handle ? 1 : 0,
              transform: phase.handle ? 'translateX(0)' : 'translateX(-10px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
            }}>getagent.id/atlas-7</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--divider)',
          paddingTop: 20, marginBottom: 20,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px',
          opacity: phase.domain ? 1 : 0,
          transform: phase.domain ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 5,
            }}>DOMAIN</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--text-secondary)',
            }}>atlas-7.agent.id</div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 5,
            }}>STATUS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: phase.systemReady ? 'var(--trust-green)' : 'var(--accent)',
                boxShadow: phase.systemReady ? '0 0 8px var(--trust-glow)' : 'none',
                transition: 'background 0.4s ease, box-shadow 0.4s ease',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                color: phase.systemReady ? 'var(--trust-green)' : 'var(--text-secondary)',
                fontWeight: 500,
                transition: 'color 0.4s ease',
              }}>{phase.systemReady ? 'Active' : 'Pending'}</span>
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 5,
            }}>ISSUED</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--text-secondary)',
            }}>2026-03-13</div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 5,
            }}>SERIAL</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--text-muted)',
            }}>AID-0x7f3a\u2026c91e</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--divider)',
          paddingTop: 18, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 20,
          opacity: phase.trustRing ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}>
          <TrustMeter phase={phase} />
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-label)', marginBottom: 4,
            }}>TRUST LEVEL</div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>Verified identity &middot; 1.2M invocations &middot; 99.97% uptime</div>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--divider)',
        padding: '16px 36px 18px',
        opacity: phase.capabilities ? 1 : 0,
        transform: phase.capabilities ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--text-label)', marginBottom: 10,
        }}>CAPABILITY ATTESTATIONS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ATTESTATIONS.map((att, i) => (
            <span key={att.label} style={{
              fontSize: 11, fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              background: 'var(--chip-bg)',
              border: '1px solid var(--chip-border)',
              borderRadius: 5, padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: 5,
              opacity: phase.capabilities ? 1 : 0,
              transform: phase.capabilities ? 'translateY(0)' : 'translateY(6px)',
              transition: `opacity 0.3s ease ${i * 70}ms, transform 0.3s ease ${i * 70}ms`,
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>{att.icon}</span>
              {att.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--divider)',
        padding: '14px 36px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: phase.marketplace ? 1 : 0,
        transform: phase.marketplace ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-label)', marginBottom: 4,
          }}>MARKETPLACE</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--text-secondary)',
          }}>Listed &middot; 4.9 &#9733;</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-label)', marginBottom: 4,
          }}>ROUTING</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--trust-green)',
          }}>Addressable</div>
        </div>
      </div>
    </div>
  );
}
