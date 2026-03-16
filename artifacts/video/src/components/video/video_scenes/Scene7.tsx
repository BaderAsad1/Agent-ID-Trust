import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { AgentIDObject } from '../AgentIDObject';

export function Scene7() {
  const badgesRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!badgesRef.current || !glowRef.current) return;

    const badges = badgesRef.current.querySelectorAll('.protocol-badge');
    const tl = gsap.timeline({ delay: 0.5 });

    tl.from(glowRef.current, {
      scale: 0,
      opacity: 0,
      duration: 1.2,
      ease: 'expo.out',
    });

    badges.forEach((badge, i) => {
      tl.fromTo(badge,
        { scale: 0, opacity: 0, rotation: -30 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2)' },
        0.8 + i * 0.3
      );
    });

    return () => { tl.kill(); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden z-10 bg-black"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ clipPath: 'inset(0 0 100% 0)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div ref={glowRef} className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.15)_0%,_#050711_70%)] z-0" />

      <div ref={badgesRef}>
        <div className="protocol-badge absolute top-[20%] left-[20%] text-accent/40 font-mono text-[1.5vw] border border-accent/20 px-4 py-2 rounded-full mix-blend-screen" style={{ opacity: 0 }}>
          MCP
        </div>
        <div className="protocol-badge absolute bottom-[20%] right-[20%] text-accent/40 font-mono text-[1.5vw] border border-accent/20 px-4 py-2 rounded-full mix-blend-screen" style={{ opacity: 0 }}>
          REST
        </div>
        <div className="protocol-badge absolute top-[30%] right-[25%] text-accent/40 font-mono text-[1.5vw] border border-accent/20 px-4 py-2 rounded-full mix-blend-screen" style={{ opacity: 0 }}>
          A2A
        </div>
      </div>

      <div className="relative z-10 w-full max-w-[60vw] mx-auto flex justify-center">
        <AgentIDObject className="w-full" animateIn={true} delay={1.5} />
      </div>
    </motion.div>
  );
}
