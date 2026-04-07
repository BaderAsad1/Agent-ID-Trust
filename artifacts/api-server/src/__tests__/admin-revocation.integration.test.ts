/**
 * Admin Revocation Flow Tests — Integration
 *
 * Tests admin-initiated agent revocation via POST /api/v1/admin/agents/:id/revoke,
 * verifying the cascade: agent status → resolve returns 410 → auth strategies reject.
 *
 * Covers:
 * - Admin revoke sets agent status to "revoked" in DB
 * - Admin revoke writes audit event
 * - Admin revoke with missing reason returns 400
 * - Revoked agent returns 410 from resolve endpoint
 * - Admin session revoke marks session as revoked
 * - Admin revoke of nonexistent agent returns 404
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
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
vi.mock("../lib/resolution-cache", () => ({
  getResolutionCache: vi.fn().mockResolvedValue(null),
  setResolutionCache: vi.fn().mockResolvedValue(undefined),
  deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
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

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentidSessionsTable,
  auditEventsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createTestAgentApiKey,
  createTestSession,
} from "../test-support/factories";

const ADMIN_KEY = "test-admin-revocation-key-unique-8f3a";

async function buildAdminApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: adminRouter } = await import("../routes/v1/admin");
  app.use("/api/v1/admin", adminRouter);
  app.use(errorHandler);
  return app;
}

async function buildCascadeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: adminRouter } = await import("../routes/v1/admin");
  const { default: resolveRouter } = await import("../routes/v1/resolve");
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/resolve", resolveRouter);
  app.use(errorHandler);
  return app;
}

describe("Admin Revocation Flow — Integration", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;
  let sessionId: string;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    app = await buildAdminApp();

    const user = await createTestUser();
    userId = user.id;

    const agent = await createTestAgent(userId, { isPublic: true });
    agentId = agent.id;

    const session = await createTestSession(agentId);
    sessionId = session.sessionId;
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(auditEventsTable).where(eq(auditEventsTable.targetId, agentId)).catch(() => {});
    await db.delete(agentidSessionsTable).where(eq(agentidSessionsTable.agentId, agentId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("admin revoke sets agent status to 'revoked' in DB", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "policy_violation", statement: "Test revocation" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("revoked");

    const dbAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, revokedAt: true, revocationReason: true, revocationStatement: true },
    });

    expect(dbAgent).toBeDefined();
    expect(dbAgent!.status).toBe("revoked");
    expect(dbAgent!.revokedAt).toBeInstanceOf(Date);
    expect(dbAgent!.revocationReason).toBe("policy_violation");
    expect(dbAgent!.revocationStatement).toBe("Test revocation");
  });

  it("admin revoke writes an audit event", async () => {
    const auditEvent = await db.query.auditEventsTable.findFirst({
      where: and(
        eq(auditEventsTable.targetId, agentId),
        eq(auditEventsTable.eventType, "admin.agent.revoked"),
      ),
      orderBy: [desc(auditEventsTable.createdAt)],
    });

    expect(auditEvent).toBeDefined();
    expect(auditEvent!.actorType).toBe("admin");
    expect(auditEvent!.targetType).toBe("agent");
  });

  it("admin revoke returns 400 when reason is missing", async () => {
    const otherAgent = await createTestAgent(userId, { isPublic: true });

    const res = await request(app)
      .post(`/api/v1/admin/agents/${otherAgent.id}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);

    await db.delete(agentsTable).where(eq(agentsTable.id, otherAgent.id)).catch(() => {});
  });

  it("admin revoke returns 404 for nonexistent agent", async () => {
    const fakeId = "00000000-0000-0000-0000-999999999999";
    const res = await request(app)
      .post(`/api/v1/admin/agents/${fakeId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "test" });

    expect(res.status).toBe(404);
  });

  it("admin session revoke marks session as revoked in DB", async () => {
    const res = await request(app)
      .post("/api/v1/admin/sessions/revoke")
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ sessionId, reason: "admin_test_revocation" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbSession = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, sessionId),
      columns: { revoked: true, revokedAt: true, revokedReason: true },
    });

    expect(dbSession).toBeDefined();
    expect(dbSession!.revoked).toBe(true);
    expect(dbSession!.revokedAt).toBeInstanceOf(Date);
    expect(dbSession!.revokedReason).toBe("admin_test_revocation");
  });

  it("admin session revoke returns 404 for nonexistent session", async () => {
    const res = await request(app)
      .post("/api/v1/admin/sessions/revoke")
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ sessionId: "nonexistent-session-id-xyz", reason: "test" });

    expect(res.status).toBe(404);
  });

  it("admin session revoke returns 400 when sessionId is missing", async () => {
    const res = await request(app)
      .post("/api/v1/admin/sessions/revoke")
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "test" });

    expect(res.status).toBe(400);
  });
});

describe("Admin Revocation Cascade — End-to-End", () => {
  let cascadeApp: express.Express;
  let userId: string;
  let cascadeAgentId: string;
  let cascadeAgentHandle: string | null;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    cascadeApp = await buildCascadeApp();

    const user = await createTestUser();
    userId = user.id;

    const agent = await createTestAgent(userId, { isPublic: true, handlePaid: true });
    cascadeAgentId = agent.id;
    cascadeAgentHandle = agent.handle;
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(auditEventsTable).where(eq(auditEventsTable.targetId, cascadeAgentId)).catch(() => {});
    await db.delete(agentidSessionsTable).where(eq(agentidSessionsTable.agentId, cascadeAgentId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, cascadeAgentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, cascadeAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, cascadeAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("active agent resolves successfully before revocation", async () => {
    const res = await request(cascadeApp)
      .get(`/api/v1/resolve/${cascadeAgentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(res.body.agent.status).toBe("active");
  });

  it("admin revoke succeeds", async () => {
    const res = await request(cascadeApp)
      .post(`/api/v1/admin/agents/${cascadeAgentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "cascade_test", statement: "E2E cascade test" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("after revocation, resolve returns 410 with revocation details", async () => {
    const res = await request(cascadeApp)
      .get(`/api/v1/resolve/${cascadeAgentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("AGENT_REVOKED");
    expect(res.body.revocation).toBeDefined();
    expect(res.body.revocation.reason).toBe("cascade_test");
  });

  it("after revocation, UUID resolution still returns agent with revoked status", async () => {
    const res = await request(cascadeApp)
      .get(`/api/v1/resolve/id/${cascadeAgentId}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.agent.status).toBe("revoked");
  });
});
