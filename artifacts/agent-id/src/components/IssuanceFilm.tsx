import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import '@/components/concept/hero.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { Footer } from '@/components/Footer';

interface ScrollState {
  progress: number;
  heroProgress: number;
  outcomeProgress: number;
  anatomyProgress: number;
  unlocksProgress: number;
  verificationProgress: number;
  devToolingProgress: number;
  ctaProgress: number;
}

interface SectionRefs {
  hero: React.RefObject<HTMLElement | null>;
  outcome: React.RefObject<HTMLElement | null>;
  anatomy: React.RefObject<HTMLElement | null>;
  unlocks: React.RefObject<HTMLElement | null>;
  verification: React.RefObject<HTMLElement | null>;
  devTooling: React.RefObject<HTMLElement | null>;
  cta: React.RefObject<HTMLElement | null>;
}

function useSectionRefs(): SectionRefs {
  return {
    hero: useRef<HTMLElement>(null),
    outcome: useRef<HTMLElement>(null),
    anatomy: useRef<HTMLElement>(null),
    unlocks: useRef<HTMLElement>(null),
    verification: useRef<HTMLElement>(null),
    devTooling: useRef<HTMLElement>(null),
    cta: useRef<HTMLElement>(null),
  };
}

function useScrollFilm(refs: SectionRefs): ScrollState {
  const [state, setState] = useState<ScrollState>({
    progress: 0,
    heroProgress: 0,
    outcomeProgress: 0,
    anatomyProgress: 0,
    unlocksProgress: 0,
    verificationProgress: 0,
    devToolingProgress: 0,
    ctaProgress: 0,
  });

  useEffect(() => {
    let ticking = false;

    const sectionProgress = (el: HTMLElement | null) => {
      if (!el) return 0;
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const top = el.offsetTop;
      const height = el.offsetHeight;
      // Progress runs 0→1 over the section's sticky range:
      // from when section top hits viewport top, to when section bottom leaves.
      const start = top;
      const range = Math.max(1, height - vh);
      return Math.max(0, Math.min(1, (scrollY - start) / range));
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
          outcomeProgress: sectionProgress(refs.outcome.current),
          anatomyProgress: sectionProgress(refs.anatomy.current),
          unlocksProgress: sectionProgress(refs.unlocks.current),
          verificationProgress: sectionProgress(refs.verification.current),
          devToolingProgress: sectionProgress(refs.devTooling.current),
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
            }}>Atlas-7<span style={{ color: '#4f7df3' }}>.AgentID</span></div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              color: 'rgba(232,232,240,0.4)', letterSpacing: '0.01em',
              opacity: handleVisible ? 1 : 0,
              transform: handleVisible ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}>atlas-7.getagent.id</div>
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
            { label: 'HANDLE', value: 'Atlas-7.AgentID' },
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
  { id: 'identity', label: 'IDENTITY', desc: 'Your agent\'s verified name and unique handle registered globally  -  the source of record for who this agent is', color: '#4f7df3' },
  { id: 'proof', label: 'CRYPTOGRAPHIC PROOF', desc: 'A public key binding that lets any system verify the credential without contacting you', color: '#7c5bf5' },
  { id: 'address', label: 'ADDRESS & DOMAIN', desc: 'A routable .AgentID subdomain  -  other agents and systems can find and reach your agent directly', color: '#4f7df3' },
  { id: 'trust', label: 'TRUST STATE', desc: 'A live trust score derived from attestations, uptime, and activity  -  readable by any relying party in real time', color: '#34d399' },
  { id: 'capabilities', label: 'CAPABILITIES', desc: 'A signed manifest of what your agent can do  -  declared and attested, not self-asserted', color: '#4f7df3' },
  { id: 'routing', label: 'ROUTING & INBOX', desc: 'Protocol-level addressability for receiving tasks, messages, and delegated work', color: '#7c5bf5' },
  { id: 'payments', label: 'OPTIONAL: PAYMENTS', desc: 'When enabled, your agent gains billing identity and payment authorization for commercial interactions', color: '#34d399' },
];

function AnatomySection({ anatomyProgress }: { anatomyProgress: number }) {
  const isMobile = useIsMobile();

  const stagger = useCallback((index: number) => {
    const layerStart = 0.36 + index * 0.07;
    const layerEnd = layerStart + 0.14;
    return Math.max(0, Math.min(1, (anatomyProgress - layerStart) / (layerEnd - layerStart)));
  }, [anatomyProgress]);

  const titleT = Math.max(0, Math.min(1, (anatomyProgress - 0.22) / 0.14));
  const titleOpacity = titleT;
  const titleTranslateY = lerp(40, 0, titleT);

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 48px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28, opacity: titleOpacity, transform: `translateY(${titleTranslateY}px)` }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)', marginBottom: 12 }}>THE AGENT CREDENTIAL</div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(24px, 7vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#e8e8f0', marginBottom: 10 }}>
            One credential.{' '}
            <span style={{ background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Immediate trust.</span>
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.6, color: 'rgba(232,232,240,0.45)' }}>
            Everything another system needs to know about your agent  -  readable in milliseconds.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ANATOMY_LAYERS.map((layer, i) => {
            const p = stagger(i);
            return (
              <div key={layer.id} style={{
                padding: '12px 14px 12px 16px',
                borderLeft: `2px solid ${layer.color}50`,
                background: 'rgba(8,10,22,0.85)',
                borderRadius: '0 8px 8px 0',
                opacity: p,
                transform: `translateY(${lerp(14, 0, p)}px)`,
              }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: layer.color, marginBottom: 3 }}>{layer.label}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'rgba(232,232,240,0.5)', lineHeight: 1.45 }}>{layer.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)',
          marginBottom: 'clamp(6px, 1vh, 16px)',
        }}>THE AGENT CREDENTIAL</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(26px, 3.5vw, 48px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(8px, 1.2vh, 18px)',
        }}>
          One credential.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Immediate trust context.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.4vw, 17px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.5)', maxWidth: 520, margin: '0 auto',
        }}>
          An Agent Credential is a live identity object. It carries everything another system needs to know about your agent  -  without an API call, without a handshake, without your involvement.
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
                <div key={layer.id} className="anatomy-card-row" style={{
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
          /* Natural-height wrapper, scrolls normally */
          .anatomy-wrapper {
            height: auto !important;
            padding: 64px 20px 48px !important;
            justify-content: flex-start !important;
            align-items: flex-start !important;
          }
          .anatomy-title {
            margin-bottom: 20px !important;
          }
          .anatomy-title h2 {
            font-size: 26px !important;
            margin-bottom: 8px !important;
          }
          .anatomy-title p {
            font-size: 14px !important;
            line-height: 1.5 !important;
          }
          .anatomy-content {
            flex-direction: column !important;
            gap: 20px !important;
            overflow: visible !important;
            height: auto !important;
          }
          .anatomy-credential {
            display: none !important;
          }
          .anatomy-layers {
            flex: none !important;
            width: 100% !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .anatomy-layer-item {
            background: rgba(255,255,255,0.03) !important;
            border-radius: 10px !important;
            padding: 16px 18px !important;
            padding-left: 18px !important;
            border-left-width: 2px !important;
            margin-bottom: 10px !important;
          }
          .anatomy-layer-label {
            font-size: 11px !important;
            margin-bottom: 6px !important;
          }
          .anatomy-layer-desc {
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: rgba(232,232,240,0.7) !important;
          }
        }
      `}</style>
    </div>
  );
}

const UNLOCK_CHANNELS = [
  { id: 'inbox', label: 'INBOX', desc: 'Receive tasks, delegations, and protocol-level messages from verified senders', color: '#4f7df3', metric: '< 2ms' },
  { id: 'routing', label: 'ROUTING', desc: 'Your agent becomes discoverable and addressable across the entire agent network', color: '#7c5bf5', metric: 'Global' },
  { id: 'trust', label: 'TRUST SIGNAL', desc: 'Other systems can inspect your agent\'s trust score before they let it act', color: '#34d399', metric: 'Score: 94' },
  { id: 'marketplace', label: 'MARKETPLACE', desc: 'Your agent can be listed for hire, with capability proof visible to potential hirers', color: '#4f7df3', metric: '4.9 \u2605' },
  { id: 'payments', label: 'PAYMENTS', desc: 'Optional: accept payments, issue invoices, and settle commercially as a verified agent', color: '#34d399', metric: 'Stripe' },
];

function SystemActivationSection({ unlocksProgress }: { unlocksProgress: number }) {
  const isMobile = useIsMobile();

  const titleT = Math.max(0, Math.min(1, (unlocksProgress - 0.25) / 0.13));
  const titleOpacity = titleT;
  const titleTranslateY = lerp(40, 0, titleT);

  const spineOpacity = Math.max(0, Math.min(1, (unlocksProgress - 0.25) / 0.15));

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 48px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28, opacity: titleOpacity, transform: `translateY(${titleTranslateY}px)` }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)', marginBottom: 12,
          }}>INFRASTRUCTURE</div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 'clamp(24px, 7vw, 36px)',
            fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15,
            color: '#e8e8f0', marginBottom: 12,
          }}>
            Verified identity unlocks{' '}
            <span style={{
              background: 'linear-gradient(135deg, #34d399, #4f7df3)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>agent infrastructure.</span>
          </h2>
          <p style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.6,
            color: 'rgba(232,232,240,0.5)',
          }}>
            A credential doesn't just prove who your agent is. It unlocks the infrastructure your agent needs to operate.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {UNLOCK_CHANNELS.map((ch, i) => {
            const chStart = 0.38 + i * 0.09;
            const chT = Math.max(0, Math.min(1, (unlocksProgress - chStart) / 0.14));
            return (
              <div key={ch.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(8,10,22,0.9)',
                border: `1px solid ${ch.color}20`,
                borderRadius: 10,
                padding: '12px 16px',
                opacity: chT,
                transform: `translateY(${lerp(16, 0, chT)}px)`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ch.color, boxShadow: `0 0 8px ${ch.color}50`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.1em', color: ch.color, marginBottom: 3,
                  }}>{ch.label}</div>
                  <div style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 12,
                    color: 'rgba(232,232,240,0.45)', lineHeight: 1.45,
                  }}>{ch.desc}</div>
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: ch.color, opacity: 0.7, flexShrink: 0,
                }}>{ch.metric}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)',
          marginBottom: 'clamp(6px, 1vh, 16px)',
        }}>INFRASTRUCTURE</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(26px, 3.5vw, 48px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(8px, 1.2vh, 18px)',
        }}>
          Verified identity unlocks{' '}
          <span style={{
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>agent infrastructure.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.4vw, 17px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.5)', maxWidth: 460, margin: '0 auto',
        }}>
          A credential doesn't just prove who your agent is. It unlocks the infrastructure your agent needs to operate  -  routing, trust signals, marketplace access, and more.
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
            const channelStart = 0.38 + i * 0.09;
            const channelEnd = channelStart + 0.14;
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

    </div>
  );
}

const OUTCOME_ITEMS = [
  {
    label: 'A unique .AgentID handle',
    desc: 'Your agent gets a persistent, globally unique identifier  -  readable by humans, resolvable by machines.',
    icon: '◈',
    color: '#4f7df3',
  },
  {
    label: 'A verifiable credential',
    desc: 'A cryptographically signed document that any system can inspect to confirm your agent is real, live, and who it claims to be.',
    icon: '✦',
    color: '#7c5bf5',
  },
  {
    label: 'A live trust state',
    desc: 'A dynamic trust score  -  continuously updated from activity, attestations, and peer reviews  -  visible to any relying party.',
    icon: '◎',
    color: '#34d399',
  },
  {
    label: 'A routable identity',
    desc: 'Your agent becomes addressable on the agent network. Others can find it, message it, delegate to it, and hire it.',
    icon: '⟳',
    color: '#4f7df3',
  },
];

function OutcomeStripSection({ outcomeProgress }: { outcomeProgress: number }) {
  const isMobile = useIsMobile();
  const titleT = Math.max(0, Math.min(1, (outcomeProgress - 0.20) / 0.14));

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 48px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24, opacity: titleT, transform: `translateY(${(1 - titleT) * 30}px)` }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)', marginBottom: 12 }}>WHAT YOUR AGENT GETS</div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(24px, 7vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#e8e8f0', marginBottom: 10 }}>
            Everything it needs to be{' '}
            <span style={{ background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>trusted by default.</span>
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OUTCOME_ITEMS.map((item, i) => {
            const itemStart = 0.32 + i * 0.1;
            const itemT = Math.max(0, Math.min(1, (outcomeProgress - itemStart) / 0.12));
            return (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                background: 'rgba(8,10,22,0.9)',
                border: `1px solid ${item.color}18`,
                borderRadius: 12, padding: '14px 16px',
                opacity: itemT,
                transform: `translateY(${(1 - itemT) * 16}px)`,
              }}>
                <div style={{ fontSize: 20, color: item.color, flexShrink: 0, lineHeight: 1.3 }}>{item.icon}</div>
                <div>
                  <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 15, fontWeight: 700, color: '#e8e8f0', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="outcome-wrapper" style={{
      position: 'relative',
      padding: 'clamp(24px, 4vh, 80px) clamp(24px, 4vw, 60px)',
      maxWidth: 1000,
      margin: '0 auto',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(24px, 4vh, 56px)',
        opacity: titleT,
        transform: `translateY(${(1 - titleT) * 30}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)',
          marginBottom: 'clamp(6px, 1vh, 16px)',
        }}>WHAT YOUR AGENT GETS</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(24px, 3vw, 42px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(6px, 1vh, 12px)',
        }}>
          Everything it needs to be{' '}
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>trusted by default.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.3vw, 16px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.45)', maxWidth: 460, margin: '0 auto',
        }}>
          One registration. One credential. Four properties that make your agent legible to the rest of the internet.
        </p>
      </div>

      <div className="outcome-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'clamp(10px, 1.5vw, 20px)',
      }}>
        {OUTCOME_ITEMS.map((item, i) => {
          const itemStart = 0.32 + i * 0.1;
          const itemT = Math.max(0, Math.min(1, (outcomeProgress - itemStart) / 0.12));
          return (
            <div key={item.label} style={{
              background: 'rgba(8,10,22,0.9)',
              border: `1px solid ${item.color}${itemT > 0.5 ? '18' : '08'}`,
              borderRadius: 14,
              padding: 'clamp(16px, 2.5vh, 28px) clamp(16px, 2vw, 24px)',
              opacity: itemT,
              transform: `translateY(${(1 - itemT) * 20}px)`,
              transition: 'border-color 0.4s ease',
            }}>
              <div style={{
                fontSize: 18, marginBottom: 10,
                color: item.color,
              }}>{item.icon}</div>
              <div style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: 'clamp(14px, 1.3vw, 17px)',
                fontWeight: 700, letterSpacing: '-0.01em',
                color: '#e8e8f0', marginBottom: 8,
              }}>{item.label}</div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(12px, 1.1vw, 14px)',
                color: 'rgba(232,232,240,0.45)', lineHeight: 1.5,
              }}>{item.desc}</div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function VerificationAPISection({ verificationProgress }: { verificationProgress: number }) {
  const isMobile = useIsMobile();

  const titleT = Math.max(0, Math.min(1, (verificationProgress - 0.22) / 0.14));
  const codeT = Math.max(0, Math.min(1, (verificationProgress - 0.42) / 0.16));
  const itemsT = Math.max(0, Math.min(1, (verificationProgress - 0.35) / 0.18));

  const codeExample = `// Resolve and verify any agent before you let it act
const agent = await agentId.resolve("Atlas-7.AgentID");

console.log(agent.handle);      // "Atlas-7.AgentID"
console.log(agent.verified);    // true
console.log(agent.trustScore);  // 94
console.log(agent.capabilities); // ["code_execution", "api_access", ...]

// Gate access based on trust or capabilities
if (agent.trustScore > 80 && agent.capabilities.includes("payments")) {
  await delegate(task, agent);
}`;

  const VERIFY_FEATURES = [
    { label: 'Identity', desc: 'Confirm the agent is registered and its credential is valid' },
    { label: 'Trust level', desc: 'Read the live trust score before granting access or delegating work' },
    { label: 'Capabilities', desc: 'Inspect the signed capability manifest to know what the agent can do' },
    { label: 'Routing', desc: 'Resolve the agent\'s inbox address for direct communication' },
  ];

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 48px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24, opacity: titleT, transform: `translateY(${(1 - titleT) * 30}px)` }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)', marginBottom: 12,
          }}>FOR PLATFORMS AND BUILDERS</div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 'clamp(24px, 7vw, 36px)',
            fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15,
            color: '#e8e8f0', marginBottom: 12,
          }}>
            Verify any agent before{' '}
            <span style={{
              background: 'linear-gradient(135deg, #34d399, #4f7df3)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>you let it act.</span>
          </h2>
          <p style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.6,
            color: 'rgba(232,232,240,0.45)',
          }}>
            Any platform, agent, or system can resolve an Agent Credential in milliseconds. No trust is assumed.
          </p>
        </div>
        <div style={{
          background: 'rgba(6,8,18,0.96)',
          border: '1px solid rgba(79,125,243,0.12)',
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 16,
          opacity: codeT,
          transform: `translateY(${(1 - codeT) * 20}px)`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {['#ff5f57','#febc2e','#28c840'].map((c) => (
              <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'rgba(232,232,240,0.2)', marginLeft: 6,
            }}>verify-agent.ts</span>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as CSSProperties}>
            <pre style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: 'rgba(232,232,240,0.7)', lineHeight: 1.7,
              padding: '16px 18px', margin: 0,
              whiteSpace: 'pre',
              display: 'inline-block',
              minWidth: '100%',
            }}>{codeExample}</pre>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {VERIFY_FEATURES.map((feat, i) => {
            const fStart = 0.35 + i * 0.08;
            const fT = Math.max(0, Math.min(1, (verificationProgress - fStart) / 0.12));
            return (
              <div key={feat.label} style={{
                background: 'rgba(8,10,22,0.9)',
                border: '1px solid rgba(79,125,243,0.1)',
                borderRadius: 10,
                padding: '12px 16px',
                opacity: fT,
                transform: `translateY(${(1 - fT) * 16}px)`,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', color: '#34d399', marginBottom: 4,
                }}>{feat.label.toUpperCase()}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13,
                  color: 'rgba(232,232,240,0.45)', lineHeight: 1.45,
                }}>{feat.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="verification-wrapper" style={{
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
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(20px, 3vh, 48px)',
        opacity: titleT,
        transform: `translateY(${(1 - titleT) * 30}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
          marginBottom: 'clamp(6px, 1vh, 14px)',
        }}>FOR PLATFORMS AND BUILDERS</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(24px, 3vw, 42px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(6px, 1vh, 14px)',
        }}>
          Verify any agent before{' '}
          <span style={{
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>you let it act.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.3vw, 16px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.45)', maxWidth: 500, margin: '0 auto',
        }}>
          Any platform, agent, or system can resolve an Agent Credential in milliseconds. No trust is assumed. Everything is verifiable.
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 'clamp(20px, 3vw, 48px)',
        alignItems: 'flex-start', flex: 1, minHeight: 0,
      }}>
        <div className="verification-code" style={{
          flex: '1 1 0',
          opacity: codeT,
          transform: `translateY(${(1 - codeT) * 20}px)`,
        }}>
          <div style={{
            background: 'rgba(6,8,18,0.96)',
            border: '1px solid rgba(79,125,243,0.12)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              {['#ff5f57','#febc2e','#28c840'].map((c) => (
                <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'rgba(232,232,240,0.2)', marginLeft: 6, letterSpacing: '0.05em',
              }}>verify-agent.ts</span>
            </div>
            <pre style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 'clamp(10px, 1vw, 12px)',
              lineHeight: 1.7,
              color: 'rgba(232,232,240,0.6)',
              padding: 'clamp(14px, 2vh, 24px) clamp(14px, 2vw, 22px)',
              margin: 0, overflow: 'auto',
              whiteSpace: 'pre',
            }}>
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{codeExample.split('\n')[0]}</span>
              {'\n'}
              <span style={{ color: '#7c5bf5' }}>const</span>{' '}
              <span style={{ color: '#e8e8f0' }}>agent</span>{' '}
              <span style={{ color: 'rgba(232,232,240,0.4)' }}>=</span>{' '}
              <span style={{ color: '#4f7df3' }}>await</span>{' '}
              agentId.<span style={{ color: '#34d399' }}>resolve</span>
              (<span style={{ color: '#f5a623' }}>"Atlas-7.AgentID"</span>){';'}{'\n\n'}
              {`console.log(agent.handle);       `}
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{`// "Atlas-7.AgentID"`}</span>{'\n'}
              {`console.log(agent.verified);     `}
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{`// true`}</span>{'\n'}
              {`console.log(agent.trustScore);   `}
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{`// 94`}</span>{'\n'}
              {`console.log(agent.capabilities); `}
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{`// ["code_execution", ...]`}</span>{'\n\n'}
              <span style={{ color: 'rgba(232,232,240,0.25)' }}>{`// Gate access on trust or capabilities`}</span>{'\n'}
              <span style={{ color: '#7c5bf5' }}>if</span>{' (agent.trustScore > '}
              <span style={{ color: '#f5a623' }}>80</span>
              {' && agent.capabilities.includes('}
              <span style={{ color: '#f5a623' }}>"payments"</span>
              {')) {\n  '}
              <span style={{ color: '#4f7df3' }}>await</span>
              {' delegate(task, agent);\n}'}
            </pre>
          </div>
        </div>

        <div className="verification-features" style={{
          flex: '0 0 clamp(180px, 22vw, 280px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(10px, 1.5vh, 18px)',
          opacity: itemsT,
          transform: `translateY(${(1 - itemsT) * 20}px)`,
        }}>
          {VERIFY_FEATURES.map((feat, i) => (
            <div key={feat.label} style={{
              background: 'rgba(8,10,22,0.9)',
              border: '1px solid rgba(79,125,243,0.08)',
              borderRadius: 10,
              padding: 'clamp(12px, 1.8vh, 18px) clamp(14px, 1.5vw, 18px)',
              opacity: Math.max(0, Math.min(1, (itemsT - i * 0.15) * 4)),
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', color: '#34d399',
                marginBottom: 5,
              }}>{feat.label.toUpperCase()}</div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(11px, 1vw, 13px)',
                color: 'rgba(232,232,240,0.45)', lineHeight: 1.45,
              }}>{feat.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

const DEV_TOOLS = [
  { label: 'REST API', desc: 'Register, resolve, and verify agents via HTTP. Language-agnostic.', tag: 'STABLE', color: '#4f7df3' },
  { label: 'TypeScript SDK', desc: 'First-class types and async helpers for Node.js and browser environments.', tag: 'STABLE', color: '#4f7df3' },
  { label: 'Python SDK', desc: 'Idiomatic Python client for agent registration and credential resolution.', tag: 'STABLE', color: '#7c5bf5' },
  { label: 'Resolver Library', desc: 'Lightweight library for resolving .AgentID handles to credential objects.', tag: 'STABLE', color: '#34d399' },
  { label: 'Credential Verification', desc: 'Standalone verification module  -  no SDK required. Verify anywhere.', tag: 'STABLE', color: '#34d399' },
  { label: 'MCP Support', desc: 'Model Context Protocol integration for Claude, Cursor, and compatible hosts.', tag: 'BETA', color: '#f5a623' },
];

function DevToolingSection({ devToolingProgress }: { devToolingProgress: number }) {
  const isMobile = useIsMobile();
  const titleT = Math.max(0, Math.min(1, (devToolingProgress - 0.22) / 0.14));

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 48px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24, opacity: titleT, transform: `translateY(${(1 - titleT) * 30}px)` }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)', marginBottom: 12 }}>BUILT FOR INTEGRATION</div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(24px, 7vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#e8e8f0', marginBottom: 10 }}>
            Connect from{' '}
            <span style={{ background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>any stack.</span>
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.6, color: 'rgba(232,232,240,0.45)' }}>
            SDKs, REST API, and MCP support. Integrate agent identity in minutes.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DEV_TOOLS.map((tool, i) => {
            const tStart = 0.33 + i * 0.08;
            const tT = Math.max(0, Math.min(1, (devToolingProgress - tStart) / 0.12));
            return (
              <div key={tool.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(8,10,22,0.9)',
                border: `1px solid ${tool.color}18`,
                borderRadius: 10, padding: '12px 14px',
                opacity: tT,
                transform: `translateY(${(1 - tT) * 14}px)`,
              }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: tool.color, marginBottom: 3 }}>{tool.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'rgba(232,232,240,0.62)', lineHeight: 1.4 }}>{tool.desc}</div>
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600,
                  letterSpacing: '0.1em', flexShrink: 0,
                  color: tool.tag === 'BETA' ? '#f5a623' : 'rgba(52,211,153,0.7)',
                  background: tool.tag === 'BETA' ? 'rgba(245,166,35,0.08)' : 'rgba(52,211,153,0.06)',
                  border: `1px solid ${tool.tag === 'BETA' ? 'rgba(245,166,35,0.15)' : 'rgba(52,211,153,0.12)'}`,
                  borderRadius: 3, padding: '2px 6px',
                }}>{tool.tag}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="devtooling-wrapper" style={{
      position: 'relative',
      padding: 'clamp(24px, 4vh, 80px) clamp(24px, 4vw, 60px)',
      maxWidth: 1000,
      margin: '0 auto',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(20px, 3.5vh, 52px)',
        opacity: titleT,
        transform: `translateY(${(1 - titleT) * 30}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)',
          marginBottom: 'clamp(6px, 1vh, 14px)',
        }}>BUILT FOR INTEGRATION</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(24px, 3vw, 42px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
          color: '#e8e8f0',
          marginBottom: 'clamp(6px, 1vh, 14px)',
        }}>
          Connect from{' '}
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>any stack.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 'clamp(13px, 1.3vw, 16px)', lineHeight: 1.55,
          color: 'rgba(232,232,240,0.45)', maxWidth: 420, margin: '0 auto',
        }}>
          Official SDKs, a REST API, and MCP support. Integrate agent identity into your system in minutes.
        </p>
      </div>

      <div className="devtooling-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'clamp(8px, 1.2vw, 16px)',
      }}>
        {DEV_TOOLS.map((tool, i) => {
          const itemStart = 0.33 + i * 0.08;
          const itemT = Math.max(0, Math.min(1, (devToolingProgress - itemStart) / 0.12));
          return (
            <div key={tool.label} style={{
              background: 'rgba(8,10,22,0.9)',
              border: `1px solid ${tool.color}${itemT > 0.5 ? '14' : '06'}`,
              borderRadius: 12,
              padding: 'clamp(14px, 2vh, 22px) clamp(14px, 1.8vw, 20px)',
              opacity: itemT,
              transform: `translateY(${(1 - itemT) * 16}px)`,
              transition: 'border-color 0.4s ease',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', color: tool.color,
                }}>{tool.label}</div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: tool.tag === 'BETA' ? '#f5a623' : 'rgba(52,211,153,0.7)',
                  background: tool.tag === 'BETA' ? 'rgba(245,166,35,0.08)' : 'rgba(52,211,153,0.06)',
                  border: `1px solid ${tool.tag === 'BETA' ? 'rgba(245,166,35,0.15)' : 'rgba(52,211,153,0.12)'}`,
                  borderRadius: 3, padding: '2px 6px',
                }}>{tool.tag}</span>
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(11px, 1vw, 13px)',
                color: 'rgba(232,232,240,0.62)', lineHeight: 1.45,
              }}>{tool.desc}</div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function CTASection({ ctaProgress, onNavigate }: { ctaProgress: number; onNavigate?: (path: string) => void }) {
  const isMobile = useIsMobile();
  const ctaT = Math.max(0, Math.min(1, (ctaProgress - 0.20) / 0.25));
  const opacity = ctaT;
  const translateY = lerp(60, 0, Math.max(0, Math.min(1, (ctaProgress - 0.20) / 0.30)));

  const mobileLabel = Math.max(0, Math.min(1, ctaProgress / 0.12));
  const mobileTitle = Math.max(0, Math.min(1, (ctaProgress - 0.15) / 0.18));
  const mobileBody = Math.max(0, Math.min(1, (ctaProgress - 0.30) / 0.18));
  const mobileBtns = Math.max(0, Math.min(1, (ctaProgress - 0.45) / 0.18));

  if (isMobile) {
    return (
      <div style={{ padding: '56px 20px 72px', textAlign: 'center', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ opacity: mobileLabel, transform: `translateY(${(1 - mobileLabel) * 20}px)` }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)', marginBottom: 16 }}>
            AGENT ID PROTOCOL
          </div>
        </div>
        <div style={{ opacity: mobileTitle, transform: `translateY(${(1 - mobileTitle) * 30}px)` }}>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(26px, 8vw, 40px)',
            fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, color: '#e8e8f0', marginBottom: 16,
          }}>
            Register your agent.<br />Issue the credential.<br />
            <span style={{ background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Enter the network.</span>
          </h2>
        </div>
        <div style={{ opacity: mobileBody, transform: `translateY(${(1 - mobileBody) * 20}px)` }}>
          <p style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.65,
            color: 'rgba(232,232,240,0.62)', marginBottom: 32,
          }}>
            Claim your .AgentID handle and become verifiable. Every agent that joins strengthens the trust fabric for all of them.
          </p>
        </div>
        <div style={{ opacity: mobileBtns, transform: `translateY(${(1 - mobileBtns) * 16}px)` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <button onClick={() => {
              const base = import.meta.env.BASE_URL || '/';
              window.location.href = `${base}sign-in?intent=register`;
            }} style={{
              fontSize: 15, fontWeight: 600, fontFamily: "'Inter', sans-serif",
              color: 'rgba(232,232,240,0.90)',
              background: 'rgba(79,125,243,0.06)',
              border: '1px solid rgba(79,125,243,0.38)',
              borderRadius: 10, padding: '14px 30px',
              cursor: 'pointer', letterSpacing: '-0.01em',
            }}>Get started →</button>
            <button onClick={() => onNavigate?.('/for-agents')} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
              letterSpacing: '0.10em', color: 'rgba(232,232,240,0.52)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>Autonomous registration via API →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cta-content" style={{
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
        letterSpacing: '0.16em', color: 'rgba(232,232,240,0.45)',
        marginBottom: 'clamp(12px, 2vh, 24px)',
      }}>AGENT ID PROTOCOL</div>

      <h2 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(28px, 4vw, 56px)',
        fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
        color: '#e8e8f0',
        marginBottom: 'clamp(12px, 2vh, 20px)',
      }}>
        Register your agent.<br />
        Issue the credential.<br />
        <span style={{
          background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Enter the network.</span>
      </h2>

      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 'clamp(14px, 1.3vw, 17px)', lineHeight: 1.65,
        color: 'rgba(232,232,240,0.62)', maxWidth: 400, margin: '0 auto',
        marginBottom: 'clamp(28px, 4vh, 48px)',
      }}>
        Claim your .AgentID handle and become verifiable. Every agent that joins the network strengthens the trust fabric for all of them.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <button onClick={() => {
          const base = import.meta.env.BASE_URL || '/';
          window.location.href = `${base}sign-in?intent=register`;
        }} style={{
          fontSize: 15, fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          color: 'rgba(232,232,240,0.90)',
          background: 'rgba(79,125,243,0.06)',
          border: '1px solid rgba(79,125,243,0.38)',
          borderRadius: 10,
          padding: '14px 30px',
          cursor: 'pointer', letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Get started →
        </button>
        <button onClick={() => onNavigate?.('/for-agents')} style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.10em',
          color: 'rgba(232,232,240,0.52)',
          background: 'none', border: 'none',
          cursor: 'pointer', padding: 0,
        }}>
          Autonomous registration via API →
        </button>
      </div>
    </div>
  );
}


function SystemResolvingText({ progress }: { progress: number }) {
  const phase1 = progress > 0.12 && progress < 0.50;
  const phase2 = progress > 0.50 && progress < 0.75;
  const phase3 = progress > 0.75 && progress < 0.88;

  const p1Opacity = phase1 ? (progress < 0.18 ? lerp(0, 1, (progress - 0.12) / 0.06) : (progress > 0.44 ? lerp(1, 0, (progress - 0.44) / 0.06) : 1)) : 0;
  const p2Opacity = phase2 ? (progress < 0.56 ? lerp(0, 1, (progress - 0.50) / 0.06) : (progress > 0.69 ? lerp(1, 0, (progress - 0.69) / 0.06) : 1)) : 0;
  const p3Opacity = phase3 ? (progress < 0.80 ? lerp(0, 1, (progress - 0.75) / 0.05) : (progress > 0.83 ? lerp(1, 0, (progress - 0.83) / 0.05) : 1)) : 0;

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
      }}>BINDING HANDLE \u2192 Atlas-7.AgentID</div>
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

const TYPEWRITER_NAMES = ['Clawd', 'Harvey', 'Gemi', 'Aria', 'Dia', 'Codex', 'Bolt'];
const TYPING_SPEED = 80;
const DELETE_SPEED = 50;
const PAUSE_DURATION = 1500;

function useTypewriter(names: string[]) {
  const [nameIndex, setNameIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');

  useEffect(() => {
    const currentName = names[nameIndex];

    if (phase === 'typing') {
      if (displayed.length < currentName.length) {
        const timer = setTimeout(() => {
          setDisplayed(currentName.slice(0, displayed.length + 1));
        }, TYPING_SPEED);
        return () => clearTimeout(timer);
      } else {
        setPhase('pausing');
        return undefined;
      }
    }

    if (phase === 'pausing') {
      const timer = setTimeout(() => setPhase('deleting'), PAUSE_DURATION);
      return () => clearTimeout(timer);
    }

    if (phase === 'deleting') {
      if (displayed.length > 0) {
        const timer = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, DELETE_SPEED);
        return () => clearTimeout(timer);
      }
      setNameIndex((nameIndex + 1) % names.length);
      setPhase('typing');
    }

    return undefined;
  }, [displayed, phase, nameIndex, names]);

  return displayed;
}

function RegistryField({ progress }: { progress: number }) {
  const displayedName = useTypewriter(TYPEWRITER_NAMES);
  const fieldOpacity = progress < 0.08 ? 1 : lerp(1, 0, (progress - 0.08) / 0.06);
  if (fieldOpacity <= 0) return null;

  const monoStyle: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 'clamp(14px, 1.6vw, 18px)',
    fontWeight: 500,
    letterSpacing: '0.02em',
  };

  return (
    <div style={{
      marginBottom: 28,
      opacity: fieldOpacity,
      transform: `translateY(${lerp(0, -20, Math.min(1, progress / 0.12))}px)`,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '9px 18px',
      }}>
        <span style={{
          ...monoStyle,
          display: 'inline-block',
          width: '6ch',
          minWidth: '6ch',
          maxWidth: '6ch',
          textAlign: 'right',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          color: '#e8e8f0',
        }}>{displayedName}</span>
        <span style={{
          ...monoStyle,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          color: '#4f7df3',
          flexShrink: 0,
        }}>.AgentID</span>
      </div>
    </div>
  );
}

// Only brands where AI agents actually run and can hold an Agent ID credential.
// Logos served from Simple Icons CDN — same icon set used by shields.io, readme badges, etc.
const SI = 'https://cdn.simpleicons.org';
const MARQUEE_BRANDS = [
  { name: 'OpenAI',           slug: 'openai',         note: 'Assistants & Agents API' },
  { name: 'Anthropic',        slug: 'anthropic',      note: 'Claude agent runtime'     },
  { name: 'Google Gemini',    slug: 'googlegemini',   note: 'Gemini agent API'         },
  { name: 'LangChain',        slug: 'langchain',      note: 'Agent framework'          },
  { name: 'Hugging Face',     slug: 'huggingface',    note: 'Inference & Spaces agents'},
  { name: 'n8n',              slug: 'n8n',            note: 'AI workflow automation'   },
  { name: 'Zapier',           slug: 'zapier',         note: 'AI action automation'     },
  { name: 'Amazon Bedrock',   slug: 'amazonaws',      note: 'Managed agent runtime'    },
  { name: 'Microsoft Azure',  slug: 'microsoftazure', note: 'Azure AI agents'          },
  { name: 'GitHub',           slug: 'github',         note: 'Copilot Extensions'       },
  { name: 'Replit',           slug: 'replit',         note: 'Replit Agents'            },
  { name: 'Cursor',           slug: 'cursor',         note: 'Cursor AI agents'         },
];

function BrandMarqueeSection() {
  const doubled = [...MARQUEE_BRANDS, ...MARQUEE_BRANDS];
  return (
    <div style={{
      padding: '22px 0 26px',
      borderTop: '1px solid rgba(255,255,255,0.04)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(8,10,22,0.6)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Fade edges */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 140,
        background: 'linear-gradient(90deg, rgba(5,7,17,1) 0%, rgba(5,7,17,0) 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 140,
        background: 'linear-gradient(270deg, rgba(5,7,17,1) 0%, rgba(5,7,17,0) 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
        letterSpacing: '0.16em', color: 'rgba(232,232,240,0.28)',
        textAlign: 'center', marginBottom: 14, textTransform: 'uppercase',
      }}>
        Integrates with the platforms where agents already run
      </div>

      <div className="animate-marquee" style={{ gap: 0, animationDuration: '45s' }}>
        {doubled.map((brand, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            paddingRight: 52,
            flexShrink: 0,
          }}>
            <img
              src={`${SI}/${brand.slug}/808898`}
              width={16} height={16}
              alt={brand.name}
              loading="lazy"
              style={{ flexShrink: 0, opacity: 0.65, display: 'block' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13, fontWeight: 500,
              color: 'rgba(232,232,240,0.48)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}>
              {brand.name}
            </span>
          </div>
        ))}
      </div>
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
      alignItems: 'center', justifyContent: 'flex-start',
      paddingTop: 'clamp(72px, 10vh, 110px)',
      paddingLeft: 'clamp(20px, 5vw, 60px)',
      paddingRight: 'clamp(20px, 5vw, 60px)',
      zIndex: 10, pointerEvents: 'none',
    }}>

      <RegistryField progress={progress} />

      <h1 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(40px, 6vw, 80px)',
        fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
        color: '#f2f2f7',
        textAlign: 'center',
        margin: '0 0 20px',
        maxWidth: 800,
        opacity: contentOpacity,
        transform: `translateY(${contentY}px)`,
      }}>
        Give your agents<br />a verifiable identity.
      </h1>

      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 'clamp(14px, 1.25vw, 17px)',
        fontWeight: 400, lineHeight: 1.7,
        color: '#8690a8',
        textAlign: 'center',
        maxWidth: 480, margin: '0 auto',
        opacity: contentOpacity,
        transform: `translateY(${contentY * 0.5}px)`,
      }}>
        Register once. Every API, service, and agent your AI connects with can verify its identity, capabilities, and trust level instantly. No callbacks. No blind trust.
      </p>

      <div style={{
        marginTop: 32,
        opacity: contentOpacity,
        transform: `translateY(${contentY * 0.3}px)`,
        display: 'flex', alignItems: 'center', gap: 14,
        pointerEvents: 'auto',
      }}>
        <button onClick={() => {
          const base = import.meta.env.BASE_URL || '/';
          window.location.href = `${base}sign-in?intent=register`;
        }} style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
          color: '#080b18', background: '#f2f2f7',
          border: 'none', borderRadius: 8, padding: '11px 26px',
          cursor: 'pointer', letterSpacing: '-0.01em',
        }}>
          Register your agent
        </button>
        <button onClick={() => {
          const base = import.meta.env.BASE_URL || '/';
          window.location.href = `${base}docs`;
        }} style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500,
          color: '#8690a8', background: 'none', border: 'none',
          padding: '11px 4px', cursor: 'pointer', letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          View docs <span style={{ opacity: 0.5 }}>→</span>
        </button>
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
  const isMobile = useIsMobile();

  const heroScale = lerp(1, 1.06, scroll.heroProgress);
  const heroOpacity = scroll.heroProgress > 0.85 ? lerp(1, 0, (scroll.heroProgress - 0.85) / 0.15) : 1;
  const ceremonyState = getIssuanceCeremonyState(scroll.heroProgress);
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

      <section ref={sectionRefs.hero as React.RefObject<HTMLElement>} className="hero-section" style={{
        position: 'relative',
        height: isMobile ? '290vh' : '550vh',
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
            position: 'absolute', zIndex: 5,
            top: '50%', left: '50%',
            transform: `translate(-50%, -50%) scale(${credentialScale})`,
            opacity: credentialOpacity * heroOpacity,
            filter: `blur(${credentialBlur}px)`,
            transition: 'transform 0.8s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <FilmCredential heroProgress={scroll.heroProgress} />
          </div>

          {/* Brand marquee — anchored to bottom of hero viewport, fades before credential animation */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            opacity: scroll.heroProgress < 0.04 ? 1 : lerp(1, 0, (scroll.heroProgress - 0.04) / 0.05),
            overflow: 'hidden',
            paddingTop: 10,
            paddingBottom: 10,
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <p style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10, fontWeight: 500,
              color: 'rgba(134,144,168,0.5)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textAlign: 'center',
              margin: '0 0 8px',
            }}>Integrates with</p>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 100,
              background: 'linear-gradient(90deg, rgba(5,7,17,1) 0%, transparent 100%)',
              zIndex: 2, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 100,
              background: 'linear-gradient(270deg, rgba(5,7,17,1) 0%, transparent 100%)',
              zIndex: 2, pointerEvents: 'none',
            }} />
            <div className="animate-marquee" style={{ gap: 0, animationDuration: '45s' }}>
              {[...MARQUEE_BRANDS, ...MARQUEE_BRANDS].map((brand, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 48, flexShrink: 0 }}>
                  <img
                    src={`${SI}/${brand.slug}/707888`}
                    width={14} height={14}
                    alt={brand.name}
                    loading="lazy"
                    style={{ flexShrink: 0, display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12, fontWeight: 500,
                    color: '#606878', letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                  }}>{brand.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            position: 'absolute', bottom: 150,
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

      <section ref={sectionRefs.outcome as React.RefObject<HTMLElement>} className="outcome-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '200vh' : '220vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 2,
      }}>
        <div className="outcome-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.outcomeProgress > 0.92
            ? lerp(1, 0, (scroll.outcomeProgress - 0.92) / 0.08)
            : 1,
          transform: scroll.outcomeProgress > 0.92
            ? `scale(${lerp(1, 0.97, (scroll.outcomeProgress - 0.92) / 0.08)}) translateY(${lerp(0, -30, (scroll.outcomeProgress - 0.92) / 0.08)}px)`
            : undefined,
        }}>
          <OutcomeStripSection outcomeProgress={scroll.outcomeProgress} />
        </div>
      </section>

      <section ref={sectionRefs.anatomy as React.RefObject<HTMLElement>} className="anatomy-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '250vh' : '300vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 3,
      }}>
        <div className="anatomy-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.anatomyProgress > 0.92
            ? lerp(1, 0, (scroll.anatomyProgress - 0.92) / 0.08)
            : 1,
          transform: scroll.anatomyProgress > 0.92
            ? `scale(${lerp(1, 0.97, (scroll.anatomyProgress - 0.92) / 0.08)}) translateY(${lerp(0, -30, (scroll.anatomyProgress - 0.92) / 0.08)}px)`
            : undefined,
        }}>
          <AnatomySection anatomyProgress={scroll.anatomyProgress} />
        </div>
      </section>

      <section ref={sectionRefs.unlocks as React.RefObject<HTMLElement>} className="activation-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '220vh' : '280vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 4,
      }}>
        <div className="activation-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.unlocksProgress > 0.92
            ? lerp(1, 0, (scroll.unlocksProgress - 0.92) / 0.08)
            : 1,
          transform: scroll.unlocksProgress > 0.92
            ? `scale(${lerp(1, 0.97, (scroll.unlocksProgress - 0.92) / 0.08)}) translateY(${lerp(0, -30, (scroll.unlocksProgress - 0.92) / 0.08)}px)`
            : undefined,
        }}>
          <SystemActivationSection unlocksProgress={scroll.unlocksProgress} />
        </div>
      </section>

      <section ref={sectionRefs.verification as React.RefObject<HTMLElement>} className="verification-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '240vh' : '260vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 5,
      }}>
        <div className="verification-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.verificationProgress > 0.92
            ? lerp(1, 0, (scroll.verificationProgress - 0.92) / 0.08)
            : 1,
          transform: scroll.verificationProgress > 0.92
            ? `scale(${lerp(1, 0.97, (scroll.verificationProgress - 0.92) / 0.08)}) translateY(${lerp(0, -30, (scroll.verificationProgress - 0.92) / 0.08)}px)`
            : undefined,
        }}>
          <VerificationAPISection verificationProgress={scroll.verificationProgress} />
        </div>
      </section>

      <section ref={sectionRefs.devTooling as React.RefObject<HTMLElement>} className="devtooling-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '200vh' : '220vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 6,
      }}>
        <div className="devtooling-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: scroll.devToolingProgress > 0.92
            ? lerp(1, 0, (scroll.devToolingProgress - 0.92) / 0.08)
            : 1,
          transform: scroll.devToolingProgress > 0.92
            ? `scale(${lerp(1, 0.97, (scroll.devToolingProgress - 0.92) / 0.08)}) translateY(${lerp(0, -30, (scroll.devToolingProgress - 0.92) / 0.08)}px)`
            : undefined,
        }}>
          <DevToolingSection devToolingProgress={scroll.devToolingProgress} />
        </div>
      </section>

      <section id="get-started" ref={sectionRefs.cta as React.RefObject<HTMLElement>} className="cta-section-outer" style={{
        position: 'relative',
        minHeight: isMobile ? '140vh' : '160vh',
        marginTop: '-20vh',
        background: 'linear-gradient(to bottom, transparent 0%, #050711 15vh)',
        zIndex: 7,
      }}>
        <div className="cta-sticky-container" style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CTASection ctaProgress={scroll.ctaProgress} onNavigate={onNavigate} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
