import { useRef, useEffect } from 'react';
import './_shared/concept/hero.css';
import { useIssuanceAnimation } from './_shared/concept/useIssuanceAnimation';
import { IssuanceCredential } from './_shared/concept/IssuanceCredential';
import type { IssuancePhase } from './_shared/concept/useIssuanceAnimation';

interface FieldRing {
  radius: number;
  particleCount: number;
  speed: number;
  size: number;
  opacity: number;
}

const FIELD_RINGS: FieldRing[] = [
  { radius: 200, particleCount: 12, speed: 40, size: 2.5, opacity: 0.5 },
  { radius: 280, particleCount: 16, speed: 55, size: 2, opacity: 0.35 },
  { radius: 360, particleCount: 20, speed: 75, size: 1.5, opacity: 0.25 },
  { radius: 440, particleCount: 14, speed: 95, size: 1.2, opacity: 0.15 },
];

function getPhaseProgress(phase: IssuancePhase): number {
  if (phase.systemReady) return 5;
  if (phase.marketplace) return 4;
  if (phase.capabilities) return 3;
  if (phase.trustRing) return 2;
  if (phase.domain) return 1;
  return 0;
}

function GravityField({ phase }: { phase: IssuancePhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1280;
    const H = 900;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const cxC = W / 2;
    const cyC = H / 2;

    interface Particle {
      angle: number;
      baseRadius: number;
      radius: number;
      speed: number;
      size: number;
      opacity: number;
      ring: number;
    }

    const particles: Particle[] = [];
    FIELD_RINGS.forEach((ring, ri) => {
      for (let j = 0; j < ring.particleCount; j++) {
        particles.push({
          angle: (j / ring.particleCount) * Math.PI * 2 + ri * 0.3,
          baseRadius: ring.radius,
          radius: ring.radius,
          speed: ring.speed + (Math.random() - 0.5) * 10,
          size: ring.size,
          opacity: ring.opacity,
          ring: ri,
        });
      }
    });

    let startTime = performance.now();

    function draw(now: number) {
      const elapsed = (now - startTime) / 1000;
      const p = phaseRef.current;
      const progress = getPhaseProgress(p);
      const isActive = p.systemReady;

      ctx!.clearRect(0, 0, W, H);

      if (p.frame) {
        FIELD_RINGS.forEach((ring, i) => {
          const ringProgress = Math.min(progress / (i + 1), 1);
          const ringOpacity = isActive ? 0.04 : 0.02 * ringProgress;
          if (ringOpacity > 0) {
            ctx!.beginPath();
            ctx!.arc(cxC, cyC, ring.radius, 0, Math.PI * 2);
            ctx!.strokeStyle = `rgba(79,125,243,${ringOpacity})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        });
      }

      particles.forEach((pt) => {
        const ringActive = progress > pt.ring;
        const baseAngle = elapsed / pt.speed;

        if (isActive) {
          pt.radius = pt.baseRadius + Math.sin(elapsed * 0.5 + pt.angle) * 8;
          pt.angle += 0.003;
        } else if (ringActive) {
          const pullStrength = Math.min((progress - pt.ring) * 0.15, 0.6);
          pt.radius = pt.baseRadius * (1 - pullStrength * 0.3);
          pt.angle += 0.004;
        } else {
          pt.angle += 0.002;
        }

        const drawAngle = pt.angle + baseAngle;
        const x = cxC + Math.cos(drawAngle) * pt.radius;
        const y = cyC + Math.sin(drawAngle) * pt.radius;

        const alpha = isActive
          ? pt.opacity * 1.2
          : ringActive
            ? pt.opacity * 0.8
            : pt.opacity * 0.3;

        const color = isActive
          ? `rgba(52,211,153,${alpha})`
          : `rgba(79,125,243,${alpha})`;

        ctx!.beginPath();
        ctx!.arc(x, y, pt.size, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.fill();

        if (ringActive && !isActive) {
          ctx!.beginPath();
          ctx!.moveTo(x, y);
          const pullX = cxC + (x - cxC) * 0.3;
          const pullY = cyC + (y - cyC) * 0.3;
          ctx!.lineTo(pullX, pullY);
          ctx!.strokeStyle = `rgba(79,125,243,${alpha * 0.3})`;
          ctx!.lineWidth = 0.3;
          ctx!.stroke();
        }

        if (isActive) {
          const trailLen = 3;
          for (let t = 1; t <= trailLen; t++) {
            const tAngle = drawAngle - t * 0.015;
            const tx = cxC + Math.cos(tAngle) * pt.radius;
            const ty = cyC + Math.sin(tAngle) * pt.radius;
            ctx!.beginPath();
            ctx!.arc(tx, ty, pt.size * (1 - t * 0.25), 0, Math.PI * 2);
            ctx!.fillStyle = `rgba(52,211,153,${alpha * (1 - t / (trailLen + 1)) * 0.4})`;
            ctx!.fill();
          }
        }
      });

      if (isActive) {
        const pulseR = 60 + Math.sin(elapsed * 1.5) * 8;
        const gradient = ctx!.createRadialGradient(cxC, cyC, 0, cxC, cyC, pulseR);
        gradient.addColorStop(0, 'rgba(52,211,153,0.04)');
        gradient.addColorStop(1, 'rgba(52,211,153,0)');
        ctx!.beginPath();
        ctx!.arc(cxC, cyC, pulseR, 0, Math.PI * 2);
        ctx!.fillStyle = gradient;
        ctx!.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none',
    }} />
  );
}

export default function HeroC() {
  const phase = useIssuanceAnimation(94);

  return (
    <div className="hero-page" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', position: 'relative',
    }}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-hero-c">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#grain-hero-c)', opacity: 0.02, mixBlendMode: 'overlay',
      }} />

      <GravityField phase={phase} />

      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        maxWidth: 460, marginBottom: 32, padding: '0 24px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 2.8vw, 34px)',
          fontWeight: 600,
          lineHeight: 1.2,
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
