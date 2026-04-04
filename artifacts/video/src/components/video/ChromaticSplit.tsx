import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface ChromaticSplitProps {
  trigger: boolean;
  duration?: number;
}

export function ChromaticSplit({ trigger, duration = 0.4 }: ChromaticSplitProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger) {
      setActive(true);
      const timer = setTimeout(() => setActive(false), duration * 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [trigger, duration]);

  if (!active) return null;

  return (
    <motion.div
      className="absolute inset-0 z-50 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration, times: [0, 0.1, 0.7, 1] }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(255,0,0,0.04)',
          transform: 'translateX(-3px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0,255,0,0.03)',
          transform: 'translateY(2px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0,0,255,0.04)',
          transform: 'translateX(3px)',
          mixBlendMode: 'screen',
        }}
      />
    </motion.div>
  );
}
