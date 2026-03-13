import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import '@/components/concept/hero.css';

interface ScrollState {
  progress: number;
  heroProgress: number;
  anatomyProgress: number;
  unlocksProgress: number;
  ctaProgress: number;
}

interface SectionRefs {
  hero: React.RefObject<HTMLElement | null>;
  anatomy: React.RefObject<HTMLElement | null>;
  unlocks: React.RefObject<HTMLElement | null>;
  cta: React.RefObject<HTMLElement | null>;
}

function useSectionRefs(): SectionRefs {
  return {
    hero: useRef<HTMLElement>(null),
    anatomy: useRef<HTMLElement>(null),
    unlocks: useRef<HTMLElement>(null),
    cta: useRef<HTMLElement>(null),
  };
}

function useScrollFilm(refs: SectionRefs): ScrollState {
  const [state, setState] = useState<ScrollState>({
    progress: 0,
    heroProgress: 0,
    anatomyProgress: 0,
    unlocksProgress: 0,
    ctaProgress: 0,
  });

  useEffect(() => {
    let ticking = false;

    const sectionProgress = (el: HTMLElement | null) => {
      if (!el) return 0;
      const scrollY = window.scrollY;
      const top = el.offsetTop;
      const height = el.offsetHeight;
      const scrollableHeight = height - window.innerHeight;
      if (scrollableHeight <= 0) {
        const visible = scrollY >= top && scrollY < top + height;
        return visible ? 1 : (scrollY >= top + height ? 1 : 0);
      }
      return Math.max(0, Math.min(1, (scrollY - top) / scrollableHeight));
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docH > 0 ? Math.min(scrollY / docH, 1) : 0;

        setState({
          progress,
          heroProgress: sectionProgress(refs.hero.current),
          anatomyProgress: sectionProgress(refs.anatomy.current),
          unlocksProgress: sectionProgress(refs.unlocks.current),
          ctaProgress: sectionProgress(refs.cta.current),
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

type IssuanceCeremonyState = 'unresolved' | 'validating' | 'binding' | 'issuing' | 'active';

function getIssuanceCeremonyState(heroProgress: number): IssuanceCeremonyState {
  if (heroProgress < 0.08) return 'unresolved';
  if (heroProgress < 0.25) return 'validating';
  if (heroProgress < 0.50) return 'binding';
  if (heroProgress < 0.75) return 'issuing';
  return 'active';
}

const CEREMONY_LABELS: Record<IssuanceCeremonyState, string> = {
  unresolved: 'UNRESOLVED',
  validating: 'VALIDATING IDENTITY',
  binding: 'BINDING DOMAIN',
  issuing: 'ISSUING CREDENTIAL',
  active: 'CREDENTIAL ACTIVE',
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function GrainOverlay() {
  return (
    <>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="issuance-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#issuance-grain)', opacity: 0.022, mixBlendMode: 'overlay',
      }} />
    </>
  );
}

function CeremonyStatusBar({ state, trustScore }: { state: IssuanceCeremonyState; trustScore: number }) {
  const isActive = state === 'active';
  const isIssuing = state === 'issuing';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 18, padding: '10px 0',
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: isActive ? '#34d399' : (isIssuing ? '#f5a623' : '#4f7df3'),
        boxShadow: isActive
          ? '0 0 16px rgba(52,211,153,0.6)'
          : (isIssuing ? '0 0 12px rgba(245,166,35,0.5)' : '0 0 8px rgba(79,125,243,0.4)'),
        transition: 'all 0.6s ease',
        animation: isIssuing ? 'pulse-dot 1.2s ease-in-out infinite' : undefined,
      }} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.16em',
        color: isActive ? '#34d399' : (isIssuing ? '#f5a623' : '#4f7df3'),
        transition: 'color 0.6s ease',
      }}>{CEREMONY_LABELS[state]}</span>
      {state === 'active' && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 600,
          color: 'rgba(232,232,240,0.3)',
          marginLeft: 8,
        }}>TRUST {trustScore}</span>
      )}
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

function CredentialIdenticon({ visible }: { visible: boolean }) {
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
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 6,
      transform: visible ? 'scale(1)' : 'scale(0.1)',
      opacity: visible ? 1 : 0,
      transition: 'transform 1s cubic-bezier(0.34,1.56,0.64,1), opacity 0.8s ease',
      boxShadow: visible ? '0 6px 24px rgba(79,125,243,0.35)' : 'none',
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

function TrustRing({ score, visible, active }: { score: number; visible: boolean; active: boolean }) {
  const size = 64;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = visible ? circ - (score / 100) * circ : circ;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{
        transform: 'rotate(-90deg)',
        filter: active ? 'drop-shadow(0 0 8px rgba(52,211,153,0.4))' : 'none',
        transition: 'filter 1s ease',
      }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="#34d399" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700,
        color: '#34d399',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>{score}</span>
    </div>
  );
}


const ATTESTATION_CHIPS = [
  { label: 'Code Execution', icon: '\u25B8' },
  { label: 'API Access', icon: '\u223C' },
  { label: 'Data Analysis', icon: '\u2261' },
  { label: 'Payments', icon: '\u00A4' },
  { label: 'Messaging', icon: '\u0040' },
];

function IssuanceFlash({ active }: { active: boolean }) {
  return (
    <>
      <div style={{
        position: 'absolute', inset: -2,
        borderRadius: 24,
        border: '1px solid transparent',
        background: active
          ? 'linear-gradient(135deg, rgba(52,211,153,0.3), rgba(79,125,243,0.1), rgba(52,211,153,0.3))'
          : 'none',
        opacity: active ? 1 : 0,
        transition: 'opacity 1.5s ease',
        pointerEvents: 'none',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'exclude',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        padding: 1,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 22,
        boxShadow: active
          ? '0 0 60px rgba(52,211,153,0.15), 0 0 120px rgba(52,211,153,0.05), inset 0 0 60px rgba(52,211,153,0.03)'
          : 'none',
        opacity: active ? 1 : 0,
        transition: 'opacity 2s ease',
        pointerEvents: 'none',
      }} />
    </>
  );
}

function MachineReadableZone() {
  const bars = Array.from({ length: 42 }, (_, i) => {
    const w = [1, 2, 1, 3, 1, 2, 1][i % 7];
    return w;
  });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 1,
      height: 10, overflow: 'hidden', opacity: 0.15,
      padding: '0 2px',
    }}>
      {bars.map((w, i) => (
        <div key={i} style={{
          width: w, height: '100%',
          background: 'rgba(232,232,240,0.6)',
          borderRadius: 0.5,
        }} />
      ))}
    </div>
  );
}

function FilmCredential({ heroProgress }: { heroProgress: number }) {
  const ceremonyState = getIssuanceCeremonyState(heroProgress);
  const frameVisible = heroProgress > 0.05;
  const identityVisible = heroProgress > 0.12;
  const handleVisible = heroProgress > 0.18;
  const domainVisible = heroProgress > 0.30;
  const trustVisible = heroProgress > 0.50;
  const capsVisible = heroProgress > 0.60;
  const marketplaceVisible = heroProgress > 0.70;
  const isActive = ceremonyState === 'active';
  const isIssuing = ceremonyState === 'issuing';

  const trustScore = trustVisible ? Math.round(easeOutCubic(Math.min(1, (heroProgress - 0.50) / 0.25)) * 94) : 0;

  const scale = lerp(0.92, 1.0, Math.min(1, heroProgress / 0.3));
  const rotateX = lerp(5, 1, Math.min(1, heroProgress / 0.4));

  const sealProgress = isActive ? 1 : (isIssuing ? lerp(0, 0.6, (heroProgress - 0.50) / 0.25) : 0);

  return (
    <div style={{
      position: 'relative',
      width: 520, maxWidth: '88vw',
      borderRadius: 22,
      border: `1px solid ${isActive ? 'rgba(52,211,153,0.15)' : (isIssuing ? 'rgba(245,166,35,0.12)' : 'rgba(79,125,243,0.14)')}`,
      background: 'rgba(8, 10, 22, 0.98)',
      backdropFilter: 'blur(30px)',
      overflow: 'hidden',
      opacity: frameVisible ? 1 : 0,
      transform: `perspective(1400px) rotateX(${rotateX}deg) scale(${scale})`,
      filter: frameVisible ? 'blur(0px)' : 'blur(14px)',
      transition: 'opacity 1.4s ease, filter 1.4s ease, border-color 1s ease',
      boxShadow: frameVisible
        ? `0 0 80px rgba(79,125,243,${isActive ? '0.08' : '0.05'}), 0 40px 100px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.3)`
        : 'none',
    }}>
      <IssuanceFlash active={isActive} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44,
        background: isActive
          ? 'linear-gradient(180deg, rgba(52,211,153,0.06), transparent)'
          : 'linear-gradient(180deg, rgba(79,125,243,0.04), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        transition: 'background 1s ease',
      }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: isActive
          ? 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.5) 30%, rgba(52,211,153,0.6) 50%, rgba(52,211,153,0.5) 70%, transparent 90%)'
          : 'linear-gradient(90deg, transparent 10%, rgba(79,125,243,0.3) 30%, rgba(79,125,243,0.4) 50%, rgba(79,125,243,0.3) 70%, transparent 90%)',
        opacity: frameVisible ? 0.8 : 0,
        transition: 'opacity 1s ease, background 1s ease',
      }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: isActive
          ? 'linear-gradient(180deg, rgba(52,211,153,0.4), rgba(52,211,153,0.1) 40%, transparent 80%)'
          : (isIssuing
            ? 'linear-gradient(180deg, rgba(245,166,35,0.3), rgba(245,166,35,0.08) 40%, transparent 80%)'
            : 'linear-gradient(180deg, rgba(79,125,243,0.2), rgba(79,125,243,0.05) 40%, transparent 80%)'),
        transition: 'background 1s ease',
      }} />

      <div style={{ padding: '14px 36px 0' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(232,232,240,0.2)',
          opacity: frameVisible ? 1 : 0,
          transition: 'opacity 1s ease 0.3s',
        }}>AGENT IDENTITY CREDENTIAL</div>
      </div>

      <div style={{ padding: '0 36px' }}>
        <CeremonyStatusBar state={ceremonyState} trustScore={trustScore} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <CredentialIdenticon visible={identityVisible} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 24, fontWeight: 700, color: '#e8e8f0',
              letterSpacing: '-0.02em',
              opacity: identityVisible ? 1 : 0,
              transform: identityVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s',
            }}>Atlas-7</div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              color: '#4f7df3', letterSpacing: '0.01em',
              opacity: handleVisible ? 1 : 0,
              transform: handleVisible ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}>agent.id/atlas-7</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          paddingTop: 18, marginBottom: 18,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px',
          opacity: domainVisible ? 1 : 0,
          transform: domainVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          {[
            { label: 'DOMAIN', value: 'atlas-7.agent.id' },
            { label: 'STATUS', value: isActive ? 'Active' : (isIssuing ? 'Issuing\u2026' : 'Pending'), isStatus: true },
            { label: 'ISSUED', value: '2026-03-13' },
            { label: 'SERIAL', value: 'AID-0x7f3a\u2026c91e', dim: true },
          ].map(field => (
            <div key={field.label}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
                letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 4,
              }}>{field.label}</div>
              {'isStatus' in field ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: isActive ? '#34d399' : (isIssuing ? '#f5a623' : '#4f7df3'),
                    boxShadow: isActive ? '0 0 8px rgba(52,211,153,0.4)' : 'none',
                    transition: 'all 0.5s ease',
                  }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
                    color: isActive ? '#34d399' : (isIssuing ? '#f5a623' : 'rgba(232,232,240,0.5)'),
                    fontWeight: 500, transition: 'color 0.5s ease',
                  }}>{field.value}</span>
                </div>
              ) : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
                  color: 'dim' in field ? 'rgba(232,232,240,0.25)' : 'rgba(232,232,240,0.55)',
                }}>{field.value}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          paddingTop: 16, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 18,
          opacity: trustVisible ? 1 : 0,
          transition: 'opacity 0.7s ease',
        }}>
          <TrustRing score={trustScore} visible={trustVisible} active={isActive} />
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
              letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 4,
            }}>TRUST LEVEL</div>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 12.5,
              color: 'rgba(232,232,240,0.5)', lineHeight: 1.5,
            }}>Verified identity &middot; 1.2M invocations &middot; 99.97% uptime</div>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '14px 36px 16px',
        opacity: capsVisible ? 1 : 0,
        transform: capsVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
          letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 8,
        }}>CAPABILITY ATTESTATIONS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {ATTESTATION_CHIPS.map((att, i) => (
            <span key={att.label} style={{
              fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace",
              color: 'rgba(232,232,240,0.5)',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 4, padding: '3px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: capsVisible ? 1 : 0,
              transform: capsVisible ? 'translateY(0)' : 'translateY(6px)',
              transition: `opacity 0.4s ease ${i * 80}ms, transform 0.4s ease ${i * 80}ms`,
            }}>
              <span style={{ color: '#4f7df3', fontWeight: 700, fontSize: 11 }}>{att.icon}</span>
              {att.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '12px 36px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: marketplaceVisible ? 1 : 0,
        transform: marketplaceVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 3,
          }}>MARKETPLACE</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'rgba(232,232,240,0.55)' }}>
            Listed &middot; 4.9 &#9733;
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 3,
          }}>ROUTING</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#34d399' }}>
            Addressable
          </div>
        </div>
      </div>

      <div style={{
        padding: '8px 36px 12px',
        borderTop: '1px solid rgba(255,255,255,0.03)',
        opacity: marketplaceVisible ? 0.6 : 0,
        transition: 'opacity 0.7s ease 0.2s',
      }}>
        <MachineReadableZone />
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: isActive
          ? 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.3) 30%, rgba(52,211,153,0.4) 50%, rgba(52,211,153,0.3) 70%, transparent 90%)'
          : 'linear-gradient(90deg, transparent 10%, rgba(79,125,243,0.15) 50%, transparent 90%)',
        transition: 'background 1s ease',
        opacity: sealProgress,
      }} />
    </div>
  );
}

function HeroIssuanceRings({ heroProgress }: { heroProgress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const progressRef = useRef(heroProgress);
  progressRef.current = heroProgress;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 1000;
    const H = 1000;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const cx = W / 2;
    const cy = H / 2;

    const startTime = performance.now();

    function draw(now: number) {
      const t = (now - startTime) / 1000;
      const p = progressRef.current;
      ctx!.clearRect(0, 0, W, H);

      const isActive = p > 0.75;
      const isIssuing = p > 0.50 && p <= 0.75;
      const ringRadii = [140, 220, 310, 410];

      ringRadii.forEach((r, i) => {
        const threshold = 0.08 + i * 0.15;
        const ringActive = p > threshold;
        const dormantOpacity = 0.025 - i * 0.005;
        const baseOpacity = ringActive ? 0.14 : (p > 0.05 ? 0.03 : Math.max(0, dormantOpacity));
        if (baseOpacity <= 0) return;

        const dormantBreathe = !ringActive && p <= 0.05 ? Math.sin(t * 0.3 + i * 0.8) * 0.008 : 0;
        const breathe = isActive
          ? Math.sin(t * 0.7 + i * 0.6) * 0.04
          : (isIssuing ? Math.sin(t * 1.5 + i * 0.4) * 0.06 : dormantBreathe);
        const opacity = baseOpacity + breathe;

        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.strokeStyle = isActive
          ? `rgba(52,211,153,${opacity * 0.6})`
          : (isIssuing
            ? `rgba(245,166,35,${opacity * 0.5})`
            : `rgba(79,125,243,${opacity})`);
        ctx!.lineWidth = ringActive ? 1.2 : 0.4;
        ctx!.stroke();

        if (ringActive) {
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, 0, Math.PI * 2);
          ctx!.strokeStyle = isActive
            ? `rgba(52,211,153,${opacity * 0.2})`
            : `rgba(79,125,243,${opacity * 0.25})`;
          ctx!.lineWidth = 6;
          ctx!.stroke();
        }
      });

      if (p > 0.05) {
        const pulseCount = isActive ? 3 : (isIssuing ? 4 : (p > 0.4 ? 2 : 1));
        const pulseSpeed = isIssuing ? 1.2 : 0.8;
        for (let i = 0; i < pulseCount; i++) {
          const age = (t * pulseSpeed + i * 1.8) % 4.5;
          const pulseR = age * 110;
          const pulseOpacity = Math.max(0, (isIssuing ? 0.15 : 0.1) * (1 - age / 4.5));
          if (pulseR > 0 && pulseOpacity > 0) {
            ctx!.beginPath();
            ctx!.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx!.strokeStyle = isActive
              ? `rgba(52,211,153,${pulseOpacity})`
              : (isIssuing
                ? `rgba(245,166,35,${pulseOpacity})`
                : `rgba(79,125,243,${pulseOpacity})`);
            ctx!.lineWidth = isIssuing ? 1.2 : 0.8;
            ctx!.stroke();
          }
        }
      }

      if (isIssuing) {
        const scanAngle = (t * 0.6) % (Math.PI * 2);
        const scanLen = Math.PI * 0.15;
        ringRadii.forEach((r, i) => {
          if (p <= 0.08 + i * 0.15) return;
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, scanAngle + i * 0.3, scanAngle + i * 0.3 + scanLen);
          ctx!.strokeStyle = `rgba(245,166,35,0.35)`;
          ctx!.lineWidth = 3;
          ctx!.stroke();
        });
      }

      const coreR = isActive ? 8 : (isIssuing ? 6 : (p > 0.05 ? 3 : 0));
      if (coreR > 0) {
        const coreGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
        coreGrad.addColorStop(0, isActive ? 'rgba(52,211,153,0.15)' : (isIssuing ? 'rgba(245,166,35,0.12)' : 'rgba(79,125,243,0.12)'));
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR * 5, 0, Math.PI * 2);
        ctx!.fillStyle = coreGrad;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx!.fillStyle = isActive ? 'rgba(52,211,153,0.6)' : (isIssuing ? 'rgba(245,166,35,0.5)' : 'rgba(79,125,243,0.5)');
        ctx!.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute',
      width: 1000, height: 1000,
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      opacity: 0.8,
    }} />
  );
}

const ANATOMY_LAYERS = [
  { id: 'identity', label: 'IDENTITY', desc: 'Verified agent name, identicon, and unique handle in the global registry', color: '#4f7df3' },
  { id: 'proof', label: 'CRYPTOGRAPHIC PROOF', desc: 'Public key binding and domain ownership verification', color: '#7c5bf5' },
  { id: 'address', label: 'ADDRESS & DOMAIN', desc: 'Routable agent.id subdomain with DNS-level resolution', color: '#4f7df3' },
  { id: 'trust', label: 'TRUST STATE', desc: 'Dynamic trust score computed from attestations, uptime, and peer reviews', color: '#34d399' },
  { id: 'capabilities', label: 'CAPABILITIES', desc: 'Declared and attested capability manifest — what this agent can do', color: '#4f7df3' },
  { id: 'routing', label: 'ROUTING & INBOX', desc: 'Task inbox, message routing, and protocol-level addressability', color: '#7c5bf5' },
  { id: 'payments', label: 'PAYMENTS', desc: 'Billing identity, payment authorization, and commercial readiness', color: '#34d399' },
];

function AnatomySection({ anatomyProgress }: { anatomyProgress: number }) {
  const stagger = useCallback((index: number) => {
    const layerStart = 0.08 + index * 0.10;
    const layerEnd = layerStart + 0.20;
    return Math.max(0, Math.min(1, (anatomyProgress - layerStart) / (layerEnd - layerStart)));
  }, [anatomyProgress]);

  const titleOpacity = Math.min(1, anatomyProgress / 0.12);
  const titleTranslateY = lerp(40, 0, Math.min(1, anatomyProgress / 0.12));

  return (
    <div className="anatomy-wrapper" style={{
      position: 'relative',
      padding: 'clamp(24px, 4vh, 80px) clamp(24px, 4vw, 60px)',
      maxWidth: 1100,
      margin: '0 auto',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      <div className="anatomy-title" style={{
        textAlign: 'center',
        marginBottom: 'clamp(16px, 3vh, 48px)',
        opacity: titleOpacity,
        transform: `translateY(${titleTranslateY}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
          marginBottom: 'clamp(6px, 1vh, 16px)',
        }}>CREDENTIAL ANATOMY</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(26px, 3.5vw, 48px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(8px, 1.2vh, 18px)',
        }}>
          Seven layers.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>One credential.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.4vw, 17px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.5)', maxWidth: 520, margin: '0 auto',
        }}>
          Every Agent ID credential is a composite identity object — not a card, not a token,
          but a layered instrument of trust.
        </p>
      </div>

      <div className="anatomy-content" style={{
        display: 'flex',
        gap: 'clamp(24px, 4vw, 80px)',
        alignItems: 'flex-start',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div className="anatomy-credential" style={{
          flex: '0 0 clamp(200px, 25vw, 320px)',
          position: 'relative',
          height: '100%',
          maxHeight: 'clamp(280px, 50vh, 440px)',
        }}>
          <div style={{
            width: '100%', height: '100%',
            borderRadius: 20,
            background: 'rgba(12,15,30,0.95)',
            border: '1px solid rgba(79,125,243,0.1)',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            {ANATOMY_LAYERS.map((layer, i) => {
              const progress = stagger(i);
              return (
                <div key={layer.id} style={{
                  position: 'absolute',
                  left: 20, right: 20,
                  top: `${(i * 13.5) + 3}%`,
                  height: 'clamp(32px, 6vh, 48px)',
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${layer.color}08, ${layer.color}04)`,
                  border: `1px solid ${layer.color}${progress > 0.5 ? '20' : '08'}`,
                  opacity: progress,
                  transform: `translateX(${lerp(-30, 0, progress)}px) scale(${lerp(0.9, 1, progress)})`,
                  transition: 'border-color 0.4s ease',
                  display: 'flex', alignItems: 'center',
                  padding: '0 14px',
                }}>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: layer.color,
                    boxShadow: `0 0 8px ${layer.color}60`,
                    marginRight: 10, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                    letterSpacing: '0.12em', color: 'rgba(232,232,240,0.5)',
                  }}>{layer.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="anatomy-layers" style={{ flex: 1, paddingTop: 0, overflow: 'hidden' }}>
          {ANATOMY_LAYERS.map((layer, i) => {
            const progress = stagger(i);
            return (
              <div key={layer.id} className="anatomy-layer-item" style={{
                marginBottom: 'clamp(8px, 1.8vh, 24px)',
                opacity: progress,
                transform: `translateY(${lerp(20, 0, progress)}px)`,
                paddingLeft: 16,
                borderLeft: `2px solid ${layer.color}${progress > 0.5 ? '40' : '10'}`,
                transition: 'border-color 0.5s ease',
              }}>
                <div className="anatomy-layer-label" style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.12em', color: layer.color,
                  marginBottom: 3,
                }}>{layer.label}</div>
                <div className="anatomy-layer-desc" style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 'clamp(12px, 1.2vw, 14px)',
                  color: 'rgba(232,232,240,0.55)', lineHeight: 1.45,
                }}>{layer.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .anatomy-wrapper {
            padding: 56px 20px 20px !important;
            justify-content: flex-start !important;
          }
          .anatomy-wrapper .anatomy-title {
            margin-bottom: 10px !important;
          }
          .anatomy-wrapper .anatomy-title h2 {
            margin-bottom: 6px !important;
          }
          .anatomy-wrapper .anatomy-title p {
            font-size: 13px !important;
            line-height: 1.4 !important;
          }
          .anatomy-content {
            flex-direction: column !important;
            gap: 12px !important;
          }
          .anatomy-credential {
            flex: none !important;
            width: 100% !important;
            height: 160px !important;
            max-height: 160px !important;
          }
          .anatomy-layers {
            overflow-y: auto !important;
            flex: 1 !important;
            min-height: 0 !important;
          }
          .anatomy-layer-item {
            margin-bottom: 6px !important;
            padding-left: 12px !important;
          }
          .anatomy-layer-label {
            font-size: 9px !important;
            margin-bottom: 1px !important;
          }
          .anatomy-layer-desc {
            font-size: 12px !important;
            line-height: 1.3 !important;
          }
        }
      `}</style>
    </div>
  );
}

const UNLOCK_CHANNELS = [
  { id: 'inbox', label: 'INBOX', desc: 'Receive tasks and protocol-level communications', color: '#4f7df3', metric: '< 2ms' },
  { id: 'routing', label: 'ROUTING', desc: 'Discoverable and addressable across the agent network', color: '#7c5bf5', metric: 'Global' },
  { id: 'trust', label: 'TRUST', desc: 'Peer-verifiable trust score visible to every participant', color: '#34d399', metric: 'Score: 94' },
  { id: 'marketplace', label: 'MARKETPLACE', desc: 'Listed for hire with ratings and capability proof', color: '#4f7df3', metric: '4.9 \u2605' },
  { id: 'payments', label: 'PAYMENTS', desc: 'Accept payments, issue invoices, settle commercially', color: '#34d399', metric: 'Stripe' },
];

function SystemActivationSection({ unlocksProgress }: { unlocksProgress: number }) {
  const titleOpacity = Math.min(1, unlocksProgress / 0.12);
  const titleTranslateY = lerp(40, 0, Math.min(1, unlocksProgress / 0.12));

  const spineOpacity = Math.min(1, unlocksProgress / 0.15);

  return (
    <div className="activation-wrapper" style={{
      position: 'relative',
      padding: 'clamp(24px, 4vh, 60px) clamp(24px, 4vw, 60px)',
      maxWidth: 900,
      margin: '0 auto',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(20px, 4vh, 56px)',
        opacity: titleOpacity,
        transform: `translateY(${titleTranslateY}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
          marginBottom: 'clamp(6px, 1vh, 16px)',
        }}>SYSTEM ACTIVATION</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(26px, 3.5vw, 48px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(8px, 1.2vh, 18px)',
        }}>
          Identity issues.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Channels open.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.4vw, 17px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.5)', maxWidth: 460, margin: '0 auto',
        }}>
          A credential activates an entire system. Each channel becomes possible
          only because the agent is known.
        </p>
      </div>

      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        <div className="activation-spine" style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 2,
          transform: 'translateX(-50%)',
          background: `linear-gradient(180deg, transparent, rgba(79,125,243,${spineOpacity * 0.15}) 15%, rgba(79,125,243,${spineOpacity * 0.15}) 85%, transparent)`,
          transition: 'background 0.5s ease',
        }} />

        <div className="activation-origin" style={{
          position: 'absolute',
          left: '50%',
          top: '10%',
          transform: 'translateX(-50%)',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: spineOpacity > 0.5 ? '#4f7df3' : 'transparent',
          boxShadow: spineOpacity > 0.5 ? '0 0 16px rgba(79,125,243,0.4)' : 'none',
          transition: 'all 0.5s ease',
          zIndex: 2,
        }} />

        <div className="activation-channels" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(6px, 1.2vh, 16px)',
        }}>
          {UNLOCK_CHANNELS.map((ch, i) => {
            const channelStart = 0.15 + i * 0.13;
            const channelEnd = channelStart + 0.18;
            const chProgress = Math.max(0, Math.min(1, (unlocksProgress - channelStart) / (channelEnd - channelStart)));
            const isLeft = i % 2 === 0;

            return (
              <div key={ch.id} className="activation-channel-row" style={{
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                height: 'clamp(52px, 8vh, 72px)',
              }}>
                <div className="activation-node" style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: chProgress > 0.3 ? ch.color : 'rgba(232,232,240,0.1)',
                  boxShadow: chProgress > 0.3 ? `0 0 12px ${ch.color}50` : 'none',
                  transition: 'all 0.4s ease',
                  zIndex: 2,
                }} />

                {isLeft ? (
                  <>
                    <div className="activation-card-left" style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'flex-end',
                      paddingRight: 'clamp(32px, 5vw, 60px)',
                      opacity: chProgress,
                      transform: `translateX(${lerp(-30, 0, chProgress)}px)`,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)',
                        background: 'rgba(8,10,22,0.9)',
                        border: `1px solid ${ch.color}${chProgress > 0.5 ? '20' : '08'}`,
                        borderRadius: 10,
                        padding: 'clamp(10px, 1.5vh, 16px) clamp(14px, 2vw, 24px)',
                        transition: 'border-color 0.4s ease',
                      }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                            letterSpacing: '0.1em', color: ch.color, marginBottom: 2,
                          }}>{ch.label}</div>
                          <div style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 'clamp(11px, 1.1vw, 13px)',
                            color: 'rgba(232,232,240,0.45)', lineHeight: 1.4,
                          }}>{ch.desc}</div>
                        </div>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          color: 'rgba(232,232,240,0.25)',
                          whiteSpace: 'nowrap',
                          borderLeft: '1px solid rgba(255,255,255,0.05)',
                          paddingLeft: 'clamp(8px, 1vw, 16px)',
                          marginLeft: 4,
                        }}>{ch.metric}</div>
                      </div>
                    </div>

                    <div className="activation-line" style={{
                      position: 'absolute',
                      right: '50%',
                      top: '50%',
                      height: 1,
                      width: 'clamp(24px, 4vw, 52px)',
                      background: `linear-gradient(90deg, ${ch.color}30, ${ch.color}08)`,
                      transform: 'translateY(-50%)',
                      opacity: chProgress,
                      marginRight: 6,
                    }} />

                    <div className="activation-spacer" style={{ flex: 1 }} />
                  </>
                ) : (
                  <>
                    <div className="activation-spacer" style={{ flex: 1 }} />

                    <div className="activation-line" style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      height: 1,
                      width: 'clamp(24px, 4vw, 52px)',
                      background: `linear-gradient(270deg, ${ch.color}30, ${ch.color}08)`,
                      transform: 'translateY(-50%)',
                      opacity: chProgress,
                      marginLeft: 6,
                    }} />

                    <div className="activation-card-right" style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'flex-start',
                      paddingLeft: 'clamp(32px, 5vw, 60px)',
                      opacity: chProgress,
                      transform: `translateX(${lerp(30, 0, chProgress)}px)`,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)',
                        background: 'rgba(8,10,22,0.9)',
                        border: `1px solid ${ch.color}${chProgress > 0.5 ? '20' : '08'}`,
                        borderRadius: 10,
                        padding: 'clamp(10px, 1.5vh, 16px) clamp(14px, 2vw, 24px)',
                        transition: 'border-color 0.4s ease',
                      }}>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          color: 'rgba(232,232,240,0.25)',
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid rgba(255,255,255,0.05)',
                          paddingRight: 'clamp(8px, 1vw, 16px)',
                          marginRight: 4,
                        }}>{ch.metric}</div>
                        <div>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                            letterSpacing: '0.1em', color: ch.color, marginBottom: 2,
                          }}>{ch.label}</div>
                          <div style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 'clamp(11px, 1.1vw, 13px)',
                            color: 'rgba(232,232,240,0.45)', lineHeight: 1.4,
                          }}>{ch.desc}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .activation-wrapper {
            height: auto !important;
            min-height: 100vh;
            padding-top: clamp(32px, 6vh, 60px) !important;
            padding-bottom: clamp(32px, 6vh, 60px) !important;
          }
          .activation-spine {
            left: 16px !important;
            transform: none !important;
          }
          .activation-origin {
            left: 16px !important;
            transform: translate(-50%, -50%) !important;
          }
          .activation-node {
            left: 16px !important;
          }
          .activation-line {
            display: none !important;
          }
          .activation-spacer {
            display: none !important;
          }
          .activation-channel-row {
            height: auto !important;
            min-height: 56px;
          }
          .activation-card-left,
          .activation-card-right {
            flex: 1 !important;
            justify-content: flex-start !important;
            padding-left: 40px !important;
            padding-right: 0 !important;
          }
          .activation-card-left > div,
          .activation-card-right > div {
            text-align: left !important;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function CTASection({ ctaProgress, onNavigate }: { ctaProgress: number; onNavigate?: (path: string) => void }) {
  const opacity = Math.min(1, ctaProgress / 0.25);
  const translateY = lerp(60, 0, Math.min(1, ctaProgress / 0.3));

  return (
    <div style={{
      position: 'relative',
      padding: 'clamp(40px, 8vh, 200px) clamp(24px, 4vw, 80px)',
      textAlign: 'center',
      opacity,
      transform: `translateY(${translateY}px)`,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      boxSizing: 'border-box',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,125,243,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
        marginBottom: 'clamp(12px, 2vh, 24px)',
      }}>YOUR AGENT AWAITS</div>

      <h2 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(30px, 4.5vw, 60px)',
        fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05,
        color: '#e8e8f0',
        marginBottom: 'clamp(12px, 2vh, 24px)',
      }}>
        Claim Your Agent ID.
      </h2>

      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 'clamp(14px, 1.5vw, 18px)', lineHeight: 1.55,
        color: 'rgba(232,232,240,0.45)', maxWidth: 440, margin: '0 auto',
        marginBottom: 'clamp(24px, 4vh, 48px)',
      }}>
        Register an agent. Issue a credential.
        Join the identity layer of the autonomous internet.
      </p>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
        <button onClick={() => onNavigate?.('/start')} style={{
          position: 'relative', overflow: 'hidden',
          fontSize: 16, fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          color: '#fff',
          background: '#4f7df3',
          border: 'none', borderRadius: 12,
          padding: '16px 40px',
          cursor: 'pointer', letterSpacing: '-0.01em',
          boxShadow: '0 6px 30px rgba(79,125,243,0.35), 0 2px 8px rgba(79,125,243,0.2)',
        }}>
          Register an Agent
        </button>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: 'rgba(232,232,240,0.3)',
          letterSpacing: '0.02em',
        }}>Free to start</span>
      </div>

      <div style={{
        marginTop: 'clamp(32px, 6vh, 80px)',
        display: 'flex', justifyContent: 'center', gap: 'clamp(20px, 3vw, 40px)',
      }}>
        {[
          { value: '4,291', label: 'Credentials issued' },
          { value: '99.97%', label: 'Uptime' },
          { value: '<2ms', label: 'Resolution' },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 700, color: '#e8e8f0',
              marginBottom: 4,
            }}>{stat.value}</div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'rgba(232,232,240,0.3)',
              letterSpacing: '0.06em',
            }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface NavProps {
  opacity: number;
  onNavigate?: (path: string) => void;
}

function NavBar({ opacity, onNavigate }: NavProps) {
  const nav = (path: string) => onNavigate?.(path);
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(16px, 4vw, 48px)', height: 56,
      background: 'rgba(5,7,17,0.7)',
      backdropFilter: 'blur(20px) saturate(1.8)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      opacity,
      transition: 'opacity 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => nav('/')}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#4f7df3',
          boxShadow: '0 0 10px rgba(79,125,243,0.4)',
        }} />
        <span style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 15, fontWeight: 700, color: '#e8e8f0',
          letterSpacing: '-0.01em',
        }}>Agent ID</span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span onClick={() => nav('/login')} style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
          color: 'rgba(232,232,240,0.5)', cursor: 'pointer',
          letterSpacing: '0.01em',
        }}>Log in</span>
        <span onClick={() => nav('/start')} style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
          color: '#fff', background: 'rgba(79,125,243,0.15)',
          border: '1px solid rgba(79,125,243,0.25)',
          borderRadius: 8, padding: '7px 18px', cursor: 'pointer',
        }}>Register</span>
      </div>
    </nav>
  );
}

function SystemResolvingText({ progress }: { progress: number }) {
  const phase1 = progress > 0.06 && progress < 0.16;
  const phase2 = progress > 0.16 && progress < 0.28;
  const phase3 = progress > 0.28 && progress < 0.40;

  const p1Opacity = phase1 ? (progress < 0.10 ? lerp(0, 1, (progress - 0.06) / 0.04) : lerp(1, 0, (progress - 0.10) / 0.06)) : 0;
  const p2Opacity = phase2 ? (progress < 0.20 ? lerp(0, 1, (progress - 0.16) / 0.04) : lerp(1, 0, (progress - 0.20) / 0.08)) : 0;
  const p3Opacity = phase3 ? (progress < 0.32 ? lerp(0, 1, (progress - 0.28) / 0.04) : lerp(1, 0, (progress - 0.32) / 0.08)) : 0;

  const anyVisible = p1Opacity > 0.01 || p2Opacity > 0.01 || p3Opacity > 0.01;
  if (!anyVisible) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 'clamp(60px, 12vh, 140px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 15,
      textAlign: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.14em',
        color: '#4f7df3',
        opacity: p1Opacity,
        position: 'absolute',
        left: '50%',
        transform: `translateX(-50%) translateY(${lerp(8, 0, Math.min(1, p1Opacity * 2))}px)`,
        whiteSpace: 'nowrap',
      }}>RESOLVING AGENT IDENTITY\u2026</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.14em',
        color: '#4f7df3',
        opacity: p2Opacity,
        position: 'absolute',
        left: '50%',
        transform: `translateX(-50%) translateY(${lerp(8, 0, Math.min(1, p2Opacity * 2))}px)`,
        whiteSpace: 'nowrap',
      }}>BINDING DOMAIN \u2192 atlas-7.agent.id</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.14em',
        color: '#34d399',
        opacity: p3Opacity,
        position: 'absolute',
        left: '50%',
        transform: `translateX(-50%) translateY(${lerp(8, 0, Math.min(1, p3Opacity * 2))}px)`,
        whiteSpace: 'nowrap',
      }}>CREDENTIAL ISSUED \u2713</div>
    </div>
  );
}

function CredentialSilhouette({ progress }: { progress: number }) {
  const silhouetteOpacity = progress < 0.06 ? lerp(0.45, 0.6, Math.min(1, progress / 0.06))
    : lerp(0.6, 0, Math.min(1, (progress - 0.06) / 0.08));
  if (silhouetteOpacity <= 0) return null;

  const GHOST_FIELDS = [
    { w: '45%' }, { w: '60%' }, { w: '38%' }, { w: '52%' },
    { w: '44%' }, { w: '35%' }, { w: '48%' },
  ];

  return (
    <div style={{
      position: 'absolute',
      width: 420, maxWidth: '80vw',
      top: '50%', left: '50%',
      transform: `translate(-50%, -50%) scale(${lerp(0.96, 1, Math.min(1, progress / 0.1))})`,
      opacity: silhouetteOpacity,
      zIndex: 3,
      pointerEvents: 'none',
    }}>
      <div style={{
        borderRadius: 22,
        border: '1px solid rgba(79,125,243,0.06)',
        background: 'rgba(8,10,22,0.4)',
        padding: '28px 32px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent 20%, rgba(79,125,243,0.12) 50%, transparent 80%)',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 2,
          background: 'linear-gradient(180deg, rgba(79,125,243,0.08), transparent 60%)',
        }} />

        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600,
          letterSpacing: '0.18em', color: 'rgba(232,232,240,0.08)',
          marginBottom: 20,
        }}>AGENT IDENTITY CREDENTIAL</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            border: '1px solid rgba(79,125,243,0.06)',
            background: 'rgba(79,125,243,0.02)',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              height: 10, width: '55%', borderRadius: 3,
              background: 'rgba(232,232,240,0.04)', marginBottom: 8,
            }} />
            <div style={{
              height: 7, width: '40%', borderRadius: 3,
              background: 'rgba(79,125,243,0.04)',
            }} />
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.02)',
          paddingTop: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {GHOST_FIELDS.map((f, i) => (
            <div key={i} style={{
              height: 6, width: f.w, borderRadius: 3,
              background: `rgba(232,232,240,${0.03 - i * 0.002})`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RegistryField({ progress }: { progress: number }) {
  const fieldOpacity = progress < 0.08 ? 1 : lerp(1, 0, (progress - 0.08) / 0.06);
  if (fieldOpacity <= 0) return null;

  return (
    <div style={{
      marginBottom: 32,
      opacity: fieldOpacity,
      transform: `translateY(${lerp(0, -20, Math.min(1, progress / 0.12))}px)`,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        background: 'rgba(79,125,243,0.04)',
        border: '1px solid rgba(79,125,243,0.08)',
        borderRadius: 10, padding: '10px 20px',
        gap: 2,
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'clamp(14px, 1.6vw, 18px)', fontWeight: 500,
          color: 'rgba(232,232,240,0.25)',
          letterSpacing: '0.02em',
        }}>agent.id/</span>
        <span className="registry-cursor" style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'clamp(14px, 1.6vw, 18px)', fontWeight: 500,
          color: '#4f7df3',
          letterSpacing: '0.02em',
        }}>_</span>
      </div>
      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .registry-cursor {
          animation: cursor-blink 1.1s step-end infinite;
        }
      `}</style>
    </div>
  );
}

function HeroOpening({ progress, onNavigate }: { progress: number; onNavigate?: (path: string) => void }) {
  const contentOpacity = progress < 0.08 ? 1 : lerp(1, 0, (progress - 0.08) / 0.06);
  const contentY = lerp(0, -60, Math.min(1, progress / 0.12));

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 10, pointerEvents: 'none',
      padding: '0 clamp(20px, 5vw, 60px)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 28,
        opacity: contentOpacity,
        transform: `translateY(${contentY * 0.3}px)`,
      }}>
        <div className="dormant-dot" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#4f7df3',
          boxShadow: '0 0 10px rgba(79,125,243,0.4)',
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
        }}>UNRESOLVED</span>
        <style>{`
          @keyframes dormant-pulse {
            0%, 100% { opacity: 0.5; box-shadow: 0 0 8px rgba(79,125,243,0.2); }
            50% { opacity: 1; box-shadow: 0 0 14px rgba(79,125,243,0.5); }
          }
          .dormant-dot {
            animation: dormant-pulse 2.8s ease-in-out infinite;
          }
        `}</style>
      </div>

      <RegistryField progress={progress} />

      <h1 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(28px, 4vw, 52px)',
        fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15,
        color: '#e8e8f0',
        textAlign: 'center',
        margin: '0 0 16px',
        maxWidth: 600,
        opacity: contentOpacity,
        transform: `translateY(${contentY}px)`,
      }}>
        Every agent needs a verifiable identity.{' '}
        <span style={{
          color: 'rgba(232,232,240,0.3)',
          fontWeight: 500,
        }}>This is where one begins.</span>
      </h1>

      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 'clamp(13px, 1.4vw, 16px)',
        fontWeight: 400, lineHeight: 1.6,
        color: 'rgba(232,232,240,0.3)',
        textAlign: 'center',
        maxWidth: 440, margin: '0 auto',
        opacity: contentOpacity * 0.8,
        transform: `translateY(${contentY * 0.5}px)`,
      }}>
        DNS, OAuth, and payments — unified into a single cryptographic credential for autonomous agents.
      </p>

      <div style={{
        marginTop: 32,
        opacity: contentOpacity * 0.7,
        transform: `translateY(${contentY * 0.3}px)`,
      }}>
        <span onClick={() => onNavigate?.('/start')} style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'rgba(232,232,240,0.35)',
          cursor: 'pointer',
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'rgba(79,125,243,0.4)',
          }} />
          BEGIN ISSUANCE
        </span>
      </div>
    </div>
  );
}

function PhaseLabel({ state, progress }: { state: IssuanceCeremonyState; progress: number }) {
  const visible = progress > 0.1;
  const isIssuing = state === 'issuing';
  return (
    <div style={{
      position: 'absolute', top: 32, left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: state === 'active' ? '#34d399' : (isIssuing ? '#f5a623' : '#4f7df3'),
        boxShadow: state === 'active' ? '0 0 12px rgba(52,211,153,0.5)' : (isIssuing ? '0 0 10px rgba(245,166,35,0.4)' : '0 0 8px rgba(79,125,243,0.4)'),
        transition: 'all 0.5s ease',
        animation: isIssuing ? 'pulse-dot 1.2s ease-in-out infinite' : undefined,
      }} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.16em',
        color: state === 'active' ? '#34d399' : (isIssuing ? '#f5a623' : 'rgba(232,232,240,0.35)'),
        transition: 'color 0.5s ease',
      }}>{CEREMONY_LABELS[state]}</span>
    </div>
  );
}

function IssuanceMomentFlash({ active }: { active: boolean }) {
  const [flashed, setFlashed] = useState(false);
  const prevActive = useRef(false);

  useEffect(() => {
    if (active && !prevActive.current) {
      setFlashed(true);
      const timer = setTimeout(() => setFlashed(false), 1200);
      prevActive.current = true;
      return () => clearTimeout(timer);
    }
    if (!active) prevActive.current = false;
    return undefined;
  }, [active]);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(circle at 50% 50%, rgba(52,211,153,0.08), transparent 60%)',
      opacity: flashed ? 1 : 0,
      transition: flashed ? 'opacity 0.15s ease' : 'opacity 1.2s ease',
      pointerEvents: 'none',
      zIndex: 4,
    }} />
  );
}

export default function IssuanceFilm({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const sectionRefs = useSectionRefs();
  const scroll = useScrollFilm(sectionRefs);

  const heroScale = lerp(1, 1.06, scroll.heroProgress);
  const heroOpacity = scroll.heroProgress > 0.85 ? lerp(1, 0, (scroll.heroProgress - 0.85) / 0.15) : 1;
  const ceremonyState = getIssuanceCeremonyState(scroll.heroProgress);
  const navOpacity = scroll.heroProgress > 0.06 ? 1 : lerp(0.4, 1, scroll.heroProgress / 0.06);

  const credentialScale = scroll.heroProgress < 0.12
    ? lerp(0.6, 1, easeOutCubic(scroll.heroProgress / 0.12))
    : 1;
  const credentialOpacity = scroll.heroProgress < 0.05 ? 0 :
    (scroll.heroProgress < 0.14 ? lerp(0, 1, (scroll.heroProgress - 0.05) / 0.09) : 1);
  const credentialBlur = scroll.heroProgress < 0.10 ? lerp(12, 0, scroll.heroProgress / 0.10) : 0;

  return (
    <div style={{
      background: '#050711',
      color: '#e8e8f0',
      fontFamily: "'Inter', sans-serif",
      WebkitFontSmoothing: 'antialiased',
    } as CSSProperties}>
      <GrainOverlay />
      <NavBar opacity={navOpacity} onNavigate={onNavigate} />

      <section ref={sectionRefs.hero as React.RefObject<HTMLElement>} style={{
        position: 'relative',
        height: '400vh',
      }}>
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            transform: `scale(${heroScale})`,
            opacity: heroOpacity,
            transition: 'opacity 0.1s linear',
          }}>
            <HeroIssuanceRings heroProgress={scroll.heroProgress} />
          </div>

          <IssuanceMomentFlash active={ceremonyState === 'active'} />

          <CredentialSilhouette progress={scroll.heroProgress} />

          <HeroOpening progress={scroll.heroProgress} onNavigate={onNavigate} />

          <PhaseLabel state={ceremonyState} progress={scroll.heroProgress} />

          <SystemResolvingText progress={scroll.heroProgress} />

          <div style={{
            position: 'relative', zIndex: 5,
            opacity: credentialOpacity * heroOpacity,
            transform: `scale(${credentialScale})`,
            filter: `blur(${credentialBlur}px)`,
            transition: 'transform 0.8s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <FilmCredential heroProgress={scroll.heroProgress} />
          </div>

          <div style={{
            position: 'absolute', bottom: 40,
            textAlign: 'center',
            opacity: scroll.heroProgress < 0.03 ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'rgba(232,232,240,0.25)', letterSpacing: '0.1em',
              marginBottom: 8,
            }}>SCROLL</div>
            <div style={{
              width: 1, height: 30, margin: '0 auto',
              background: 'linear-gradient(180deg, rgba(79,125,243,0.4), transparent)',
            }} />
          </div>
        </div>
      </section>

      <section ref={sectionRefs.anatomy as React.RefObject<HTMLElement>} style={{
        position: 'relative',
        minHeight: '300vh',
      }}>
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.anatomyProgress > 0.88
            ? lerp(1, 0, (scroll.anatomyProgress - 0.88) / 0.12)
            : (scroll.anatomyProgress < 0.08
              ? lerp(0, 1, scroll.anatomyProgress / 0.08)
              : 1),
          transform: scroll.anatomyProgress > 0.88
            ? `scale(${lerp(1, 0.97, (scroll.anatomyProgress - 0.88) / 0.12)}) translateY(${lerp(0, -30, (scroll.anatomyProgress - 0.88) / 0.12)}px)`
            : undefined,
          transition: 'opacity 0.05s linear',
        }}>
          <AnatomySection anatomyProgress={scroll.anatomyProgress} />
        </div>
      </section>

      <section ref={sectionRefs.unlocks as React.RefObject<HTMLElement>} style={{
        position: 'relative',
        minHeight: '280vh',
      }}>
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.unlocksProgress > 0.88
            ? lerp(1, 0, (scroll.unlocksProgress - 0.88) / 0.12)
            : (scroll.unlocksProgress < 0.08
              ? lerp(0, 1, scroll.unlocksProgress / 0.08)
              : 1),
          transform: scroll.unlocksProgress > 0.88
            ? `scale(${lerp(1, 0.97, (scroll.unlocksProgress - 0.88) / 0.12)}) translateY(${lerp(0, -30, (scroll.unlocksProgress - 0.88) / 0.12)}px)`
            : undefined,
          transition: 'opacity 0.05s linear',
        }}>
          <SystemActivationSection unlocksProgress={scroll.unlocksProgress} />
        </div>
      </section>

      <section ref={sectionRefs.cta as React.RefObject<HTMLElement>} style={{
        position: 'relative',
        minHeight: '160vh',
      }}>
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.ctaProgress < 0.1
            ? lerp(0, 1, scroll.ctaProgress / 0.1)
            : 1,
          transform: scroll.ctaProgress < 0.15
            ? `translateY(${lerp(40, 0, scroll.ctaProgress / 0.15)}px)`
            : undefined,
          transition: 'opacity 0.05s linear',
        }}>
          <CTASection ctaProgress={scroll.ctaProgress} onNavigate={onNavigate} />
        </div>
      </section>

      <footer className="film-footer" style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: 'clamp(24px, 4vh, 40px) clamp(20px, 5vw, 80px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4f7df3' }} />
            <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>Agent ID</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)' }}>Identity, Trust, and Routing for the Agent Internet.</div>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 20px)', flexWrap: 'wrap' }}>
          {['Protocol', 'Registry', 'Documentation', 'GitHub'].map(link => (
            <span key={link} style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', cursor: 'pointer' }}>{link}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
