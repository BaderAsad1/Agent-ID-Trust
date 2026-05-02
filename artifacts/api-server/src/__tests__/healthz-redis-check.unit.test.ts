/**
 * Health Check Redis Verification — Task #278
 *
 * Verifies the regression where /healthz silently lied about Redis status:
 *   1. Inline /healthz in app.ts imported "../lib/redis" (wrong path) and
 *      called getRedisClient() (non-existent symbol). Both failures were
 *      swallowed by optional chaining + try/catch, so checks.redis was always
 *      "skip" and the endpoint always returned 200/ok even when Redis was
 *      completely unreachable.
 *
 * These tests assert the new behavior: when Redis is configured but the
 * connection fails, /healthz returns 503 with status="degraded" and the
 * redis service is reported as "error" (NOT "skip"/"not_configured").
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../lib/redis", () => ({
  isRedisConfigured: vi.fn(),
  getSharedRedis: vi.fn(),
  getRedis: vi.fn().mockReturnValue(null),
  createBullMQConnection: vi.fn().mockReturnValue({ connection: {} }),
  logRedisConnectionPlan: vi.fn(),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../workers/worker-failure", () => ({
  getWorkersInFailureState: vi.fn(() => ({})),
}));

vi.mock("../lib/env", () => ({
  env: () => ({
    STRIPE_SECRET_KEY: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
    CLOUDFLARE_ZONE_ID: undefined,
    RESEND_API_KEY: undefined,
  }),
}));

async function buildApp() {
  const healthRouter = (await import("../routes/health")).default;
  const app = express();
  app.use(healthRouter);
  return app;
}

describe("Task #278 — /healthz must surface Redis failures (not silently lie)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 + redis.status=error when Redis is configured but unreachable", async () => {
    const { isRedisConfigured, getSharedRedis } = await import("../lib/redis");
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getSharedRedis).mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as ReturnType<typeof getSharedRedis>);

    const app = await buildApp();
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.services.redis.status).toBe("error");
    expect(res.body.services.database.status).toBe("ok");
  });

  it("returns 200 + healthy when both DB and Redis are up", async () => {
    const { isRedisConfigured, getSharedRedis } = await import("../lib/redis");
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getSharedRedis).mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
    } as unknown as ReturnType<typeof getSharedRedis>);

    const app = await buildApp();
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.services.redis.status).toBe("ok");
  });

  it("returns 200 + healthy when Redis is not configured (skip is allowed)", async () => {
    const { isRedisConfigured } = await import("../lib/redis");
    vi.mocked(isRedisConfigured).mockReturnValue(false);

    const app = await buildApp();
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.services.redis.status).toBe("not_configured");
  });

  it("/livez always returns 200 regardless of dependency state", async () => {
    const { isRedisConfigured, getSharedRedis } = await import("../lib/redis");
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getSharedRedis).mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as ReturnType<typeof getSharedRedis>);

    const app = await buildApp();
    const res = await request(app).get("/livez");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("/readyz returns 503 when Redis is down", async () => {
    const { isRedisConfigured, getSharedRedis } = await import("../lib/redis");
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getSharedRedis).mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as ReturnType<typeof getSharedRedis>);

    const app = await buildApp();
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.services.redis.status).toBe("error");
  });

  it("includes worker failure state in /healthz response", async () => {
    const { isRedisConfigured } = await import("../lib/redis");
    const { getWorkersInFailureState } = await import("../workers/worker-failure");
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    vi.mocked(getWorkersInFailureState).mockReturnValue({ "domain-provisioning": 3 });

    const app = await buildApp();
    const res = await request(app).get("/healthz");

    expect(res.body).toHaveProperty("workers");
    expect(res.body.workers.status).toBe("degraded");
    expect(res.body.workers.failing).toEqual({ "domain-provisioning": 3 });
    expect(res.status).toBe(503);
  });
});
