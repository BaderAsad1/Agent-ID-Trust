import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video/hooks';

const LINES = [
  'Identity: confirmed',
  'Signatures: valid',
  'Trust: 94/100',
];

export function Scene3() {
  const [showCheck, setShowCheck] = useState(false);
  const [showVerified, setShowVerified] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);

  useSceneTimer([
    { time: 400, callback: () => setShowCheck(true) },
    { time: 1200, callback: () => setShowVerified(true) },
    { time: 2500, callback: () => setVisibleLines(1) },
    { time: 3200, callback: () => setVisibleLines(2) },
    { time: 3900, callback: () => setVisibleLines(3) },
  ]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        {showCheck && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="relative"
          >
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <motion.circle
                cx="40"
                cy="40"
                r="36"
                stroke="var(--color-emerald)"
                strokeWidth="2.5"
                fill="rgba(52,211,153,0.08)"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <motion.path
                d="M24 40 L35 52 L56 28"
                stroke="var(--color-emerald)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
              />
            </svg>
            <motion.div
              className="absolute -inset-8 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 60%)',
                filter: 'blur(30px)',
              }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
        )}

        {showVerified && (
          <motion.div
            initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '42px',
              fontWeight: 700,
              color: 'var(--color-emerald)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase' as const,
            }}
          >
            VERIFIED
          </motion.div>
        )}

        <div className="flex flex-col gap-2 items-center">
          {LINES.map((line, i) => (
            i < visibleLines && (
              <motion.div
                key={line}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {line}
              </motion.div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
