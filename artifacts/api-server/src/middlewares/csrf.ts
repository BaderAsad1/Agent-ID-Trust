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

  if (hasApiKey || hasBearer) {
    next();
    return;
  }

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

  if (cookieToken.length !== headerToken.length) {
    res.status(403).json({ error: "CSRF_INVALID", message: "CSRF token mismatch." });
    return;
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(cookieToken, "utf8"),
    Buffer.from(headerToken, "utf8"),
  );

  if (!valid) {
    res.status(403).json({ error: "CSRF_INVALID", message: "CSRF token mismatch." });
    return;
  }

  next();
}
