import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./request-logger";
import { getSharedRedis, isRedisConfigured } from "../lib/redis";

// C2/C3: Rate limiting backend health tracking.
// redisHealthy: tracks current real-time Redis health (updated by event handlers).
// redisStoreFactory: factory to create a Redis-backed store for a given prefix.
// Once Redis transitions unavailable→available, the factory is restored AND the limiter
// cache is cleared so new limiters use the fresh Redis store.
let redisHealthy = false;
let redisStoreFactory: ((prefix: string) => unknown) | null = null;
let redisInitDone = false;
let redisInitPromise: Promise<void> | null = null;

// Limiter cache: created once per (prefix, limit, windowMs) tuple.
// The store type (Redis vs in-memory) is fixed at creation time.
// Cache is ONLY invalidated on Redis reconnect (unavailable→available), not on error,
// to preserve in-flight counters when Redis drops.
const limiters = new Map<string, ReturnType<typeof rateLimit>>();

async function ensureRedisStore(): Promise<void> {
  if (redisInitDone) return;
  if (redisInitPromise) {
    await redisInitPromise;
    return;
  }
  redisInitPromise = (async () => {
    try {
      if (!isRedisConfigured()) {
        logger.warn("[rate-limit] No REDIS_URL — using in-memory rate limit store. Registration endpoint will hard-block.");
        return;
      }
      const { default: RedisStore } = await import("rate-limit-redis");
      const client = getSharedRedis();

      const makeFactory = () => (prefix: string) =>
        new RedisStore({
          sendCommand: (...args: string[]) =>
            (client as { call: (...a: string[]) => Promise<number> }).call(...args),
          prefix,
        });

      client.on("error", (err) => {
        if (redisHealthy) {
          logger.error({ err: err.message }, "[rate-limit] ALERT: Redis error — rate limiting degraded to in-memory. Registration endpoint will hard-block new requests.");
        }
        redisHealthy = false;
        redisStoreFactory = null;
        // Intentionally NOT clearing limiterCache on error to preserve active counters.
        // New limiters created while Redis is down will use in-memory store.
      });
      client.on("connect", () => {
        if (!redisHealthy) {
          redisStoreFactory = makeFactory();
          redisHealthy = true;
          // Note: We do NOT clear the limiter cache on reconnect.
          // Existing limiters keep their in-memory counters for the current window.
          // New limiters (for new prefixes/windows created after reconnect) will use Redis.
          // This avoids counter resets that could allow burst traffic after a Redis blip.
        }
      });

      const pingResult = await client.ping().catch(() => null);
      if (pingResult !== "PONG") {
        logger.error("[rate-limit] ALERT: Redis ping failed — rate limiting degraded to in-memory. Registration endpoint will hard-block.");
        return;
      }

      redisHealthy = true;
      redisStoreFactory = makeFactory();
      logger.info("[rate-limit] Redis-backed store initialized");
    } catch (err) {
      logger.error({ err: (err as Error).message }, "[rate-limit] ALERT: Failed to connect to Redis — rate limiting degraded to in-memory. Registration endpoint will hard-block.");
    } finally {
      redisInitDone = true;
    }
  })();
  await redisInitPromise;
}

function getLimiter(limit: number, prefix: string, windowMs = 60_000): ReturnType<typeof rateLimit> {
  const key = `${prefix}:${limit}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    // Attempt to create a Redis-backed store; gracefully fall back to in-memory if store creation fails.
    let store: never | undefined;
    if (redisStoreFactory) {
      try {
        store = redisStoreFactory(prefix) as never;
      } catch (err) {
        logger.error({ err: (err as Error).message }, "[rate-limit] Failed to create Redis store instance — falling back to in-memory for this limiter");
        // Don't touch redisStoreFactory or limiters cache — just let this limiter use in-memory
      }
    }

    const opts: Parameters<typeof rateLimit>[0] = {
      windowMs,
      limit,
      standardHeaders: "draft-7" as const,
      legacyHeaders: true,
      validate: {
        xForwardedForHeader: false,
        // We use req.ip (Express-validated, trust-proxy-aware) for rate-limit keying.
        keyGeneratorIpFallback: false,
      },
      keyGenerator: (req: Request): string => {
        return req.ip ?? req.socket?.remoteAddress ?? "unknown";
      },
      handler(req: Request, res: Response) {
        const requestId = (req as unknown as { requestId?: string }).requestId || req.headers["x-request-id"] || "unknown";
        res.status(429).json({
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
          requestId,
          details: { retryAfterSeconds: Math.ceil(windowMs / 1000) },
        });
      },
      ...(store ? { store } : {}),
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

/**
 * Clear all cached limiter instances and reset Redis factory. Used in tests only to prevent
 * state leakage between test cases (cached limiters carry accumulated request counts).
 * Clears redisStoreFactory to avoid re-using a potentially closed Redis client in new limiters.
 * @internal
 */
export function _resetLimitersForTesting(): void {
  limiters.clear();
  redisStoreFactory = null;
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

export function registrationRateLimitStrict(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await ensureRedisStore();

    // C3: Hard-block registration if rate-limiting backend is unhealthy in production.
    // In-memory fallback is insufficient for distributed/horizontally-scaled deployments
    // because each process has a separate counter, making per-IP limits ineffective.
    if (!redisHealthy && process.env.NODE_ENV === "production") {
      logger.error("[rate-limit] ALERT: Registration hard-blocked — Redis unavailable in production");
      res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        message: "Registration temporarily unavailable. Please try again shortly.",
        code: "RATE_LIMIT_BACKEND_UNAVAILABLE",
      });
      return;
    }

    // Use getLimiter (not cache key lookup) so that limiters are re-evaluated
    // after Redis reconnects and limiters cache is cleared.
    getLimiter(10, "rl:reg:", 60_000)(req, res, next);
  })().catch(next);
}

export function authChallengeRateLimit(req: Request, res: Response, next: NextFunction): void {
  const agentId = (req.body as { agentId?: string })?.agentId;
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const key = agentId ? `${agentId}:${ip}` : ip;
  void applyLimiter(5, `rl:auth-challenge:${key}:`, 60_000, req, res, next);
}

export function recoveryRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(5, "rl:rec:", 600_000, req, res, next);
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

export function challengeRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(5, "rl:challenge:", 60_000, req, res, next);
}

/**
 * H1: Rate limit for magic-link send endpoint.
 * 5 requests per 15 minutes per IP to prevent email-bombing attacks.
 */
export function magicLinkSendRateLimit(req: Request, res: Response, next: NextFunction): void {
  void applyLimiter(5, "rl:magic-send:", 15 * 60_000, req, res, next);
}
