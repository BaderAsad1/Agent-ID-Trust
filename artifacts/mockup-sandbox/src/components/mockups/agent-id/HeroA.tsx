import { useRef, useEffect } from 'react';
import './_shared/concept/hero.css';
import { useIssuanceAnimation } from './_shared/concept/useIssuanceAnimation';
import type { IssuancePhase } from './_shared/concept/useIssuanceAnimation';
import { IssuanceCredential } from './_shared/concept/IssuanceCredential';

const RING_RADII = [160, 240, 320, 400];

interface ServiceNode {
  label: string;
  angle: number;
  ring: 0 | 1 | 2 | 3;
  phase: 'domainBinding' | 'trustIssuance' | 'capabilities' | 'marketplace';
}

const SERVICES: ServiceNode[] = [
  { label: 'REGISTRY',    angle: -60,  ring: 1, phase: 'domainBinding' },
  { label: 'TRUST',       angle: 30,   ring: 1, phase: 'trustIssuance' },
  { label: 'ROUTER',      angle: 150,  ring: 2, phase: 'domainBinding' },
  { label: 'GATEWAY',     angle: -30,  ring: 2, phase: 'trustIssuance' },
  { label: 'MARKETPLACE', angle: 100,  ring: 3, phase: 'marketplace' },
  { label: 'PAYMENTS',    angle: -100, ring: 3, phase: 'capabilities' },
  { label: 'ATTESTATION', angle: 180,  ring: 3, phase: 'marketplace' },
  { label: 'INBOX',       angle: 60,   ring: 2, phase: 'capabilities' },
];

const PHASE_STEPS: { key: keyof IssuancePhase; label: string }[] = [
  { key: 'frame', label: 'IDENTITY RESOLUTION' },
  { key: 'domain', label: 'DOMAIN BINDING' },
  { key: 'trustRing', label: 'TRUST ISSUANCE' },
  { key: 'capabilities', label: 'CAPABILITY ATTESTATION' },
  { key: 'systemReady', label: 'SYSTEM ACTIVE' },
];

function isPhaseActive(phase: IssuancePhase, key: ServiceNode['phase']): boolean {
  if (key === 'domainBinding') return phase.domain;
  if (key === 'trustIssuance') return phase.trustRing;
  if (key === 'capabilities') return phase.capabilities;
  if (key === 'marketplace') return phase.marketplace;
  return false;
}

function ProtocolRings({ phase }: { phase: IssuancePhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 900;
    const H = 900;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const cx = W / 2;
    const cy = H / 2;

    const startTime = performance.now();

    function draw(now: number) {
      const t = (now - startTime) / 1000;
      const p = phaseRef.current;
      ctx!.clearRect(0, 0, W, H);

      RING_RADII.forEach((r, i) => {
        const phaseKeys: (keyof IssuancePhase)[] = ['frame', 'domain', 'trustRing', 'capabilities'];
        const active = Boolean(p[phaseKeys[i] ?? 'frame']);
        const baseOpacity = active ? 0.18 : (p.frame ? 0.04 : 0);

        if (baseOpacity <= 0) return;

        const breathe = p.systemReady ? Math.sin(t * 0.8 + i * 0.5) * 0.04 : 0;
        const opacity = baseOpacity + breathe;

        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        if (active && !p.systemReady) {
          const grad = ctx!.createRadialGradient(cx, cy, r - 2, cx, cy, r + 2);
          grad.addColorStop(0, `rgba(79,125,243,0)`);
          grad.addColorStop(0.5, `rgba(79,125,243,${opacity})`);
          grad.addColorStop(1, `rgba(79,125,243,0)`);
          ctx!.strokeStyle = `rgba(79,125,243,${opacity})`;
        } else if (p.systemReady) {
          ctx!.strokeStyle = `rgba(52,211,153,${opacity * 0.7})`;
        } else {
          ctx!.strokeStyle = `rgba(79,125,243,${opacity})`;
        }
        ctx!.lineWidth = active ? 1.5 : 0.5;
        ctx!.stroke();

        if (active) {
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(79,125,243,${opacity * 0.3})`;
          ctx!.lineWidth = 8;
          ctx!.stroke();
        }
      });

      if (p.frame) {
        const pulseCount = p.systemReady ? 3 : (p.trustRing ? 2 : 1);
        for (let i = 0; i < pulseCount; i++) {
          const age = (t + i * 1.5) % 4;
          const pulseR = age * 130;
          const pulseOpacity = Math.max(0, 0.15 * (1 - age / 4));
          if (pulseR > 0 && pulseOpacity > 0) {
            ctx!.beginPath();
            ctx!.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx!.strokeStyle = p.systemReady
              ? `rgba(52,211,153,${pulseOpacity})`
              : `rgba(79,125,243,${pulseOpacity})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }
      }

      SERVICES.forEach((svc) => {
        const active = isPhaseActive(p, svc.phase);
        if (!active && !p.frame) return;
        const r = RING_RADII[svc.ring];
        if (r === undefined) return;
        const rad = (svc.angle * Math.PI) / 180;
        const x = cx + Math.cos(rad) * r;
        const y = cy + Math.sin(rad) * r;

        if (active) {
          ctx!.beginPath();
          ctx!.moveTo(cx, cy);
          ctx!.lineTo(x, y);
          ctx!.strokeStyle = p.systemReady
            ? 'rgba(52,211,153,0.06)'
            : 'rgba(79,125,243,0.06)';
          ctx!.lineWidth = 0.5;
          ctx!.setLineDash([4, 6]);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }

        const dotSize = active ? 4 : 1.5;
        const dotOpacity = active ? 0.8 : 0.15;
        ctx!.beginPath();
        ctx!.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx!.fillStyle = active && p.systemReady
          ? `rgba(52,211,153,${dotOpacity})`
          : `rgba(79,125,243,${dotOpacity})`;
        ctx!.fill();

        if (active) {
          ctx!.beginPath();
          ctx!.arc(x, y, 12, 0, Math.PI * 2);
          ctx!.strokeStyle = p.systemReady
            ? 'rgba(52,211,153,0.12)'
            : 'rgba(79,125,243,0.12)';
          ctx!.lineWidth = 0.5;
          ctx!.stroke();

          ctx!.font = '500 7.5px "JetBrains Mono", monospace';
          ctx!.textAlign = 'center';
          ctx!.fillStyle = active && p.systemReady
            ? 'rgba(232,232,240,0.45)'
            : 'rgba(232,232,240,0.25)';
          ctx!.fillText(svc.label, x, y + (svc.angle < 0 ? -18 : 22));
        }
      });

      const coreR = p.systemReady ? 6 : (p.frame ? 3 : 0);
      if (coreR > 0) {
        const coreGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
        coreGrad.addColorStop(0, p.systemReady ? 'rgba(52,211,153,0.15)' : 'rgba(79,125,243,0.15)');
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
        ctx!.fillStyle = coreGrad;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx!.fillStyle = p.systemReady ? 'rgba(52,211,153,0.6)' : 'rgba(79,125,243,0.6)';
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
      width: 900, height: 900,
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    }} />
  );
}

function PhaseTimeline({ phase }: { phase: IssuancePhase }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      marginTop: 40,
    }}>
      {PHASE_STEPS.map((step, i) => {
        const active = Boolean(phase[step.key]);
        const isLast = i === PHASE_STEPS.length - 1;
        return (
          <div key={step.key} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            opacity: active ? 1 : 0.25,
            transition: `opacity 0.6s ease ${i * 80}ms`,
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              minHeight: isLast ? 20 : 36,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: active
                  ? (phase.systemReady && isLast ? 'var(--trust-green)' : 'var(--accent)')
                  : 'rgba(255,255,255,0.1)',
                boxShadow: active
                  ? (phase.systemReady && isLast
                    ? '0 0 12px var(--trust-glow)'
                    : '0 0 8px rgba(79,125,243,0.4)')
                  : 'none',
                transition: 'background 0.4s ease, box-shadow 0.4s ease',
                flexShrink: 0,
              }} />
              {!isLast && (
                <div style={{
                  width: 1, flex: 1, minHeight: 20,
                  background: active
                    ? 'rgba(79,125,243,0.2)'
                    : 'rgba(255,255,255,0.04)',
                  transition: 'background 0.6s ease',
                }} />
              )}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: active
                ? (phase.systemReady && isLast ? 'var(--trust-green)' : 'var(--text-secondary)')
                : 'var(--text-muted)',
              transition: 'color 0.4s ease',
              paddingTop: 0,
              lineHeight: '8px',
            }}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function HeroA() {
  const phase = useIssuanceAnimation(94);

  return (
    <div className="hero-page" style={{
      display: 'flex',
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-hero-a">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#grain-hero-a)', opacity: 0.025, mixBlendMode: 'overlay',
      }} />

      <div style={{
        flex: '0 0 44%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 60px 0 80px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'var(--accent)',
          marginBottom: 24,
          opacity: phase.frame ? 1 : 0,
          transform: phase.frame ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.8s ease, transform 0.8s ease',
        }}>AGENT ID</div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 4.5vw, 56px)',
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          opacity: phase.frame ? 1 : 0,
          transform: phase.frame ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 1s ease 0.2s, transform 1s ease 0.2s',
          marginBottom: 20,
        }}>
          Every agent{' '}
          <br />
          deserves an{' '}
          <span style={{
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>identity.</span>
        </h1>

        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          lineHeight: 1.65,
          color: 'var(--text-secondary)',
          maxWidth: 400,
          opacity: phase.identity ? 1 : 0,
          transform: phase.identity ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.8s ease, transform 0.8s ease',
          marginBottom: 0,
        }}>
          The identity and trust layer for autonomous agents.
          Verified credentials, portable trust scores, and protocol-native resolution —
          the missing primitive for the agentic internet.
        </p>

        <PhaseTimeline phase={phase} />

        <div style={{
          marginTop: 40,
          display: 'flex', alignItems: 'center', gap: 16,
          opacity: phase.systemReady ? 1 : 0,
          transform: phase.systemReady ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>
          <button style={{
            fontSize: 15, fontWeight: 600,
            fontFamily: 'var(--font-body)',
            color: '#fff',
            background: 'var(--accent)',
            border: 'none', borderRadius: 10,
            padding: '14px 32px',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            boxShadow: '0 4px 24px rgba(79,125,243,0.3)',
          }}>
            Claim Your Agent ID
          </button>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: '0.02em',
          }}>Free to start</span>
        </div>
      </div>

      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ProtocolRings phase={phase} />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <IssuanceCredential phase={phase} />
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(79,125,243,0.08), transparent)',
      }} />
    </div>
  );
}
