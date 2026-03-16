import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

interface GlassMorphTransitionProps {
  sceneIndex: number;
}

export function GlassMorphTransition({ sceneIndex }: GlassMorphTransitionProps) {
  const [transitioning, setTransitioning] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'expanding' | 'holding' | 'clearing'>('idle');
  const prevScene = useRef(sceneIndex);

  useEffect(() => {
    if (prevScene.current !== sceneIndex) {
      prevScene.current = sceneIndex;
      setTransitioning(true);
      setPhase('expanding');

      const holdTimer = setTimeout(() => setPhase('holding'), 500);
      const clearTimer = setTimeout(() => {
        setPhase('clearing');
      }, 700);
      const doneTimer = setTimeout(() => {
        setTransitioning(false);
        setPhase('idle');
      }, 1100);

      return () => {
        clearTimeout(holdTimer);
        clearTimeout(clearTimer);
        clearTimeout(doneTimer);
      };
    }
    return undefined;
  }, [sceneIndex]);

  if (!transitioning) return null;

  return (
    <motion.div
      className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'clearing' ? 0 : 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute"
        style={{
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
        initial={{
          width: '300px',
          height: '200px',
          borderRadius: '20px',
        }}
        animate={{
          width: phase === 'expanding' || phase === 'holding' || phase === 'clearing'
            ? '110vw' : '300px',
          height: phase === 'expanding' || phase === 'holding' || phase === 'clearing'
            ? '110vh' : '200px',
          borderRadius: phase === 'expanding' || phase === 'holding' || phase === 'clearing'
            ? '0px' : '20px',
        }}
        transition={{
          duration: 0.5,
          ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
        }}
      >
        <div
          className="absolute top-0 left-0 w-[200%] h-[2px] animate-specular pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 70%, transparent 100%)',
          }}
        />
      </motion.div>
    </motion.div>
  );
}
