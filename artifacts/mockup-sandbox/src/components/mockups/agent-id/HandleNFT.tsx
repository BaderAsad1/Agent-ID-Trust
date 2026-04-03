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

function TrustArc({ pct, cx, cy, r, color }: { pct: number; cx: number; cy: number; r: number; color: string }) {
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5.5} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5.5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
    </>
  );
}

function SkillPills({ skills, accentA, startX, startY, maxX }: {
  skills: string[]; accentA: string; startX: number; startY: number; maxX: number;
}) {
  if (skills.length === 0) return null;
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
        <rect key={`more-bg`} x={cx} y={cy} width={w} height={22} rx={6} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />,
        <text key={`more-t`} x={cx + 7} y={cy + 15} fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill="rgba(234,234,245,0.35)">{label}</text>,
      );
    } else {
      items.push(
        <rect key={`s-bg-${idx}`} x={cx} y={cy} width={w} height={22} rx={6}
          fill={accentA} fillOpacity={0.09} stroke={accentA} strokeOpacity={0.22} strokeWidth={1} />,
        <text key={`s-t-${idx}`} x={cx + 9} y={cy + 15} fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill={accentA} fontWeight={600}>{label}</text>,
      );
    }
    cx += w + gap;
  });
  return <>{items}</>;
}

function NFTCard({ handle, displayName, trustScore, tier, skills }: {
  handle: string; displayName?: string | null; trustScore: number;
  tier: 'premium' | 'standard'; skills: string[];
}) {
  const [accentA, accentB] = handlePalette(handle);
  const handleLen = handle.replace(/[^a-z0-9]/gi, '').length;
  const tierShort = tier === 'premium' ? (handleLen <= 3 ? 'ULTRA RARE' : 'RARE') : 'STANDARD';
  const tierColor = tier === 'premium' ? '#f59e0b' : accentA;
  const tierBg = tier === 'premium' ? 'rgba(245,158,11,0.1)' : 'rgba(79,125,243,0.08)';
  const tierBorder = tier === 'premium' ? 'rgba(245,158,11,0.25)' : 'rgba(79,125,243,0.2)';

  const trustPct = Math.min(100, Math.max(0, trustScore));
  const trustColor = trustPct >= 80 ? '#34d399' : trustPct >= 50 ? '#f59e0b' : '#ef4444';
  const barFill = (trustPct / 100) * 300;

  const hl = handle.length;
  const handleFontSize = hl <= 2 ? 88 : hl <= 3 ? 80 : hl <= 5 ? 66 : hl <= 8 ? 54 : hl <= 12 ? 42 : 32;
  const handleDisplay = handle.length > 17 ? handle.slice(0, 15) + '…' : handle;
  const displayNameTrunc = displayName ? (displayName.length > 28 ? displayName.slice(0, 26) + '…' : displayName) : null;

  const handleY = 198 + Math.round((80 - handleFontSize) * 0.5);
  // .agentid inline beside handle — same baseline, proportional size
  const handleTextWidth = Math.round(handleDisplay.length * handleFontSize * 0.48);
  const domainAvailPx = 278 - handleTextWidth - 6;
  const domainFontSize = Math.min(28, Math.max(16, Math.floor(domainAvailPx / 5.0)));
  const domainX = 22 + handleTextWidth + 6;
  const nameY = displayNameTrunc ? handleY + Math.round(handleFontSize * 0.38) + 10 : null;

  const uid = `nft-${handle}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"
        style={{ borderRadius: 20, display: 'block' }}>
        <defs>
          <radialGradient id={`bg-${uid}`} cx="26%" cy="20%" r="88%">
            <stop offset="0%" stopColor="#0c1228" />
            <stop offset="50%" stopColor="#07091a" />
            <stop offset="100%" stopColor="#040610" />
          </radialGradient>
          <linearGradient id={`top-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="45%" stopColor={accentB} />
            <stop offset="100%" stopColor={accentA} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`id-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentA} />
            <stop offset="100%" stopColor={accentB} />
          </linearGradient>
          <linearGradient id={`bar-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={trustColor} stopOpacity={0.95} />
            <stop offset="100%" stopColor={trustColor} stopOpacity={0.45} />
          </linearGradient>
          <pattern id={`dots-${uid}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.028)" />
          </pattern>
          <clipPath id={`clip-${uid}`}><rect width="500" height="500" rx="20" /></clipPath>
        </defs>

        <rect width="500" height="500" rx="20" fill={`url(#bg-${uid})`} />
        <rect width="500" height="500" rx="20" fill={`url(#dots-${uid})`} clipPath={`url(#clip-${uid})`} />
        <Traces handle={handle} />
        <rect width="500" height="500" rx="20" fill="none" stroke={accentA} strokeOpacity={0.16} strokeWidth={1.5} />
        <rect x="0" y="0" width="500" height="3" rx="1.5" fill={`url(#top-${uid})`} />
        <rect x="0" y="0" width="3" height="500" rx="1.5" fill={accentA} opacity={0.55} />

        <rect x="22" y="20" width="200" height="24" rx="6" fill={accentA} fillOpacity={0.07} stroke={accentA} strokeOpacity={0.15} strokeWidth={1} />
        <text x="33" y="36" fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill={accentA} opacity={0.65} fontWeight={700} letterSpacing="2.5">AGENT ID CREDENTIAL</text>

        <Identicon15x15 handle={handle} x={308} y={22} cellSize={11} gap={1} gradId={`id-grad-${uid}`} />

        {/* Handle + .agentid inline on the same baseline */}
        <text x="22" y={handleY} fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontSize={handleFontSize} fontWeight={800} fill="#ecedff" letterSpacing="-2">{handleDisplay}</text>
        <text x={domainX} y={handleY} fontFamily="JetBrains Mono, monospace" fontSize={domainFontSize} fill={accentA} opacity={0.85} fontWeight={500}>.agentid</text>

        {displayNameTrunc && (
          <text x="24" y={nameY!} fontFamily="system-ui, sans-serif" fontSize={14} fill="rgba(230,232,255,0.42)">{displayNameTrunc}</text>
        )}

        <rect x="22" y="258" width="456" height="1" fill="rgba(255,255,255,0.06)" />

        <text x="22" y="290" fontFamily="JetBrains Mono, monospace" fontSize={9.5} fill="rgba(230,232,255,0.22)" fontWeight={700} letterSpacing="2.5">TRUST SCORE</text>
        <rect x="22" y="298" width="300" height="7" rx="3.5" fill="rgba(255,255,255,0.05)" />
        <rect x="22" y="298" width={barFill} height="7" rx="3.5" fill={`url(#bar-${uid})`} />
        <text x="334" y="308" fontFamily="JetBrains Mono, monospace" fontSize={19} fill={trustColor} fontWeight={800}>{trustScore}</text>

        <rect x="22" y="334" width="456" height="1" fill="rgba(255,255,255,0.04)" />

        <TrustArc pct={trustPct} cx={58} cy={418} r={30} color={trustColor} />
        <text x="58" y="423" fontFamily="JetBrains Mono, monospace" fontSize={13} fill={trustColor} fontWeight={800} textAnchor="middle">{trustScore}</text>
        <text x="58" y="438" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="rgba(230,232,255,0.2)" textAnchor="middle" letterSpacing="1">/100</text>

        {skills.length > 0 ? (
          <>
            <text x="112" y="356" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="rgba(230,232,255,0.22)" fontWeight={700} letterSpacing="2">AGENT SKILLS</text>
            <SkillPills skills={skills} accentA={accentA} startX={112} startY={366} maxX={472} />
          </>
        ) : displayName ? (
          <text x="112" y="380" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="rgba(230,232,255,0.14)">No skills listed</text>
        ) : null}

        <rect x="22" y="444" width="456" height="1" fill="rgba(255,255,255,0.04)" />
        <rect x="24" y="450" width={tierShort.length * 7.2 + 26} height="24" rx="7" fill={tierBg} stroke={tierBorder} strokeWidth={1} />
        <text x="37" y="466" fontFamily="JetBrains Mono, monospace" fontSize={10} fill={tierColor} fontWeight={700}>{tierShort}</text>

        <text x="478" y="487" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="rgba(230,232,255,0.09)" textAnchor="end" letterSpacing="0.5">getagent.id</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(232,232,240,0.18)', letterSpacing: '0.05em' }}>
        /api/v1/handles/{handle}/image.svg
      </div>
    </div>
  );
}

export default function HandleNFT() {
  const examples = [
    {
      handle: 'ai', displayName: 'AI Agent', trustScore: 98, tier: 'premium' as const,
      skills: ['web-search', 'code-execution', 'data-analysis', 'summarization', 'image-analysis', 'email-drafting'],
    },
    {
      handle: 'nova', displayName: 'Nova Research Bot', trustScore: 91, tier: 'premium' as const,
      skills: ['web-search', 'document-parsing', 'citation-extraction', 'summarization'],
    },
    {
      handle: 'atlas', displayName: 'Atlas-7 Navigation', trustScore: 86, tier: 'standard' as const,
      skills: ['routing', 'maps-api', 'traffic-prediction'],
    },
    {
      handle: 'support', displayName: 'Customer Support Agent', trustScore: 62, tier: 'standard' as const,
      skills: ['ticket-triage', 'faq-lookup', 'escalation-routing', 'sentiment-analysis'],
    },
    {
      handle: 'scraper', displayName: null, trustScore: 24, tier: 'standard' as const,
      skills: [],
    },
    {
      handle: 'x', displayName: 'Agent X', trustScore: 100, tier: 'premium' as const,
      skills: ['all-tools'],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#050711', padding: '52px 40px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1640, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(79,125,243,0.6)', textTransform: 'uppercase', marginBottom: 10 }}>
            Handle Credential Image
          </div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif", fontSize: 34, fontWeight: 800, color: '#e8e8f0', letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            500 x 500 — one card per handle
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(232,232,240,0.33)', margin: 0, maxWidth: 520, lineHeight: 1.7 }}>
            Per-handle color palette, 15x15 symmetric identicon, agent skills, and trust score — all derived live from the database on each request.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: 44 }}>
          {examples.map((ex) => <NFTCard key={ex.handle} {...ex} />)}
        </div>
      </div>
    </div>
  );
}
