import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH || "/";

const KNOWN_APP_ROUTES = new Set([
  "start",
  "sign-in",
  "for-agents",
  "pricing",
  "marketplace",
  "jobs",
  "dashboard",
  "protocol",
  "docs",
  "agent",
  "v2",
  "api",
  ".well-known",
]);

const CLI_USER_AGENTS = [
  "curl/",
  "wget/",
  "httpie/",
  "libfetch",
  "python-requests",
  "python-httpx",
  "python-urllib",
  "go-http-client",
  "node-fetch",
  "undici",
  "axios/",
  "got/",
  "powershell",
];

const LLM_AND_BOT_USER_AGENTS = [
  "claude",
  "gpt",
  "openai",
  "langchain",
  "llamaindex",
  "autogen",
  "crewai",
  "agentid-sdk",
  "googlebot",
  "bingbot",
  "gptbot",
  "claudebot",
  "openai-searchbot",
  "perplexitybot",
  "aiohttp",
];

function isNonBrowser(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const ua = (String(req.headers["user-agent"] || "")).toLowerCase();
  const accept = String(req.headers["accept"] || "");

  if (req.headers["x-agent-key"]) return true;

  if (accept.includes("text/html") && ua.includes("mozilla")) return false;

  for (const pattern of CLI_USER_AGENTS) {
    if (ua.includes(pattern)) return true;
  }

  for (const pattern of LLM_AND_BOT_USER_AGENTS) {
    if (ua.includes(pattern)) return true;
  }

  if (ua.includes("mozilla")) return false;

  if (accept && accept !== "*/*") {
    const acceptsHtml = accept.includes("text/html") || accept.includes("application/xhtml+xml");
    if (!acceptsHtml) return true;
  }

  if (accept === "*/*" && ua && !ua.includes("mozilla")) return true;

  return false;
}

function agentDetectionPlugin(): Plugin {
  return {
    name: "agent-detection",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }

        if (!isNonBrowser(req)) {
          next();
          return;
        }

        const url = req.url || "/";
        const pathname = url.split("?")[0];

        if (pathname === "/" || pathname === "") {
          res.writeHead(302, { Location: "/api/llms.txt" });
          res.end();
          return;
        }

        const segments = pathname.replace(/^\//, "").split("/");
        const firstSegment = segments[0];

        if (
          firstSegment &&
          !KNOWN_APP_ROUTES.has(firstSegment) &&
          !firstSegment.startsWith("@") &&
          !firstSegment.includes(".") &&
          /^[a-zA-Z0-9]/.test(firstSegment)
        ) {
          res.writeHead(302, { Location: `/api/v1/resolve/${firstSegment}` });
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    agentDetectionPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  define: {
    'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(
      process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env.STRIPE_PK ||
      ''
    ),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
