import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../lib/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
  getSharedRedis: vi.fn().mockReturnValue(null),
  isRedisConfigured: vi.fn().mockReturnValue(false),
}));

import {
  _resetLimitersForTesting,
  magicLinkSendRateLimit,
  recoveryRateLimit,
  publicRateLimit,
  registrationRateLimitStrict,
} from "../middlewares/rate-limit";

function buildAppWithRealMiddleware() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  app.post("/api/auth/magic-link/send", magicLinkSendRateLimit, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe("Rate Limit — magicLinkSendRateLimit middleware returns 429 after 5 requests", () => {
  beforeEach(() => {
    _resetLimitersForTesting();
  });

  it("allows up to 5 requests and returns 429 on the 6th (real middleware, 15-min window)", async () => {
    const app = buildAppWithRealMiddleware();
    const LIMIT = 5;

    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email: `test${i}@example.com` });
      expect(res.status).toBe(200);
    }

    const res = await request(app)
      .post("/api/auth/magic-link/send")
      .send({ email: "blocked@example.com" });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("rate limit response includes Retry-After header and proper error structure", async () => {
    const app = buildAppWithRealMiddleware();

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email: `fill${i}@example.com` });
    }

    const res = await request(app)
      .post("/api/auth/magic-link/send")
      .send({ email: "over-limit@example.com" });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error", "RATE_LIMIT_EXCEEDED");
    expect(res.body).toHaveProperty("message");
    expect(res.headers["retry-after"]).toBeDefined();
  });
});

describe("Rate Limit — exported middleware functions", () => {
  it("recoveryRateLimit is exported and callable", () => {
    expect(typeof recoveryRateLimit).toBe("function");
  });

  it("publicRateLimit is exported and callable", () => {
    expect(typeof publicRateLimit).toBe("function");
  });

  it("registrationRateLimitStrict is exported and callable", () => {
    expect(typeof registrationRateLimitStrict).toBe("function");
  });
});
