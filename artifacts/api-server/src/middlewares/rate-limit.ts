import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { env } from "../lib/env";
import { logger } from "./request-logger";

const baseOptions = {
  windowMs: 60 * 1000,
  standardHeaders: "draft-7" as const,
  legacyHeaders: true,
  validate: { xForwardedForHeader: false },
};

let redisStoreFactory: ((prefix: string) => unknown) | null = null;
let redisInitDone = false;
let redisInitPromise: Promise<void> | null = null;

async function ensureRedisStore(): Promise<void> {
  if (redisInitDone) return;
  if (redisInitPromise) {
    await redisInitPromise;
    return;
  }
  redisInitPromise = (async () => {
    try {
      const config = env();
      const redisUrl = config.REDIS_URL;
      if (!redisUrl) {
        logger.warn("[rate-limit] No REDIS_URL — using in-memory rate limit store");
        return;
      }
      const { default: RedisStore } = await import("rate-limit-redis");
      const { default: Redis } = await import("ioredis");
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        retryStrategy: (times) => (times > 2 ? null : Math.min(times * 500, 2000)),
        enableOfflineQueue: false,
      });
      client.on("error", (err) => {
        logger.warn({ err: err.message }, "[rate-limit] Redis error — rate limiting degraded to in-memory");
      });
      await client.connect();
      redisStoreFactory = (prefix: string) =>
        new RedisStore({
          sendCommand: (...args: string[]) =>
            (client as { call: (...a: string[]) => Promise<number> }).call(...args),
          prefix,
        });
      logger.info("[rate-limit] Redis-backed store initialized");
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[rate-limit] Failed to connect to Redis, using in-memory store");
    } finally {
      redisInitDone = true;
    }
  })();
  await redisInitPromise;
}

const limiters = new Map<string, ReturnType<typeof rateLimit>>();

function getLimiter(limit: number, prefix: string, windowMs = 60_000): ReturnType<typeof rateLimit> {
  const key = `${prefix}:${limit}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    const opts: Parameters<typeof rateLimit>[0] = {
      ...baseOptions,
      windowMs,
      limit,
      handler(req: Request, res: Response) {
        const requestId = (req as unknown as { requestId?: string }).requestId || req.headers["x-request-id"] || "unknown";
        res.status(429).json({
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
          requestId,
          details: { retryAfterSeconds: Math.ceil(windowMs / 1000) },
        });
      },
      ...(redisStoreFactory ? { store: redisStoreFactory(prefix) as never } : {}),
    };
    limiter = rateLimit(opts);
    limiters.set(key, limiter);
  }
  return limiter;
}

async function applyLimiter(limit: number, prefix: string, windowMs: number, req: Request, res: Response, next: NextFunction) {
  await ensureRedisStore();
  getLimiter(limit, prefix, windowMs)(req, res, next);
}

export function publicRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(100, "rl:pub:", 60_000, req, res, next);
}

export function userRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(500, "rl:usr:", 60_000, req, res, next);
}

export function agentRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(1000, "rl:agt:", 60_000, req, res, next);
}

export function resolutionRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(10_000, "rl:res:", 60_000, req, res, next);
}

export function registrationRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(10, "rl:reg:", 60_000, req, res, next);
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["x-agent-key"] || req.headers["authorization"]?.toString().startsWith("Bearer agk_")) {
    void applyLimiter(1000, "rl:agt:", 60_000, req, res, next);
    return;
  }
  if (req.user || req.headers["x-replit-user-id"]) {
    void applyLimiter(500, "rl:usr:", 60_000, req, res, next);
    return;
  }
  void applyLimiter(100, "rl:pub:", 60_000, req, res, next);
}
