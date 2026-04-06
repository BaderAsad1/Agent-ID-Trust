/**
 * Admin Auth Tests — Integration
 *
 * Tests the X-Admin-Key authentication mechanism and admin routes.
 * Uses real DB but mocks external services.
 *
 * Covers:
 * - Missing X-Admin-Key returns 401
 * - Empty X-Admin-Key returns 401
 * - Wrong X-Admin-Key returns 401
 * - Correct X-Admin-Key allows access
 * - Non-admin cannot reach admin routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { errorHandler } from "../middlewares/error-handler";
import { _resetEnvCacheForTests } from "../lib/env";

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));

const ADMIN_KEY = "test-admin-secret-key-for-tests";

async function buildAdminApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  const { default: adminRouter } = await import("../routes/v1/admin");
  app.use("/api/v1/admin", adminRouter);
  app.use(errorHandler);
  return app;
}

describe("Admin Auth — X-Admin-Key enforcement", () => {
  let app: express.Express;

  beforeEach(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    app = await buildAdminApp();
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
  });

  it("returns 401 when X-Admin-Key header is missing", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-log");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 when X-Admin-Key is empty string", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("X-Admin-Key", "");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 when X-Admin-Key is wrong", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("X-Admin-Key", "wrong-key-value");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("allows access with correct X-Admin-Key", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("X-Admin-Key", ADMIN_KEY);

    expect(res.status).not.toBe(401);
  });

  it("returns 401 without admin key even when providing other auth headers", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", "Bearer some-token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("blocks agent revoke without admin key", async () => {
    const res = await request(app)
      .post("/api/v1/admin/agents/some-agent-id/revoke")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("allows agent revoke with correct admin key (returns 404 for nonexistent agent)", async () => {
    const fakeAgentId = "00000000-0000-0000-0000-000000000099";
    const res = await request(app)
      .post(`/api/v1/admin/agents/${fakeAgentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "test" });

    expect(res.status).not.toBe(401);
    expect([200, 404]).toContain(res.status);
  });

  it("returns 401 for all admin endpoints without key", async () => {
    const endpoints = [
      { method: "post", path: "/api/v1/admin/sessions/revoke" },
      { method: "post", path: "/api/v1/admin/tokens/revoke" },
    ];

    for (const { method, path } of endpoints) {
      const res = await (method === "get"
        ? request(app).get(path)
        : request(app).post(path).send({}));

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
    }
  });

  it("when ADMIN_SECRET_KEY env is not set, all admin requests are denied", async () => {
    delete process.env.ADMIN_SECRET_KEY;
    const appNoKey = await buildAdminApp();

    const res = await request(appNoKey)
      .get("/api/v1/admin/audit-log")
      .set("X-Admin-Key", "anything");

    expect(res.status).toBe(401);
  });
});
