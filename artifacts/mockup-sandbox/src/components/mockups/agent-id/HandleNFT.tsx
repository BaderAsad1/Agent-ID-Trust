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
  const tierLabel = tier === 'premium'
    ? handle.length === 3 ? '◆ ULTRA RARE · 3-CHAR' : '◈ RARE · 4-CHAR'
    : '◇ STANDARD';
  const tierColor = tier === 'premium' ? '#f59e0b' : '#4f7df3';
  const tierBg   = tier === 'premium' ? 'rgba(245,158,11,0.12)' : 'rgba(79,125,243,0.12)';
  const tierBorderColor = tier === 'premium' ? 'rgba(245,158,11,0.3)' : 'rgba(79,125,243,0.3)';

  const trustPct   = Math.min(100, Math.max(0, trustScore));
  const trustColor = trustPct >= 80 ? '#34d399' : trustPct >= 50 ? '#f59e0b' : '#ef4444';
  const barWidth   = (trustPct / 100) * 200;

  const handleDisplay  = handle.length > 16 ? handle.slice(0, 14) + '…' : handle;
  const nameTrunc      = displayName.length > 22 ? displayName.slice(0, 20) + '…' : displayName;
  const tierLabelWidth = tierLabel.length * 5.8 + 16;

  const onChainBadge = minted ? (
    <>
      <rect x="16" y="180" width="96" height="20" rx="6" fill="rgba(52,211,153,0.12)" stroke="rgba(52,211,153,0.3)" strokeWidth="1"/>
      <text x="64" y="194" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#34d399" textAnchor="middle" fontWeight="600">⬡ BASE NFT</text>
    </>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220" style={{ borderRadius: 16, display: 'block' }}>
        <defs>
          <linearGradient id={`bg-${handle}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#07091a' }}/>
            <stop offset="100%" style={{ stopColor: '#0a0d22' }}/>
          </linearGradient>
          <linearGradient id={`accent-${handle}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#4f7df3', stopOpacity: 0.5 }}/>
            <stop offset="100%" style={{ stopColor: '#7c5bf5', stopOpacity: 0 }}/>
          </linearGradient>
        </defs>

        <rect width="400" height="220" rx="16" fill={`url(#bg-${handle})`}/>
        <rect width="400" height="220" rx="16" fill="none" stroke="rgba(79,125,243,0.2)" strokeWidth="1"/>
        <rect x="0" y="0" width="400" height="2" rx="1" fill={`url(#accent-${handle})`}/>
        <rect x="0" y="0" width="3" height="220" rx="1.5" fill="rgba(79,125,243,0.4)"/>

        <rect x="16" y="14" width="130" height="16" rx="4" fill="rgba(79,125,243,0.08)"/>
        <text x="24" y="25" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="rgba(232,232,240,0.35)" fontWeight="600" letterSpacing="2">AGENT ID CREDENTIAL</text>

        <text x="16" y="58" fontFamily="'Bricolage Grotesque', 'Inter', sans-serif" fontSize="26" fontWeight="700" fill="#e8e8f0" letterSpacing="-0.5">{handleDisplay}</text>
        <text x="16" y="74" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill="rgba(79,125,243,0.7)">.agentid</text>

        <text x="16" y="102" fontFamily="'Inter', sans-serif" fontSize="13" fill="rgba(232,232,240,0.55)">{nameTrunc}</text>

        <rect x="16" y="114" width="368" height="1" fill="rgba(255,255,255,0.05)"/>

        <text x="16" y="136" fontFamily="'JetBrains Mono', monospace" fontSize="8.5" fill="rgba(232,232,240,0.25)" letterSpacing="1" fontWeight="600">TRUST SCORE</text>
        <rect x="16" y="142" width="200" height="4" rx="2" fill="rgba(255,255,255,0.05)"/>
        <rect x="16" y="142" width={barWidth} height="4" rx="2" fill={trustColor}/>
        <text x="224" y="147" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill={trustColor} fontWeight="700">{trustScore}</text>

        <rect x="16" y="156" width={tierLabelWidth} height="20" rx="6" fill={tierBg} stroke={tierBorderColor} strokeWidth="1"/>
        <text x="24" y="170" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill={tierColor} fontWeight="600">{tierLabel}</text>

        {onChainBadge}

        <text x="384" y="210" fontFamily="'JetBrains Mono', monospace" fontSize="8" fill="rgba(232,232,240,0.15)" textAnchor="end">getagent.id</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>
        /api/v1/handles/{handle}/image.svg
      </div>
    </div>
  );
}

export default function HandleNFT() {
  const examples = [
    { handle: 'ai',      displayName: 'AI Agent',         trustScore: 98, tier: 'premium' as const, minted: true },
    { handle: 'nova',    displayName: 'Nova Research Bot', trustScore: 91, tier: 'premium' as const, minted: true },
    { handle: 'atlas',   displayName: 'Atlas-7',           trustScore: 86, tier: 'standard' as const, minted: false },
    { handle: 'support', displayName: 'Support Agent',     trustScore: 62, tier: 'standard' as const, minted: false },
    { handle: 'scraper', displayName: 'Web Scraper v2',    trustScore: 24, tier: 'standard' as const, minted: false },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      padding: '60px 40px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: '0.15em',
            color: 'rgba(79,125,243,0.7)',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            Handle NFT Image
          </div>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
            fontSize: 36, fontWeight: 800, color: '#e8e8f0',
            letterSpacing: '-0.03em', margin: '0 0 12px',
          }}>
            What your handle NFT looks like
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.4)', margin: 0 }}>
            Served live at <code style={{ color: '#4f7df3' }}>/api/v1/handles/:handle/image.svg</code> — used as the NFT metadata image on Base.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 40 }}>
          {examples.map((ex) => (
            <NFTCard key={ex.handle} {...ex} />
          ))}
        </div>

        <div style={{ marginTop: 60, padding: '24px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'rgba(232,232,240,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            Card variants
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 40px', fontSize: 13, color: 'rgba(232,232,240,0.5)' }}>
            <div><span style={{ color: '#f59e0b' }}>◆ Premium (3-char)</span> — ultra rare amber badge</div>
            <div><span style={{ color: '#f59e0b' }}>◈ Premium (4-char)</span> — rare amber badge</div>
            <div><span style={{ color: '#4f7df3' }}>◇ Standard (5+ char)</span> — blue badge</div>
            <div><span style={{ color: '#34d399' }}>Trust ≥ 80</span> — green bar</div>
            <div><span style={{ color: '#f59e0b' }}>Trust 50–79</span> — amber bar</div>
            <div><span style={{ color: '#ef4444' }}>Trust &lt; 50</span> — red bar</div>
            <div><span style={{ color: '#34d399' }}>⬡ BASE NFT</span> — shown when minted or pending claim</div>
            <div style={{ color: 'rgba(232,232,240,0.3)' }}>No badge — not yet minted</div>
          </div>
        </div>
      </div>
    </div>
  );
}
