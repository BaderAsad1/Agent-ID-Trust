import { useState, useEffect, useRef, useCallback } from 'react';

export type IssuanceState = 'unresolved' | 'validating' | 'domainBinding' | 'trustIssuance' | 'active';

export interface IssuancePhase {
  state: IssuanceState;
  frame: boolean;
  identity: boolean;
  handle: boolean;
  domain: boolean;
  verification: boolean;
  trustRing: boolean;
  trustCount: number;
  capabilities: boolean;
  marketplace: boolean;
  systemReady: boolean;
}

const STATE_LABELS: Record<IssuanceState, string> = {
  unresolved: 'UNRESOLVED',
  validating: 'VALIDATING',
  domainBinding: 'DOMAIN BINDING',
  trustIssuance: 'TRUST ISSUANCE',
  active: 'ACTIVE',
};

export function getStateLabel(state: IssuanceState): string {
  return STATE_LABELS[state];
}

const initial: IssuancePhase = {
  state: 'unresolved',
  frame: false,
  identity: false,
  handle: false,
  domain: false,
  verification: false,
  trustRing: false,
  trustCount: 0,
  capabilities: false,
  marketplace: false,
  systemReady: false,
};

export function useIssuanceAnimation(rawTargetTrust = 94) {
  const targetTrust = Math.max(0, Math.min(100, rawTargetTrust));
  const [phase, setPhase] = useState<IssuancePhase>(initial);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const set = useCallback((updates: Partial<IssuancePhase>) => {
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

    t(() => set({ state: 'validating', frame: true }), 400);

    t(() => set({ identity: true }), 900);

    t(() => set({ handle: true }), 1300);

    t(() => set({ state: 'domainBinding', domain: true }), 1800);

    t(() => set({ verification: true }), 2400);

    t(() => {
      set({ state: 'trustIssuance', trustRing: true });
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
    }, 2900);

    t(() => set({ capabilities: true }), 3600);

    t(() => set({ marketplace: true }), 4000);

    t(() => set({ state: 'active', systemReady: true }), 4500);

    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [targetTrust, set]);

  return phase;
}
