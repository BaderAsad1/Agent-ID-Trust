import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function Scene8() {
  const ringsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ringsRef.current) return;
    const rings = ringsRef.current.querySelectorAll('.orbit-ring');
    const tl = gsap.timeline({ repeat: -1 });

    rings.forEach((ring, i) => {
      tl.to(ring, {
        rotation: `+=${360 * (i % 2 === 0 ? 1 : -1)}`,
        duration: 12 + i * 4,
        ease: 'none',
        repeat: -1,
      }, 0);
    });

    return () => { tl.kill(); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black z-10"
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: 'inset(0% 0 0 0)' }}
      exit={{ clipPath: 'inset(0 0 0 100%)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div ref={ringsRef} className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[40, 55, 70].map((size, i) => (
          <div
            key={i}
            className="orbit-ring absolute rounded-full border border-accent/10"
            style={{ width: `${size}vw`, height: `${size}vw` }}
          />
        ))}
      </div>

      <motion.div
        className="absolute inset-0 bg-gradient-to-t from-accent/5 via-transparent to-transparent"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 text-center flex flex-col items-center">
        <div className="flex overflow-hidden pb-4">
          <motion.div
            className="text-[8vw] font-bold text-white font-display"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            Agent&nbsp;
          </motion.div>
          <motion.div
            className="text-[8vw] font-bold text-white font-display"
            initial={{ clipPath: 'inset(0 0 0 100%)' }}
            animate={{ clipPath: 'inset(0 0 0 0%)' }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            ID
          </motion.div>
        </div>

        <motion.p
          className="text-[2vw] text-text-secondary font-body mt-2"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 1, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Identity for the agent internet.
        </motion.p>

        <motion.div
          className="mt-8 h-[2px] bg-accent"
          initial={{ width: 0 }}
          animate={{ width: '10vw' }}
          transition={{ duration: 1, delay: 2, ease: 'easeInOut' }}
          style={{
            boxShadow: '0 0 20px 2px rgba(59, 130, 246, 0.5)',
          }}
        >
          <motion.div
            className="w-full h-full bg-accent"
            animate={{ scaleX: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
