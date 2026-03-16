import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { env } from "../lib/env";
import { isRedisConfigured, getRedisConnectionOptions } from "../lib/redis";

const router: IRouter = Router();

async function pingDatabase(): Promise<{ status: "ok" | "error"; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}

let sharedRedis: import("ioredis").default | null = null;
let sharedRedisReady = false;

async function getOrCreateRedis(): Promise<import("ioredis").default | null> {
  if (sharedRedis && sharedRedisReady) return sharedRedis;

  if (sharedRedis && !sharedRedisReady) {
    try { sharedRedis.disconnect(); } catch {}
    sharedRedis = null;
  }

  try {
    const { default: Redis } = await import("ioredis");
    const opts = getRedisConnectionOptions();
    sharedRedis = new Redis({
      ...opts,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    sharedRedis.on("ready", () => { sharedRedisReady = true; });
    sharedRedis.on("error", () => { sharedRedisReady = false; });
    sharedRedis.on("close", () => { sharedRedisReady = false; });
    await sharedRedis.connect();
    return sharedRedis;
  } catch {
    sharedRedis = null;
    sharedRedisReady = false;
    return null;
  }
}

async function pingRedis(): Promise<{ status: "ok" | "error" | "not_configured"; latencyMs: number }> {
  if (!isRedisConfigured()) {
    return { status: "not_configured", latencyMs: 0 };
  }
  const start = Date.now();
  try {
    const client = await getOrCreateRedis();
    if (!client) return { status: "error", latencyMs: Date.now() - start };
    await client.ping();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}

router.get("/healthz", async (_req, res) => {
  const config = env();
  const [dbResult, redisResult] = await Promise.all([
    pingDatabase(),
    pingRedis(),
  ]);

  const stripeConfigured = !!config.STRIPE_SECRET_KEY;
  const cloudflareConfigured = !!(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID);
  const resendConfigured = !!config.RESEND_API_KEY;

  const dbOk = dbResult.status === "ok";
  const redisOk = redisResult.status === "ok" || redisResult.status === "not_configured";

  let status: "healthy" | "degraded" | "unhealthy";
  if (dbOk && redisOk) {
    status = "healthy";
  } else if (dbOk) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  const httpStatus = status === "unhealthy" ? 503 : 200;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbResult,
      redis: redisResult,
      stripe: { configured: stripeConfigured },
      cloudflare: { configured: cloudflareConfigured },
      resend: { configured: resendConfigured },
    },
  });
});

export default router;
