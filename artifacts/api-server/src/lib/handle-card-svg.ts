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

function renderIdenticon15x15(handle: string, x: number, y: number, cellSize: number, gap: number, gradId: string): string {
  const cells = handleToIdenticon15x15(handle);
  const parts: string[] = [];
  const dim = 15;
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const cx = x + col * (cellSize + gap);
      const cy = y + row * (cellSize + gap);
      const active = cells[row][col];
      const edgeDist = Math.min(row, dim - 1 - row, col, dim - 1 - col);
      const opacity = active ? (edgeDist === 0 ? 0.38 : edgeDist === 1 ? 0.62 : edgeDist === 2 ? 0.82 : 1.0) : 0.03;
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" rx="2" fill="${active ? `url(#${gradId})` : "rgba(255,255,255,0.03)"}" opacity="${opacity}"/>`,
      );
    }
  }
  return parts.join("\n  ");
}

function generateTraces(handle: string): string {
  let seed = 0x6d2b4e1a;
  for (const c of handle) seed = ((seed * 31) + c.charCodeAt(0)) >>> 0;
  const traces: string[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 100 + (((seed >>> (i * 8)) & 0xFF) / 255) * 220;
    const x2 = 160 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 100;
    const dropY = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    traces.push(
      `<path d="M4 ${y.toFixed(1)} H ${x2.toFixed(1)} V ${dropY.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>`,
    );
    traces.push(`<circle cx="${x2.toFixed(1)}" cy="${dropY.toFixed(1)}" r="2.5" fill="rgba(255,255,255,0.08)"/>`);
  }
  return traces.join("\n  ");
}

export function generateHandleCardSvg(handle: string): string {
  const handleDisplay = handle.length > 17 ? handle.slice(0, 15) + "…" : handle;
  const [accentA, accentB] = handlePalette(handle);
  const hl = handle.length;
  const handleFontSize = hl <= 2 ? 84 : hl <= 3 ? 74 : hl <= 4 ? 64 : hl <= 6 ? 54 : hl <= 9 ? 44 : 34;
  const identicon = renderIdenticon15x15(handle, 400, 14, 5, 1, "id-grad");
  const traces = generateTraces(handle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="380" viewBox="0 0 500 380">
  <defs>
    <radialGradient id="bg-r" cx="24%" cy="18%" r="90%">
      <stop offset="0%" stop-color="#0d1530"/>
      <stop offset="52%" stop-color="#07091c"/>
      <stop offset="100%" stop-color="#040610"/>
    </radialGradient>
    <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="48%" stop-color="${accentB}"/>
      <stop offset="100%" stop-color="${accentA}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="100%" stop-color="${accentB}"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.85" fill="rgba(255,255,255,0.022)"/>
    </pattern>
    <clipPath id="card-clip"><rect width="500" height="380" rx="18"/></clipPath>
  </defs>

  <rect width="500" height="380" rx="18" fill="url(#bg-r)"/>
  <rect width="500" height="380" rx="18" fill="url(#dots)" clip-path="url(#card-clip)"/>
  ${traces}
  <rect width="500" height="380" rx="18" fill="none" stroke="${accentA}" stroke-opacity="0.2" stroke-width="1.5"/>
  <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)"/>
  <rect x="0" y="0" width="2.5" height="380" rx="1.25" fill="${accentA}" opacity="0.55"/>

  <!-- AGENT ID CREDENTIAL badge -->
  <rect x="20" y="16" width="183" height="21" rx="5.5" fill="${accentA}" fill-opacity="0.07" stroke="${accentA}" stroke-opacity="0.14" stroke-width="1"/>
  <text x="30" y="30.5" font-family="JetBrains Mono, Courier New, monospace" font-size="8.5" fill="${accentA}" opacity="0.6" font-weight="700" letter-spacing="2.4">AGENT ID CREDENTIAL</text>

  <!-- 15x15 identicon — cell=5 gap=1 (89px). x=400 y=14 -->
  ${identicon}

  <!-- Handle — the hero -->
  <text x="24" y="228" font-family="Bricolage Grotesque, Segoe UI, system-ui, sans-serif" font-size="${handleFontSize}" font-weight="800" fill="#eef0ff" letter-spacing="-1.5">${handleDisplay}</text>

  <!-- .agentid -->
  <text x="26" y="258" font-family="JetBrains Mono, Courier New, monospace" font-size="20" font-weight="600" fill="${accentA}" opacity="0.88">.agentid</text>

  <!-- bottom rule -->
  <rect x="20" y="318" width="460" height="1" fill="rgba(255,255,255,0.04)"/>
  <text x="480" y="350" font-family="JetBrains Mono, Courier New, monospace" font-size="8.5" fill="rgba(220,225,255,0.07)" text-anchor="end" letter-spacing="0.4">getagent.id</text>
</svg>`;
}

export function generateHandleCardSvgDataUri(handle: string): string {
  const svg = generateHandleCardSvg(handle);
  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}
