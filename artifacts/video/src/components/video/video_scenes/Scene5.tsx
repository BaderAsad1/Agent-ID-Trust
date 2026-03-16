import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function Scene5() {
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!particlesRef.current) return;
    const dots = particlesRef.current.querySelectorAll('.float-dot');
    const tl = gsap.timeline({ repeat: -1, yoyo: true });

    dots.forEach((dot, i) => {
      tl.to(dot, {
        y: `${(i % 2 === 0 ? -1 : 1) * (20 + i * 5)}`,
        x: `${(i % 3 === 0 ? -1 : 1) * (10 + i * 3)}`,
        opacity: 0.2 + (i % 4) * 0.15,
        duration: 3 + i * 0.5,
        ease: 'sine.inOut',
      }, 0);
    });

    return () => { tl.kill(); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 bg-black flex flex-col items-center justify-center z-10"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div ref={particlesRef} className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="float-dot absolute rounded-full bg-white/10"
            style={{
              width: `${2 + (i % 4)}px`,
              height: `${2 + (i % 4)}px`,
              left: `${(i * 5) % 100}%`,
              top: `${(i * 7 + 10) % 100}%`,
            }}
          />
        ))}
      </div>

      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />

      <div className="text-center font-display tracking-tight relative z-10">
        <motion.div
          className="text-[2vw] text-white overflow-hidden"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 1.5, delay: 2, ease: [0.16, 1, 0.3, 1] }}
        >
          This is every AI agent
        </motion.div>

        <motion.div
          className="text-[3vw] text-accent mt-2 font-bold overflow-hidden"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 1.5, delay: 4, ease: [0.16, 1, 0.3, 1] }}
        >
          right now.
        </motion.div>

        <motion.div
          className="mt-6 flex justify-center gap-2"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2, delay: 5.5, ease: 'easeOut' }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full bg-accent/60"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, delay: 6 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
