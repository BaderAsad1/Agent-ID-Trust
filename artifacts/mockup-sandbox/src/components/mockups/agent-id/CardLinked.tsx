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
          const opacity = active ? (edgeDist === 0 ? 0.38 : edgeDist === 1 ? 0.62 : edgeDist === 2 ? 0.82 : 1.0) : 0.03;
          return (
            <rect key={`${ri}-${ci}`}
              x={x + ci * (cellSize + gap)} y={y + ri * (cellSize + gap)}
              width={cellSize} height={cellSize} rx={2}
              fill={active ? `url(#${gradId})` : 'rgba(255,255,255,0.03)'}
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
  for (let i = 0; i < 4; i++) {
    const y = 100 + (((seed >>> (i * 8)) & 0xFF) / 255) * 220;
    const x2 = 160 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 100;
    const dropY = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    els.push(
      <path key={`t${i}`} d={`M4 ${y.toFixed(1)} H ${x2.toFixed(1)} V ${dropY.toFixed(1)}`}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} />,
      <circle key={`c${i}`} cx={x2} cy={dropY} r={2.5} fill="rgba(255,255,255,0.08)" />,
    );
  }
  return <>{els}</>;
}

function SkillPills({ skills, accentA, startX, startY, maxX }: {
  skills: string[]; accentA: string; startX: number; startY: number; maxX: number;
}) {
  const maxDisplay = 6, rowH = 30, gap = 6;
  const displayed = skills.slice(0, maxDisplay);
  const items: React.ReactNode[] = [];
  let cx = startX, cy = startY;
  [...displayed, ...(skills.length > maxDisplay ? [`+${skills.length - maxDisplay}`] : [])].forEach((skill, idx) => {
    const isMore = idx >= maxDisplay;
    const label = skill.length > 15 ? skill.slice(0, 13) + '…' : skill;
    const w = Math.ceil(label.length * 6.8 + 18);
    if (cx + w > maxX && cx > startX) { cx = startX; cy += rowH; }
    if (isMore) {
      items.push(
        <rect key="more-bg" x={cx} y={cy} width={w} height={22} rx={6} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />,
        <text key="more-t" x={cx + 7} y={cy + 15} fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill="rgba(234,234,245,0.35)">{label}</text>,
      );
    } else {
      items.push(
        <rect key={`bg-${idx}`} x={cx} y={cy} width={w} height={22} rx={6}
          fill={accentA} fillOpacity={0.09} stroke={accentA} strokeOpacity={0.22} strokeWidth={1} />,
        <text key={`t-${idx}`} x={cx + 9} y={cy + 15} fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill={accentA} fontWeight={600}>{label}</text>,
      );
    }
    cx += w + gap;
  });
  return <>{items}</>;
}

const HANDLE = "prime";
const DISPLAY_NAME = "Prime Analytics Engine";
const TRUST = 96;
const SKILLS = ["data-analysis", "forecasting", "reporting", "anomaly-detect", "sql-query"];

export default function CardLinked() {
  const [accentA, accentB] = handlePalette(HANDLE);
  const trustColor = "#34d399";
  const barFill = (TRUST / 100) * 320;
  const hl = HANDLE.length;
  const handleFontSize = hl <= 2 ? 68 : hl <= 3 ? 58 : hl <= 5 ? 48 : hl <= 8 ? 40 : hl <= 12 ? 32 : 24;

  return (
    <div style={{
      minHeight: '100vh', background: '#030509', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        filter: 'drop-shadow(0 8px 40px rgba(79,125,243,0.18)) drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
          style={{ display: 'block', borderRadius: 18 }}>
          <defs>
            <radialGradient id="bg" cx="26%" cy="18%" r="90%">
              <stop offset="0%" stopColor="#0d1430" />
              <stop offset="55%" stopColor="#07091c" />
              <stop offset="100%" stopColor="#040610" />
            </radialGradient>
            <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={accentA} />
              <stop offset="45%" stopColor={accentB} />
              <stop offset="100%" stopColor={accentA} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={accentA} />
              <stop offset="100%" stopColor={accentB} />
            </linearGradient>
            <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={trustColor} stopOpacity={0.95} />
              <stop offset="100%" stopColor={trustColor} stopOpacity={0.35} />
            </linearGradient>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.025)" />
            </pattern>
            <clipPath id="card-clip"><rect width="500" height="380" rx="18" /></clipPath>
            <filter id="badge-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <rect width="500" height="380" rx="18" fill="url(#bg)" />
          <rect width="500" height="380" rx="18" fill="url(#dots)" clipPath="url(#card-clip)" />
          <Traces handle={HANDLE} />
          <rect width="500" height="380" rx="18" fill="none" stroke={accentA} strokeOpacity={0.18} strokeWidth={1.5} />
          <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)" />
          <rect x="0" y="0" width="3" height="380" rx="1.5" fill={accentA} opacity={0.6} />

          <rect x="20" y="16" width="186" height="22" rx="6" fill={accentA} fillOpacity={0.07} stroke={accentA} strokeOpacity={0.15} strokeWidth={1} />
          <text x="30" y="31" fontFamily="JetBrains Mono, monospace" fontSize={9} fill={accentA} opacity={0.65} fontWeight={700} letterSpacing="2.5">AGENT ID CREDENTIAL</text>

          <rect x="306" y="14" width="72" height="18" rx="5" fill="#34d399" fillOpacity={0.08} stroke="#34d399" strokeOpacity={0.25} strokeWidth={1} />
          <circle cx="317" cy="23" r="3" fill="#34d399" fillOpacity={0.9} />
          <circle cx="317" cy="23" r="5" fill="none" stroke="#34d399" strokeOpacity={0.3} strokeWidth={1} />
          <text x="325" y="27" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="#34d399" fontWeight={700} letterSpacing="1">LINKED</text>

          <Identicon handle={HANDLE} x={400} y={14} gradId="id-grad" />

          <text x="22" y="122" fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontSize={handleFontSize} fontWeight={800} fill="#edf0ff" letterSpacing="-1.5">{HANDLE}</text>
          <text x="24" y="144" fontFamily="JetBrains Mono, monospace" fontSize={17} fill={accentA} fontWeight={600} opacity={0.9}>.agentid</text>
          <text x="24" y="162" fontFamily="system-ui, sans-serif" fontSize={12} fill="rgba(210,215,255,0.38)">{DISPLAY_NAME}</text>

          <rect x="20" y="180" width="460" height="1" fill="rgba(255,255,255,0.06)" />

          <text x="22" y="196" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill="rgba(230,232,255,0.2)" fontWeight={700} letterSpacing="2.5">TRUST SCORE</text>
          <rect x="22" y="202" width="320" height="5" rx="2.5" fill="rgba(255,255,255,0.05)" />
          <rect x="22" y="202" width={barFill} height="5" rx="2.5" fill="url(#bar-grad)" />
          <text x="354" y="210" fontFamily="JetBrains Mono, monospace" fontSize={16} fill={trustColor} fontWeight={800}>{TRUST}</text>

          <rect x="20" y="226" width="460" height="1" fill="rgba(255,255,255,0.04)" />

          <text x="22" y="242" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill="rgba(230,232,255,0.2)" fontWeight={700} letterSpacing="2">AGENT SKILLS</text>
          <SkillPills skills={SKILLS} accentA={accentA} startX={22} startY={253} maxX={472} />

          <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.04)" />
          <text x="480" y="350" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill="rgba(230,232,255,0.08)" textAnchor="end" letterSpacing="0.5">getagent.id</text>
        </svg>
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
        color: 'rgba(210,215,255,0.2)', textTransform: 'uppercase',
      }}>
        Agent Linked
      </div>
    </div>
  );
}
