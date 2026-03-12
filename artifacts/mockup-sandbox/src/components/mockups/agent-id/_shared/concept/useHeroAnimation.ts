import { useState, useEffect, useRef, useCallback } from 'react';

export interface AnimationPhase {
  frame: boolean;
  avatar: boolean;
  name: boolean;
  handle: boolean;
  domain: boolean;
  seal: boolean;
  trustRing: boolean;
  trustCount: number;
  chips: boolean;
  footer: boolean;
  alive: boolean;
}

const initial: AnimationPhase = {
  frame: false,
  avatar: false,
  name: false,
  handle: false,
  domain: false,
  seal: false,
  trustRing: false,
  trustCount: 0,
  chips: false,
  footer: false,
  alive: false,
};

export function useHeroAnimation(targetTrust = 94) {
  const [phase, setPhase] = useState<AnimationPhase>(initial);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const set = useCallback((updates: Partial<AnimationPhase>) => {
    if (mountedRef.current) {
      setPhase(p => ({ ...p, ...updates }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    t(() => set({ frame: true }), 200);
    t(() => set({ avatar: true }), 700);
    t(() => set({ name: true }), 1100);
    t(() => set({ handle: true }), 1400);
    t(() => set({ domain: true }), 1650);
    t(() => set({ seal: true }), 1950);
    t(() => {
      set({ trustRing: true });
      const start = performance.now();
      const duration = 1200;
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const count = Math.round(eased * targetTrust);
        if (mountedRef.current) {
          set({ trustCount: count });
          if (progress < 1) {
            rafRef.current = requestAnimationFrame(animate);
          }
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, 2200);
    t(() => set({ chips: true }), 2800);
    t(() => set({ footer: true }), 3200);
    t(() => set({ alive: true }), 3600);

    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [targetTrust, set]);

  return phase;
}
