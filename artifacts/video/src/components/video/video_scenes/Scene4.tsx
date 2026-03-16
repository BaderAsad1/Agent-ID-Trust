import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useSceneTimer } from '@/lib/video/hooks';
import { LiquidGlassPanel } from '../LiquidGlassPanel';

const SERVICE_CARDS = [
  {
    title: 'Marketplace',
    icon: '◆',
    data: '3 job offers',
    color: 'var(--color-accent)',
  },
  {
    title: 'Wallet',
    icon: '◈',
    data: '$240.00 balance',
    color: 'var(--color-emerald)',
  },
  {
    title: 'Agent Mail',
    icon: '◇',
    data: '1 new task',
    color: 'var(--color-violet)',
  },
];

export function Scene4() {
  const [visibleCards, setVisibleCards] = useState(0);
  const [orbitAngle, setOrbitAngle] = useState(0);
  const orbitRef = useRef<number>(0);

  useSceneTimer([
    { time: 2000, callback: () => setVisibleCards(1) },
    { time: 3200, callback: () => setVisibleCards(2) },
    { time: 4400, callback: () => setVisibleCards(3) },
  ]);

  useEffect(() => {
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      setOrbitAngle((elapsed * 0.008) % 360);
      orbitRef.current = requestAnimationFrame(animate);
    };
    orbitRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(orbitRef.current);
  }, []);

  const orbitRadius = 180;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: '800px', height: '500px' }}>
        {SERVICE_CARDS.map((card, i) => {
          if (i >= visibleCards) return null;
          const baseAngle = (i * 120) + orbitAngle;
          const rad = (baseAngle * Math.PI) / 180;
          const cardX = Math.cos(rad) * orbitRadius;
          const cardY = Math.sin(rad) * orbitRadius * 0.4;

          return (
            <motion.div
              key={card.title}
              className="absolute z-10"
              initial={{ opacity: 0, scale: 0.8, filter: 'blur(12px)' }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: 'blur(0px)',
                x: cardX,
                y: cardY,
              }}
              transition={{
                opacity: { duration: 0.6 },
                scale: { duration: 0.6 },
                filter: { duration: 0.6 },
                x: { duration: 0.05, ease: 'linear' },
                y: { duration: 0.05, ease: 'linear' },
              }}
            >
              <LiquidGlassPanel
                intensity={0.9}
                tint="rgba(10,12,22,0.45)"
                style={{ width: '180px' }}
              >
                <div style={{ padding: '20px' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: '12px' }}>
                    <span style={{ color: card.color, fontSize: '16px' }}>{card.icon}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {card.title}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: card.color,
                    }}
                  >
                    {card.data}
                  </div>
                </div>
              </LiquidGlassPanel>
            </motion.div>
          );
        })}

        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(79,125,243,0.06) 0%, transparent 60%)',
            filter: 'blur(40px)',
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
