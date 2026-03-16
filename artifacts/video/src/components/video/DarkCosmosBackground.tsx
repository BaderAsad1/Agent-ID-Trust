import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';

interface Props {
  phase: 'cold' | 'warming' | 'warm' | 'hot' | 'cooling';
}

interface BlobConfig {
  baseX: number;
  baseY: number;
  driftRadiusX: number;
  driftRadiusY: number;
  driftSpeed: number;
  size: string;
}

const BLOB_CONFIGS: BlobConfig[] = [
  { baseX: 25, baseY: 35, driftRadiusX: 8, driftRadiusY: 6, driftSpeed: 0.0003, size: '45vw' },
  { baseX: 70, baseY: 60, driftRadiusX: 10, driftRadiusY: 8, driftSpeed: 0.00025, size: '55vw' },
  { baseX: 50, baseY: 20, driftRadiusX: 12, driftRadiusY: 5, driftSpeed: 0.0004, size: '40vw' },
  { baseX: 30, baseY: 75, driftRadiusX: 7, driftRadiusY: 9, driftSpeed: 0.00035, size: '35vw' },
  { baseX: 80, baseY: 30, driftRadiusX: 9, driftRadiusY: 7, driftSpeed: 0.00028, size: '50vw' },
];

interface PhaseColors {
  colors: string[];
  scale: number;
}

const PHASE_COLOR_MAP: Record<string, PhaseColors> = {
  cold: {
    colors: [
      'rgba(79,125,243,0.25)',
      'rgba(79,125,243,0.15)',
      'rgba(124,91,245,0.1)',
      'rgba(52,211,153,0.05)',
      'rgba(124,91,245,0.08)',
    ],
    scale: 1,
  },
  warming: {
    colors: [
      'rgba(79,125,243,0.3)',
      'rgba(124,91,245,0.2)',
      'rgba(124,91,245,0.18)',
      'rgba(52,211,153,0.12)',
      'rgba(52,211,153,0.1)',
    ],
    scale: 1.15,
  },
  warm: {
    colors: [
      'rgba(79,125,243,0.3)',
      'rgba(124,91,245,0.25)',
      'rgba(52,211,153,0.2)',
      'rgba(52,211,153,0.18)',
      'rgba(124,91,245,0.15)',
    ],
    scale: 1.25,
  },
  hot: {
    colors: [
      'rgba(79,125,243,0.35)',
      'rgba(124,91,245,0.3)',
      'rgba(52,211,153,0.28)',
      'rgba(52,211,153,0.22)',
      'rgba(79,125,243,0.2)',
    ],
    scale: 1.4,
  },
  cooling: {
    colors: [
      'rgba(79,125,243,0.15)',
      'rgba(124,91,245,0.12)',
      'rgba(124,91,245,0.08)',
      'rgba(52,211,153,0.06)',
      'rgba(52,211,153,0.04)',
    ],
    scale: 0.85,
  },
};

const STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: `${Math.random() * 100}%`,
  y: `${Math.random() * 100}%`,
  size: 0.5 + Math.random() * 1.5,
  delay: Math.random() * 5,
  duration: 3 + Math.random() * 4,
}));

function GsapBlob({ config, color, scaleMultiplier, index }: {
  config: BlobConfig;
  color: string;
  scaleMultiplier: number;
  index: number;
}) {
  const blobRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const el = blobRef.current;
    if (!el) return;

    gsap.set(el, {
      left: `${config.baseX}%`,
      top: `${config.baseY}%`,
    });

    const tl = gsap.timeline({ repeat: -1, delay: index * 0.8 });

    const durationBase = 1 / config.driftSpeed / 1000;

    tl.to(el, {
      left: `${config.baseX + config.driftRadiusX}%`,
      top: `${config.baseY - config.driftRadiusY * 0.5}%`,
      duration: durationBase * 0.3,
      ease: 'sine.inOut',
    })
    .to(el, {
      left: `${config.baseX + config.driftRadiusX * 0.5}%`,
      top: `${config.baseY + config.driftRadiusY}%`,
      duration: durationBase * 0.25,
      ease: 'sine.inOut',
    })
    .to(el, {
      left: `${config.baseX - config.driftRadiusX}%`,
      top: `${config.baseY + config.driftRadiusY * 0.3}%`,
      duration: durationBase * 0.3,
      ease: 'sine.inOut',
    })
    .to(el, {
      left: `${config.baseX - config.driftRadiusX * 0.7}%`,
      top: `${config.baseY - config.driftRadiusY}%`,
      duration: durationBase * 0.25,
      ease: 'sine.inOut',
    })
    .to(el, {
      left: `${config.baseX}%`,
      top: `${config.baseY}%`,
      duration: durationBase * 0.2,
      ease: 'sine.inOut',
    });

    tweenRef.current = tl;

    return () => {
      tl.kill();
    };
  }, [config, index]);

  useEffect(() => {
    const el = blobRef.current;
    if (!el) return;

    gsap.to(el, {
      scale: scaleMultiplier,
      duration: 4,
      ease: 'power2.inOut',
    });
  }, [scaleMultiplier]);

  return (
    <div
      ref={blobRef}
      className="absolute pointer-events-none"
      style={{
        width: config.size,
        height: config.size,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: 'blur(80px)',
        willChange: 'left, top, transform',
      }}
    />
  );
}

const PHASE_PARALLAX: Record<string, { x: number; y: number }> = {
  cold: { x: 0, y: 0 },
  warming: { x: -4, y: -2 },
  warm: { x: 2, y: -5 },
  hot: { x: -3, y: 3 },
  cooling: { x: 1, y: 1 },
};

export function DarkCosmosBackground({ phase }: Props) {
  const phaseConfig = PHASE_COLOR_MAP[phase] || PHASE_COLOR_MAP.cold;
  const parallax = PHASE_PARALLAX[phase] || PHASE_PARALLAX.cold;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" style={{ backgroundColor: '#050711' }}>
      {BLOB_CONFIGS.map((config, i) => (
        <GsapBlob
          key={i}
          config={config}
          color={phaseConfig.colors[i]}
          scaleMultiplier={phaseConfig.scale}
          index={i}
        />
      ))}

      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.04 }}>
        <svg width="100%" height="100%">
          <filter id="cosmosNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#cosmosNoise)" />
        </svg>
      </div>

      <motion.div
        className="absolute -inset-4 pointer-events-none"
        animate={{ x: parallax.x, y: parallax.y }}
        transition={{ duration: 3, ease: 'easeInOut' }}
      >
        {STARS.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: star.x,
              top: star.y,
              width: star.size,
              height: star.size,
              backgroundColor: 'rgba(255,255,255,0.7)',
            }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{
              duration: star.duration,
              delay: star.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
