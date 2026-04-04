import fs from "fs";
import path from "path";

let logoBase64: string | null = null;

function getLogoBase64(): string {
  if (logoBase64) return logoBase64;
  const candidates = [
    path.join(process.cwd(), "artifacts/agent-id/public/app-icon.png"),
    path.join(process.cwd(), "artifacts/agent-id/dist/public/app-icon.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logoBase64 = fs.readFileSync(p).toString("base64");
      return logoBase64;
    }
  }
  return "";
}

function getLogoSrc(): string {
  const b64 = getLogoBase64();
  if (b64) return `data:image/png;base64,${b64}`;
  return "/app-icon.png";
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface SsrPageOptions {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  schemaJson?: string;
  body: string;
}

export function renderSsrPage(opts: SsrPageOptions): string {
  const logoSrc = getLogoSrc();
  const {
    title,
    description,
    canonical,
    ogTitle = title,
    ogDescription = description,
    schemaJson,
    body,
  } = opts;

  const schemaTags = schemaJson
    ? `<script type="application/ld+json">${schemaJson}</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="icon" type="image/png" href="${logoSrc}" />
  ${schemaTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg-base: #050711;
      --bg-surface: #0C0F1E;
      --accent: #4f7df3;
      --text-primary: #e8e8f0;
      --text-muted: #8690a8;
      --font-display: 'Bricolage Grotesque', 'Inter', system-ui, sans-serif;
      --font-body: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bricolage+Grotesque:wght@700&display=swap');
    html, body {
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-body);
      line-height: 1.6;
      min-height: 100vh;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .seo-nav {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(5,7,17,0.88);
      backdrop-filter: blur(20px) saturate(1.8);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      height: 56px;
      display: flex;
      align-items: center;
    }
    .seo-nav-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
    .seo-nav-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    .seo-nav-brand img {
      width: 26px;
      height: 26px;
      border-radius: 5px;
    }
    .seo-nav-brand span {
      font-family: var(--font-display);
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }
    .seo-nav-cta {
      background: rgba(79,125,243,0.15);
      color: #fff;
      border: 1px solid rgba(79,125,243,0.25);
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      padding: 6px 20px;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .seo-nav-cta:hover { opacity: 0.85; text-decoration: none; }
    .seo-main {
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }
    .seo-breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: rgba(232,232,240,0.4);
      margin-bottom: 32px;
      flex-wrap: wrap;
    }
    .seo-breadcrumb a { color: rgba(232,232,240,0.4); }
    .seo-breadcrumb a:hover { color: var(--accent); text-decoration: none; }
    .seo-breadcrumb .sep { opacity: 0.3; }
    h1 {
      font-family: var(--font-display);
      font-size: clamp(28px, 5vw, 42px);
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 36px 0 12px;
      letter-spacing: -0.01em;
    }
    h3 {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 24px 0 8px;
    }
    p { color: rgba(232,232,240,0.7); margin-bottom: 16px; font-size: 15px; }
    .seo-lead {
      font-size: 18px;
      color: rgba(232,232,240,0.55);
      margin-bottom: 36px;
      line-height: 1.7;
    }
    .seo-tag {
      display: inline-flex;
      align-items: center;
      background: rgba(79,125,243,0.12);
      border: 1px solid rgba(79,125,243,0.2);
      color: rgba(79,125,243,0.9);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .seo-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .seo-card {
      background: var(--bg-surface);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.15s;
    }
    .seo-card:hover { border-color: rgba(79,125,243,0.3); }
    .seo-card h3 { margin-top: 0; font-size: 15px; }
    .seo-card p { font-size: 13px; color: rgba(232,232,240,0.5); margin-bottom: 12px; }
    .seo-card a { font-size: 13px; font-weight: 500; }
    .seo-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.06);
      margin: 36px 0;
    }
    .seo-faq-item { margin-bottom: 20px; }
    .seo-faq-item h3 { color: var(--text-primary); font-size: 16px; margin-bottom: 6px; }
    .seo-faq-item p { font-size: 14px; margin-bottom: 0; }
    .seo-step {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      align-items: flex-start;
    }
    .seo-step-num {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(79,125,243,0.15);
      border: 1px solid rgba(79,125,243,0.3);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }
    .seo-step-body h3 { margin-top: 0; }
    .seo-table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
    .seo-table th {
      text-align: left;
      padding: 10px 14px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      color: rgba(232,232,240,0.5);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }
    .seo-table td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      color: rgba(232,232,240,0.7);
    }
    .seo-table tr:last-child td { border-bottom: none; }
    .seo-related {
      background: var(--bg-surface);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 20px 24px;
      margin-top: 48px;
    }
    .seo-related h2 { margin-top: 0; font-size: 16px; }
    .seo-related ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .seo-related ul li a {
      display: inline-block;
      background: rgba(79,125,243,0.08);
      border: 1px solid rgba(79,125,243,0.15);
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 13px;
      color: rgba(79,125,243,0.85);
    }
    .seo-related ul li a:hover { text-decoration: none; background: rgba(79,125,243,0.15); }
    .seo-verdict {
      background: rgba(79,125,243,0.07);
      border: 1px solid rgba(79,125,243,0.18);
      border-radius: 10px;
      padding: 20px;
      margin: 28px 0;
    }
    .seo-verdict h3 { margin-top: 0; color: var(--accent); }
    .seo-check { color: #4ade80; font-size: 13px; margin-bottom: 6px; }
    .code-block {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: rgba(232,232,240,0.8);
      overflow-x: auto;
      margin: 16px 0;
      white-space: pre;
    }
    /* Footer */
    .seo-footer {
      border-top: 1px solid rgba(255,255,255,0.05);
      background: var(--bg-base);
      padding: 40px 24px;
    }
    .seo-footer-inner {
      max-width: 1100px;
      margin: 0 auto;
    }
    .seo-footer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 32px;
      margin-bottom: 32px;
    }
    .seo-footer-brand img { width: 22px; height: 22px; border-radius: 5px; vertical-align: middle; margin-right: 6px; }
    .seo-footer-brand span {
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      vertical-align: middle;
    }
    .seo-footer-tagline { font-size: 12px; color: rgba(232,232,240,0.25); line-height: 1.6; margin-top: 10px; max-width: 180px; }
    .seo-footer-col-title {
      font-family: var(--font-body);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: rgba(232,232,240,0.22);
      margin-bottom: 10px;
    }
    .seo-footer-col a {
      display: block;
      color: rgba(232,232,240,0.4);
      font-size: 12px;
      padding: 4px 0;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .seo-footer-col a:hover { opacity: 0.8; text-decoration: none; }
    .seo-footer-bottom {
      border-top: 1px solid rgba(255,255,255,0.04);
      padding-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .seo-footer-bottom p { font-size: 11px; color: rgba(232,232,240,0.2); margin-bottom: 0; }
    @media (max-width: 640px) {
      .seo-main { padding: 32px 16px 64px; }
    }
  </style>
</head>
<body>
  <nav class="seo-nav" aria-label="Main navigation">
    <div class="seo-nav-inner">
      <a href="/" class="seo-nav-brand">
        <img src="${logoSrc}" alt="Agent ID" />
        <span>Agent ID</span>
      </a>
      <a href="/sign-in?intent=register" class="seo-nav-cta">Get Started</a>
    </div>
  </nav>
  <main class="seo-main">
    ${body}
  </main>
  <footer class="seo-footer">
    <div class="seo-footer-inner">
      <div class="seo-footer-grid">
        <div class="seo-footer-brand">
          <img src="${logoSrc}" alt="Agent ID" /><span>Agent ID</span>
          <p class="seo-footer-tagline">Identity, Trust, and Routing for the Agent Internet.</p>
        </div>
        <div class="seo-footer-col">
          <p class="seo-footer-col-title">Product</p>
          <a href="/marketplace">Marketplace</a>
          <a href="/jobs">Jobs</a>
          <a href="/pricing">Pricing</a>
          <a href="/for-agents">For Agents</a>
        </div>
        <div class="seo-footer-col">
          <p class="seo-footer-col-title">Developers</p>
          <a href="/docs">Docs</a>
          <a href="/docs/quickstart">Quickstart</a>
          <a href="/docs/webhooks">Webhooks</a>
          <a href="/changelog">Changelog</a>
          <a href="https://status.getagent.id" target="_blank" rel="noopener noreferrer">Status</a>
        </div>
        <div class="seo-footer-col">
          <p class="seo-footer-col-title">Learn</p>
          <a href="/glossary">Glossary</a>
          <a href="/guides">How-To Guides</a>
          <a href="/use-cases">Use Cases</a>
          <a href="/compare">Comparisons</a>
        </div>
        <div class="seo-footer-col">
          <p class="seo-footer-col-title">Company</p>
          <a href="/protocol">About</a>
          <a href="/security">Security</a>
        </div>
        <div class="seo-footer-col">
          <p class="seo-footer-col-title">Legal</p>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </div>
      <div class="seo-footer-bottom">
        <p>&copy; ${new Date().getFullYear()} Agent ID. All rights reserved.</p>
        <p>Identity infrastructure for the agentic web</p>
      </div>
    </div>
  </footer>
</body>
</html>`;
}
