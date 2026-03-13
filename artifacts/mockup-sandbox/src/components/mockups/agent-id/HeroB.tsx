import { useRef, useEffect } from 'react';
import './_shared/concept/hero.css';
import { useIssuanceAnimation } from './_shared/concept/useIssuanceAnimation';
import { IssuanceCredential } from './_shared/concept/IssuanceCredential';
import type { IssuancePhase } from './_shared/concept/useIssuanceAnimation';
import { getStateLabel } from './_shared/concept/useIssuanceAnimation';

interface NetworkNode {
  x: number;
  y: number;
  label: string;
  phase: 'identity' | 'domain' | 'trustRing' | 'capabilities' | 'marketplace';
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

const NODE_DEFS: Omit<NetworkNode, 'vx' | 'vy' | 'baseX' | 'baseY'>[] = [
  { x: 0.12, y: 0.18, label: 'REGISTRY',    phase: 'domain' },
  { x: 0.88, y: 0.15, label: 'GATEWAY',     phase: 'identity' },
  { x: 0.08, y: 0.50, label: 'ATTESTATION', phase: 'trustRing' },
  { x: 0.92, y: 0.48, label: 'ROUTER',      phase: 'domain' },
  { x: 0.15, y: 0.82, label: 'MARKETPLACE', phase: 'marketplace' },
  { x: 0.85, y: 0.80, label: 'PAYMENTS',    phase: 'capabilities' },
  { x: 0.35, y: 0.10, label: 'TRUST',       phase: 'trustRing' },
  { x: 0.65, y: 0.90, label: 'INBOX',       phase: 'capabilities' },
  { x: 0.25, y: 0.65, label: 'RESOLVER',    phase: 'identity' },
  { x: 0.78, y: 0.30, label: 'VALIDATOR',   phase: 'marketplace' },
];

const EDGES: [number, number][] = [
  [0, 2], [0, 6], [1, 3], [1, 9], [2, 4], [2, 8],
  [3, 5], [3, 9], [4, 7], [4, 8], [5, 7], [6, 9],
  [0, 8], [1, 6], [5, 9], [7, 8],
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

function NetworkCanvas({ phase }: { phase: IssuancePhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const phaseRef = useRef(phase);
  const nodesRef = useRef<NetworkNode[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 1280;
    const H = 900;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;

    nodesRef.current = NODE_DEFS.map(d => ({
      ...d,
      x: d.x * W,
      y: d.y * H,
      baseX: d.x * W,
      baseY: d.y * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));

    const startTime = performance.now();

    function spawnParticle(fromX: number, fromY: number, toX: number, toY: number) {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 1.5;
      particlesRef.current.push({
        x: fromX,
        y: fromY,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        life: 0,
        maxLife: dist / speed,
        size: 1.5 + Math.random(),
      });
    }

    function isNodeActive(p: IssuancePhase, key: string): boolean {
      return Boolean(p[key as keyof IssuancePhase]);
    }

    function draw(now: number) {
      const t = (now - startTime) / 1000;
      const p = phaseRef.current;
      const nodes = nodesRef.current;
      ctx!.clearRect(0, 0, W, H);

      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        const dx = n.x - n.baseX;
        const dy = n.y - n.baseY;
        n.vx -= dx * 0.008;
        n.vy -= dy * 0.008;
        n.vx *= 0.995;
        n.vy *= 0.995;
        n.vx += (Math.random() - 0.5) * 0.05;
        n.vy += (Math.random() - 0.5) * 0.05;
      });

      EDGES.forEach(([a, b]) => {
        const na = nodes[a];
        const nb = nodes[b];
        if (!na || !nb) return;
        const activeA = isNodeActive(p, na.phase);
        const activeB = isNodeActive(p, nb.phase);
        const bothActive = activeA && activeB;

        const opacity = bothActive
          ? (p.systemReady ? 0.15 : 0.10)
          : (p.frame ? 0.025 : 0);
        if (opacity <= 0) return;

        ctx!.beginPath();
        ctx!.moveTo(na.x, na.y);
        ctx!.lineTo(nb.x, nb.y);

        if (bothActive && p.systemReady) {
          ctx!.strokeStyle = `rgba(52,211,153,${opacity})`;
        } else {
          ctx!.strokeStyle = `rgba(79,125,243,${opacity})`;
        }
        ctx!.lineWidth = bothActive ? 1 : 0.5;
        ctx!.stroke();

        if (bothActive && Math.random() < 0.008) {
          spawnParticle(na.x, na.y, nb.x, nb.y);
        }
      });

      nodes.forEach(n => {
        const active = isNodeActive(p, n.phase);

        const toCenterDx = cx - n.x;
        const toCenterDy = cy - n.y;
        const toCenterDist = Math.sqrt(toCenterDx * toCenterDx + toCenterDy * toCenterDy);
        const centerOpacity = active
          ? (p.systemReady ? 0.08 : 0.04)
          : 0;

        if (centerOpacity > 0) {
          ctx!.beginPath();
          ctx!.moveTo(n.x, n.y);
          ctx!.lineTo(cx, cy);
          ctx!.strokeStyle = p.systemReady
            ? `rgba(52,211,153,${centerOpacity})`
            : `rgba(79,125,243,${centerOpacity})`;
          ctx!.lineWidth = 0.5;
          ctx!.setLineDash([6, 8]);
          ctx!.stroke();
          ctx!.setLineDash([]);
        }

        if (active && Math.random() < 0.006 && toCenterDist > 60) {
          spawnParticle(n.x, n.y, cx, cy);
        }

        const nodeR = active ? 5 : (p.frame ? 2 : 0);
        if (nodeR <= 0) return;

        if (active) {
          const glowR = 30 + Math.sin(t * 2 + n.baseX * 0.01) * 5;
          const glow = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          glow.addColorStop(0, p.systemReady
            ? 'rgba(52,211,153,0.08)'
            : 'rgba(79,125,243,0.08)');
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx!.fillStyle = glow;
          ctx!.fill();
        }

        ctx!.beginPath();
        ctx!.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
        ctx!.fillStyle = active
          ? (p.systemReady ? 'rgba(52,211,153,0.8)' : 'rgba(79,125,243,0.7)')
          : 'rgba(79,125,243,0.2)';
        ctx!.fill();

        if (active) {
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, 14, 0, Math.PI * 2);
          ctx!.strokeStyle = p.systemReady
            ? 'rgba(52,211,153,0.15)'
            : 'rgba(79,125,243,0.15)';
          ctx!.lineWidth = 0.5;
          ctx!.stroke();
        }

        ctx!.font = '600 8px "JetBrains Mono", monospace';
        ctx!.textAlign = 'center';
        ctx!.fillStyle = active
          ? (p.systemReady ? 'rgba(232,232,240,0.55)' : 'rgba(232,232,240,0.40)')
          : 'rgba(232,232,240,0.08)';
        ctx!.fillText(n.label, n.x, n.y - 18);
      });

      particlesRef.current = particlesRef.current.filter(pt => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;
        if (pt.life > pt.maxLife) return false;

        const progress = pt.life / pt.maxLife;
        const alpha = Math.sin(progress * Math.PI) * 0.6;
        ctx!.beginPath();
        ctx!.arc(pt.x, pt.y, pt.size * (1 - progress * 0.5), 0, Math.PI * 2);
        ctx!.fillStyle = p.systemReady
          ? `rgba(52,211,153,${alpha})`
          : `rgba(79,125,243,${alpha})`;
        ctx!.fill();
        return true;
      });

      if (p.systemReady) {
        const pulseR = 50 + Math.sin(t * 1.2) * 10;
        const coreGlow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
        coreGlow.addColorStop(0, 'rgba(52,211,153,0.06)');
        coreGlow.addColorStop(1, 'rgba(52,211,153,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx!.fillStyle = coreGlow;
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

function HUDOverlay({ phase }: { phase: IssuancePhase }) {
  const label = getStateLabel(phase.state);
  const isActive = phase.state === 'active';

  return (
    <>
      <div style={{
        position: 'absolute', top: 32, left: 40,
        zIndex: 10, pointerEvents: 'none',
        opacity: phase.frame ? 1 : 0,
        transform: phase.frame ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'var(--accent)',
          marginBottom: 8,
        }}>AGENT ID</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isActive ? 'var(--trust-green)' : 'var(--accent)',
            boxShadow: isActive
              ? '0 0 10px var(--trust-glow)'
              : '0 0 6px rgba(79,125,243,0.4)',
            transition: 'all 0.4s ease',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 600,
            letterSpacing: '0.14em',
            color: isActive ? 'var(--trust-green)' : 'var(--accent)',
            transition: 'color 0.4s ease',
          }}>{label}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 32, right: 40,
        zIndex: 10, pointerEvents: 'none',
        opacity: phase.trustRing ? 1 : 0,
        transition: 'opacity 0.6s ease',
        textAlign: 'right',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 600,
          letterSpacing: '0.12em',
          color: 'var(--text-label)',
          marginBottom: 4,
        }}>TRUST SCORE</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28, fontWeight: 700,
          color: 'var(--trust-green)',
          lineHeight: 1,
        }}>{phase.trustCount}</div>
      </div>

      <div style={{
        position: 'absolute', bottom: 32, left: 40,
        zIndex: 10, pointerEvents: 'none',
        display: 'flex', gap: 24,
        opacity: phase.domain ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }}>
        {[
          { label: 'NODES', value: phase.systemReady ? '10' : String(
            (phase.identity ? 2 : 0) + (phase.domain ? 2 : 0) +
            (phase.trustRing ? 2 : 0) + (phase.capabilities ? 2 : 0) +
            (phase.marketplace ? 2 : 0)
          )},
          { label: 'EDGES', value: phase.systemReady ? '16' : '—' },
          { label: 'LATENCY', value: phase.systemReady ? '2ms' : '—' },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8, fontWeight: 600,
              letterSpacing: '0.14em',
              color: 'var(--text-label)',
              marginBottom: 3,
            }}>{stat.label}</div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14, fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>{stat.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function HeroB() {
  const phase = useIssuanceAnimation(94);

  return (
    <div className="hero-page" style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <svg style={{ position: 'fixed', width: 0, height: 0 }}>
        <filter id="grain-hero-b">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        filter: 'url(#grain-hero-b)', opacity: 0.025, mixBlendMode: 'overlay',
      }} />

      <NetworkCanvas phase={phase} />

      <HUDOverlay phase={phase} />

      <div style={{
        position: 'relative', zIndex: 5,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div style={{
          position: 'relative', zIndex: 3,
        }}>
          <IssuanceCredential phase={phase} />
        </div>

        <div style={{
          marginTop: 28,
          textAlign: 'center',
          opacity: phase.identity ? 1 : 0,
          transform: phase.identity ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 1s ease, transform 1s ease',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 2.5vw, 28px)',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 16,
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

        <div style={{
          opacity: phase.systemReady ? 1 : 0,
          transform: phase.systemReady ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>
          <button style={{
            fontSize: 14, fontWeight: 600,
            fontFamily: 'var(--font-body)',
            color: '#fff', background: 'var(--accent)',
            border: 'none', borderRadius: 10, padding: '13px 28px',
            cursor: 'pointer', letterSpacing: '-0.01em',
            boxShadow: '0 4px 24px rgba(79,125,243,0.3)',
          }}>
            Claim Your Agent ID
          </button>
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
