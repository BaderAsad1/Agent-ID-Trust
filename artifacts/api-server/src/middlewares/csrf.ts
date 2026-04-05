import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSessionId } from "../lib/auth";

const CSRF_COOKIE = "csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    if (!req.cookies?.[CSRF_COOKIE]) {
      res.cookie(CSRF_COOKIE, generateToken(), {
        httpOnly: false,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    next();
    return;
  }

  const hasApiKey = !!(req.headers["x-agent-key"] || req.headers["x-api-key"]);
  const hasBearer = !!req.headers.authorization?.startsWith("Bearer ");

  // API key / Bearer token auth is not cookie-based, so CSRF doesn't apply.
  // Cross-site requests with custom headers (X-Agent-Key, Authorization) require a CORS preflight,
  // which is blocked by the server's CORS policy — so an attacker cannot forge these from a third-party page.
  // NOTE: if a request carries BOTH a session cookie AND an API key, the API key takes precedence here.
  // This is safe because the API key is a secret the attacker does not know.
  if (hasApiKey || hasBearer) {
    next();
    return;
  }

  // No session cookie means the request is not browser-session-authenticated.
  // requireAuth will reject it independently — CSRF check is redundant for unauthenticated requests.
  const sessionId = getSessionId(req);
  if (!sessionId) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken) {
    res.status(403).json({
      error: "CSRF_MISSING",
      message: "CSRF token missing. Include the csrf cookie value in the X-CSRF-Token header.",
    });
    return;
  }

  // Compare using constant-time comparison only — do NOT short-circuit on length mismatch.
  // A length check before timingSafeEqual leaks token length as a timing oracle side-channel.
  const cookieBuf = Buffer.from(cookieToken, "utf8");
  const headerBuf = Buffer.from(headerToken, "utf8");
  const maxLen = Math.max(cookieBuf.length, headerBuf.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  cookieBuf.copy(a);
  headerBuf.copy(b);
  const valid = crypto.timingSafeEqual(a, b) && cookieBuf.length === headerBuf.length;

  if (!valid) {
    res.status(403).json({ error: "CSRF_INVALID", message: "CSRF token mismatch." });
    return;
  }

  next();
}
