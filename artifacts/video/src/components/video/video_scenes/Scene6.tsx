import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video/hooks';

export function Scene6() {
  const [showLayer1, setShowLayer1] = useState(false);
  const [showLayer2, setShowLayer2] = useState(false);
  const [showLayer3, setShowLayer3] = useState(false);
  const [showWordmark, setShowWordmark] = useState(false);
  const [showTagline, setShowTagline] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useSceneTimer([
    { time: 800, callback: () => setShowLayer1(true) },
    { time: 1600, callback: () => setShowLayer2(true) },
    { time: 2400, callback: () => setShowLayer3(true) },
    { time: 3200, callback: () => setShowWordmark(true) },
    { time: 4500, callback: () => setShowTagline(true) },
    { time: 13000, callback: () => setFadeOut(true) },
  ]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: fadeOut ? 0 : 1 }}
        transition={{ duration: fadeOut ? 2.5 : 0 }}
      >
        <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '800px' }}>
          {showLayer1 && (
            <motion.div
              className="absolute rounded-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.2, scale: 1.15 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '500px',
                height: '280px',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                transform: 'translateZ(-100px)',
              }}
            />
          )}

          {showLayer2 && (
            <motion.div
              className="absolute rounded-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.35, scale: 1.06 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '480px',
                height: '260px',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                transform: 'translateZ(-50px)',
              }}
            />
          )}

          {showLayer3 && (
            <motion.div
              className="absolute rounded-2xl"
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: fadeOut ? 0.1 : 0.5, scale: 1 }}
              transition={{ duration: fadeOut ? 2 : 1.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: '460px',
                height: '240px',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="absolute top-0 left-0 w-[200%] h-[2px] animate-specular pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 70%, transparent 100%)',
                }}
              />
            </motion.div>
          )}

          <div className="relative z-10 flex flex-col items-center gap-6">
            {showWordmark && (
              <motion.div
                initial={{ opacity: 0, y: 15, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '52px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {'Agent ID'.split('').map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.04,
                      type: 'spring',
                      stiffness: 300,
                      damping: 20,
                    }}
                    style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.div>
            )}

            {showTagline && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.6, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  color: 'var(--color-text-secondary)',
                  letterSpacing: '0.04em',
                }}
              >
                Identity for the agent internet.
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
