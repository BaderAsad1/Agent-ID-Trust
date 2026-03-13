import './_shared/concept/hero.css';
import { useIssuanceAnimation } from './_shared/concept/useIssuanceAnimation';
import { IssuanceCredential } from './_shared/concept/IssuanceCredential';

interface ServiceNode {
  label: string;
  angle: number;
  ring: 0 | 1 | 2;
  phase: 'domainBinding' | 'trustIssuance' | 'capabilities' | 'marketplace';
}

const SERVICES: ServiceNode[] = [
  { label: 'TRUST',       angle: 0,   ring: 1, phase: 'trustIssuance' },
  { label: 'ROUTER',      angle: 90,  ring: 1, phase: 'domainBinding' },
  { label: 'MARKETPLACE', angle: 180, ring: 2, phase: 'marketplace' },
  { label: 'PAYMENTS',    angle: 270, ring: 2, phase: 'capabilities' },
  { label: 'REGISTRY',    angle: 45,  ring: 2, phase: 'domainBinding' },
  { label: 'INBOX',       angle: 225, ring: 1, phase: 'capabilities' },
  { label: 'GATEWAY',     angle: 315, ring: 2, phase: 'trustIssuance' },
  { label: 'ATTESTATION', angle: 135, ring: 1, phase: 'marketplace' },
];

const RING_RADII = [240, 360, 480];

function isPhaseActive(phase: ReturnType<typeof useIssuanceAnimation>, key: ServiceNode['phase']): boolean {
  if (key === 'domainBinding') return phase.domain;
  if (key === 'trustIssuance') return phase.trustRing;
  if (key === 'capabilities') return phase.capabilities;
  if (key === 'marketplace') return phase.marketplace;
  return false;
}

export default function HeroA() {
  const phase = useIssuanceAnimation(94);

  return (
    <div className="hero-page" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', position: 'relative',
    }}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-hero-a">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#grain-hero-a)', opacity: 0.02, mixBlendMode: 'overlay',
      }} />

      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {RING_RADII.map((r, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: r * 2, height: r * 2,
            borderRadius: '50%',
            border: `1px solid rgba(79,125,243,${phase.systemReady ? 0.06 : (phase.frame ? 0.03 : 0)})`,
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            transition: 'border-color 1.5s ease',
            animation: phase.systemReady ? `hero-ring-idle ${4 + i * 1.5}s ease-in-out infinite` : 'none',
          }} />
        ))}

        {phase.frame && [0, 1, 2].map(i => {
          const stateIdx = phase.marketplace ? 3 : phase.capabilities ? 2 : phase.trustRing ? 1 : phase.domain ? 0 : -1;
          if (i > stateIdx && !phase.systemReady) return null;
          return (
            <div key={`pulse-${i}`} style={{
              position: 'absolute',
              width: 10, height: 10,
              borderRadius: '50%',
              border: '1px solid rgba(79,125,243,0.15)',
              left: '50%', top: '50%',
              animation: `hero-ring-expand 3s ease-out ${i * 800}ms infinite`,
              pointerEvents: 'none',
            }} />
          );
        })}

        {SERVICES.map((svc, i) => {
          const active = isPhaseActive(phase, svc.phase);
          const r = RING_RADII[svc.ring];
          const rad = (svc.angle * Math.PI) / 180;
          const x = Math.cos(rad) * r;
          const y = Math.sin(rad) * r;

          return (
            <div key={i} style={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: active ? 1 : 0,
              transition: 'opacity 0.8s ease',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: active && phase.systemReady ? 'var(--trust-green)' : 'var(--accent)',
                boxShadow: active && phase.systemReady
                  ? '0 0 12px var(--trust-glow)'
                  : '0 0 8px rgba(79,125,243,0.3)',
                transition: 'background 0.6s ease, box-shadow 0.6s ease',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                fontWeight: 500,
                letterSpacing: '0.14em',
                color: active && phase.systemReady ? 'rgba(232,232,240,0.35)' : 'rgba(232,232,240,0.18)',
                transition: 'color 0.6s ease',
                animation: active && phase.systemReady ? `hero-service-pulse 4s ease-in-out ${i * 300}ms infinite` : 'none',
              }}>{svc.label}</span>
            </div>
          );
        })}

        {SERVICES.map((svc, i) => {
          const active = isPhaseActive(phase, svc.phase);
          if (!active) return null;
          const r = RING_RADII[svc.ring];
          const rad = (svc.angle * Math.PI) / 180;
          const x2 = 50 + (Math.cos(rad) * r / 12.8);
          const y2 = 50 + (Math.sin(rad) * r / 9);

          return (
            <svg key={`line-${i}`} style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
            }}>
              <line
                x1="50%" y1="50%"
                x2={`${x2}%`} y2={`${y2}%`}
                stroke="rgba(79,125,243,0.06)"
                strokeWidth="0.5"
                strokeDasharray="3 4"
                style={{
                  animation: phase.systemReady ? `hero-service-pulse 3s ease-in-out ${i * 200}ms infinite` : 'none',
                }}
              />
            </svg>
          );
        })}
      </div>

      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        maxWidth: 500, marginBottom: 32, padding: '0 24px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(20px, 2.5vw, 30px)',
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          opacity: phase.frame ? 1 : 0,
          transform: phase.frame ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 1s ease 0.3s, transform 1s ease 0.3s',
        }}>
          The identity primitive for the{' '}
          <span style={{
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>autonomous internet.</span>
        </h1>
      </div>

      <div style={{ position: 'relative', zIndex: 3 }}>
        <IssuanceCredential phase={phase} />
      </div>

      <div style={{
        position: 'relative', zIndex: 2,
        marginTop: 28,
        opacity: phase.systemReady ? 1 : 0,
        transform: phase.systemReady ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <button style={{
          position: 'relative', overflow: 'hidden',
          fontSize: 14, fontWeight: 600,
          fontFamily: 'var(--font-body)',
          color: '#fff', background: 'var(--accent)',
          border: 'none', borderRadius: 10, padding: '13px 28px',
          cursor: 'pointer', letterSpacing: '-0.01em',
        }}>
          Claim Your Agent ID
        </button>
      </div>
    </div>
  );
}
