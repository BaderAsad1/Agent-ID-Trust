import './_shared/concept/hero.css';
import { useIssuanceAnimation } from './_shared/concept/useIssuanceAnimation';
import { IssuanceCredential } from './_shared/concept/IssuanceCredential';

interface TopoNode {
  x: number;
  y: number;
  label?: string;
  connectsAtPhase: 'identity' | 'domain' | 'trustRing' | 'capabilities' | 'marketplace';
}

const NODES: TopoNode[] = [
  { x: -420, y: -200, label: 'Trust',       connectsAtPhase: 'trustRing' },
  { x: 400,  y: -180, label: 'Router',      connectsAtPhase: 'domain' },
  { x: -380, y: 220,  label: 'Marketplace', connectsAtPhase: 'marketplace' },
  { x: 440,  y: 200,  label: 'Payments',    connectsAtPhase: 'capabilities' },
  { x: -200, y: -320, label: 'Registry',    connectsAtPhase: 'domain' },
  { x: 250,  y: 320,  label: 'Inbox',       connectsAtPhase: 'capabilities' },
  { x: 480,  y: -20,  label: 'Gateway',     connectsAtPhase: 'identity' },
  { x: -460, y: 10,   label: 'Attestation', connectsAtPhase: 'trustRing' },
];

const AMBIENT_NODES: { x: number; y: number }[] = [
  { x: -300, y: -280 }, { x: 320, y: -300 }, { x: -500, y: -120 },
  { x: 520, y: -100 }, { x: -350, y: 310 }, { x: 380, y: 330 },
  { x: -550, y: 160 }, { x: 540, y: 130 }, { x: 0, y: -380 },
  { x: 0, y: 400 }, { x: -180, y: 380 }, { x: 200, y: -370 },
  { x: -580, y: -50 }, { x: 580, y: 50 },
];

const EDGES: [number, number][] = [
  [0, 4], [1, 3], [2, 5], [0, 7], [1, 6],
  [4, 1], [2, 0], [3, 5], [6, 3], [7, 2],
];

function isNodeActive(phase: ReturnType<typeof useIssuanceAnimation>, key: TopoNode['connectsAtPhase']): boolean {
  return Boolean(phase[key]);
}

export default function HeroB() {
  const phase = useIssuanceAnimation(94);
  const cx = 640;
  const cy = 450;

  return (
    <div className="hero-page" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', position: 'relative',
    }}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-hero-b">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#grain-hero-b)', opacity: 0.02, mixBlendMode: 'overlay',
      }} />

      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
      }} viewBox="0 0 1280 900" preserveAspectRatio="xMidYMid slice">
        {EDGES.map(([a, b], i) => {
          const na = NODES[a];
          const nb = NODES[b];
          if (!na || !nb) return null;
          const activeA = isNodeActive(phase, na.connectsAtPhase);
          const activeB = isNodeActive(phase, nb.connectsAtPhase);
          const lit = activeA && activeB;
          return (
            <line key={`edge-${i}`}
              x1={cx + na.x} y1={cy + na.y}
              x2={cx + nb.x} y2={cy + nb.y}
              stroke={lit ? 'rgba(79,125,243,0.12)' : 'rgba(79,125,243,0.03)'}
              strokeWidth="0.5"
              strokeDasharray="4 6"
              style={{ transition: 'stroke 1s ease' }}
            />
          );
        })}

        {AMBIENT_NODES.map((n, i) => (
          <circle key={`amb-${i}`}
            cx={cx + n.x} cy={cy + n.y}
            r={phase.frame ? 1.5 : 0}
            fill="rgba(79,125,243,0.15)"
            style={{ transition: `r 0.6s ease ${300 + i * 80}ms` }}
          />
        ))}

        {NODES.map((n, i) => {
          const active = isNodeActive(phase, n.connectsAtPhase);
          return (
            <g key={`node-${i}`}>
              <line
                x1={cx} y1={cy}
                x2={cx + n.x} y2={cy + n.y}
                stroke={active ? 'rgba(79,125,243,0.10)' : 'rgba(79,125,243,0.02)'}
                strokeWidth="0.75"
                strokeDasharray="200"
                style={{
                  transition: 'stroke 1s ease',
                  animation: active ? `hero-network-draw 1.5s ease-out forwards` : 'none',
                }}
              />
              <circle
                cx={cx + n.x} cy={cy + n.y}
                r={active ? 3 : (phase.frame ? 1.5 : 0)}
                fill={active && phase.systemReady ? 'var(--trust-green)' : 'var(--accent)'}
                opacity={active ? 0.7 : 0.2}
                style={{
                  transition: 'r 0.5s ease, fill 0.6s ease, opacity 0.5s ease',
                }}
              />
              {active && phase.systemReady && (
                <circle
                  cx={cx + n.x} cy={cy + n.y}
                  r="8" fill="none"
                  stroke={phase.systemReady ? 'var(--trust-green)' : 'var(--accent)'}
                  strokeWidth="0.5"
                  opacity="0.2"
                />
              )}
              {n.label && (
                <text
                  x={cx + n.x}
                  y={cy + n.y + (n.y < 0 ? -12 : 16)}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="500"
                  letterSpacing="0.12em"
                  fill={active ? 'rgba(232,232,240,0.30)' : 'rgba(232,232,240,0.08)'}
                  style={{
                    transition: 'fill 0.8s ease',
                    textTransform: 'uppercase' as const,
                  }}
                >{n.label}</text>
              )}
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={phase.frame ? 4 : 0}
          fill="var(--accent)" opacity="0.5"
          style={{ transition: 'r 0.8s ease' }} />
        {phase.systemReady && (
          <circle cx={cx} cy={cy} r="14" fill="none"
            stroke="var(--accent)" strokeWidth="0.5" opacity="0.15" />
        )}
      </svg>

      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        maxWidth: 480, marginBottom: 32, padding: '0 24px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 2.8vw, 34px)',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          opacity: phase.identity ? 1 : 0,
          transform: phase.identity ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 1s ease, transform 1s ease',
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
          fontSize: 14, fontWeight: 600,
          fontFamily: 'var(--font-body)',
          color: '#fff', background: 'var(--accent)',
          border: 'none', borderRadius: 10, padding: '13px 28px',
          cursor: 'pointer',
        }}>
          Claim Your Agent ID
        </button>
      </div>
    </div>
  );
}
