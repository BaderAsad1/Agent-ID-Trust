/*
 * CardShowcaseV2 — handle-first redesign
 * The handle IS the product. Two examples, same weight, pure identity.
 */

interface CardProps {
  handle:  string;
  accentA: string;
  accentB: string;
}

function identicon(handle: string): boolean[][] {
  const hashes = [0x12345678, 0xdeadbeef, 0xabcdef01, 0x55aa55aa].map((seed, i) => {
    let h = seed;
    for (const c of handle) h = (((h << 5) + h) ^ c.charCodeAt(0) ^ (i * 0x1234567)) | 0;
    return Math.abs(h);
  });
  return Array.from({ length: 15 }, (_, row) => {
    const half = Array.from({ length: 8 }, (__, col) => {
      const bit = row * 8 + col;
      return ((hashes[Math.min(Math.floor(bit / 30), 3)] >> (bit % 30)) & 1) === 1;
    });
    return [...half, half[6], half[5], half[4], half[3], half[2], half[1], half[0]];
  });
}

function traces(handle: string) {
  let seed = 0x6d2b4e1a;
  for (const c of handle) seed = (((seed * 31) + c.charCodeAt(0)) >>> 0);
  return Array.from({ length: 4 }, (_, i) => ({
    y:   80  + (((seed >>> (i * 8))     & 0xFF) / 255) * 240,
    x2:  80  + (((seed >>> (i * 8 + 4)) & 0x3F) / 63)  * 140,
    dy:        ((seed >>> (i * 8 + 2))  & 0x1F) - 16,
  })).map(t => ({ ...t, dy: t.y + t.dy * 3 }));
}

function HandleCard({ handle, accentA, accentB }: CardProps) {
  const cells = identicon(handle);
  const trs   = traces(handle);
  const hl    = handle.length;
  /* give the handle as much size as the card can hold */
  const fs = hl <= 2 ? 84 : hl <= 3 ? 74 : hl <= 4 ? 64 : hl <= 6 ? 54 : hl <= 9 ? 44 : 34;
  const uid = `hc-${handle}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
      style={{ display: "block", borderRadius: 18 }}>
      <defs>
        <radialGradient id={`${uid}-bg`} cx="24%" cy="18%" r="90%">
          <stop offset="0%"   stopColor="#0d1530" />
          <stop offset="52%"  stopColor="#07091c" />
          <stop offset="100%" stopColor="#040610" />
        </radialGradient>
        <linearGradient id={`${uid}-top`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={accentA} />
          <stop offset="48%"  stopColor={accentB} />
          <stop offset="100%" stopColor={accentA} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${uid}-id`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={accentA} />
          <stop offset="100%" stopColor={accentB} />
        </linearGradient>
        <pattern id={`${uid}-dots`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.85" fill="rgba(255,255,255,0.022)" />
        </pattern>
        <clipPath id={`${uid}-clip`}><rect width="500" height="380" rx="18" /></clipPath>
      </defs>

      {/* background */}
      <rect width="500" height="380" rx="18" fill={`url(#${uid}-bg)`} />
      <rect width="500" height="380" rx="18" fill={`url(#${uid}-dots)`} clipPath={`url(#${uid}-clip)`} />

      {/* PCB traces */}
      {trs.map((t, i) => (
        <g key={i}>
          <path d={`M4 ${t.y.toFixed(1)} H ${t.x2.toFixed(1)} V ${t.dy.toFixed(1)}`}
            fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth={1.5} />
          <circle cx={t.x2} cy={t.dy} r={2.5} fill="rgba(255,255,255,0.07)" />
        </g>
      ))}

      {/* border + accent edges */}
      <rect width="500" height="380" rx="18" fill="none"
        stroke={accentA} strokeOpacity={0.2} strokeWidth={1.5} />
      <rect x="0" y="0" width="500" height="3" rx="1.5" fill={`url(#${uid}-top)`} />
      <rect x="0" y="0" width="2.5" height="380" rx="1.25" fill={accentA} opacity={0.55} />

      {/* AGENT ID CREDENTIAL badge */}
      <rect x="20" y="16" width="183" height="21" rx="5.5"
        fill={accentA} fillOpacity={0.07} stroke={accentA} strokeOpacity={0.14} strokeWidth={1} />
      <text x="30" y="30.5"
        fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill={accentA} opacity={0.6} fontWeight={700} letterSpacing="2.4">
        AGENT ID CREDENTIAL
      </text>

      {/* 15×15 identicon — cell=5 gap=1 → 89px. x=400 y=14 */}
      {cells.flatMap((row, ri) =>
        row.map((on, ci) => {
          const e  = Math.min(ri, 14 - ri, ci, 14 - ci);
          const op = on ? (e === 0 ? 0.4 : e === 1 ? 0.65 : e === 2 ? 0.85 : 1.0) : 0.03;
          return (
            <rect key={`${ri}-${ci}`}
              x={400 + ci * 6} y={14 + ri * 6} width={5} height={5} rx={2}
              fill={on ? `url(#${uid}-id)` : "rgba(255,255,255,0.03)"} opacity={op} />
          );
        })
      )}

      {/* ── HANDLE — the hero ── */}
      <text
        x="24" y="228"
        fontFamily="Bricolage Grotesque, system-ui, sans-serif"
        fontSize={fs} fontWeight={800}
        fill="#eef0ff" letterSpacing="-1.5">
        {handle}
      </text>

      {/* ── .agentid ── */}
      <text
        x="26" y="258"
        fontFamily="JetBrains Mono, monospace"
        fontSize={20} fontWeight={600}
        fill={accentA} opacity={0.88}>
        .agentid
      </text>

      {/* bottom rule */}
      <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.04)" />
      <text x="480" y="350"
        fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill="rgba(220,225,255,0.07)" textAnchor="end" letterSpacing="0.4">
        getagent.id
      </text>
    </svg>
  );
}

export default function CardShowcaseV2() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: "#020307",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 52,
        padding: "60px 80px",
        boxSizing: "border-box",
      }}>
        <div style={{ filter: "drop-shadow(0 0 32px rgba(79,125,243,0.16)) drop-shadow(0 16px 48px rgba(0,0,0,0.72))" }}>
          <HandleCard handle="nova" accentA="#4f7df3" accentB="#7c5bf5" />
        </div>
        <div style={{ filter: "drop-shadow(0 0 32px rgba(52,211,153,0.14)) drop-shadow(0 16px 48px rgba(0,0,0,0.72))" }}>
          <HandleCard handle="atlas" accentA="#34d399" accentB="#059669" />
        </div>
      </div>
    </>
  );
}
