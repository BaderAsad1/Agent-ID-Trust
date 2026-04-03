/*
 * CardShowcaseV2 — "Series C" quality iteration
 * Two cards: agent-linked vs bare handle, same namespace.
 * Hardcoded to brand blue palette so the showcase is cohesive.
 */

const ACCENT  = "#4f7df3";
const ACCENT2 = "#7c5bf5";
const TRUST_C = "#34d399";
const HANDLE  = "nova";
const DOMAIN  = ".agentid";
const DNAME   = "Nova Research Bot";
const TRUST   = 94;
const SKILLS  = ["data-analysis", "forecasting", "anomaly-detect", "sql-query"];

/* ── identicon ── */
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

/* ── PCB traces ── */
function traces(handle: string, maxY = 240) {
  let seed = 0x6d2b4e1a;
  for (const c of handle) seed = (((seed * 31) + c.charCodeAt(0)) >>> 0);
  return Array.from({ length: 4 }, (_, i) => {
    const y  = 80 + (((seed >>> (i * 8)) & 0xFF) / 255) * maxY;
    const x2 = 100 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 120;
    const dy = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    return { y, x2, dy };
  });
}

/* ── pill layout ── */
function pillLayout(skills: string[], startX: number, startY: number, maxX: number) {
  const rows: { label: string; x: number; y: number; w: number }[] = [];
  let cx = startX, cy = startY;
  skills.forEach((s, i) => {
    const label = s.length > 14 ? s.slice(0, 12) + "…" : s;
    const w = label.length * 6.5 + 20;
    if (cx + w > maxX && cx > startX) { cx = startX; cy += 28; }
    rows.push({ label, x: cx, y: cy, w });
    cx += w + 6;
    void i;
  });
  return rows;
}

/* ══════════════════════════════════════
   LINKED CARD  — full credential state
   ══════════════════════════════════════ */
function LinkedCard() {
  const cells   = identicon(HANDLE);
  const trs     = traces(HANDLE);
  const barW    = (TRUST / 100) * 326;
  const pills   = pillLayout(SKILLS, 22, 253, 472);
  const hl      = HANDLE.length;
  const hSize   = hl <= 2 ? 68 : hl <= 3 ? 58 : hl <= 5 ? 52 : hl <= 8 ? 40 : 30;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
      style={{ display: "block", borderRadius: 18 }}>
      <defs>
        <radialGradient id="L-bg" cx="22%" cy="16%" r="88%">
          <stop offset="0%"   stopColor="#0d1530" />
          <stop offset="52%"  stopColor="#070a1c" />
          <stop offset="100%" stopColor="#030610" />
        </radialGradient>
        <linearGradient id="L-top" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={ACCENT} />
          <stop offset="48%"  stopColor={ACCENT2} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="L-id" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={ACCENT} />
          <stop offset="100%" stopColor={ACCENT2} />
        </linearGradient>
        <linearGradient id="L-bar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={TRUST_C} stopOpacity={0.95} />
          <stop offset="100%" stopColor={TRUST_C} stopOpacity={0.25} />
        </linearGradient>
        <pattern id="L-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.85" fill="rgba(255,255,255,0.022)" />
        </pattern>
        <clipPath id="L-clip"><rect width="500" height="380" rx="18" /></clipPath>
      </defs>

      {/* background */}
      <rect width="500" height="380" rx="18" fill="url(#L-bg)" />
      <rect width="500" height="380" rx="18" fill="url(#L-grid)" clipPath="url(#L-clip)" />

      {/* PCB traces */}
      {trs.map((t, i) => (
        <g key={i}>
          <path d={`M4 ${t.y.toFixed(1)} H ${t.x2.toFixed(1)} V ${t.dy.toFixed(1)}`}
            fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth={1.5} />
          <circle cx={t.x2} cy={t.dy} r={2.5} fill="rgba(255,255,255,0.07)" />
        </g>
      ))}

      {/* card border + accent edges */}
      <rect width="500" height="380" rx="18" fill="none"
        stroke={ACCENT} strokeOpacity={0.2} strokeWidth={1.5} />
      <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#L-top)" />
      <rect x="0" y="0" width="2.5" height="380" rx="1.25"
        fill={ACCENT} opacity={0.55} />

      {/* ── HEADER ROW ── */}
      <rect x="20" y="16" width="183" height="21" rx="5.5"
        fill={ACCENT} fillOpacity={0.07} stroke={ACCENT} strokeOpacity={0.14} strokeWidth={1} />
      <text x="30" y="30.5" fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill={ACCENT} opacity={0.6} fontWeight={700} letterSpacing="2.4">
        AGENT ID CREDENTIAL
      </text>

      {/* VERIFIED badge */}
      <rect x="307" y="14" width="68" height="19" rx="5"
        fill={TRUST_C} fillOpacity={0.08} stroke={TRUST_C} strokeOpacity={0.28} strokeWidth={1} />
      <circle cx="318" cy="23.5" r={3.2} fill={TRUST_C} fillOpacity={0.85} />
      <text x="326" y="28" fontFamily="JetBrains Mono, monospace" fontSize={8}
        fill={TRUST_C} fontWeight={700} letterSpacing="1.2">VERIFIED</text>

      {/* Identicon 15×15 — cell=5 gap=1 → 89px. x=400 y=14 */}
      {cells.flatMap((row, ri) =>
        row.map((on, ci) => {
          const e = Math.min(ri, 14 - ri, ci, 14 - ci);
          const op = on ? (e === 0 ? 0.4 : e === 1 ? 0.65 : e === 2 ? 0.85 : 1.0) : 0.03;
          return (
            <rect key={`${ri}-${ci}`}
              x={400 + ci * 6} y={14 + ri * 6} width={5} height={5} rx={2}
              fill={on ? "url(#L-id)" : "rgba(255,255,255,0.03)"} opacity={op} />
          );
        })
      )}

      {/* ── IDENTITY SECTION ── */}
      <text x="22" y="122" fontFamily="Bricolage Grotesque, system-ui, sans-serif"
        fontSize={hSize} fontWeight={800} fill="#eef0ff" letterSpacing="-1.5">
        {HANDLE}
      </text>
      <text x="24" y="144" fontFamily="JetBrains Mono, monospace"
        fontSize={16.5} fill={ACCENT} fontWeight={600} opacity={0.88}>
        {DOMAIN}
      </text>
      <text x="24" y="162" fontFamily="Inter, system-ui, sans-serif"
        fontSize={11.5} fill="rgba(200,208,255,0.34)">
        {DNAME}
      </text>

      {/* divider 1 */}
      <rect x="20" y="178" width="460" height="1" fill="rgba(255,255,255,0.055)" />

      {/* ── TRUST SECTION ── */}
      <text x="22" y="195" fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill="rgba(220,225,255,0.22)" fontWeight={700} letterSpacing="2.4">TRUST SCORE</text>
      {/* bar track */}
      <rect x="22" y="203" width="326" height="5" rx="2.5"
        fill="rgba(255,255,255,0.05)" />
      {/* bar fill */}
      <rect x="22" y="203" width={barW} height="5" rx="2.5"
        fill="url(#L-bar)" />
      {/* score hero number */}
      <text x="478" y="214" fontFamily="JetBrains Mono, monospace"
        fontSize={30} fill={TRUST_C} fontWeight={800} textAnchor="end">
        {TRUST}
      </text>
      <text x="478" y="226" fontFamily="JetBrains Mono, monospace"
        fontSize={8} fill="rgba(220,255,220,0.25)" textAnchor="end" letterSpacing="1">/100</text>

      {/* divider 2 */}
      <rect x="20" y="234" width="460" height="1" fill="rgba(255,255,255,0.04)" />

      {/* ── SKILLS SECTION ── */}
      <text x="22" y="250" fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill="rgba(220,225,255,0.2)" fontWeight={700} letterSpacing="2.2">AGENT SKILLS</text>
      {pills.map(({ label, x, y, w }, i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={22} rx={6}
            fill={ACCENT} fillOpacity={0.08} stroke={ACCENT} strokeOpacity={0.2} strokeWidth={1} />
          <text x={x + 10} y={y + 15} fontFamily="JetBrains Mono, monospace"
            fontSize={9.5} fill={ACCENT} fontWeight={600}>{label}</text>
        </g>
      ))}

      {/* ── FOOTER ── */}
      <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.035)" />
      <text x="480" y="350" fontFamily="JetBrains Mono, monospace"
        fontSize={8.5} fill="rgba(220,225,255,0.07)" textAnchor="end" letterSpacing="0.4">
        getagent.id
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════
   BARE CARD  — handle-only, no agent
   Reads as "parked" potential, not failure
   ══════════════════════════════════════ */
function BareCard() {
  const cells = identicon(HANDLE);
  const trs   = traces(HANDLE);
  const hl    = HANDLE.length;
  const hSize = hl <= 2 ? 68 : hl <= 3 ? 58 : hl <= 5 ? 52 : hl <= 8 ? 40 : 30;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380"
      style={{ display: "block", borderRadius: 18 }}>
      <defs>
        <radialGradient id="B-bg" cx="22%" cy="16%" r="88%">
          <stop offset="0%"   stopColor="#080a14" />
          <stop offset="52%"  stopColor="#050608" />
          <stop offset="100%" stopColor="#040508" />
        </radialGradient>
        <linearGradient id="B-top" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.35} />
          <stop offset="48%"  stopColor={ACCENT2} stopOpacity={0.25} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="B-id" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.45} />
          <stop offset="100%" stopColor={ACCENT2} stopOpacity={0.45} />
        </linearGradient>
        <pattern id="B-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.85" fill="rgba(255,255,255,0.012)" />
        </pattern>
        <clipPath id="B-clip"><rect width="500" height="380" rx="18" /></clipPath>
      </defs>

      {/* background */}
      <rect width="500" height="380" rx="18" fill="url(#B-bg)" />
      <rect width="500" height="380" rx="18" fill="url(#B-grid)" clipPath="url(#B-clip)" />

      {/* Faint traces */}
      {trs.map((t, i) => (
        <g key={i}>
          <path d={`M4 ${t.y.toFixed(1)} H ${t.x2.toFixed(1)} V ${t.dy.toFixed(1)}`}
            fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth={1.5} />
          <circle cx={t.x2} cy={t.dy} r={2.5} fill="rgba(255,255,255,0.04)" />
        </g>
      ))}

      {/* card border — very subtle */}
      <rect width="500" height="380" rx="18" fill="none"
        stroke={ACCENT} strokeOpacity={0.08} strokeWidth={1.5} />
      <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#B-top)" />
      <rect x="0" y="0" width="2.5" height="380" rx="1.25"
        fill={ACCENT} opacity={0.2} />

      {/* ── HEADER ROW ── */}
      <rect x="20" y="16" width="183" height="21" rx="5.5"
        fill={ACCENT} fillOpacity={0.035} stroke={ACCENT} strokeOpacity={0.07} strokeWidth={1} />
      <text x="30" y="30.5" fontFamily="JetBrains Mono, monospace" fontSize={8.5}
        fill={ACCENT} opacity={0.28} fontWeight={700} letterSpacing="2.4">
        AGENT ID CREDENTIAL
      </text>

      {/* AVAILABLE badge */}
      <rect x="307" y="14" width="78" height="19" rx="5"
        fill="rgba(245,158,11,0.05)" stroke="rgba(245,158,11,0.2)" strokeWidth={1} />
      <circle cx="318" cy="23.5" r={3.2} fill="rgba(245,158,11,0)" />
      <circle cx="318" cy="23.5" r={3.2} fill="none"
        stroke="rgba(245,158,11,0.55)" strokeWidth={1.4} />
      <text x="326" y="28" fontFamily="JetBrains Mono, monospace" fontSize={8}
        fill="rgba(245,158,11,0.65)" fontWeight={700} letterSpacing="1.2">AVAILABLE</text>

      {/* Identicon — dimmed to signal dormancy */}
      {cells.flatMap((row, ri) =>
        row.map((on, ci) => {
          const e  = Math.min(ri, 14 - ri, ci, 14 - ci);
          const op = on ? (e === 0 ? 0.1 : e === 1 ? 0.18 : e === 2 ? 0.26 : 0.32) : 0.012;
          return (
            <rect key={`${ri}-${ci}`}
              x={400 + ci * 6} y={14 + ri * 6} width={5} height={5} rx={2}
              fill={on ? "url(#B-id)" : "rgba(255,255,255,0.01)"} opacity={op} />
          );
        })
      )}

      {/* ── IDENTITY SECTION (ghosted) ── */}
      <text x="22" y="122" fontFamily="Bricolage Grotesque, system-ui, sans-serif"
        fontSize={hSize} fontWeight={800} fill="#eef0ff" opacity={0.28} letterSpacing="-1.5">
        {HANDLE}
      </text>
      <text x="24" y="144" fontFamily="JetBrains Mono, monospace"
        fontSize={16.5} fill={ACCENT} fontWeight={600} opacity={0.22}>
        {DOMAIN}
      </text>

      {/* divider — dashed to signal incompleteness */}
      <line x1="20" y1="165" x2="480" y2="165"
        stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="4 4" />

      {/* Activation note */}
      <text x="22" y="198" fontFamily="JetBrains Mono, monospace"
        fontSize={10.5} fill="rgba(200,208,255,0.16)" letterSpacing="0.02em">
        No agent linked to this handle.
      </text>
      <text x="22" y="217" fontFamily="JetBrains Mono, monospace"
        fontSize={9} fill="rgba(200,208,255,0.09)" letterSpacing="0.02em">
        Mint at getagent.id to link an agent and activate capabilities.
      </text>

      {/* Corner serial — like a blank financial instrument */}
      <text x="480" y="288" fontFamily="JetBrains Mono, monospace"
        fontSize={8} fill="rgba(200,208,255,0.04)" textAnchor="end" letterSpacing="0.5">
        {`${HANDLE.toUpperCase()}-AGENTID-00`}
      </text>

      {/* ── FOOTER ── */}
      <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.025)" />
      <text x="480" y="350" fontFamily="JetBrains Mono, monospace"
        fontSize={8.5} fill="rgba(220,225,255,0.04)" textAnchor="end" letterSpacing="0.4">
        getagent.id
      </text>
    </svg>
  );
}

/* ══════════════════════════════════
   PAGE — the showcase layout
   ══════════════════════════════════ */
export default function CardShowcaseV2() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;500&display=swap');
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: "#020307",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 52,
        padding: "60px 80px",
        fontFamily: "'JetBrains Mono', monospace",
        boxSizing: "border-box",
      }}>
        {/* Card 1 — Linked */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{
            filter: `
              drop-shadow(0 0 32px rgba(79,125,243,0.14))
              drop-shadow(0 16px 48px rgba(0,0,0,0.72))
            `,
          }}>
            <LinkedCard />
          </div>
          <div style={{
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "rgba(200,210,255,0.2)",
            textTransform: "uppercase" as const,
          }}>
            Agent Linked
          </div>
        </div>

        {/* Card 2 — Bare */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{
            filter: `
              drop-shadow(0 0 18px rgba(79,125,243,0.04))
              drop-shadow(0 16px 40px rgba(0,0,0,0.8))
            `,
          }}>
            <BareCard />
          </div>
          <div style={{
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "rgba(200,210,255,0.14)",
            textTransform: "uppercase" as const,
          }}>
            Handle Only
          </div>
        </div>
      </div>
    </>
  );
}
