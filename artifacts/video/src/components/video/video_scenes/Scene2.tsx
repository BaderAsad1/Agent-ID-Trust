import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const base = import.meta.env.BASE_URL;

export function Scene2() {
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTypedChars(prev => (prev < 15 ? prev + 1 : prev));
    }, 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex bg-black z-10"
      initial={{ clipPath: 'polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ clipPath: 'polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 7, ease: 'linear' }}
      >
        <img
          src={`${base}images/job_interview.png`}
          alt=""
          className="w-full h-full object-cover opacity-15 mix-blend-luminosity"
        />
      </motion.div>

      <div className="w-1/2 h-full flex flex-col justify-center pl-[10vw] border-r border-white/20 relative z-10">
        <div className="space-y-12 font-mono text-[3vw]">
          <div className="flex items-center text-white/50">
            <span>FULL NAME:</span>
            <span className="ml-4 font-bold text-error animate-glitch">
              {typedChars > 3 ? 'NOT FOUND' : <span className="w-[2vw] h-[3vw] bg-white inline-block animate-blink"/>}
            </span>
          </div>
          <div className="flex items-center text-white/50">
            <span>SSN:</span>
            <span className="ml-4 font-bold text-error animate-glitch" style={{ animationDelay: '0.2s' }}>
              {typedChars > 8 ? 'NOT FOUND' : (typedChars > 3 ? <span className="w-[2vw] h-[3vw] bg-white inline-block animate-blink"/> : '')}
            </span>
          </div>
          <div className="flex items-center text-white/50">
            <span>HISTORY:</span>
            <span className="ml-4 font-bold text-error animate-glitch" style={{ animationDelay: '0.4s' }}>
              {typedChars > 13 ? 'NOT FOUND' : (typedChars > 8 ? <span className="w-[2vw] h-[3vw] bg-white inline-block animate-blink"/> : '')}
            </span>
          </div>
        </div>
      </div>

      <div className="w-1/2 h-full flex items-center justify-center relative overflow-hidden z-10">
        <motion.div
          className="text-[30vw] font-display font-black text-white leading-none mix-blend-difference"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
        >
          ?
        </motion.div>
      </div>
    </motion.div>
  );
}
