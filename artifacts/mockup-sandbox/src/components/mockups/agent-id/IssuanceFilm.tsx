import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import './_shared/concept/hero.css';

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
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 20,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: isActive ? '#34d399' : '#4f7df3',
        boxShadow: isActive ? '0 0 12px rgba(52,211,153,0.5)' : '0 0 8px rgba(79,125,243,0.4)',
        transition: 'all 0.6s ease',
      }} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.16em',
        color: isActive ? '#34d399' : '#4f7df3',
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
      width: 60, height: 60, borderRadius: 15,
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 7,
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
  const size = 68;
  const r = 28;
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
        fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700,
        color: '#34d399',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>{score}</span>
    </div>
  );
}

function VerificationSeal({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'absolute', top: 26, right: 32,
      width: 64, height: 64,
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1) rotate(0deg)' : 'scale(2.2) rotate(-20deg)',
      transition: 'opacity 0.5s ease, transform 0.7s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r="30" fill="none" stroke="#4f7df3"
          strokeWidth="1.5" strokeDasharray="3 2.5" opacity="0.3" />
        <circle cx="32" cy="32" r="22" fill="rgba(79,125,243,0.12)"
          stroke="#4f7df3" strokeWidth="0.5" opacity="0.5" />
        <path d="M32 17l3.2 6.2 6.8 1-5 4.8 1.2 6.8L32 32.5l-6.2 3.3 1.2-6.8-5-4.8 6.8-1z"
          fill="#4f7df3" opacity="0.6" />
        <text x="32" y="47" textAnchor="middle" fontSize="5.5"
          fontFamily="'JetBrains Mono', monospace" fill="rgba(232,232,240,0.35)" fontWeight="600"
          letterSpacing="0.08em">VERIFIED</text>
      </svg>
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

function FilmCredential({ heroProgress }: { heroProgress: number }) {
  const ceremonyState = getIssuanceCeremonyState(heroProgress);
  const frameVisible = heroProgress > 0.05;
  const identityVisible = heroProgress > 0.12;
  const handleVisible = heroProgress > 0.18;
  const domainVisible = heroProgress > 0.30;
  const verificationVisible = heroProgress > 0.40;
  const trustVisible = heroProgress > 0.50;
  const capsVisible = heroProgress > 0.60;
  const marketplaceVisible = heroProgress > 0.70;
  const isActive = ceremonyState === 'active';

  const trustScore = trustVisible ? Math.round(easeOutCubic(Math.min(1, (heroProgress - 0.50) / 0.25)) * 94) : 0;

  const scale = lerp(0.92, 1.0, Math.min(1, heroProgress / 0.3));
  const rotateX = lerp(5, 1, Math.min(1, heroProgress / 0.4));

  return (
    <div style={{
      position: 'relative',
      width: 640, maxWidth: '92vw',
      borderRadius: 22,
      border: `1px solid ${isActive ? 'rgba(52,211,153,0.12)' : 'rgba(79,125,243,0.14)'}`,
      background: 'rgba(12, 15, 30, 0.97)',
      backdropFilter: 'blur(30px)',
      overflow: 'hidden',
      opacity: frameVisible ? 1 : 0,
      transform: `perspective(1400px) rotateX(${rotateX}deg) scale(${scale})`,
      filter: frameVisible ? 'blur(0px)' : 'blur(14px)',
      transition: 'opacity 1.4s ease, filter 1.4s ease, border-color 1s ease',
      boxShadow: frameVisible
        ? `0 0 80px rgba(79,125,243,${isActive ? '0.08' : '0.05'}), 0 40px 100px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.2)`
        : 'none',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: isActive
          ? 'linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(79,125,243,0.3), transparent)',
        opacity: frameVisible ? 0.6 : 0,
        transition: 'opacity 1s ease, background 1s ease',
      }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 1,
        background: isActive
          ? 'linear-gradient(180deg, rgba(52,211,153,0.15), transparent 70%)'
          : 'linear-gradient(180deg, rgba(79,125,243,0.1), transparent 70%)',
        transition: 'background 1s ease',
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 1,
        background: isActive
          ? 'linear-gradient(180deg, rgba(52,211,153,0.15), transparent 70%)'
          : 'linear-gradient(180deg, rgba(79,125,243,0.1), transparent 70%)',
        transition: 'background 1s ease',
      }} />

      <VerificationSeal visible={verificationVisible} />

      <div style={{ padding: '30px 40px 0' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 500,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'rgba(232,232,240,0.25)',
          marginBottom: 6,
          opacity: frameVisible ? 1 : 0,
          transition: 'opacity 1s ease 0.3s',
        }}>AGENT IDENTITY CREDENTIAL</div>

        <CeremonyStatusBar state={ceremonyState} trustScore={trustScore} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 26 }}>
          <CredentialIdenticon visible={identityVisible} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 26, fontWeight: 700, color: '#e8e8f0',
              letterSpacing: '-0.02em',
              opacity: identityVisible ? 1 : 0,
              transform: identityVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s',
            }}>Atlas-7</div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13.5,
              color: '#4f7df3', letterSpacing: '0.01em',
              opacity: handleVisible ? 1 : 0,
              transform: handleVisible ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}>agent.id/atlas-7</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 22, marginBottom: 22,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 32px',
          opacity: domainVisible ? 1 : 0,
          transform: domainVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          {[
            { label: 'DOMAIN', value: 'atlas-7.agent.id' },
            { label: 'STATUS', value: isActive ? 'Active' : 'Pending', isStatus: true },
            { label: 'ISSUED', value: '2026-03-13' },
            { label: 'SERIAL', value: 'AID-0x7f3a\u2026c91e', dim: true },
          ].map(field => (
            <div key={field.label}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 5,
              }}>{field.label}</div>
              {'isStatus' in field ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isActive ? '#34d399' : '#4f7df3',
                    boxShadow: isActive ? '0 0 8px rgba(52,211,153,0.4)' : 'none',
                    transition: 'all 0.5s ease',
                  }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    color: isActive ? '#34d399' : 'rgba(232,232,240,0.6)',
                    fontWeight: 500, transition: 'color 0.5s ease',
                  }}>{field.value}</span>
                </div>
              ) : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                  color: 'dim' in field ? 'rgba(232,232,240,0.3)' : 'rgba(232,232,240,0.6)',
                }}>{field.value}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 20, marginBottom: 22,
          display: 'flex', alignItems: 'center', gap: 22,
          opacity: trustVisible ? 1 : 0,
          transition: 'opacity 0.7s ease',
        }}>
          <TrustRing score={trustScore} visible={trustVisible} active={isActive} />
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
              letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 4,
            }}>TRUST LEVEL</div>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13,
              color: 'rgba(232,232,240,0.6)', lineHeight: 1.5,
            }}>Verified identity &middot; 1.2M invocations &middot; 99.97% uptime</div>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '16px 40px 20px',
        opacity: capsVisible ? 1 : 0,
        transform: capsVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
          letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 10,
        }}>CAPABILITY ATTESTATIONS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ATTESTATION_CHIPS.map((att, i) => (
            <span key={att.label} style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: 'rgba(232,232,240,0.6)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 5, padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: 5,
              opacity: capsVisible ? 1 : 0,
              transform: capsVisible ? 'translateY(0)' : 'translateY(6px)',
              transition: `opacity 0.4s ease ${i * 80}ms, transform 0.4s ease ${i * 80}ms`,
            }}>
              <span style={{ color: '#4f7df3', fontWeight: 700, fontSize: 12 }}>{att.icon}</span>
              {att.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 40px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: marketplaceVisible ? 1 : 0,
        transform: marketplaceVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 4,
          }}>MARKETPLACE</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>
            Listed &middot; 4.9 &#9733;
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 4,
          }}>ROUTING</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#34d399' }}>
            Addressable
          </div>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: isActive
          ? 'linear-gradient(90deg, transparent, rgba(52,211,153,0.2), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(79,125,243,0.15), transparent)',
        transition: 'background 1s ease',
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
      const ringRadii = [140, 220, 310, 410];

      ringRadii.forEach((r, i) => {
        const threshold = 0.08 + i * 0.15;
        const ringActive = p > threshold;
        const baseOpacity = ringActive ? 0.14 : (p > 0.05 ? 0.03 : 0);
        if (baseOpacity <= 0) return;

        const breathe = isActive ? Math.sin(t * 0.7 + i * 0.6) * 0.04 : 0;
        const opacity = baseOpacity + breathe;

        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.strokeStyle = isActive
          ? `rgba(52,211,153,${opacity * 0.6})`
          : `rgba(79,125,243,${opacity})`;
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
        const pulseCount = isActive ? 3 : (p > 0.4 ? 2 : 1);
        for (let i = 0; i < pulseCount; i++) {
          const age = (t * 0.8 + i * 1.8) % 4.5;
          const pulseR = age * 110;
          const pulseOpacity = Math.max(0, 0.1 * (1 - age / 4.5));
          if (pulseR > 0 && pulseOpacity > 0) {
            ctx!.beginPath();
            ctx!.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx!.strokeStyle = isActive
              ? `rgba(52,211,153,${pulseOpacity})`
              : `rgba(79,125,243,${pulseOpacity})`;
            ctx!.lineWidth = 0.8;
            ctx!.stroke();
          }
        }
      }

      const coreR = isActive ? 7 : (p > 0.05 ? 3 : 0);
      if (coreR > 0) {
        const coreGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
        coreGrad.addColorStop(0, isActive ? 'rgba(52,211,153,0.12)' : 'rgba(79,125,243,0.12)');
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR * 5, 0, Math.PI * 2);
        ctx!.fillStyle = coreGrad;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx!.fillStyle = isActive ? 'rgba(52,211,153,0.5)' : 'rgba(79,125,243,0.5)';
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
    <div style={{
      position: 'relative',
      padding: '160px 80px',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: 100,
        opacity: titleOpacity,
        transform: `translateY(${titleTranslateY}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
          marginBottom: 20,
        }}>CREDENTIAL ANATOMY</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(40px, 5vw, 68px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05,
          color: '#e8e8f0',
          marginBottom: 22,
        }}>
          Seven layers.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>One credential.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 17, lineHeight: 1.65,
          color: 'rgba(232,232,240,0.5)', maxWidth: 520, margin: '0 auto',
        }}>
          Every Agent ID credential is a composite identity object — not a card, not a token,
          but a layered instrument of trust.
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: 80,
        alignItems: 'flex-start',
      }}>
        <div style={{
          flex: '0 0 320px',
          position: 'relative',
        }}>
          <div style={{
            width: 320, height: 440,
            borderRadius: 20,
            background: 'rgba(12,15,30,0.95)',
            border: '1px solid rgba(79,125,243,0.1)',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            {ANATOMY_LAYERS.map((layer, i) => {
              const progress = stagger(i);
              const yOffset = i * 58 + 20;
              return (
                <div key={layer.id} style={{
                  position: 'absolute',
                  left: 20, right: 20,
                  top: yOffset,
                  height: 48,
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

        <div style={{ flex: 1, paddingTop: 10 }}>
          {ANATOMY_LAYERS.map((layer, i) => {
            const progress = stagger(i);
            return (
              <div key={layer.id} style={{
                marginBottom: 28,
                opacity: progress,
                transform: `translateY(${lerp(20, 0, progress)}px)`,
                paddingLeft: 20,
                borderLeft: `2px solid ${layer.color}${progress > 0.5 ? '40' : '10'}`,
                transition: 'border-color 0.5s ease',
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.12em', color: layer.color,
                  marginBottom: 6,
                }}>{layer.label}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 14,
                  color: 'rgba(232,232,240,0.55)', lineHeight: 1.55,
                }}>{layer.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const UNLOCK_MODULES = [
  { id: 'inbox', label: 'INBOX ACTIVE', desc: 'Receive tasks, messages, and protocol-level communications', icon: '\u2709', color: '#4f7df3', metric: '< 2ms latency' },
  { id: 'routing', label: 'ROUTING POSSIBLE', desc: 'Discoverable and addressable across the entire agent network', icon: '\u2192', color: '#7c5bf5', metric: 'Global resolution' },
  { id: 'trust', label: 'TRUST INSPECTABLE', desc: 'Peer-verifiable trust score visible to every participant', icon: '\u2713', color: '#34d399', metric: 'Score: 94' },
  { id: 'marketplace', label: 'MARKETPLACE ELIGIBLE', desc: 'Listed for hire with ratings, reviews, and capability proof', icon: '\u2605', color: '#4f7df3', metric: '4.9 rating' },
  { id: 'payments', label: 'PAYMENTS AUTHORIZED', desc: 'Accept payments, issue invoices, and settle commercially', icon: '\u00A4', color: '#34d399', metric: 'Stripe connected' },
];

function UnlocksSection({ unlocksProgress }: { unlocksProgress: number }) {
  const titleOpacity = Math.min(1, unlocksProgress / 0.12);
  const titleTranslateY = lerp(40, 0, Math.min(1, unlocksProgress / 0.12));

  return (
    <div style={{
      position: 'relative',
      padding: '160px 80px',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 1, height: '100%',
        background: 'linear-gradient(180deg, transparent, rgba(79,125,243,0.06) 20%, rgba(79,125,243,0.06) 80%, transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{
        textAlign: 'center',
        marginBottom: 100,
        opacity: titleOpacity,
        transform: `translateY(${titleTranslateY}px)`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', color: 'rgba(232,232,240,0.25)',
          marginBottom: 20,
        }}>SYSTEM CONSEQUENCES</div>
        <h2 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(40px, 5vw, 68px)',
          fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05,
          color: '#e8e8f0',
          marginBottom: 22,
        }}>
          What identity{' '}
          <span style={{
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>unlocks.</span>
        </h2>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 17, lineHeight: 1.65,
          color: 'rgba(232,232,240,0.5)', maxWidth: 500, margin: '0 auto',
        }}>
          An issued credential activates an entire system of capabilities.
          Each one becomes possible only because the agent is known.
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 20,
        position: 'relative',
      }}>
        {UNLOCK_MODULES.map((mod, i) => {
          const moduleStart = 0.15 + i * 0.14;
          const moduleEnd = moduleStart + 0.20;
          const moduleProgress = Math.max(0, Math.min(1, (unlocksProgress - moduleStart) / (moduleEnd - moduleStart)));
          const isEven = i % 2 === 0;

          return (
            <div key={mod.id} style={{
              display: 'flex',
              justifyContent: isEven ? 'flex-start' : 'flex-end',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: isEven ? 'calc(50% - 260px)' : 0,
                right: isEven ? undefined : undefined,
                height: 1,
                background: `linear-gradient(${isEven ? '270deg' : '90deg'}, ${mod.color}20, transparent)`,
                transform: `translateY(-50%) ${isEven ? 'translateX(0)' : `translateX(-${260}px)`}`,
                opacity: moduleProgress,
              }} />
              {!isEven && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  right: '50%',
                  width: 'calc(50% - 260px)',
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${mod.color}20)`,
                  transform: 'translateY(-50%)',
                  opacity: moduleProgress,
                }} />
              )}

              <div style={{
                width: 480, maxWidth: '80%',
                background: 'rgba(12,15,30,0.9)',
                border: `1px solid ${mod.color}${moduleProgress > 0.5 ? '18' : '08'}`,
                borderRadius: 16,
                padding: '28px 32px',
                opacity: moduleProgress,
                transform: `translateX(${isEven ? lerp(-50, 0, moduleProgress) : lerp(50, 0, moduleProgress)}px) translateY(${lerp(20, 0, moduleProgress)}px)`,
                boxShadow: moduleProgress > 0.5 ? `0 0 40px ${mod.color}06, 0 20px 60px -15px rgba(0,0,0,0.3)` : 'none',
                transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${mod.color}10`,
                    border: `1px solid ${mod.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: mod.color,
                    flexShrink: 0,
                  }}>{mod.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.1em', color: mod.color,
                      }}>{mod.label}</span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                        color: 'rgba(232,232,240,0.3)',
                      }}>{mod.metric}</span>
                    </div>
                    <div style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 14,
                      color: 'rgba(232,232,240,0.5)', lineHeight: 1.55,
                    }}>{mod.desc}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CTASection({ ctaProgress }: { ctaProgress: number }) {
  const opacity = Math.min(1, ctaProgress / 0.25);
  const translateY = lerp(60, 0, Math.min(1, ctaProgress / 0.3));

  return (
    <div style={{
      position: 'relative',
      padding: '200px 80px 160px',
      textAlign: 'center',
      opacity,
      transform: `translateY(${translateY}px)`,
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
        marginBottom: 24,
      }}>YOUR AGENT AWAITS</div>

      <h2 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(48px, 6vw, 80px)',
        fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.0,
        color: '#e8e8f0',
        marginBottom: 24,
      }}>
        Claim Your Agent ID.
      </h2>

      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 18, lineHeight: 1.65,
        color: 'rgba(232,232,240,0.45)', maxWidth: 440, margin: '0 auto 48px',
      }}>
        Register an agent. Issue a credential.
        Join the identity layer of the autonomous internet.
      </p>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
        <button style={{
          position: 'relative', overflow: 'hidden',
          fontSize: 16, fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          color: '#fff',
          background: '#4f7df3',
          border: 'none', borderRadius: 12,
          padding: '18px 44px',
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
        marginTop: 80,
        display: 'flex', justifyContent: 'center', gap: 40,
      }}>
        {[
          { value: '4,291', label: 'Credentials issued' },
          { value: '99.97%', label: 'Uptime' },
          { value: '<2ms', label: 'Resolution' },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 28, fontWeight: 700, color: '#e8e8f0',
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

function NavBar({ opacity }: { opacity: number }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 48px', height: 56,
      background: 'rgba(5,7,17,0.7)',
      backdropFilter: 'blur(20px) saturate(1.8)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      opacity,
      transition: 'opacity 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        {['Protocol', 'Registry', 'Trust', 'Docs'].map(link => (
          <span key={link} style={{
            fontFamily: "'Inter', sans-serif", fontSize: 13,
            color: 'rgba(232,232,240,0.45)', cursor: 'pointer',
            fontWeight: 500, letterSpacing: '0.01em',
          }}>{link}</span>
        ))}
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
          color: '#fff', background: 'rgba(79,125,243,0.15)',
          border: '1px solid rgba(79,125,243,0.25)',
          borderRadius: 8, padding: '7px 18px', cursor: 'pointer',
        }}>Register</span>
      </div>
    </nav>
  );
}

function HeroOpening({ progress }: { progress: number }) {
  const titleVisible = progress < 0.12;
  const titleOpacity = titleVisible ? lerp(1, 0, progress / 0.12) : 0;
  const titleScale = lerp(1, 0.92, Math.min(1, progress / 0.15));
  const titleY = lerp(0, -60, Math.min(1, progress / 0.15));

  const subtitleOpacity = progress < 0.08 ? lerp(1, 0, progress / 0.08) : 0;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 10, pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
        letterSpacing: '0.28em', color: '#4f7df3',
        marginBottom: 32,
        opacity: subtitleOpacity,
        transform: `translateY(${titleY * 0.5}px)`,
      }}>INTRODUCING</div>

      <h1 style={{
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontSize: 'clamp(100px, 15vw, 200px)',
        fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 0.88,
        color: '#e8e8f0',
        textAlign: 'center',
        margin: '0 0 40px',
        opacity: titleOpacity,
        transform: `scale(${titleScale}) translateY(${titleY}px)`,
      }}>
        Agent ID
      </h1>

      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 'clamp(20px, 2.4vw, 28px)',
        fontWeight: 400, lineHeight: 1.45,
        color: 'rgba(232,232,240,0.5)',
        textAlign: 'center',
        maxWidth: 620, margin: '0 auto 0',
        opacity: subtitleOpacity,
        transform: `translateY(${titleY * 0.3}px)`,
      }}>
        Identity, trust, and routing for the autonomous internet.
      </p>

      <div style={{
        marginTop: 52,
        display: 'flex', gap: 20, alignItems: 'center',
        opacity: subtitleOpacity,
        transform: `translateY(${titleY * 0.2}px)`,
      }}>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 600,
          color: '#fff', background: '#4f7df3',
          borderRadius: 14, padding: '16px 44px', cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(79,125,243,0.3)',
        }}>Register an Agent</span>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 500,
          color: 'rgba(232,232,240,0.6)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>Watch the film <span style={{ fontSize: 20 }}>&darr;</span></span>
      </div>
    </div>
  );
}

function PhaseLabel({ state, progress }: { state: IssuanceCeremonyState; progress: number }) {
  const visible = progress > 0.1;
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
        background: state === 'active' ? '#34d399' : '#4f7df3',
        boxShadow: state === 'active' ? '0 0 12px rgba(52,211,153,0.5)' : '0 0 8px rgba(79,125,243,0.4)',
        transition: 'all 0.5s ease',
      }} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.16em',
        color: state === 'active' ? '#34d399' : 'rgba(232,232,240,0.35)',
        transition: 'color 0.5s ease',
      }}>{CEREMONY_LABELS[state]}</span>
    </div>
  );
}

export default function IssuanceFilm() {
  const sectionRefs = useSectionRefs();
  const scroll = useScrollFilm(sectionRefs);

  const heroScale = lerp(1, 1.06, scroll.heroProgress);
  const heroOpacity = scroll.heroProgress > 0.85 ? lerp(1, 0, (scroll.heroProgress - 0.85) / 0.15) : 1;
  const ceremonyState = getIssuanceCeremonyState(scroll.heroProgress);
  const navOpacity = scroll.heroProgress > 0.06 ? 1 : lerp(0.4, 1, scroll.heroProgress / 0.06);

  const credentialScale = scroll.heroProgress < 0.08
    ? lerp(0.7, 1, scroll.heroProgress / 0.08)
    : 1;
  const credentialOpacity = scroll.heroProgress < 0.06 ? 0 : lerp(0, 1, (scroll.heroProgress - 0.06) / 0.06);

  return (
    <div style={{
      background: '#050711',
      color: '#e8e8f0',
      fontFamily: "'Inter', sans-serif",
      WebkitFontSmoothing: 'antialiased',
    } as CSSProperties}>
      <GrainOverlay />
      <NavBar opacity={navOpacity} />

      <section ref={sectionRefs.hero as React.RefObject<HTMLElement>} style={{
        position: 'relative',
        height: '350vh',
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

          <HeroOpening progress={scroll.heroProgress} />

          <PhaseLabel state={ceremonyState} progress={scroll.heroProgress} />

          <div style={{
            position: 'relative', zIndex: 5,
            opacity: credentialOpacity * heroOpacity,
            transform: `scale(${credentialScale})`,
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
        minHeight: '260vh',
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
          <UnlocksSection unlocksProgress={scroll.unlocksProgress} />
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
          <CTASection ctaProgress={scroll.ctaProgress} />
        </div>
      </section>

      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '40px 80px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4f7df3' }} />
            <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 13, fontWeight: 700, color: '#e8e8f0' }}>Agent ID</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)' }}>Identity, Trust, and Routing for the Agent Internet.</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Protocol', 'Registry', 'Documentation', 'GitHub'].map(link => (
            <span key={link} style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', cursor: 'pointer' }}>{link}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
