import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { env } from "../lib/env";

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

async function pingRedis(): Promise<{ status: "ok" | "error" | "not_configured"; latencyMs: number }> {
  const config = env();
  if (!config.REDIS_URL) {
    return { status: "not_configured", latencyMs: 0 };
  }
  const start = Date.now();
  let client: import("ioredis").default | null = null;
  try {
    const { default: Redis } = await import("ioredis");
    client = new Redis(config.REDIS_URL, { connectTimeout: 3000, lazyConnect: true });
    client.on("error", () => {});
    await client.connect();
    await client.ping();
    await client.quit();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    if (client) { try { client.disconnect(); } catch {} }
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
