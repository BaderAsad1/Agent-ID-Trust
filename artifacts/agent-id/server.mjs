import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? Number(process.env.PORT) : 21766;
const API_SERVER_PORT = process.env.API_SERVER_PORT ? Number(process.env.API_SERVER_PORT) : 8080;
const STATIC_DIR = path.resolve(__dirname, "dist/public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function proxyToApiServer(req, res, apiPath) {
  const options = {
    hostname: "localhost",
    port: API_SERVER_PORT,
    path: apiPath,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: `localhost:${API_SERVER_PORT}` }),
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("[well-known-proxy] Error proxying to api-server:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad Gateway", message: "Could not reach api-server" }));
  });

  req.pipe(proxyReq);
}

/**
 * Safely resolve a request pathname to a file under STATIC_DIR.
 * Returns null if the resolved path escapes STATIC_DIR (path traversal).
 */
function resolveStaticPath(pathname) {
  // Strip leading slash so path.join doesn't discard STATIC_DIR
  const relative = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(STATIC_DIR, relative);
  // Ensure the resolved path stays within STATIC_DIR
  if (!resolved.startsWith(STATIC_DIR + path.sep) && resolved !== STATIC_DIR) {
    return null;
  }
  return resolved;
}

function serveStaticFile(req, res, filePath) {
  // Double-check containment (defensive)
  if (!filePath || !filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      serveIndexHtml(res);
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const maxAge = ext === ".html" ? "no-cache" : "public, max-age=86400, immutable";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": maxAge,
      "Content-Length": stat.size,
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

let cachedIndexHtml = null;

function serveIndexHtml(res) {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (cachedIndexHtml) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(cachedIndexHtml);
    return;
  }

  fs.readFile(indexPath, "utf-8", (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error: index.html not found");
      return;
    }
    cachedIndexHtml = data;
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  // Proxy /.well-known/* to the api-server (preserve query string)
  if (pathname.startsWith("/.well-known/")) {
    const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    const apiPath = `/api${pathname}${qs}`;
    console.log(`[well-known-proxy] ${req.method} ${pathname} -> api-server${apiPath}`);
    proxyToApiServer(req, res, apiPath);
    return;
  }

  // Root: serve index.html directly
  if (pathname === "/" || pathname === "") {
    serveIndexHtml(res);
    return;
  }

  // Resolve and validate the static file path (path traversal protection)
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // If the path has a file extension, try to serve the static asset
  const ext = path.extname(pathname);
  if (ext) {
    serveStaticFile(req, res, filePath);
    return;
  }

  // No extension → SPA route, serve index.html
  serveIndexHtml(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[agent-id] Server listening on port ${PORT}`);
  console.log(`[agent-id] Proxying /.well-known/* -> localhost:${API_SERVER_PORT}/api/.well-known/*`);
  console.log(`[agent-id] Serving static files from ${STATIC_DIR}`);
});
