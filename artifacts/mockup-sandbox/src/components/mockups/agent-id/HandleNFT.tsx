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

function Identicon15x15({ handle, x, y, cellSize, gap, gradId }: {
  handle: string; x: number; y: number; cellSize: number; gap: number; gradId: string;
}) {
  const cells = handleToIdenticon15x15(handle);
  const dim = 15;
  return (
    <>
      {cells.flatMap((row, ri) =>
        row.map((active, ci) => {
          const edgeDist = Math.min(ri, dim - 1 - ri, ci, dim - 1 - ci);
          const opacity = active ? (edgeDist === 0 ? 0.38 : edgeDist === 1 ? 0.62 : edgeDist === 2 ? 0.82 : 1.0) : 0.03;
          return (
            <rect
              key={`${ri}-${ci}`}
              x={x + ci * (cellSize + gap)}
              y={y + ri * (cellSize + gap)}
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


function NFTCard({ handle }: { handle: string }) {
  const [accentA, accentB] = handlePalette(handle);
  const hl = handle.length;
  const fs = hl <= 2 ? 84 : hl <= 3 ? 74 : hl <= 4 ? 64 : hl <= 6 ? 54 : hl <= 9 ? 44 : 34;
  const handleDisplay = handle.length > 17 ? handle.slice(0, 15) + '…' : handle;
  const uid = `nft-${handle}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
        style={{ borderRadius: 18, display: 'block' }}>
        <defs>
          <radialGradient id={`bg-${uid}`} cx="24%" cy="18%" r="90%">
            <stop offset="0%" stopColor="#0d1530" />
            <stop offset="52%" stopColor="#07091c" />
            <stop offset="100%" stopColor="#040610" />
          </radialGradient>
          <linearGradient id={`top-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="48%" stopColor={accentB} />
            <stop offset="100%" stopColor={accentA} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`id-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="100%" stopColor={accentB} />
          </linearGradient>
          <pattern id={`dots-${uid}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.85" fill="rgba(255,255,255,0.022)" />
          </pattern>
          <clipPath id={`clip-${uid}`}><rect width="500" height="380" rx="18" /></clipPath>
        </defs>

        <rect width="500" height="380" rx="18" fill={`url(#bg-${uid})`} />
        <rect width="500" height="380" rx="18" fill={`url(#dots-${uid})`} clipPath={`url(#clip-${uid})`} />
        <Traces handle={handle} />
        <rect width="500" height="380" rx="18" fill="none" stroke={accentA} strokeOpacity={0.2} strokeWidth={1.5} />
        <rect x="0" y="0" width="500" height="3" rx="1.5" fill={`url(#top-${uid})`} />
        <rect x="0" y="0" width="2.5" height="380" rx="1.25" fill={accentA} opacity={0.55} />

        <rect x="20" y="16" width="183" height="21" rx="5.5" fill={accentA} fillOpacity={0.07} stroke={accentA} strokeOpacity={0.14} strokeWidth={1} />
        <text x="30" y="30.5" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill={accentA} opacity={0.6} fontWeight={700} letterSpacing="2.4">AGENT ID CREDENTIAL</text>

        <Identicon15x15 handle={handle} x={400} y={14} cellSize={5} gap={1} gradId={`id-grad-${uid}`} />

        {/* Handle — the hero */}
        <text x="24" y="228" fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontSize={fs} fontWeight={800} fill="#eef0ff" letterSpacing="-1.5">{handleDisplay}</text>

        {/* .agentid */}
        <text x="26" y="258" fontFamily="JetBrains Mono, monospace" fontSize={20} fontWeight={600} fill={accentA} opacity={0.88}>.agentid</text>

        <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.04)" />
        <text x="480" y="350" fontFamily="JetBrains Mono, monospace" fontSize={8.5} fill="rgba(220,225,255,0.07)" textAnchor="end" letterSpacing="0.4">getagent.id</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(232,232,240,0.15)', letterSpacing: '0.05em' }}>
        /api/v1/handles/{handle}/image.svg
      </div>
    </div>
  );
}

export default function HandleNFT() {
  const handles = ['ai', 'nova', 'atlas', 'support', 'scraper', 'x'];

  return (
    <div style={{ minHeight: '100vh', background: '#020307', padding: '52px 40px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 1640, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(79,125,243,0.5)', textTransform: 'uppercase' as const, marginBottom: 10 }}>
            Handle Credential Image
          </div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontSize: 34, fontWeight: 800, color: '#e8e8f0', letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            500 x 380 — one card per handle
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(232,232,240,0.28)', margin: 0, maxWidth: 480, lineHeight: 1.7 }}>
            Per-handle accent palette and 15x15 symmetric identicon — fully derived from the handle string, no database query required.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: 44 }}>
          {handles.map((h) => <NFTCard key={h} handle={h} />)}
        </div>
      </div>
    </div>
  );
}
