import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { env } from "../lib/env";
import { isRedisConfigured, getSharedRedis } from "../lib/redis";
import { getWorkersInFailureState } from "../workers/worker-failure";

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
  if (!isRedisConfigured()) {
    return { status: "not_configured", latencyMs: 0 };
  }
  const start = Date.now();
  try {
    const client = getSharedRedis();
    await client.ping();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}

// /livez — Liveness probe. The process is up and the event loop is responsive.
// Use this for load-balancer "is the container alive?" checks. It does NOT
// touch dependencies and will never return 503 unless the process is wedged.
router.get("/livez", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// /readyz — Readiness probe. The process is ready to serve traffic, meaning
// DB + Redis (if configured) + workers are all healthy. Returns 503 when any
// critical dependency is down so load-balancers route around this instance.
router.get("/readyz", async (_req, res) => {
  const [dbResult, redisResult] = await Promise.all([
    pingDatabase(),
    pingRedis(),
  ]);
  const failingWorkers = getWorkersInFailureState();
  const workerStatus = Object.keys(failingWorkers).length === 0 ? "ok" : "degraded";
  const dbOk = dbResult.status === "ok";
  const redisOk = redisResult.status === "ok" || redisResult.status === "not_configured";
  const ready = dbOk && redisOk && workerStatus === "ok";
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    services: { database: dbResult, redis: redisResult },
    workers: { status: workerStatus, failing: failingWorkers },
  });
});

router.get("/healthz", async (_req, res) => {
  const config = env();
  const [dbResult, redisResult] = await Promise.all([
    pingDatabase(),
    pingRedis(),
  ]);

  const stripeConfigured = !!config.STRIPE_SECRET_KEY;
  const cloudflareConfigured = !!(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID);
  const resendConfigured = !!config.RESEND_API_KEY;

  const failingWorkers = getWorkersInFailureState();
  const workerStatus = Object.keys(failingWorkers).length === 0 ? "ok" : "degraded";

  const dbOk = dbResult.status === "ok";
  const redisOk = redisResult.status === "ok" || redisResult.status === "not_configured";
  const redisConfiguredButDown =
    redisResult.status === "error" && isRedisConfigured();

  let status: "healthy" | "degraded" | "unhealthy";
  if (!dbOk) {
    status = "unhealthy";
  } else if (redisConfiguredButDown) {
    // Redis is configured but unreachable — surface as degraded with 503 so
    // load-balancers can route around the instance instead of believing the
    // old /healthz lie that everything was fine.
    status = "degraded";
  } else if (!redisOk || workerStatus !== "ok") {
    status = "degraded";
  } else {
    status = "healthy";
  }

  const httpStatus = status === "healthy" ? 200 : 503;

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
    workers: { status: workerStatus, failing: failingWorkers },
  });
});

export default router;
