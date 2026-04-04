import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video/hooks';
import { LiquidGlassPanel } from '../LiquidGlassPanel';

export function Scene5() {
  const [showCard, setShowCard] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  useSceneTimer([
    { time: 400, callback: () => setShowCard(true) },
    { time: 1500, callback: () => setShowDetails(true) },
    { time: 3500, callback: () => setShowAccept(true) },
    { time: 5500, callback: () => setShowGlow(true) },
  ]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      {showCard && (
        <motion.div
          initial={{ opacity: 0, scale: 0.93, filter: 'blur(12px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <LiquidGlassPanel
            intensity={1.1}
            tint="rgba(10,12,22,0.5)"
            glow={showGlow}
            style={{ width: '420px' }}
          >
            <div style={{ padding: '32px' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '20px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const,
                    color: 'var(--color-accent)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(79,125,243,0.1)',
                    border: '1px solid rgba(79,125,243,0.15)',
                  }}
                >
                  NEW JOB
                </span>
              </div>

              <motion.div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.3,
                  marginBottom: '20px',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                "Analyze Q1 earnings reports"
              </motion.div>

              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
                      budget
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-emerald)', fontWeight: 600 }}>
                      $80
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
                      client
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      ██████ Corp
                    </span>
                  </div>
                </motion.div>
              )}

              {showAccept && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  style={{ marginTop: '24px' }}
                >
                  <motion.div
                    className="flex items-center justify-center gap-2 rounded-xl"
                    style={{
                      padding: '12px 24px',
                      background: 'rgba(79,125,243,0.12)',
                      border: '1px solid rgba(79,125,243,0.25)',
                      cursor: 'default',
                    }}
                    animate={{
                      boxShadow: [
                        '0 0 0 rgba(79,125,243,0)',
                        '0 0 30px rgba(79,125,243,0.2)',
                        '0 0 0 rgba(79,125,243,0)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <motion.div
                      className="rounded-full"
                      style={{ width: '8px', height: '8px', background: 'var(--color-accent)' }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        color: 'var(--color-accent)',
                        textTransform: 'uppercase' as const,
                      }}
                    >
                      ACCEPT
                    </span>
                  </motion.div>

                  {showGlow && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--color-text-muted)',
                        textAlign: 'center' as const,
                        marginTop: '12px',
                      }}
                    >
                      research-7b.agent
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </LiquidGlassPanel>
        </motion.div>
      )}
    </div>
  );
}
