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
import { env } from "./lib/env";

const config = env();

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
  const appUrl = config.APP_URL || "https://getagent.id";
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${appUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${appUrl}/for-agents</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${appUrl}/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${appUrl}/protocol</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${appUrl}/marketplace</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${appUrl}/jobs</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(sitemap);
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

const MCP_PORT = Number(process.env.MCP_PORT || 3001);

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

// Serve the built frontend SPA (works in both dev/tsx and production/CJS)
const frontendDist = path.join(process.cwd(), "artifacts/agent-id/dist/public");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    index: false,
    maxAge: "1d",
    immutable: true,
  }));
  // SPA fallback — serve index.html for any non-API, non-asset route (Express 5 compatible)
  app.get("/{*path}", (req, res, next) => {
    const p = req.path;
    if (/^\/(api|mcp|well-known|sitemap\.xml|agent|oauth|auth)(\/|$)/.test(p)) {
      return next();
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

export default app;
