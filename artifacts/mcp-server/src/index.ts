import express from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger, requestLogger } from "./logger.js";
import { extractBearerToken, verifyApiKey } from "./auth.js";
import { createSession, getSession, deleteSession } from "./sessions.js";
import { rateLimiter } from "./rate-limit.js";
import { registerAllTools } from "./tools/index.js";

const TOOL_LIST = [
  "agentid_whoami",
  "agentid_register",
  "agentid_resolve",
  "agentid_discover",
  "agentid_send_task",
  "agentid_send_message",
  "agentid_check_inbox",
  "agentid_verify_credential",
  "agentid_spawn_subagent",
  "agentid_get_trust",
];

const SSE_KEEPALIVE_MS = 30_000;

const app = express();

app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    name: "Agent ID MCP Server",
    version: "1.0.0",
    description: "MCP server for the Agent ID identity network. Discover, verify, message, and route tasks to AI agents.",
    transport: {
      type: "streamable-http",
      url: "/mcp",
      authentication: {
        type: "bearer",
        prefix: "agk_",
      },
    },
    tools: TOOL_LIST.map((name) => ({ name })),
  });
});

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  apiKey: string;
}

const transports = new Map<string, SessionEntry>();

/**
 * Timing-safe API key comparison for session ownership checks.
 * Prevents timing-oracle attacks where an attacker could guess session keys
 * byte-by-byte by measuring response latency differences.
 */
function apiKeyMatches(provided: string, stored: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(stored, "utf8");
  const maxLen = Math.max(a.length, b.length);
  const pa = Buffer.alloc(maxLen);
  const pb = Buffer.alloc(maxLen);
  a.copy(pa);
  b.copy(pb);
  return timingSafeEqual(pa, pb);
}

function evictExpiredSessions() {
  for (const [sessionId, entry] of transports) {
    const session = getSession(sessionId);
    if (!session) {
      logger.info({ sessionId }, "[mcp] Evicting expired session transport");
      entry.transport.close().catch(() => {});
      transports.delete(sessionId);
      deleteSession(sessionId);
    }
  }
}

setInterval(evictExpiredSessions, 60_000).unref();

async function authenticateAndAuthorize(
  req: express.Request,
  res: express.Response,
  requireSessionOwnership = false,
): Promise<{ token: string; sessionId?: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or invalid Authorization header. Expected: Bearer agk_...",
    });
    return null;
  }

  const authResult = await verifyApiKey(token);
  if (!authResult.valid) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: authResult.error || "Invalid API key",
    });
    return null;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (requireSessionOwnership && sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: "SESSION_NOT_FOUND",
        message: "Session expired or invalid. Start a new session.",
      });
      return null;
    }
    if (!apiKeyMatches(token, session.apiKey)) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "API key does not match session owner",
      });
      return null;
    }
  }

  return { token, sessionId };
}

app.post("/mcp", rateLimiter, express.json(), async (req, res) => {
  const auth = await authenticateAndAuthorize(req, res, true);
  if (!auth) return;

  const { token, sessionId: existingSessionId } = auth;

  if (existingSessionId) {
    const existing = transports.get(existingSessionId);
    if (existing) {
      if (!apiKeyMatches(token, existing.apiKey)) {
        res.status(403).json({
          error: "FORBIDDEN",
          message: "API key does not match session owner",
        });
        return;
      }
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }
    res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: "Session expired or invalid. Start a new session without mcp-session-id header.",
    });
    return;
  }

  const authResult = await verifyApiKey(token);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      createSession(sessionId, token, authResult.agentData || {});
      transports.set(sessionId, { transport, server, apiKey: token });
      logger.info({ sessionId }, "[mcp] Session initialized");
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      transports.delete(sid);
      deleteSession(sid);
      logger.info({ sessionId: sid }, "[mcp] Transport closed");
    }
  };

  const server = new McpServer({
    name: "agentid-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, token, () => transport.sessionId);

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", rateLimiter, async (req, res) => {
  const auth = await authenticateAndAuthorize(req, res, true);
  if (!auth) return;

  const { sessionId } = auth;
  if (!sessionId) {
    res.status(400).json({
      error: "MISSING_SESSION",
      message: "mcp-session-id header is required for SSE connections",
    });
    return;
  }

  const existing = transports.get(sessionId);
  if (!existing) {
    res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: "Session expired or invalid",
    });
    return;
  }

  if (!apiKeyMatches(auth.token, existing.apiKey)) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "API key does not match session owner",
    });
    return;
  }

  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keepalive\n\n");
    }
  }, SSE_KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepalive);
  });

  await existing.transport.handleRequest(req, res);
});

app.delete("/mcp", rateLimiter, async (req, res) => {
  const auth = await authenticateAndAuthorize(req, res, true);
  if (!auth) return;

  const { sessionId } = auth;
  if (!sessionId) {
    res.status(400).json({
      error: "MISSING_SESSION",
      message: "mcp-session-id header is required",
    });
    return;
  }

  const existing = transports.get(sessionId);
  if (!existing) {
    res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: "Session not found or already terminated",
    });
    return;
  }

  if (!apiKeyMatches(auth.token, existing.apiKey)) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "API key does not match session owner",
    });
    return;
  }

  await existing.transport.close();
  transports.delete(sessionId);
  deleteSession(sessionId);

  logger.info({ sessionId }, "[mcp] Session terminated by client");
  res.status(200).json({ success: true, message: "Session terminated" });
});

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  logger.info({ port }, `MCP server listening on port ${port}`);
});
