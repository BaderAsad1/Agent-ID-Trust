import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video/hooks';
import { LiquidGlassPanel } from '../LiquidGlassPanel';

const COMMAND = 'agent.register("research-7b")';

export function Scene1() {
  const [typedChars, setTypedChars] = useState(0);
  const [showAurora, setShowAurora] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [expandPanel, setExpandPanel] = useState(false);

  useSceneTimer([
    ...COMMAND.split('').map((_, i) => ({
      time: 1500 + i * 80,
      callback: () => setTypedChars(i + 1),
    })),
    { time: 1500 + COMMAND.length * 80 + 200, callback: () => setShowAurora(true) },
    { time: 1500 + COMMAND.length * 80 + 800, callback: () => setShowPanel(true) },
    { time: 6000, callback: () => setExpandPanel(true) },
  ]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '6px',
          height: '6px',
          backgroundColor: 'rgba(255,255,255,0.9)',
        }}
        animate={{
          scale: showAurora ? [1, 3, 0] : [0.8, 1.2, 0.8],
          opacity: showAurora ? [1, 1, 0] : [0.5, 1, 0.5],
        }}
        transition={{
          duration: showAurora ? 0.6 : 2,
          repeat: showAurora ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {showAurora && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
        >
          <div
            className="absolute"
            style={{
              left: '30%',
              top: '40%',
              width: '50vw',
              height: '50vw',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(79,125,243,0.3) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute"
            style={{
              left: '65%',
              top: '55%',
              width: '40vw',
              height: '40vw',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(124,91,245,0.2) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </motion.div>
      )}

      <div className="flex flex-col items-center gap-8 z-10">
        {typedChars > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: showPanel ? -60 : 0 }}
            transition={{ duration: 0.6, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '18px',
              color: 'var(--color-text-primary)',
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>{'> '}</span>
            <span>{COMMAND.slice(0, typedChars)}</span>
            <span
              className="animate-blink"
              style={{
                display: 'inline-block',
                width: '2px',
                height: '18px',
                backgroundColor: 'var(--color-accent)',
                marginLeft: '2px',
                verticalAlign: 'text-bottom',
              }}
            />
          </motion.div>
        )}

        {showPanel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.93, filter: 'blur(12px)' }}
            animate={{
              opacity: expandPanel ? 0 : 1,
              scale: expandPanel ? 2 : 1,
              filter: expandPanel ? 'blur(30px)' : 'blur(0px)',
              borderRadius: expandPanel ? '0px' : '20px',
            }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <LiquidGlassPanel intensity={0.8} tint="rgba(10,12,22,0.4)">
              <div style={{ padding: '24px 32px' }}>
                <div className="flex items-center gap-3">
                  <motion.div
                    className="rounded-full"
                    style={{ width: '10px', height: '10px', background: 'var(--color-emerald)' }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Initializing agent identity...
                  </span>
                </div>
              </div>
            </LiquidGlassPanel>
          </motion.div>
        )}
      </div>
    </div>
  );
}
