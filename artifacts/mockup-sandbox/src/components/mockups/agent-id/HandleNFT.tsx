function handleToIdenticon(handle: string): boolean[][] {
  let hash = 5381;
  for (const c of handle) {
    hash = ((hash << 5) + hash) ^ c.charCodeAt(0);
  }
  hash = Math.abs(hash);
  const cells: boolean[][] = [];
  for (let row = 0; row < 5; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 3; col++) {
      rowCells.push(((hash >> (row * 3 + col)) & 1) === 1);
    }
    cells.push([rowCells[0], rowCells[1], rowCells[2], rowCells[1], rowCells[0]]);
  }
  return cells;
}

function Identicon({ handle, x, y, cellSize, gap }: { handle: string; x: number; y: number; cellSize: number; gap: number }) {
  const cells = handleToIdenticon(handle);
  return (
    <>
      {cells.flatMap((row, ri) =>
        row.map((active, ci) => (
          <rect
            key={`${ri}-${ci}`}
            x={x + ci * (cellSize + gap)}
            y={y + ri * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={3}
            fill={active ? 'url(#id-grad)' : 'rgba(255,255,255,0.04)'}
          />
        ))
      )}
    </>
  );
}

function TrustArc({ pct, cx, cy, r, color }: { pct: number; cx: number; cy: number; r: number; color: string }) {
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </>
  );
}

function NFTCard({
  handle,
  displayName,
  trustScore,
  tier,
  minted,
}: {
  handle: string;
  displayName: string;
  trustScore: number;
  tier: 'premium' | 'standard';
  minted?: boolean;
}) {
  const handleLen = handle.replace(/[^a-z0-9]/gi, '').length;
  const tierShort = tier === 'premium' ? (handleLen <= 3 ? 'ULTRA RARE' : 'RARE') : 'STANDARD';
  const tierColor = tier === 'premium' ? '#f59e0b' : '#4f7df3';
  const tierBg    = tier === 'premium' ? 'rgba(245,158,11,0.1)' : 'rgba(79,125,243,0.1)';
  const tierBorder = tier === 'premium' ? 'rgba(245,158,11,0.25)' : 'rgba(79,125,243,0.25)';

  const trustPct  = Math.min(100, Math.max(0, trustScore));
  const trustColor = trustPct >= 80 ? '#34d399' : trustPct >= 50 ? '#f59e0b' : '#ef4444';
  const trustGlow  = trustPct >= 80 ? 'rgba(52,211,153,0.25)' : trustPct >= 50 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';
  const barFill    = (trustPct / 100) * 280;

  const handleDisplay  = handle.length > 16 ? handle.slice(0, 14) + '…' : handle;
  const displayNameTrunc = displayName.length > 24 ? displayName.slice(0, 22) + '…' : displayName;

  const uid = handle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500" style={{ borderRadius: 24, display: 'block' }}>
        <defs>
          <radialGradient id={`bg-${uid}`} cx="25%" cy="20%" r="90%">
            <stop offset="0%" stopColor="#0e1535" />
            <stop offset="60%" stopColor="#080c1f" />
            <stop offset="100%" stopColor="#05071a" />
          </radialGradient>
          <linearGradient id={`top-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4f7df3" />
            <stop offset="50%" stopColor="#7c5bf5" />
            <stop offset="100%" stopColor="#4f7df3" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f7df3" />
            <stop offset="100%" stopColor="#7c5bf5" />
          </linearGradient>
          <filter id={`soft-${uid}`}>
            <feGaussianBlur stdDeviation="20" result="blur" />
          </filter>
          <pattern id={`dots-${uid}`} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.035)" />
          </pattern>
          <clipPath id={`clip-${uid}`}><rect width="500" height="500" rx="24" /></clipPath>
        </defs>

        <rect width="500" height="500" rx="24" fill={`url(#bg-${uid})`} />
        <rect width="500" height="500" rx="24" fill={`url(#dots-${uid})`} clipPath={`url(#clip-${uid})`} />

        <ellipse cx="80" cy="80" rx="160" ry="140" fill={trustGlow} filter={`url(#soft-${uid})`} opacity={0.5} />

        <rect width="500" height="500" rx="24" fill="none" stroke="rgba(79,125,243,0.18)" strokeWidth={1.5} />
        <rect x="0" y="0" width="500" height="3" rx="1.5" fill={`url(#top-${uid})`} />
        <rect x="0" y="0" width="3" height="500" rx="1.5" fill="rgba(79,125,243,0.45)" />

        <rect x="24" y="24" width="192" height="24" rx="7" fill="rgba(79,125,243,0.07)" stroke="rgba(79,125,243,0.14)" strokeWidth={1} />
        <text x="36" y="40" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="rgba(79,125,243,0.65)" fontWeight={700} letterSpacing="2.5">AGENT ID CREDENTIAL</text>

        <Identicon handle={handle} x={388} y={24} cellSize={14} gap={2} />

        <text x="24" y="150" fontFamily="Bricolage Grotesque, Inter, sans-serif" fontSize={60} fontWeight={800} fill="#eaeaf5" letterSpacing="-2.5">{handleDisplay}</text>
        <text x="26" y="180" fontFamily="JetBrains Mono, monospace" fontSize={15} fill="#4f7df3" opacity={0.75}>.agentid</text>
        <text x="26" y="218" fontFamily="Inter, sans-serif" fontSize={15} fill="rgba(234,234,245,0.45)">{displayNameTrunc}</text>

        <rect x="24" y="238" width="452" height="1" fill="rgba(255,255,255,0.05)" />

        <text x="24" y="275" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="rgba(234,234,245,0.25)" fontWeight={700} letterSpacing="2">TRUST SCORE</text>
        <rect x="24" y="284" width="280" height="6" rx="3" fill="rgba(255,255,255,0.05)" />
        <rect x="24" y="284" width={barFill} height="6" rx="3" fill={trustColor} opacity={0.85} />
        <text x="316" y="291" fontFamily="JetBrains Mono, monospace" fontSize={20} fill={trustColor} fontWeight={800}>{trustScore}</text>

        <TrustArc pct={trustPct} cx={60} cy={395} r={32} color={trustColor} />
        <text x="60" y="401" fontFamily="JetBrains Mono, monospace" fontSize={13} fill={trustColor} fontWeight={800} textAnchor="middle">{trustScore}</text>
        <text x="60" y="416" fontFamily="JetBrains Mono, monospace" fontSize={8} fill="rgba(234,234,245,0.25)" textAnchor="middle" letterSpacing="1">TRUST</text>

        <rect x="110" y="376" width={tierShort.length * 7 + 30} height="26" rx="8" fill={tierBg} stroke={tierBorder} strokeWidth={1} />
        <text x="125" y="393" fontFamily="JetBrains Mono, monospace" fontSize={10.5} fill={tierColor} fontWeight={700}>{tierShort}</text>

        <rect x="24" y="438" width="452" height="1" fill="rgba(255,255,255,0.04)" />

        {minted && (
          <>
            <rect x="318" y="448" width="100" height="22" rx="7" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.2)" strokeWidth={1} />
            <text x="368" y="463" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="#34d399" textAnchor="middle" fontWeight={600}>&#x2B21; BASE NFT</text>
          </>
        )}

        <text x="476" y="484" fontFamily="JetBrains Mono, monospace" fontSize={9} fill="rgba(234,234,245,0.12)" textAnchor="end" letterSpacing="0.5">getagent.id</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'rgba(232,232,240,0.25)', letterSpacing: '0.05em' }}>
        /api/v1/handles/{handle}/image.svg
      </div>
    </div>
  );
}

export default function HandleNFT() {
  const examples = [
    { handle: 'ai',       displayName: 'AI Agent',           trustScore: 98, tier: 'premium' as const, minted: true  },
    { handle: 'nova',     displayName: 'Nova Research Bot',   trustScore: 91, tier: 'premium' as const, minted: true  },
    { handle: 'atlas',    displayName: 'Atlas-7',             trustScore: 86, tier: 'standard' as const, minted: false },
    { handle: 'support',  displayName: 'Support Agent',       trustScore: 62, tier: 'standard' as const, minted: false },
    { handle: 'scraper',  displayName: 'Web Scraper v2',      trustScore: 24, tier: 'standard' as const, minted: false },
    { handle: 'x',        displayName: 'Agent X',             trustScore: 100, tier: 'premium' as const, minted: true  },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      padding: '60px 40px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: '0.18em',
            color: 'rgba(79,125,243,0.65)',
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            Handle NFT Image
          </div>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
            fontSize: 40, fontWeight: 800, color: '#e8e8f0',
            letterSpacing: '-0.03em', margin: '0 0 14px',
          }}>
            500 x 500 NFT card
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.38)', margin: 0, maxWidth: 580, lineHeight: 1.6 }}>
            Served live at{' '}
            <code style={{ color: '#4f7df3', background: 'rgba(79,125,243,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              /api/v1/handles/:handle/image.svg
            </code>
            . Every request reads fresh agent data from the database, so trust score, display name, and tier always reflect the current state.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: 48 }}>
          {examples.map((ex) => (
            <NFTCard key={ex.handle} {...ex} />
          ))}
        </div>

        <div style={{ marginTop: 72, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ padding: '24px 28px', borderRadius: 12, border: '1px solid rgba(79,125,243,0.1)', background: 'rgba(79,125,243,0.04)' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(79,125,243,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>Live updates</div>
            <p style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', margin: 0, lineHeight: 1.7 }}>
              Every HTTP request hits the database. Change an agent's display name, earn trust from a completed task, or mint on Base and the next time the image is fetched it reflects the new state. No republish needed.
            </p>
          </div>
          <div style={{ padding: '24px 28px', borderRadius: 12, border: '1px solid rgba(124,91,245,0.1)', background: 'rgba(124,91,245,0.04)' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(124,91,245,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>Smart contract flow</div>
            <p style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', margin: 0, lineHeight: 1.7 }}>
              <code style={{ color: '#7c5bf5', fontSize: 12 }}>tokenURI(tokenId)</code> returns the metadata URL. Marketplaces fetch the JSON, read the <code style={{ color: '#4f7df3', fontSize: 12 }}>image</code> field, and display this SVG. OpenSea refreshes metadata on demand and on a 7-day cadence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
