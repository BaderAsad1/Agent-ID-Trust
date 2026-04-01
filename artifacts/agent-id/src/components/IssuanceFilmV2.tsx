import { useRef, useEffect, useState, type RefObject } from 'react';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

interface ScrollState {
  progress: number;
  heroProgress: number;
  anatomyProgress: number;
  activationProgress: number;
  ctaProgress: number;
}

interface SectionRefs {
  hero: RefObject<HTMLElement | null>;
  anatomy: RefObject<HTMLElement | null>;
  activation: RefObject<HTMLElement | null>;
  cta: RefObject<HTMLElement | null>;
}

type CeremonyState = 'unresolved' | 'validating' | 'binding' | 'issuing' | 'active';

const CONSTELLATION_NODES = [
  {x:7,y:10},{x:22,y:6},{x:40,y:14},{x:58,y:7},{x:74,y:18},{x:90,y:11},
  {x:4,y:38},{x:18,y:52},{x:34,y:44},{x:50,y:58},{x:65,y:46},{x:80,y:56},{x:94,y:40},
  {x:10,y:74},{x:28,y:82},{x:46,y:72},{x:62,y:84},{x:78,y:75},{x:92,y:88},
];
const CONSTELLATION_EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],
  [0,6],[2,8],[4,10],[5,12],
  [6,7],[7,8],[8,9],[9,10],[10,11],[11,12],
  [6,13],[8,14],[9,15],[10,16],[11,17],[12,18],
  [13,14],[14,15],[15,16],[16,17],[17,18],
  [1,7],[3,9],[5,11],[7,14],[9,16],[11,18],
];

// ─────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────

function useSectionRefs(): SectionRefs {
  return {
    hero: useRef<HTMLElement>(null),
    anatomy: useRef<HTMLElement>(null),
    activation: useRef<HTMLElement>(null),
    cta: useRef<HTMLElement>(null),
  };
}

function useScrollFilm(refs: SectionRefs): ScrollState {
  const [state, setState] = useState<ScrollState>({
    progress: 0, heroProgress: 0, anatomyProgress: 0, activationProgress: 0, ctaProgress: 0,
  });

  useEffect(() => {
    let ticking = false;
    const sp = (el: HTMLElement | null) => {
      if (!el) return 0;
      const scrollY = window.scrollY;
      const top = el.offsetTop;
      const height = el.offsetHeight;
      const scrollable = height - window.innerHeight;
      if (scrollable <= 0) {
        return scrollY >= top && scrollY < top + height ? 1 : scrollY >= top + height ? 1 : 0;
      }
      return Math.max(0, Math.min(1, (scrollY - top) / scrollable));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        setState({
          progress: docH > 0 ? Math.min(scrollY / docH, 1) : 0,
          heroProgress: sp(refs.hero.current),
          anatomyProgress: sp(refs.anatomy.current),
          activationProgress: sp(refs.activation.current),
          ctaProgress: sp(refs.cta.current),
        });
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [refs]);

  return state;
}

function useCounter(target: number, duration = 2000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const startTime = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function getCeremony(p: number): CeremonyState {
  if (p < 0.08) return 'unresolved';
  if (p < 0.25) return 'validating';
  if (p < 0.50) return 'binding';
  if (p < 0.75) return 'issuing';
  return 'active';
}

function sectionOpacity(progress: number): number {
  if (progress < 0.06) return lerp(0, 1, progress / 0.06);
  if (progress > 0.90) return lerp(1, 0, (progress - 0.90) / 0.10);
  return 1;
}

// ─────────────────────────────────────────────────────────────────
// GRAIN
// ─────────────────────────────────────────────────────────────────

function GrainOverlay() {
  return null;
}

function NetworkConstellation({ opacity = 1 }: { opacity?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', opacity }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        {CONSTELLATION_EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={`${CONSTELLATION_NODES[a].x}%`} y1={`${CONSTELLATION_NODES[a].y}%`}
            x2={`${CONSTELLATION_NODES[b].x}%`} y2={`${CONSTELLATION_NODES[b].y}%`}
            stroke="#4f7df3"
            strokeWidth="0.7"
            style={{ animation: `v2-edge-flow ${2.5 + (i % 7) * 0.5}s ease-in-out infinite`, animationDelay: `${(i * 0.18) % 3}s` }}
          />
        ))}
        {CONSTELLATION_NODES.map((n, i) => (
          <circle
            key={i}
            cx={`${n.x}%`} cy={`${n.y}%`} r={i % 5 === 0 ? 3.5 : 1.8}
            fill="#4f7df3"
            style={{ animation: `v2-node-pulse ${2 + (i % 5) * 0.45}s ease-in-out infinite`, animationDelay: `${(i * 0.22) % 2.5}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

function HeroStats({ visible }: { visible: boolean }) {
  const agents = useCounter(14247, 2200);
  const creds = useCounter(98420, 2600);
  const stats = [
    { value: agents.toLocaleString() + '+', label: 'Agents Registered' },
    { value: creds.toLocaleString() + '+', label: 'Credentials Issued' },
    { value: '<50ms', label: 'Resolution Time' },
  ];
  return (
    <div style={{
      display: 'flex', marginBottom: 44,
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(8px)',
      transition: 'opacity 0.5s ease 0.3s, transform 0.5s ease 0.3s',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          flex: 1, padding: '16px 0',
          borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 'clamp(18px, 2vw, 26px)',
            fontWeight: 700, color: '#ffffff',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>{s.value}</div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10, letterSpacing: '0.13em',
            color: 'rgba(255,255,255,0.30)', fontWeight: 500,
          }}>{s.label.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AMBIENT RINGS
// ─────────────────────────────────────────────────────────────────

function ProductGlow({ ceremony, heroProgress }: { ceremony: CeremonyState; heroProgress: number }) {
  const isActive = ceremony === 'active';
  const isIssuing = ceremony === 'issuing';
  const color = isActive ? '52,211,153' : isIssuing ? '245,166,35' : '79,125,243';
  const intensity = Math.min(1, heroProgress / 0.06);

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      opacity: intensity, transition: 'opacity 1s ease',
      overflow: 'hidden',
    }}>
      {/* Bottom specular  -  product sitting in light */}
      <div style={{
        position: 'absolute', bottom: '-10%', left: '50%',
        transform: 'translateX(-50%)',
        width: 800, height: 400, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(${color},${isActive ? 0.10 : isIssuing ? 0.08 : 0.06}) 0%, transparent 65%)`,
        transition: 'background 1.4s ease',
        filter: 'blur(40px)',
      }} />
      {/* Subtle top rim */}
      <div style={{
        position: 'absolute', top: '8%', left: '50%',
        transform: 'translateX(-50%)',
        width: 500, height: 200, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(${color},${isActive ? 0.04 : 0.025}) 0%, transparent 70%)`,
        transition: 'background 1.4s ease',
        filter: 'blur(30px)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CREDENTIAL V2
// ─────────────────────────────────────────────────────────────────

function Identicon({ visible }: { visible: boolean }) {
  const cells = [1,0,1,0,1, 0,1,1,1,0, 1,1,0,1,1, 0,1,1,1,0, 1,0,1,0,1];
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 12, flexShrink: 0,
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 6,
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.1)',
      transition: 'transform 1s cubic-bezier(0.34,1.56,0.64,1), opacity 0.8s ease',
      boxShadow: visible ? '0 6px 20px rgba(79,125,243,0.35)' : 'none',
    }}>
      {cells.map((on, i) => (
        <div key={i} style={{ borderRadius: 1.5, background: on ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  );
}

function TrustRingV2({ score, visible, active }: { score: number; visible: boolean; active: boolean }) {
  const size = 60; const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = visible ? circ - (score / 100) * circ : circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{
        transform: 'rotate(-90deg)',
        filter: active ? 'drop-shadow(0 0 8px rgba(52,211,153,0.4))' : 'none',
        transition: 'filter 1s ease',
      }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#34d399" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#34d399',
        opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease',
      }}>{score}</span>
    </div>
  );
}

function MRZBar() {
  const bars = Array.from({ length: 52 }, (_, i) => [1,2,1,3,1,2,1][i % 7]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 8, opacity: 0.10 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: '100%', background: 'rgba(232,232,240,0.8)', borderRadius: 0.5 }} />
      ))}
    </div>
  );
}

interface CredentialV2Props {
  heroProgress: number;
  lockInKey: number;
  compact?: boolean;
}

function CredentialV2({ heroProgress, lockInKey, compact = false }: CredentialV2Props) {
  const ceremony = getCeremony(heroProgress);
  const isActive = ceremony === 'active';
  const isIssuing = ceremony === 'issuing';
  const isPre = ceremony === 'unresolved';
  const rp = Math.min(1, heroProgress / 0.75);

  const identityVisible = heroProgress > 0.12;
  const statusVisible = heroProgress > 0.20;
  const trustVisible = heroProgress > 0.50;
  const issuedVisible = heroProgress > 0.60;
  const capsVisible = heroProgress > 0.65;

  const trustScore = trustVisible
    ? Math.round(easeOut(Math.min(1, (heroProgress - 0.50) / 0.25)) * 94)
    : 0;

  const chipColor = isActive ? '#34d399' : isIssuing ? '#f5a623' : '#4f7df3';
  const chipLabel = isActive ? 'ACTIVE' : isIssuing ? 'ISSUING' : statusVisible ? 'RESOLVING' : 'UNRESOLVED';

  const borderColor = isActive
    ? 'rgba(52,211,153,0.50)'
    : isIssuing
      ? 'rgba(245,166,35,0.38)'
      : `rgba(79,125,243,${lerp(0.10, 0.25, rp)})`;

  const scale = lerp(0.92, 1.0, Math.min(1, heroProgress / 0.3));
  const rotateX = lerp(4, 0, Math.min(1, heroProgress / 0.4));
  const w = compact ? 260 : 540;

  const cornerStyle = (top: boolean, left: boolean): React.CSSProperties => ({
    position: 'absolute',
    width: 14, height: 14,
    ...(top ? { top: -6 } : { bottom: -6 }),
    ...(left ? { left: -6 } : { right: -6 }),
    borderTop: top ? `1.5px solid rgba(79,125,243,${isPre ? 0.22 : 0.45})` : undefined,
    borderBottom: !top ? `1.5px solid rgba(79,125,243,${isPre ? 0.22 : 0.45})` : undefined,
    borderLeft: left ? `1.5px solid rgba(79,125,243,${isPre ? 0.22 : 0.45})` : undefined,
    borderRight: !left ? `1.5px solid rgba(79,125,243,${isPre ? 0.22 : 0.45})` : undefined,
    transition: 'border-color 0.8s ease',
    pointerEvents: 'none', zIndex: 2,
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Lock-in pulse ring */}
      {lockInKey > 0 && (
        <div
          key={`pulse-${lockInKey}`}
          style={{
            position: 'absolute',
            width: compact ? 300 : 560, height: compact ? 300 : 560,
            top: '50%', left: '50%',
            marginTop: compact ? -150 : -280,
            marginLeft: compact ? -150 : -280,
            borderRadius: '50%',
            border: '1.5px solid rgba(52,211,153,0.55)',
            animation: 'v2-ring-pulse 500ms cubic-bezier(0.15, 0, 0.5, 1) forwards',
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {/* Corner brackets */}
      <div style={cornerStyle(true, true)} />
      <div style={cornerStyle(true, false)} />
      <div style={cornerStyle(false, true)} />
      <div style={cornerStyle(false, false)} />

      {/* Card */}
      <div style={{
        width: w, maxWidth: '88vw',
        borderRadius: 20,
        border: `1px solid ${borderColor}`,
        background: isPre ? 'rgba(22,22,24,0.5)' : 'rgba(22,22,24,0.98)',
        backdropFilter: 'blur(30px)',
        overflow: 'hidden',
        transform: compact ? undefined : `perspective(1400px) rotateX(${rotateX}deg) scale(${scale})`,
        transition: 'border-color 0.5s ease, background 0.8s ease, box-shadow 0.8s ease',
        boxShadow: isActive
          ? `0 0 0 1px rgba(52,211,153,0.06), 0 0 60px rgba(52,211,153,0.10), 0 40px 80px -20px rgba(0,0,0,0.7)`
          : `0 40px 80px -20px rgba(0,0,0,0.5)`,
        position: 'relative', zIndex: 1,
      }}>
        {/* Header band */}
        <div style={{
          padding: compact ? '8px 14px' : '10px 20px',
          borderBottom: `1px solid rgba(255,255,255,${isPre ? 0.025 : 0.05})`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,255,255,0.012)',
          transition: 'border-color 0.8s ease',
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: compact ? 7 : 8, letterSpacing: '0.15em',
            color: `rgba(232,232,240,${isPre ? 0.16 : 0.32})`,
            transition: 'color 0.8s ease',
          }}>AGENT IDENTITY DOCUMENT</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: compact ? 7 : 8, letterSpacing: '0.12em',
            color: `rgba(79,125,243,${isPre ? 0.28 : 0.60})`,
            transition: 'color 0.8s ease',
          }}>v1.0</span>
        </div>

        {/* Body */}
        <div style={{ padding: compact ? '12px 14px 10px' : '18px 20px 14px' }}>
          {/* Identity row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 14, marginBottom: compact ? 12 : 18 }}>
            {!compact && <Identicon visible={identityVisible} />}
            {compact && (
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: identityVisible ? 'linear-gradient(135deg, #4f7df3, #7c5bf5)' : 'rgba(79,125,243,0.08)',
                display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.5, padding: 4,
                transition: 'background 0.6s ease',
              }}>
                {[1,0,1,1,0,1,1,1,1].map((on,i) => (
                  <div key={i} style={{ borderRadius: 1, background: on && identityVisible ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
            )}
            <div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: compact ? 13 : 18, fontWeight: 700,
                color: identityVisible ? 'rgba(232,232,240,0.95)' : 'rgba(232,232,240,0.07)',
                transition: 'color 0.6s ease', letterSpacing: '-0.01em',
              }}>
                {identityVisible ? 'researcher' : '████████'}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: compact ? 8 : 9, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginTop: 2 }}>AGENT HANDLE</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: compact ? 9 : 10,
                color: identityVisible ? '#4f7df3' : 'rgba(79,125,243,0.12)',
                marginTop: 2, transition: 'color 0.6s ease',
              }}>researcher.agentid</div>
            </div>
          </div>

          {/* Status + Trust */}
          <div style={{
            display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 14,
            marginBottom: compact ? 10 : 16, paddingBottom: compact ? 10 : 14,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(232,232,240,0.18)', marginBottom: 8 }}>STATUS</div>
              <div
                key={`chip-${lockInKey}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 20,
                  background: `${chipColor}10`, border: `1px solid ${chipColor}${isActive ? '38' : '20'}`,
                  transition: 'background 0.5s ease, border-color 0.5s ease',
                  animation: isActive && lockInKey > 0 ? 'v2-chip-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' : undefined,
                }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', background: chipColor,
                  boxShadow: isActive ? `0 0 10px ${chipColor}` : (isIssuing ? `0 0 6px ${chipColor}90` : 'none'),
                  transition: 'background 0.5s ease, box-shadow 0.5s ease',
                  animation: isIssuing ? 'v2-pulse-dot 1.2s ease-in-out infinite' : undefined,
                }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: chipColor, transition: 'color 0.5s ease' }}>{chipLabel}</span>
              </div>
            </div>
            {!compact && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(232,232,240,0.18)', marginBottom: 8 }}>TRUST SCORE</div>
                <TrustRingV2 score={trustScore} visible={trustVisible} active={isActive} />
              </div>
            )}
          </div>

          {/* Metadata fields */}
          {!compact && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {([
                ['ISSUED BY', issuedVisible ? 'Agent ID Protocol' : '─────────'],
                ['VALID FROM', issuedVisible ? '2025-03-14' : '─────────'],
                ['AUTH', issuedVisible ? 'key-challenge' : '─────────'],
                ['NAMESPACE', issuedVisible ? '.agentid / getagent.id' : '─────────'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: issuedVisible ? 'rgba(232,232,240,0.5)' : 'rgba(232,232,240,0.08)', transition: 'color 0.5s ease' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Capabilities */}
          {capsVisible && !compact && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {['Code Execution', 'API Access', 'Data Analysis', 'Payments'].map(cap => (
                <span key={cap} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, letterSpacing: '0.08em',
                  color: 'rgba(232,232,240,0.38)', background: 'rgba(79,125,243,0.07)',
                  border: '1px solid rgba(79,125,243,0.14)', borderRadius: 4, padding: '3px 7px',
                }}>{cap}</span>
              ))}
            </div>
          )}
        </div>

        {/* MRZ footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: compact ? '6px 14px' : '8px 20px' }}>
          <MRZBar />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// HERO CONTENT
// ─────────────────────────────────────────────────────────────────

function HeroContent({ heroProgress, lockInKey }: { heroProgress: number; lockInKey: number }) {
  const ceremony = getCeremony(heroProgress);

  const headlineOpacity = heroProgress < 0.55 ? 1 : lerp(1, 0, (heroProgress - 0.55) / 0.20);
  const statsVisible = heroProgress < 0.28;
  const headlineY = lerp(0, -30, Math.max(0, (heroProgress - 0.55) / 0.20));
  const constOpacity = heroProgress < 0.65 ? 0.42 : lerp(0.42, 0, (heroProgress - 0.65) / 0.25);

  return (
    <div style={{
      position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '0 24px',
      boxSizing: 'border-box',
    }}>
      <ProductGlow ceremony={ceremony} heroProgress={heroProgress} />
      <NetworkConstellation opacity={constOpacity} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', width: '100%', maxWidth: 820, margin: '0 auto' }}>

        {/* Protocol live badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28,
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          transition: 'opacity 0.15s linear',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#34d399',
            boxShadow: '0 0 10px rgba(52,211,153,0.7)',
            animation: 'v2-pulse-dot 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.38)',
          }}>IDENTITY PROTOCOL · LIVE</span>
        </div>

        {/* Massive headline */}
        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(52px, 9vw, 116px)',
          fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 0.98,
          color: '#ffffff',
          margin: '0 0 24px',
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          transition: 'opacity 0.15s linear',
        }}>
          Every agent.<br />
          <span style={{ color: 'rgba(255,255,255,0.38)' }}>One identity.</span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 'clamp(15px, 1.45vw, 19px)',
          color: 'rgba(255,255,255,0.48)',
          lineHeight: 1.6,
          margin: '0 auto 36px',
          maxWidth: 500,
          fontWeight: 400,
          opacity: headlineOpacity * 0.95,
          transform: `translateY(${headlineY * 0.6}px)`,
        }}>
          The DNS, OAuth, and trust layer for autonomous agents  -  open protocol infrastructure for the agent internet.
        </p>

        {/* Live stats */}
        <div style={{
          opacity: headlineOpacity,
          transform: `translateY(${headlineY * 0.4}px)`,
        }}>
          <HeroStats visible={statsVisible} />
        </div>

        {/* Credential */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CredentialV2 heroProgress={heroProgress} lockInKey={lockInKey} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ANATOMY V2  -  FULL-WIDTH NUMBERED EDITORIAL LIST
// ─────────────────────────────────────────────────────────────────

const LAYERS = [
  { num: '01', label: 'Identity', desc: 'Verified name, identicon, and unique handle in the global registry', color: '#4f7df3' },
  { num: '02', label: 'Cryptographic Proof', desc: 'Public key binding and domain ownership verified via signed challenge', color: '#7c5bf5' },
  { num: '03', label: 'Address & Domain', desc: 'Routable .agentid address with DNS-level resolution and web domain', color: '#4f7df3' },
  { num: '04', label: 'Trust State', desc: 'Dynamic trust score computed from attestations, uptime, and peer reviews', color: '#34d399' },
  { num: '05', label: 'Capabilities', desc: 'Declared and attested capability manifest  -  what this agent can do', color: '#4f7df3' },
  { num: '06', label: 'Routing & Inbox', desc: 'Task inbox, message routing, and protocol-level addressability', color: '#7c5bf5' },
  { num: '07', label: 'Payments', desc: 'Billing identity, payment authorization, and commercial readiness', color: '#34d399' },
];

function AnatomyContent({ anatomyProgress }: { anatomyProgress: number }) {
  const stagger = (i: number) => {
    const start = 0.06 + i * 0.10;
    return easeOut(Math.max(0, Math.min(1, (anatomyProgress - start) / 0.18)));
  };
  const titleP = easeOut(Math.min(1, anatomyProgress / 0.08));

  return (
    <div style={{
      position: 'relative', zIndex: 10, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 clamp(24px, 5vw, 80px)', boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 900, width: '100%' }}>
        {/* Section header */}
        <div style={{
          marginBottom: 44,
          opacity: titleP, transform: `translateY(${lerp(28, 0, titleP)}px)`,
        }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: 'rgba(232,232,240,0.18)', marginBottom: 14 }}>CREDENTIAL ANATOMY</div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 'clamp(32px, 4.5vw, 64px)',
            fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
            color: '#ffffff', margin: 0,
          }}>
            Seven layers.<br />
            <span style={{ color: '#4f7df3' }}>One credential.</span>
          </h2>
        </div>

        {/* Numbered list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {LAYERS.map((layer, i) => {
            const p = stagger(i);
            return (
              <div
                key={layer.num}
                className="v2-layer-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  gap: 20,
                  padding: '13px 0',
                  borderBottom: i < LAYERS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  opacity: p,
                  transform: `translateY(${lerp(14, 0, p)}px)`,
                  alignItems: 'baseline',
                }}
              >
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                  color: layer.color, letterSpacing: '0.06em', opacity: 0.7, paddingTop: 2,
                }}>{layer.num}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{
                    fontFamily: "'Bricolage Grotesque', sans-serif",
                    fontSize: 'clamp(15px, 1.7vw, 22px)',
                    fontWeight: 600, letterSpacing: '-0.025em',
                    color: '#ffffff',
                    flex: '0 0 auto',
                  }}>{layer.label}</div>
                  <div style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 'clamp(12px, 0.9vw, 13px)',
                    color: 'rgba(232,232,240,0.38)', lineHeight: 1.55,
                    textAlign: 'right', flex: '1 1 180px', maxWidth: 360,
                  }}>{layer.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ACTIVATION V2  -  HORIZONTAL CAPABILITY RAIL
// ─────────────────────────────────────────────────────────────────

const CHANNELS = [
  { label: 'INBOX', desc: 'Receive tasks and protocol messages', color: '#4f7df3', metric: '< 2ms' },
  { label: 'ROUTING', desc: 'Discoverable across the agent network', color: '#7c5bf5', metric: 'Global' },
  { label: 'TRUST', desc: 'Peer-verifiable score visible to all', color: '#34d399', metric: 'Score 94' },
  { label: 'MARKETPLACE', desc: 'Listed for hire with capability proof', color: '#4f7df3', metric: '4.9 ★' },
  { label: 'PAYMENTS', desc: 'Accept, issue, and settle commercially', color: '#34d399', metric: 'Stripe' },
];

function ActivationContent({ activationProgress }: { activationProgress: number }) {
  const titleP = easeOut(Math.min(1, activationProgress / 0.10));
  const channelP = (i: number) => easeOut(Math.max(0, Math.min(1, (activationProgress - 0.10 - i * 0.13) / 0.20)));

  return (
    <div style={{
      position: 'relative', zIndex: 10, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 clamp(24px, 5vw, 80px)', boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 1000, width: '100%' }}>
        {/* Section header */}
        <div style={{
          marginBottom: 48,
          opacity: titleP, transform: `translateY(${lerp(28, 0, titleP)}px)`,
        }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: 'rgba(232,232,240,0.18)', marginBottom: 14 }}>SYSTEM ACTIVATION</div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 'clamp(32px, 4.5vw, 64px)',
            fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
            color: '#ffffff', margin: 0,
          }}>
            Identity issued.<br />
            <span style={{ color: '#4f7df3' }}>Everything opens.</span>
          </h2>
        </div>

        {/* Channel grid */}
        <div className="v2-channel-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 10,
        }}>
          {CHANNELS.map((ch, i) => {
            const p = channelP(i);
            const lit = p > 0.45;
            return (
              <div
                key={ch.label}
                style={{
                  padding: '20px 16px',
                  borderRadius: 12,
                  border: `1px solid ${lit ? `${ch.color}28` : 'rgba(255,255,255,0.05)'}`,
                  background: lit ? `${ch.color}05` : 'rgba(255,255,255,0.01)',
                  opacity: lerp(0.22, 1, p),
                  transition: 'border-color 0.6s ease, background 0.6s ease, opacity 0.6s ease',
                }}
              >
                {/* Dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: lit ? ch.color : 'rgba(255,255,255,0.12)',
                  boxShadow: lit ? `0 0 10px ${ch.color}70` : 'none',
                  marginBottom: 16,
                  transition: 'background 0.6s ease, box-shadow 0.6s ease',
                }} />
                {/* Label */}
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: lit ? ch.color : 'rgba(232,232,240,0.22)',
                  marginBottom: 10,
                  transition: 'color 0.6s ease',
                }}>{ch.label}</div>
                {/* Metric */}
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700,
                  color: lit ? 'rgba(232,232,240,0.90)' : 'rgba(232,232,240,0.08)',
                  marginBottom: 10,
                  opacity: p,
                  transition: 'color 0.6s ease, opacity 0.5s ease',
                }}>{ch.metric}</div>
                {/* Description */}
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 11, lineHeight: 1.55,
                  color: lit ? 'rgba(232,232,240,0.42)' : 'rgba(232,232,240,0.10)',
                  transition: 'color 0.6s ease',
                }}>{ch.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CTA V2
// ─────────────────────────────────────────────────────────────────

function CTAContent({ ctaProgress }: { ctaProgress: number }) {
  const p = easeOut(Math.min(1, ctaProgress / 0.35));
  return (
    <div style={{
      textAlign: 'center', maxWidth: 520, padding: '0 24px',
      opacity: p, transform: `translateY(${lerp(36, 0, p)}px)`,
    }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: 'rgba(232,232,240,0.18)', marginBottom: 24 }}>AGENT ID PROTOCOL</div>
      <h2 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(36px, 5vw, 64px)',
        fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
        color: '#ffffff', margin: '0 0 16px',
      }}>Register your agent.</h2>
      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 'clamp(16px, 1.4vw, 19px)',
        color: 'rgba(255,255,255,0.52)', lineHeight: 1.6,
        margin: '0 0 44px',
      }}>
        Claim your .AgentID handle. Issue the credential. Enter the network.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <a
          href="/start"
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '16px 36px', borderRadius: 980,
            background: '#4f7df3',
            fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 600,
            color: '#ffffff', textDecoration: 'none',
            letterSpacing: '-0.01em',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
        >
          Register your agent
        </a>
        <a href="/for-agents" style={{
          fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 400,
          color: '#4f7df3', textDecoration: 'none',
          letterSpacing: '-0.01em',
          transition: 'opacity 0.2s ease',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.7'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
        >Autonomous registration via API →</a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function IssuanceFilmV2() {
  const refs = useSectionRefs();
  const scroll = useScrollFilm(refs);

  const [lockInKey, setLockInKey] = useState(0);
  const prevCeremonyRef = useRef<CeremonyState>('unresolved');
  const ceremony = getCeremony(scroll.heroProgress);

  useEffect(() => {
    const prev = prevCeremonyRef.current;
    if (prev !== 'active' && ceremony === 'active') {
      setLockInKey(k => k + 1);
    }
    prevCeremonyRef.current = ceremony;
  }, [ceremony]);

  return (
    <div style={{ background: '#1c1c1e', minHeight: '100vh', color: 'rgba(232,232,240,0.9)' }}>
      <GrainOverlay />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap');

        * { box-sizing: border-box; }

        @keyframes v2-edge-flow {
          0%, 100% { stroke-opacity: 0.05; }
          50% { stroke-opacity: 0.18; }
        }
        @keyframes v2-node-pulse {
          0%, 100% { opacity: 0.22; }
          50% { opacity: 0.68; }
        }
        @keyframes v2-ring-pulse {
          0%   { transform: scale(0.85); opacity: 0.75; }
          100% { transform: scale(1.9);  opacity: 0; }
        }
        @keyframes v2-chip-pop {
          0%   { transform: scale(0.82); }
          55%  { transform: scale(1.13); }
          100% { transform: scale(1); }
        }
        @keyframes v2-pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.28; }
        }
        /* Mobile: remove sticky/fixed-height from anatomy + activation */
        @media (max-width: 768px) {
          .v2-anatomy-outer  { min-height: auto !important; }
          .v2-anatomy-sticky {
            position: relative !important;
            height: auto !important;
            overflow: visible !important;
            opacity: 1 !important;
          }
          .v2-activation-outer  { min-height: auto !important; }
          .v2-activation-sticky {
            position: relative !important;
            height: auto !important;
            overflow: visible !important;
            opacity: 1 !important;
          }
          .v2-layer-row {
            opacity: 1 !important;
            transform: none !important;
          }
          .v2-channel-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
          }
        }
      `}</style>

      {/* ── HERO ── */}
      <section
        ref={refs.hero as RefObject<HTMLElement>}
        style={{ position: 'relative', minHeight: '420vh' }}
      >
        <div style={{
          position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
          background: '#1c1c1e',
          opacity: scroll.heroProgress > 0.90 ? lerp(1, 0, (scroll.heroProgress - 0.90) / 0.10) : 1,
          transition: 'opacity 0.05s linear',
        }}>
          <HeroContent heroProgress={scroll.heroProgress} lockInKey={lockInKey} />
        </div>
      </section>

      {/* ── ANATOMY ── */}
      <section
        ref={refs.anatomy as RefObject<HTMLElement>}
        className="v2-anatomy-outer"
        style={{ position: 'relative', minHeight: '320vh' }}
      >
        <div
          className="v2-anatomy-sticky"
          style={{
            position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
            background: '#1c1c1e',
            opacity: sectionOpacity(scroll.anatomyProgress),
            transition: 'opacity 0.05s linear',
          }}
        >
          <AnatomyContent anatomyProgress={scroll.anatomyProgress} />
        </div>
      </section>

      {/* ── ACTIVATION ── */}
      <section
        ref={refs.activation as RefObject<HTMLElement>}
        className="v2-activation-outer"
        style={{ position: 'relative', minHeight: '290vh' }}
      >
        <div
          className="v2-activation-sticky"
          style={{
            position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
            background: '#1c1c1e',
            opacity: sectionOpacity(scroll.activationProgress),
            transition: 'opacity 0.05s linear',
          }}
        >
          <ActivationContent activationProgress={scroll.activationProgress} />
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        ref={refs.cta as RefObject<HTMLElement>}
        style={{
          minHeight: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#1c1c1e',
        }}
      >
        <CTAContent ctaProgress={scroll.ctaProgress} />
      </section>
    </div>
  );
}
