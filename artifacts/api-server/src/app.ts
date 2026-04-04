import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import path from "path";
import fs from "fs";
import router from "./routes";
import wellKnownRouter from "./routes/well-known";
import authOidcRouter from "./routes/auth-oidc";
import oauthRouter from "./routes/oauth";
import seoRouter from "./routes/seo";
import { GLOSSARY_TERMS } from "./seo/glossary";
import { GUIDES } from "./seo/guides";
import { USE_CASES } from "./seo/use-cases";
import { COMPARISONS } from "./seo/comparisons";
import { securityHeaders } from "./middlewares/security-headers";
import { sandboxMiddleware } from "./middlewares/sandbox";
import { requestIdMiddleware } from "./middlewares/request-id";
import { requestLogger } from "./middlewares/request-logger";
import { replitAuth } from "./middlewares/replit-auth";
import { apiKeyAuth } from "./middlewares/api-key-auth";
import { errorHandler } from "./middlewares/error-handler";
import { cliDetect, cliMarkdownRoot } from "./middlewares/cli-markdown";
import { apiRateLimiter, handleCheckRateLimit } from "./middlewares/rate-limit";
import { agentUserAgentMiddleware } from "./middlewares/agent-ua";
import { csrfProtection } from "./middlewares/csrf";
import { generateAgentRegistrationMarkdown } from "./services/agent-markdown";
import { LLMS_TXT } from "./routes/llms-txt";
import { env } from "./lib/env";

const config = env();

const APP_URL = config.APP_URL || "https://getagent.id";

const app: Express = express();

// C2: Trust proxy is environment-driven; defaults to false (secure-by-default).
// In production behind Cloudflare+nginx, set TRUST_PROXY="2" or a CIDR list.
// An incorrect value here allows XFF spoofing that undermines IP-based rate limits.
const trustProxyValue: boolean | number | string = (() => {
  const raw = (config.TRUST_PROXY ?? "false").trim().toLowerCase();
  if (raw === "false") return false;
  if (raw === "true") return true;
  const n = Number(raw);
  if (!isNaN(n) && Number.isInteger(n) && n >= 0) return n;
  // CIDR string or comma-separated list — pass through to Express
  return raw;
})();

if (config.NODE_ENV === "production" && trustProxyValue === false) {
  throw new Error(
    "[security] FATAL: TRUST_PROXY is 'false' in production. " +
    "Set TRUST_PROXY to your proxy hop count (e.g. '2' for Cloudflare+nginx) or a CIDR range. " +
    "Running without proxy trust undermines IP-based rate limits and security controls.",
  );
}
app.set("trust proxy", trustProxyValue);

app.use((_req, res, next) => {
  res.setHeader("X-API-Version", "1");
  next();
});
app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(sandboxMiddleware);
app.use(requestLogger);

const corsOrigins: cors.CorsOptions["origin"] = (() => {
  if (config.NODE_ENV !== "production") return true;
  // Production: fail-closed CORS. ALLOWED_ORIGINS must be set explicitly.
  // If ALLOWED_ORIGINS is unset or empty, ALL cross-origin requests are denied.
  // This prevents a missing env var from accidentally opening CORS to any origin.
  // Example: ALLOWED_ORIGINS="https://getagent.id,https://app.getagent.id"
  if (!config.ALLOWED_ORIGINS) {
    // Empty array → cors() will deny all cross-origin requests
    return [];
  }
  const origins = config.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  return origins;
})();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Agent-Key",
    "X-Request-ID",
    "X-Api-Key",
    "X-CSRF-Token",
    "Accept",
  ],
  exposedHeaders: [
    "X-Request-ID",
    "X-Cache",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "Retry-After",
    "X-API-Version",
  ],
}));
app.use(cookieParser());

app.use(cliDetect);
app.use(cliMarkdownRoot);

app.use((req, res, next) => {
  if (req.path === "/api/v1/webhooks/stripe") {
    next();
    return;
  }
  if (req.path.startsWith("/api/v1/webhooks/resend/")) {
    express.json({
      limit: "100kb",
      verify: (incomingReq, _res, buf) => {
        (incomingReq as Request).rawBody = buf;
      },
    })(req, res, next);
    return;
  }
  express.json({ limit: "100kb" })(req, res, next);
});
app.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction): void => {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: "invalid_json",
      message: "Request body contains invalid JSON",
    });
    return;
  }
  if (err.type === "entity.too.large") {
    res.status(413).json({
      error: "payload_too_large",
      message: "Request body exceeds the 100kb limit",
    });
    return;
  }
  next(err);
});
app.use(express.urlencoded({ extended: true }));

app.use(replitAuth);
app.use(apiKeyAuth);
app.use("/api", csrfProtection);
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const p = req.path;
  if (p.startsWith("/v1/resolve") || p.startsWith("/.well-known/")) {
    return next();
  }
  if (p === "/v1/handles/check") {
    return handleCheckRateLimit(req, res, next);
  }
  return apiRateLimiter(req, res, next);
});
app.use("/api/v1", agentUserAgentMiddleware);

app.get("/sitemap.xml", (_req, res) => {
  const glossaryUrls = GLOSSARY_TERMS.map((t) => `  <url>
    <loc>${APP_URL}/glossary/${t.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join("\n");

  const guideUrls = GUIDES.map((g) => `  <url>
    <loc>${APP_URL}/guides/${g.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join("\n");

  const useCaseUrls = USE_CASES.map((u) => `  <url>
    <loc>${APP_URL}/use-cases/${u.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join("\n");

  const compareUrls = COMPARISONS.map((c) => `  <url>
    <loc>${APP_URL}/compare/${c.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${APP_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${APP_URL}/for-agents</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${APP_URL}/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${APP_URL}/protocol</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${APP_URL}/marketplace</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${APP_URL}/jobs</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${APP_URL}/security</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${APP_URL}/changelog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${APP_URL}/docs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${APP_URL}/docs/quickstart</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${APP_URL}/docs/webhooks</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${APP_URL}/docs/payments</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${APP_URL}/docs/sign-in</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${APP_URL}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${APP_URL}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${APP_URL}/glossary</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${glossaryUrls}
  <url>
    <loc>${APP_URL}/guides</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${guideUrls}
  <url>
    <loc>${APP_URL}/use-cases</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${useCaseUrls}
  <url>
    <loc>${APP_URL}/compare</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${compareUrls}
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(sitemap);
});

app.get("/llms.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(LLMS_TXT);
});

app.get("/agent", (_req, res) => {
  const md = generateAgentRegistrationMarkdown();
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(md);
});

app.get("/api/agent", (_req, res) => {
  const md = generateAgentRegistrationMarkdown();
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(md);
});

app.use(wellKnownRouter);
app.use("/api", wellKnownRouter);
app.use("/api", authOidcRouter);
app.use("/oauth", oauthRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api", router);
app.use(seoRouter);

const MCP_PORT = Number(process.env.MCP_PORT || 3001);

function proxyToMcp(req: Request, res: Response, targetPath: string) {
  const headers: Record<string, string | string[] | undefined> = { ...req.headers };
  headers.host = `127.0.0.1:${MCP_PORT}`;
  headers["content-length"] = "0";

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: MCP_PORT,
    path: targetPath,
    method: req.method,
    headers: headers as http.OutgoingHttpHeaders,
  };
  const proxy = http.request(options, (proxyRes) => {
    const resHeaders: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      resHeaders[k] = v as string | string[] | undefined;
    }
    res.writeHead(proxyRes.statusCode ?? 502, resHeaders);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on("error", (_err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: "MCP server unavailable", code: "MCP_UNAVAILABLE" });
    }
  });
  proxy.end();
}

app.get("/mcp/.well-known/mcp.json", (req: Request, res: Response) => {
  proxyToMcp(req, res, "/.well-known/mcp.json");
});

app.get("/mcp/health", (req: Request, res: Response) => {
  proxyToMcp(req, res, "/health");
});

app.all("/mcp", async (req: Request, res: Response, next: NextFunction) => {
  const { tryAgentAuth } = await import("./middlewares/agent-auth");
  tryAgentAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.authenticatedAgent && !req.userId) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "MCP proxy requires authentication via X-Agent-Key header or Authorization bearer token",
        requestId: req.requestId ?? "unknown",
      });
      return;
    }
    next();
  });
}, (req: Request, res: Response) => {
  const bodyStr = req.body && typeof req.body === "object"
    ? JSON.stringify(req.body)
    : typeof req.body === "string"
      ? req.body
      : undefined;

  const headers: Record<string, string | string[] | undefined> = { ...req.headers };
  headers.host = `127.0.0.1:${MCP_PORT}`;
  if (bodyStr) {
    headers["content-length"] = Buffer.byteLength(bodyStr).toString();
    headers["content-type"] = headers["content-type"] ?? "application/json";
  } else {
    headers["content-length"] = "0";
  }

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: MCP_PORT,
    path: "/mcp",
    method: req.method,
    headers: headers as http.OutgoingHttpHeaders,
  };
  const proxy = http.request(options, (proxyRes) => {
    const resHeaders: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      resHeaders[k] = v as string | string[] | undefined;
    }
    res.writeHead(proxyRes.statusCode ?? 502, resHeaders);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on("error", (_err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: "MCP server unavailable", code: "MCP_UNAVAILABLE" });
    }
  });
  if (bodyStr) {
    proxy.end(bodyStr);
  } else {
    proxy.end();
  }
});

// SEO meta-tag injection: page-specific meta for key public routes
interface PageMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  canonical: string;
}

const PAGE_META: Record<string, PageMeta> = {
  "/": {
    title: "Agent ID — Identity, Trust & Routing for AI Agents",
    description: "Agent ID is the identity and trust layer for autonomous AI agents. Verified identity, portable trust scores, and protocol-native resolution for every agent on the open internet.",
    ogTitle: "Agent ID — Identity, Trust & Routing for AI Agents",
    ogDescription: "The identity and trust layer for AI agents. Verified identity, portable trust scores, and protocol-native resolution for every autonomous agent.",
    canonical: `${APP_URL}/`,
  },
  "/pricing": {
    title: "Pricing — Agent ID",
    description: "Simple, transparent pricing for Agent ID. Start free with UUID machine identity and API access. Upgrade for handles, fleet management, and advanced features.",
    ogTitle: "Agent ID Pricing — Start Free, Scale as You Grow",
    ogDescription: "Free plan available. No payment required to get started. Upgrade for handles, fleet management, inbox, and more.",
    canonical: `${APP_URL}/pricing`,
  },
  "/for-agents": {
    title: "For AI Agents — Agent ID",
    description: "Agent ID provides programmatic identity registration, cryptographic verification, and protocol-native resolution for autonomous AI agents. One API call to get started.",
    ogTitle: "Agent ID for AI Agents — Programmatic Identity & Trust",
    ogDescription: "Register, verify, and resolve AI agent identities programmatically. One POST call. No human required.",
    canonical: `${APP_URL}/for-agents`,
  },
  "/protocol": {
    title: "The Agent ID Protocol — Identity Resolution for AI Agents",
    description: "The Agent ID Protocol provides open, decentralized identity resolution for autonomous AI agents via .agentid addresses, DID-based identifiers, and well-known endpoints.",
    ogTitle: "The Agent ID Protocol — Open Identity for AI Agents",
    ogDescription: "Protocol-native identity resolution for AI agents. .agentid addresses, DID-based identifiers, and well-known endpoints for every agent.",
    canonical: `${APP_URL}/protocol`,
  },
  "/marketplace": {
    title: "Agent Marketplace — Hire Verified AI Agents",
    description: "Browse and hire verified AI agents on the Agent ID Marketplace. Filter by capability, trust score, and pricing. Only verified agents with proven track records.",
    ogTitle: "Agent Marketplace — Hire Verified AI Agents",
    ogDescription: "Browse verified AI agents available for hire. Filter by capability, trust score, and price. Powered by Agent ID.",
    canonical: `${APP_URL}/marketplace`,
  },
  "/jobs": {
    title: "Agent Job Board — Post Work for AI Agents",
    description: "Post jobs for AI agents on the Agent ID Job Board. Specify required capabilities, trust thresholds, and budgets. Verified agents submit proposals.",
    ogTitle: "Agent Job Board — Post Work for AI Agents",
    ogDescription: "Post jobs for verified AI agents. Set capability requirements, minimum trust scores, and budgets. Only verified agents apply.",
    canonical: `${APP_URL}/jobs`,
  },
  "/security": {
    title: "Security — Agent ID",
    description: "Agent ID security practices, responsible disclosure policy, and cryptographic identity verification details for the Agent ID platform.",
    ogTitle: "Security at Agent ID",
    ogDescription: "Cryptographic identity verification, responsible disclosure, and security practices for the Agent ID platform.",
    canonical: `${APP_URL}/security`,
  },
  "/changelog": {
    title: "Changelog — Agent ID",
    description: "What's new in Agent ID. Follow platform updates, API changes, and new features for the identity and trust layer for AI agents.",
    ogTitle: "Agent ID Changelog — What's New",
    ogDescription: "Platform updates, API changes, and new features for Agent ID.",
    canonical: `${APP_URL}/changelog`,
  },
  "/docs": {
    title: "Documentation — Agent ID",
    description: "Developer documentation for Agent ID. API reference, quickstart guides, webhooks, payments, and integration examples for AI agent identity and trust.",
    ogTitle: "Agent ID Documentation",
    ogDescription: "API reference, quickstart guides, and integration examples for building with Agent ID.",
    canonical: `${APP_URL}/docs`,
  },
  "/docs/quickstart": {
    title: "Quickstart Guide — Agent ID Docs",
    description: "Get started with Agent ID in minutes. Register your first AI agent, verify ownership, and resolve identities with this step-by-step quickstart guide.",
    ogTitle: "Agent ID Quickstart Guide",
    ogDescription: "Register and verify your first AI agent identity in minutes with the Agent ID quickstart guide.",
    canonical: `${APP_URL}/docs/quickstart`,
  },
  "/docs/webhooks": {
    title: "Webhooks — Agent ID Docs",
    description: "Configure and receive real-time webhook notifications for Agent ID events: tasks, hires, trust changes, and more.",
    ogTitle: "Agent ID Webhooks Documentation",
    ogDescription: "Real-time webhook notifications for tasks, hires, trust changes, and more on Agent ID.",
    canonical: `${APP_URL}/docs/webhooks`,
  },
  "/docs/payments": {
    title: "Payments & Escrow — Agent ID Docs",
    description: "Accept payments and manage escrow for AI agent tasks on Agent ID. Powered by Stripe Connect with automatic 48-hour release windows.",
    ogTitle: "Agent ID Payments & Escrow Documentation",
    ogDescription: "Accept payments and manage escrow for AI agent tasks. Powered by Stripe Connect.",
    canonical: `${APP_URL}/docs/payments`,
  },
  "/docs/sign-in": {
    title: "Authentication — Agent ID Docs",
    description: "Authenticate users and agents with Agent ID's OpenID Connect implementation. API key authentication, OAuth flows, and agent key-signing.",
    ogTitle: "Agent ID Authentication Documentation",
    ogDescription: "API key auth, OAuth flows, and agent key-signing for Agent ID.",
    canonical: `${APP_URL}/docs/sign-in`,
  },
  "/terms": {
    title: "Terms of Service — Agent ID",
    description: "Agent ID Terms of Service. Review the terms governing use of the Agent ID platform, API, and services.",
    ogTitle: "Agent ID Terms of Service",
    ogDescription: "Terms governing use of the Agent ID platform, API, and services.",
    canonical: `${APP_URL}/terms`,
  },
  "/privacy": {
    title: "Privacy Policy — Agent ID",
    description: "Agent ID Privacy Policy. Learn how we collect, use, and protect your data on the Agent ID platform.",
    ogTitle: "Agent ID Privacy Policy",
    ogDescription: "How Agent ID collects, uses, and protects your data.",
    canonical: `${APP_URL}/privacy`,
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectMeta(html: string, meta: PageMeta): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escapeHtml(meta.description)}"`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${escapeHtml(meta.canonical)}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${escapeHtml(meta.canonical)}"`);
}

// Serve the built frontend SPA (works in both dev/tsx and production/CJS)
const frontendDist = path.join(process.cwd(), "artifacts/agent-id/dist/public");
if (fs.existsSync(frontendDist)) {
  const indexHtmlPath = path.join(frontendDist, "index.html");
  let cachedIndexHtml: string | null = null;

  function getIndexHtml(): string {
    if (!cachedIndexHtml) {
      cachedIndexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
    }
    return cachedIndexHtml;
  }

  app.use(express.static(frontendDist, {
    index: false,
    maxAge: "1d",
    immutable: true,
  }));

  // SPA fallback — serve index.html for any non-API, non-asset route (Express 5 compatible)
  app.get("/{*path}", async (req: Request, res: Response, next: NextFunction) => {
    const p = req.path;
    if (/^\/(api|mcp|\.well-known|sitemap\.xml|agent|oauth|auth|llms\.txt|glossary|guides|use-cases|compare)(\/|$)/.test(p)) {
      return next();
    }

    const baseHtml = getIndexHtml();

    // Check for exact static page meta
    if (PAGE_META[p]) {
      const html = injectMeta(baseHtml, PAGE_META[p]);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
      return;
    }

    // Agent profile: /:handle — look up by handle for meta injection
    const handleMatch = p.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (handleMatch) {
      const handle = handleMatch[1];
      // All known non-profile single-segment routes — these fall through to unchanged index.html
      const reservedPaths = new Set([
        "sign-in", "login", "register", "get-started", "start", "claim",
        "magic-link", "onboarding", "dashboard", "mail", "marketplace",
        "jobs", "integrations", "docs", "for-agents", "pricing", "protocol",
        "terms", "privacy", "changelog", "security", "org", "u", "id",
        "handle", "authorize", "api", "mcp", "oauth", "auth", "well-known",
        "sitemap.xml", "agent", "llms.txt", "robots.txt",
        "glossary", "guides", "use-cases", "compare",
      ]);
      if (!reservedPaths.has(handle)) {
        try {
          const { getAgentByHandle } = await import("./services/agents");
          const agent = await getAgentByHandle(handle);
          if (agent && agent.status === "active" && agent.isPublic) {
            const agentName = agent.displayName || handle;
            const agentDesc = agent.description
              ? agent.description.slice(0, 160)
              : `${agentName} is a verified AI agent on Agent ID. View their trust score, capabilities, and hire them for tasks.`;
            const profileUrl = `${APP_URL}/${handle}`;
            const meta: PageMeta = {
              title: `${agentName} (@${handle}) — Agent ID`,
              description: agentDesc,
              ogTitle: `${agentName} on Agent ID`,
              ogDescription: agentDesc,
              canonical: profileUrl,
            };
            const html = injectMeta(baseHtml, meta);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          } else {
            // Unknown or inactive agent — generic not-found meta
            const meta: PageMeta = {
              title: `Agent Not Found — Agent ID`,
              description: `No active Agent ID profile found for @${handle}. Browse verified AI agents on the Agent ID Marketplace.`,
              ogTitle: `Agent Not Found — Agent ID`,
              ogDescription: `No active Agent ID profile found for @${handle}.`,
              canonical: `${APP_URL}/${handle}`,
            };
            const html = injectMeta(baseHtml, meta);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
        } catch (err) {
          console.error(`[seo] handle meta lookup failed for /:${handle}:`, err);
          // Fall through to serve unmodified index.html on DB errors
        }
      }
    }

    res.sendFile(indexHtmlPath);
  });
}

app.use(errorHandler);

export default app;
