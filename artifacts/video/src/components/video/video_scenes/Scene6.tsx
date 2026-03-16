import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function Scene6() {
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linesRef.current) return;
    const lines = linesRef.current.querySelectorAll('.scan-line');
    const tl = gsap.timeline({ repeat: -1 });

    lines.forEach((line, i) => {
      tl.fromTo(line,
        { y: '-100vh', opacity: 0 },
        { y: '100vh', opacity: 0.3, duration: 2 + i * 0.3, ease: 'none' },
        i * 0.4
      );
    });

    return () => { tl.kill(); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 bg-black flex flex-col items-center justify-center z-10"
      initial={{ clipPath: 'inset(50% 0 50% 0)' }}
      animate={{ clipPath: 'inset(0% 0 0% 0)' }}
      exit={{ clipPath: 'inset(50% 0 50% 0)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div ref={linesRef} className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="scan-line absolute w-full h-px"
            style={{
              left: 0,
              background: `linear-gradient(90deg, transparent 0%, rgba(59,130,246,${0.1 + i * 0.05}) 50%, transparent 100%)`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <motion.div
          className="absolute h-px bg-accent w-full"
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2, ease: 'linear' }}
        />

        <motion.div
          className="absolute pb-8 font-display text-[2vw] font-bold text-white tracking-wide"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 0.8, delay: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          There is a fix.
        </motion.div>

        <motion.div
          className="absolute top-[45%] left-0 w-full h-px bg-white/5"
          animate={{ scaleX: [0, 1, 0], originX: ['0%', '0%', '100%'] }}
          transition={{ duration: 3, delay: 1.5, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-[55%] left-0 w-full h-px bg-white/5"
          animate={{ scaleX: [0, 1, 0], originX: ['100%', '100%', '0%'] }}
          transition={{ duration: 3, delay: 2, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}
