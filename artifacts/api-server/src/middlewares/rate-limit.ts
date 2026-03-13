import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const baseOptions = {
  windowMs: 60 * 1000,
  limit: (req: Request) => (req.user ? 500 : 100),
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    code: "RATE_LIMIT_EXCEEDED",
    retryAfterSeconds: 60,
  },
  validate: { xForwardedForHeader: false },
};

let limiter: ReturnType<typeof rateLimit> = rateLimit(baseOptions);

async function tryUpgradeToRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const { default: RedisStore } = await import("rate-limit-redis");
    const { default: Redis } = await import("ioredis");
    const client = new Redis(redisUrl);
    limiter = rateLimit({
      ...baseOptions,
      store: new RedisStore({
        sendCommand: (...args: string[]) =>
          (client as { call: (...a: string[]) => Promise<number> }).call(
            ...args,
          ),
        prefix: "rl:",
      }),
    });
    console.log("[rate-limit] Upgraded to Redis-backed store");
  } catch {
    console.warn(
      "[rate-limit] Failed to connect to Redis, using in-memory store",
    );
  }
}

tryUpgradeToRedis();

export function apiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  limiter(req, res, next);
}
