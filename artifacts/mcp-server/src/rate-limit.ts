import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 30_000).unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const key = authHeader || req.ip || "unknown";
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000);
    const resetTime = Math.ceil((entry.timestamps[0] + WINDOW_MS) / 1000);
    res.setHeader("RateLimit-Limit", String(MAX_REQUESTS));
    res.setHeader("RateLimit-Remaining", "0");
    res.setHeader("RateLimit-Reset", String(resetTime));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Maximum 100 requests per minute.",
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  entry.timestamps.push(now);

  const remaining = Math.max(0, MAX_REQUESTS - entry.timestamps.length);
  const resetTime = Math.ceil((entry.timestamps[0] + WINDOW_MS) / 1000);

  res.setHeader("RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetTime));

  next();
}
