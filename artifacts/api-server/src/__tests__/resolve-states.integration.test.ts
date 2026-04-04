/**
 * Resolve Endpoint — Agent State Tests — Integration
 *
 * Tests the resolve endpoint behavior across all agent states.
 * Uses real DB, real route handlers, supertest.
 *
 * Covers:
 * - Active agent resolves successfully (200)
 * - Revoked agent returns 410 with revocation details
 * - Suspended agent returns 404 (hidden from resolution)
 * - Pending agent returns 404 (not yet active)
 * - Non-public agent returns 403
 * - Nonexistent handle returns 404
 * - UUID-based resolution returns agent even when revoked
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { errorHandler } from "../middlewares/error-handler";

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/credentials", () => ({
  reissueCredential: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/billing", () => ({
  getUserPlan: vi.fn().mockResolvedValue("free"),
  getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5, canReceiveMail: false }),
  getActiveUserSubscription: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/mail", () => ({
  provisionInboxForAgent: vi.fn().mockResolvedValue(undefined),
  getOrCreateInbox: vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/resolution-cache", () => ({
  getResolutionCache: vi.fn().mockResolvedValue(null),
  setResolutionCache: vi.fn().mockResolvedValue(undefined),
  deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createRevokedAgent,
  createSuspendedAgent,
  createPendingAgent,
} from "../test-support/factories";

async function buildResolveApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: resolveRouter } = await import("../routes/v1/resolve");
  app.use("/api/v1/resolve", resolveRouter);
  app.use(errorHandler);
  return app;
}

describe("Resolve Endpoint — Agent States", () => {
  let app: express.Express;
  let userId: string;
  let activeAgent: { id: string; handle: string | null };
  let revokedAgent: { id: string; handle: string | null };
  let suspendedAgent: { id: string; handle: string | null };
  let pendingAgent: { id: string; handle: string | null };
  let privateAgent: { id: string; handle: string | null };

  const agentIds: string[] = [];

  beforeAll(async () => {
    app = await buildResolveApp();

    const user = await createTestUser();
    userId = user.id;

    const active = await createTestAgent(userId, { isPublic: true, handlePaid: true });
    activeAgent = { id: active.id, handle: active.handle };
    agentIds.push(active.id);

    const revoked = await createRevokedAgent(userId);
    await db.update(agentsTable).set({ isPublic: true, handlePaid: true }).where(eq(agentsTable.id, revoked.id));
    revokedAgent = { id: revoked.id, handle: revoked.handle };
    agentIds.push(revoked.id);

    const suspended = await createSuspendedAgent(userId);
    await db.update(agentsTable).set({ isPublic: true, handlePaid: true }).where(eq(agentsTable.id, suspended.id));
    suspendedAgent = { id: suspended.id, handle: suspended.handle };
    agentIds.push(suspended.id);

    const pending = await createPendingAgent(userId);
    await db.update(agentsTable).set({ isPublic: true, handlePaid: true }).where(eq(agentsTable.id, pending.id));
    pendingAgent = { id: pending.id, handle: pending.handle };
    agentIds.push(pending.id);

    const priv = await createTestAgent(userId, { isPublic: false, handlePaid: true });
    privateAgent = { id: priv.id, handle: priv.handle };
    agentIds.push(priv.id);
  });

  afterAll(async () => {
    for (const id of agentIds) {
      await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, id)).catch(() => {});
      await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("resolves active public agent successfully (200)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${activeAgent.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(res.body.agent.status).toBe("active");
  });

  it("revoked agent returns 410 with revocation details", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${revokedAgent.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("AGENT_REVOKED");
    expect(res.body.revocation).toBeDefined();
    expect(res.body.revocation.reason).toBe("test");
  });

  it("suspended agent returns 404 (hidden from handle resolution)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${suspendedAgent.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });

  it("pending agent returns 404 (not yet active)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${pendingAgent.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });

  it("non-public agent returns 403", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${privateAgent.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("AGENT_NOT_PUBLIC");
  });

  it("nonexistent handle returns 404", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/totally-nonexistent-handle-xyz")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });

  it("UUID-based resolution returns agent even when revoked", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/id/${revokedAgent.id}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(res.body.agent.status).toBe("revoked");
  });

  it("UUID-based resolution returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/id/not-a-uuid")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_ID");
  });

  it("UUID-based resolution returns 404 for nonexistent agent", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/id/00000000-0000-0000-0000-000000000001")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });
});
