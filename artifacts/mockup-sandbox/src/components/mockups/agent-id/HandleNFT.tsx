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

function handleToIdenticon9x9(handle: string): boolean[][] {
  let h1 = 5381, h2 = 0x12345678;
  for (const c of handle) {
    const code = c.charCodeAt(0);
    h1 = ((h1 << 5) + h1) ^ code;
    h2 = (Math.imul(h2 ^ code, 0x9e3779b9)) | 0;
  }
  h1 = Math.abs(h1); h2 = Math.abs(h2);
  const cells: boolean[][] = [];
  for (let row = 0; row < 9; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 5; col++) {
      const bitIdx = row * 5 + col;
      const src = bitIdx < 31 ? h1 : h2;
      rowCells.push(((src >> (bitIdx % 31)) & 1) === 1);
    }
    cells.push([
      rowCells[0], rowCells[1], rowCells[2], rowCells[3], rowCells[4],
      rowCells[3], rowCells[2], rowCells[1], rowCells[0],
    ]);
  }
  return cells;
}

function Identicon9x9({
  handle, x, y, cellSize, gap, gradId,
}: {
  handle: string; x: number; y: number; cellSize: number; gap: number; gradId: string;
}) {
  const cells = handleToIdenticon9x9(handle);
  const dim = 9;
  return (
    <>
      {cells.flatMap((row, ri) =>
        row.map((active, ci) => {
          const edgeDist = Math.min(ri, dim - 1 - ri, ci, dim - 1 - ci);
          const opacity = active
            ? edgeDist === 0 ? 0.55 : edgeDist === 1 ? 0.75 : 1
            : 0.04;
          return (
            <rect
              key={`${ri}-${ci}`}
              x={x + ci * (cellSize + gap)}
              y={y + ri * (cellSize + gap)}
              width={cellSize}
              height={cellSize}
              rx={3}
              fill={active ? `url(#${gradId})` : 'rgba(255,255,255,0.04)'}
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
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 100 + (((seed >>> (i * 8)) & 0xFF) / 255) * 220;
    const x2 = 160 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 100;
    const dropY = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    paths.push(
      <path key={`t${i}`} d={`M4 ${y.toFixed(1)} H ${x2.toFixed(1)} V ${dropY.toFixed(1)}`}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} />,
      <circle key={`c${i}`} cx={x2} cy={dropY} r={2.5} fill="rgba(255,255,255,0.08)" />,
    );
  }
  return <>{paths}</>;
}

function TrustArc({ pct, cx, cy, r, color }: { pct: number; cx: number; cy: number; r: number; color: string }) {
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5.5} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={color} strokeWidth={5.5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </>
  );
}

function NFTCard({
  handle, displayName, trustScore, tier, minted,
}: {
  handle: string; displayName: string; trustScore: number;
  tier: 'premium' | 'standard'; minted?: boolean;
}) {
  const [accentA, accentB] = handlePalette(handle);
  const handleLen = handle.replace(/[^a-z0-9]/gi, '').length;
  const tierShort = tier === 'premium' ? (handleLen <= 3 ? 'ULTRA RARE' : 'RARE') : 'STANDARD';
  const tierColor = tier === 'premium' ? '#f59e0b' : accentA;
  const tierBg    = tier === 'premium' ? 'rgba(245,158,11,0.1)' : 'rgba(79,125,243,0.1)';
  const tierBorder = tier === 'premium' ? 'rgba(245,158,11,0.25)' : 'rgba(79,125,243,0.25)';

  const trustPct  = Math.min(100, Math.max(0, trustScore));
  const trustColor = trustPct >= 80 ? '#34d399' : trustPct >= 50 ? '#f59e0b' : '#ef4444';
  const trustGlow  = trustPct >= 80 ? 'rgba(52,211,153,0.22)' : trustPct >= 50 ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)';
  const barFill    = (trustPct / 100) * 300;

  const hl = handle.length;
  const handleFontSize = hl <= 3 ? 80 : hl <= 5 ? 68 : hl <= 8 ? 56 : hl <= 12 ? 44 : 34;
  const handleDisplay  = handle.length > 17 ? handle.slice(0, 15) + '…' : handle;
  const displayNameTrunc = displayName.length > 26 ? displayName.slice(0, 24) + '…' : displayName;

  const handleY = 200 + (80 - handleFontSize) * 0.5;
  const domainY = handleY + handleFontSize * 0.28;
  const nameY   = domainY + 30;

  const uid = `nft-${handle}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"
        style={{ borderRadius: 22, display: 'block' }}>
        <defs>
          <radialGradient id={`bg-${uid}`} cx="28%" cy="22%" r="85%">
            <stop offset="0%" stopColor="#0d1430" />
            <stop offset="55%" stopColor="#080b1e" />
            <stop offset="100%" stopColor="#04060f" />
          </radialGradient>
          <linearGradient id={`top-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="50%" stopColor={accentB} />
            <stop offset="100%" stopColor={accentA} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`id-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="100%" stopColor={accentB} />
          </linearGradient>
          <linearGradient id={`bar-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={trustColor} stopOpacity={0.9} />
            <stop offset="100%" stopColor={trustColor} stopOpacity={0.55} />
          </linearGradient>
          <filter id={`glow-${uid}`}>
            <feGaussianBlur stdDeviation="18" result="blur" />
          </filter>
          <pattern id={`dots-${uid}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.03)" />
          </pattern>
          <clipPath id={`clip-${uid}`}><rect width="500" height="500" rx="22" /></clipPath>
        </defs>

        <rect width="500" height="500" rx="22" fill={`url(#bg-${uid})`} />
        <rect width="500" height="500" rx="22" fill={`url(#dots-${uid})`} clipPath={`url(#clip-${uid})`} />

        <Traces handle={handle} />

        <ellipse cx="420" cy="80" rx="180" ry="150" fill={accentA} filter={`url(#glow-${uid})`} opacity={0.18} />
        <ellipse cx="66" cy="420" rx="110" ry="100" fill={trustGlow} filter={`url(#glow-${uid})`} opacity={0.9} />

        <rect width="500" height="500" rx="22" fill="none" stroke={accentA} strokeOpacity={0.18} strokeWidth={1.5} />
        <rect x="0" y="0" width="500" height="3" rx="1.5" fill={`url(#top-${uid})`} />
        <rect x="0" y="0" width="3" height="500" rx="1.5" fill={accentA} opacity={0.6} />

        <rect x="22" y="22" width="200" height="26" rx="7" fill={accentA} fillOpacity={0.07} stroke={accentA} strokeOpacity={0.16} strokeWidth={1} />
        <text x="34" y="39" fontFamily="JetBrains Mono, monospace" fontSize={10} fill={accentA} opacity={0.7} fontWeight={700} letterSpacing="2.5">AGENT ID CREDENTIAL</text>

        <Identicon9x9 handle={handle} x={302} y={34} cellSize={16} gap={2} gradId={`id-grad-${uid}`} />

        <text x="22" y={handleY} fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontSize={handleFontSize} fontWeight={800} fill="#eef0ff" letterSpacing="-2">{handleDisplay}</text>
        <text x="24" y={domainY} fontFamily="JetBrains Mono, monospace" fontSize={14} fill={accentA} opacity={0.8}>.agentid</text>
        <text x="24" y={nameY} fontFamily="system-ui, sans-serif" fontSize={14} fill="rgba(230,232,255,0.42)">{displayNameTrunc}</text>

        <rect x="22" y="255" width="456" height="1" fill="rgba(255,255,255,0.06)" />

        <text x="22" y="290" fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill="rgba(230,232,255,0.22)" fontWeight={700} letterSpacing="2.5">TRUST SCORE</text>
        <rect x="22" y="298" width="300" height="7" rx="3.5" fill="rgba(255,255,255,0.05)" />
        <rect x="22" y="298" width={barFill} height="7" rx="3.5" fill={`url(#bar-${uid})`} />
        <text x="334" y="307" fontFamily="JetBrains Mono, monospace" fontSize={18} fill={trustColor} fontWeight={800}>{trustScore}</text>

        <rect x="22" y="336" width="456" height="1" fill="rgba(255,255,255,0.04)" />

        <TrustArc pct={trustPct} cx={66} cy={420} r={36} color={trustColor} />
        <text x="66" y="426" fontFamily="JetBrains Mono, monospace" fontSize={14} fill={trustColor} fontWeight={800} textAnchor="middle">{trustScore}</text>
        <text x="66" y="443" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="rgba(230,232,255,0.22)" textAnchor="middle" letterSpacing="1.5">/ 100</text>

        <rect x="120" y="400" width={tierShort.length * 7.2 + 28} height="28" rx="8" fill={tierBg} stroke={tierBorder} strokeWidth={1} />
        <text x="134" y="419" fontFamily="JetBrains Mono, monospace" fontSize={10.5} fill={tierColor} fontWeight={700}>{tierShort}</text>

        <rect x="22" y="449" width="456" height="1" fill="rgba(255,255,255,0.04)" />

        {minted && (
          <>
            <rect x="340" y="456" width="110" height="24" rx="8" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.2)" strokeWidth={1} />
            <text x="395" y="472" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#34d399" textAnchor="middle" fontWeight={600}>⬡ BASE NFT</text>
          </>
        )}

        <text x="478" y="486" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="rgba(230,232,255,0.1)" textAnchor="end" letterSpacing="0.5">getagent.id</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(232,232,240,0.2)', letterSpacing: '0.05em' }}>
        /api/v1/handles/{handle}/image.svg
      </div>
    </div>
  );
}

export default function HandleNFT() {
  const examples = [
    { handle: 'ai',        displayName: 'AI Agent',              trustScore: 98, tier: 'premium'  as const, minted: true  },
    { handle: 'nova',      displayName: 'Nova Research Bot',      trustScore: 91, tier: 'premium'  as const, minted: true  },
    { handle: 'atlas',     displayName: 'Atlas-7 Navigation',     trustScore: 86, tier: 'standard' as const, minted: false },
    { handle: 'support',   displayName: 'Customer Support Agent', trustScore: 62, tier: 'standard' as const, minted: false },
    { handle: 'scraper',   displayName: 'Web Scraper v2',         trustScore: 24, tier: 'standard' as const, minted: false },
    { handle: 'x',         displayName: 'Agent X',                trustScore: 100, tier: 'premium' as const, minted: true  },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      padding: '56px 40px 80px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1640, margin: '0 auto' }}>
        <div style={{ marginBottom: 52 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: '0.2em',
            color: 'rgba(79,125,243,0.6)',
            textTransform: 'uppercase', marginBottom: 12,
          }}>Handle NFT Image</div>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
            fontSize: 36, fontWeight: 800, color: '#e8e8f0',
            letterSpacing: '-0.03em', margin: '0 0 12px',
          }}>500 x 500 &mdash; one card per handle</h1>
          <p style={{ fontSize: 13, color: 'rgba(232,232,240,0.35)', margin: 0, maxWidth: 560, lineHeight: 1.7 }}>
            Each card uses a color palette derived from the handle's hash. The 9x9 symmetric identicon, PCB traces, and glow are all deterministic. Trust score, display name, and mint status update live on every API call.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: 44 }}>
          {examples.map((ex) => <NFTCard key={ex.handle} {...ex} />)}
        </div>
      </div>
    </div>
  );
}
