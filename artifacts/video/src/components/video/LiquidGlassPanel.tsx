import { motion, type MotionStyle, type TargetAndTransition, type VariantLabels, type Transition } from 'framer-motion';
import { type ReactNode, type CSSProperties, useId } from 'react';

interface LiquidGlassPanelProps {
  children?: ReactNode;
  intensity?: number;
  tint?: string;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  animate?: TargetAndTransition | VariantLabels;
  initial?: TargetAndTransition | VariantLabels | boolean;
  exit?: TargetAndTransition | VariantLabels;
  transition?: Transition;
  layoutId?: string;
}

export function LiquidGlassPanel({
  children,
  intensity = 1,
  tint = 'rgba(255,255,255,0.03)',
  glow = false,
  className = '',
  style = {},
  animate,
  initial,
  exit,
  transition,
  layoutId,
}: LiquidGlassPanelProps) {
  const filterId = useId().replace(/:/g, '_');
  const blurAmount = Math.round(24 * intensity);
  const borderOpacity = 0.06 + 0.06 * intensity;
  const highlightOpacity = 0.08 + 0.12 * intensity;
  const displacementScale = 4 + 4 * intensity;

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      layoutId={layoutId}
      initial={initial}
      animate={animate}
      exit={exit}
      transition={transition}
      style={{
        backdropFilter: `blur(${blurAmount}px)`,
        WebkitBackdropFilter: `blur(${blurAmount}px)`,
        background: tint,
        borderRadius: '20px',
        border: `1px solid rgba(255,255,255,${borderOpacity})`,
        boxShadow: glow
          ? `0 0 60px rgba(79,125,243,0.15), 0 0 120px rgba(124,91,245,0.08), 0 30px 60px rgba(0,0,0,0.4)`
          : `0 30px 60px rgba(0,0,0,0.4)`,
        ...style,
      } as MotionStyle}
    >
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id={`refraction-${filterId}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves="3"
              seed={42}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displacementScale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="absolute top-0 left-0 w-[200%] h-[2px] animate-specular pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${highlightOpacity}) 30%, rgba(255,255,255,${highlightOpacity * 1.5}) 50%, rgba(255,255,255,${highlightOpacity}) 70%, transparent 100%)`,
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.02) 100%)`,
          borderRadius: '20px',
        }}
      />

      <div
        className="absolute -inset-[1px] pointer-events-none"
        style={{
          borderRadius: '20px',
          filter: `url(#refraction-${filterId})`,
          border: `2px solid rgba(255,255,255,${borderOpacity * 0.8})`,
          background: `linear-gradient(135deg, rgba(79,125,243,0.12) 0%, rgba(255,255,255,0.04) 25%, transparent 50%, rgba(255,255,255,0.04) 75%, rgba(124,91,245,0.12) 100%) border-box`,
          WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
