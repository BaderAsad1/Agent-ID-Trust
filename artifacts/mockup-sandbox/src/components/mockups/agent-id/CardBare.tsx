import React from "react";

const PALETTES: Array<[string, string]> = [
  ["#4f7df3", "#7c5bf5"],
  ["#34d399", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#06b6d4", "#0891b2"],
  ["#ec4899", "#db2777"],
  ["#8b5cf6", "#6d28d9"],
  ["#f97316", "#ea580c"],
  ["#22d3ee", "#0e7490"],
];

function handlePalette(handle: string): [string, string] {
  let hash = 5381;
  for (const c of handle) hash = ((hash << 5) + hash) ^ c.charCodeAt(0);
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

function handleToIdenticon15x15(handle: string): boolean[][] {
  const hashes = [0x12345678, 0xdeadbeef, 0xabcdef01, 0x55aa55aa].map((seed, i) => {
    let h = seed;
    for (const c of handle) h = (((h << 5) + h) ^ c.charCodeAt(0) ^ (i * 0x1234567)) | 0;
    return Math.abs(h);
  });
  const cells: boolean[][] = [];
  for (let row = 0; row < 15; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 8; col++) {
      const bitIdx = row * 8 + col;
      const src = hashes[Math.min(Math.floor(bitIdx / 30), 3)];
      rowCells.push(((src >> (bitIdx % 30)) & 1) === 1);
    }
    cells.push([
      rowCells[0], rowCells[1], rowCells[2], rowCells[3], rowCells[4], rowCells[5], rowCells[6], rowCells[7],
      rowCells[6], rowCells[5], rowCells[4], rowCells[3], rowCells[2], rowCells[1], rowCells[0],
    ]);
  }
  return cells;
}

function Identicon({ handle, x, y, gradId }: { handle: string; x: number; y: number; gradId: string }) {
  const cells = handleToIdenticon15x15(handle);
  const cellSize = 5, gap = 1, dim = 15;
  return (
    <>
      {cells.flatMap((row, ri) =>
        row.map((active, ci) => {
          const edgeDist = Math.min(ri, dim - 1 - ri, ci, dim - 1 - ci);
          const opacity = active ? (edgeDist === 0 ? 0.18 : edgeDist === 1 ? 0.32 : edgeDist === 2 ? 0.44 : 0.55) : 0.02;
          return (
            <rect key={`${ri}-${ci}`}
              x={x + ci * (cellSize + gap)} y={y + ri * (cellSize + gap)}
              width={cellSize} height={cellSize} rx={2}
              fill={active ? `url(#${gradId})` : 'rgba(255,255,255,0.02)'}
              opacity={opacity}
            />
          );
        })
      )}
    </>
  );
}

function Traces({ handle }: { handle: string }) {
  let seed = 0x6d2b4e1a;
  for (const c of handle) seed = (((seed * 31) + c.charCodeAt(0)) >>> 0);
  const els: React.ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    const y = 100 + (((seed >>> (i * 8)) & 0xFF) / 255) * 180;
    const x2 = 120 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 80;
    const dropY = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    els.push(
      <path key={`t${i}`} d={`M4 ${y.toFixed(1)} H ${x2.toFixed(1)} V ${dropY.toFixed(1)}`}
        fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1.5} />,
      <circle key={`c${i}`} cx={x2} cy={dropY} r={2} fill="rgba(255,255,255,0.05)" />,
    );
  }
  return <>{els}</>;
}

const HANDLE = "prime";

export default function CardBare() {
  const [accentA, accentB] = handlePalette(HANDLE);
  const hl = HANDLE.length;
  const handleFontSize = hl <= 2 ? 68 : hl <= 3 ? 58 : hl <= 5 ? 48 : hl <= 8 ? 40 : hl <= 12 ? 32 : 24;

  return (
    <div style={{
      minHeight: '100vh', background: '#030509', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        filter: 'drop-shadow(0 8px 40px rgba(79,125,243,0.10)) drop-shadow(0 2px 8px rgba(0,0,0,0.7))',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
          style={{ display: 'block', borderRadius: 18 }}>
          <defs>
            <radialGradient id="bg" cx="26%" cy="18%" r="90%">
              <stop offset="0%" stopColor="#0a0d1e" />
              <stop offset="55%" stopColor="#060710" />
              <stop offset="100%" stopColor="#040508" />
            </radialGradient>
            <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={accentA} stopOpacity={0.5} />
              <stop offset="45%" stopColor={accentB} stopOpacity={0.4} />
              <stop offset="100%" stopColor={accentA} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={accentA} stopOpacity={0.5} />
              <stop offset="100%" stopColor={accentB} stopOpacity={0.5} />
            </linearGradient>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.018)" />
            </pattern>
            <clipPath id="card-clip"><rect width="500" height="380" rx="18" /></clipPath>
          </defs>

          <rect width="500" height="380" rx="18" fill="url(#bg)" />
          <rect width="500" height="380" rx="18" fill="url(#dots)" clipPath="url(#card-clip)" />
          <Traces handle={HANDLE} />
          <rect width="500" height="380" rx="18" fill="none" stroke={accentA} strokeOpacity={0.08} strokeWidth={1.5} />
          <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)" />
          <rect x="0" y="0" width="3" height="380" rx="1.5" fill={accentA} opacity={0.25} />

          <rect x="20" y="16" width="186" height="22" rx="6" fill={accentA} fillOpacity={0.04} stroke={accentA} strokeOpacity={0.08} strokeWidth={1} />
          <text x="30" y="31" fontFamily="JetBrains Mono, monospace" fontSize={9} fill={accentA} opacity={0.35} fontWeight={700} letterSpacing="2.5">AGENT ID CREDENTIAL</text>

          <rect x="306" y="14" width="80" height="18" rx="5" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.18)" strokeWidth={1} />
          <circle cx="317" cy="23" r="3" fill="rgba(245,158,11,0.5)" />
          <text x="325" y="27" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="rgba(245,158,11,0.7)" fontWeight={700} letterSpacing="1">UNLINKED</text>

          <Identicon handle={HANDLE} x={400} y={14} gradId="id-grad" />

          <text x="22" y="122" fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontSize={handleFontSize} fontWeight={800} fill="rgba(210,215,255,0.55)" letterSpacing="-1.5">{HANDLE}</text>
          <text x="24" y="144" fontFamily="JetBrains Mono, monospace" fontSize={17} fill={accentA} fontWeight={600} opacity={0.4}>.agentid</text>

          <rect x="20" y="168" width="460" height="1" fill="rgba(255,255,255,0.04)" />

          <text x="22" y="206" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="rgba(210,215,255,0.18)" fontWeight={400} letterSpacing="0.02em">No agent has been linked to this handle.</text>

          <rect x="22" y="226" width="190" height="32" rx="8"
            fill="none" stroke={accentA} strokeOpacity={0.14} strokeWidth={1}
            strokeDasharray="4 3" />
          <text x="42" y="246" fontFamily="JetBrains Mono, monospace" fontSize={9} fill={accentA} opacity={0.35} fontWeight={600} letterSpacing="1.5">LINK AGENT TO ACTIVATE</text>

          <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.03)" />
          <text x="480" y="350" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill="rgba(230,232,255,0.06)" textAnchor="end" letterSpacing="0.5">getagent.id</text>
        </svg>
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
        color: 'rgba(210,215,255,0.2)', textTransform: 'uppercase',
      }}>
        Handle Only
      </div>
    </div>
  );
}
