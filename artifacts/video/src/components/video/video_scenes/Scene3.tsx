import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const base = import.meta.env.BASE_URL;

export function Scene3() {
  const text = "WHO ARE YOU?";
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowAnswer(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10"
      initial={{ clipPath: 'inset(50% 0 50% 0)' }}
      animate={{ clipPath: 'inset(0% 0 0% 0)' }}
      exit={{ clipPath: 'inset(0 50% 0 50%)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 2 }}
      >
        <img
          src={`${base}images/apartment_denial.png`}
          alt=""
          className="w-full h-full object-cover mix-blend-luminosity"
        />
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80 z-[1]" />

      <div className="flex text-[8vw] font-display font-bold text-white tracking-tighter z-[2]">
        {text.split('').map((char, index) => (
          <motion.span
            key={index}
            initial={{ opacity: 0, rotateX: -90, y: 50 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 20,
              delay: index * 0.1
            }}
            style={{ display: 'inline-block', transformOrigin: 'bottom' }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </div>

      <div className="mt-[4vw] h-[6vw] flex items-center justify-center font-mono text-[4vw] z-[2]">
        {!showAnswer ? (
          <motion.span
            className="w-[3vw] h-[5vw] bg-white inline-block"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.1 }}
            className="text-error font-bold tracking-widest flex items-center gap-4"
          >
            <motion.div
              className="absolute inset-0 bg-error/20 z-0"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
            [ NO ANSWER ]
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
