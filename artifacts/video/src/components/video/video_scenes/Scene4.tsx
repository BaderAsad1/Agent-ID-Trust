import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const WORDS = ["DENIED", "REJECTED", "UNKNOWN", "UNTRUSTED", "INVALID", "ERROR", "BLOCKED", "FAILED"];

const WORD_CONFIGS = Array.from({ length: 40 }).map((_, i) => ({
  word: WORDS[i % WORDS.length],
  size: 4 + (i % 8),
  left: (i * 17) % 80,
  top: (i * 23) % 80,
  rotate: ((i % 5) - 2) * 15,
  opacity: 0.3 + ((i % 5) * 0.12),
}));

export function Scene4() {
  const [count, setCount] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const words = containerRef.current.querySelectorAll('.chaos-word');
    const tl = gsap.timeline();

    tl.set(words, { opacity: 0, scale: 3, rotation: -20 });

    words.forEach((word, i) => {
      tl.to(word, {
        opacity: WORD_CONFIGS[i]?.opacity ?? 0.4,
        scale: 1,
        rotation: WORD_CONFIGS[i]?.rotate ?? 0,
        duration: 0.12,
        ease: 'back.out(2)',
      }, i * 0.08);
    });

    if (counterRef.current) {
      tl.fromTo(counterRef.current,
        { x: 50, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
        0.5
      );
    }

    return () => { tl.kill(); };
  }, []);

  useEffect(() => {
    let current = 1;
    const targets = [47, 2847, 9999, 1000000];
    let targetIdx = 0;

    const timer = setInterval(() => {
      if (targetIdx < targets.length) {
        current += Math.ceil((targets[targetIdx] - current) * 0.3);
        if (current >= targets[targetIdx]) {
          current = targets[targetIdx];
          targetIdx++;
        }
        setCount(current);
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-black z-10"
      initial={{ scale: 0.3, opacity: 0, borderRadius: '50%' }}
      animate={{ scale: 1, opacity: 1, borderRadius: '0%' }}
      exit={{ scale: 2.5, opacity: 0, filter: 'blur(30px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 noise-bg mix-blend-screen opacity-30" />

      <div ref={containerRef} className="absolute inset-0">
        {WORD_CONFIGS.map((config, i) => (
          <div
            key={i}
            className="chaos-word absolute font-black uppercase whitespace-nowrap text-error"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: `${config.size}vw`,
              left: `${config.left}%`,
              top: `${config.top}%`,
              opacity: 0,
              textShadow: '2px 2px 0 rgba(255,0,0,0.5)',
            }}
          >
            {config.word}
          </div>
        ))}
      </div>

      <div
        ref={counterRef}
        className="absolute bottom-[5vw] right-[5vw] font-mono text-error z-50 text-[3vw] bg-black/80 p-4 border border-error/30 backdrop-blur"
        style={{ opacity: 0 }}
      >
        REJECTIONS: {count >= 1000000 ? '1,000,000+' : count.toLocaleString()}
      </div>
    </motion.div>
  );
}
