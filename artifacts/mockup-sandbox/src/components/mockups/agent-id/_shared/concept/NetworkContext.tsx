import type { AnimationPhase } from './useHeroAnimation';

interface NetworkNode {
  x: number;
  y: number;
  label: string;
  delay: number;
}

const NODES: NetworkNode[] = [
  { x: -240, y: -140, label: 'Trust Network', delay: 0 },
  { x: 260, y: -120, label: 'Router', delay: 100 },
  { x: -220, y: 160, label: 'Marketplace', delay: 200 },
  { x: 250, y: 150, label: 'Payments', delay: 300 },
  { x: -140, y: -220, label: 'Registry', delay: 400 },
  { x: 180, y: 230, label: 'Inbox', delay: 500 },
  { x: 300, y: -10, label: 'Gateway', delay: 150 },
  { x: -280, y: 10, label: 'Attestation', delay: 350 },
];

const SECONDARY_NODES = [
  { x: -350, y: -80 }, { x: 380, y: -60 }, { x: -300, y: 220 },
  { x: 340, y: 240 }, { x: 0, y: -280 }, { x: 0, y: 300 },
  { x: -400, y: 140 }, { x: 400, y: 100 },
  { x: -180, y: 280 }, { x: 200, y: -260 },
];

export function NetworkContext({ phase }: { phase: AnimationPhase }) {
  const cx = 450;
  const cy = 350;

  return (
    <svg
      width="900" height="700"
      viewBox="0 0 900 700"
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: phase.network ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    >
      {SECONDARY_NODES.map((n, i) => (
        <line key={`sl-${i}`}
          x1={cx} y1={cy} x2={cx + n.x} y2={cy + n.y}
          stroke="var(--network-line)" strokeWidth="0.5"
          opacity={phase.alive ? 0.4 : 0.2}
          style={{ transition: 'opacity 1s ease' }}
        />
      ))}

      {NODES.map((n, i) => (
        <line key={`pl-${i}`}
          x1={cx} y1={cy} x2={cx + n.x} y2={cy + n.y}
          stroke="var(--network-line)" strokeWidth="1"
          strokeDasharray="4 4"
          style={{
            animation: phase.alive ? `concept-network-pulse 3s ease-in-out ${n.delay}ms infinite` : 'none',
          }}
        />
      ))}

      {SECONDARY_NODES.map((n, i) => (
        <circle key={`sn-${i}`}
          cx={cx + n.x} cy={cy + n.y}
          r={phase.network ? 2 : 0}
          fill="var(--network-node)"
          opacity={0.3}
          style={{ transition: `r 0.5s ease ${200 + i * 50}ms, opacity 0.5s ease` }}
        />
      ))}

      {NODES.map((n, i) => (
        <g key={`ng-${i}`}>
          <circle
            cx={cx + n.x} cy={cy + n.y}
            r={phase.network ? 3.5 : 0}
            fill="var(--network-node)"
            style={{
              transition: `r 0.4s ease ${n.delay}ms`,
              animation: phase.alive ? `concept-ring-pulse 4s ease-in-out ${n.delay}ms infinite` : 'none',
            }}
          />
          <text
            x={cx + n.x} y={cx ? cy + n.y + 14 : cy + n.y + 14}
            textAnchor="middle"
            fontSize="8"
            fontFamily="var(--font-mono)"
            fill="var(--network-label)"
            fontWeight="500"
            letterSpacing="0.06em"
            style={{
              opacity: phase.alive ? 1 : 0,
              transition: `opacity 0.6s ease ${n.delay + 400}ms`,
              textTransform: 'uppercase' as const,
            }}
          >{n.label}</text>
        </g>
      ))}

      <circle cx={cx} cy={cy} r={phase.alive ? 5 : 0} fill="var(--accent-blue)" opacity="0.6"
        style={{ transition: 'r 0.6s ease' }} />
      <circle cx={cx} cy={cy} r={phase.alive ? 12 : 0} fill="none" stroke="var(--accent-blue)"
        strokeWidth="0.5" opacity="0.3"
        style={{ transition: 'r 0.8s ease 0.1s' }} />
    </svg>
  );
}
