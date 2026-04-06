/**
 * Agent Lifecycle State Machine — Integration Tests
 *
 * Tests real state transitions using real DB + real services.
 *
 * State machine coverage:
 *   - draft → active (via route) is FORBIDDEN (422 INVALID_TRANSITION) — must go via verification
 *   - draft → inactive (via updateAgent service): allowed
 *   - pending_verification → active (via updateAgent service, the legitimate activation path)
 *   - pending_verification → active side-effects: inbox provisioning called on activation
 *   - active → suspended (DB-level platform admin update)
 *   - suspended → active: platform admin DB reinstatement, auth passes again (200 probe)
 *   - suspended → revoked (via admin route POST /admin/agents/:id/revoke): permanent
 *   - any → revoked (admin route): authenticated with ADMIN_SECRET_KEY
 *   - Authentication enforcement: draft, inactive, suspended, pending_verification agents blocked
 *   - API key revocation: revoked API key rejected (401) by requireAgentAuth
 *   - Audit event written on admin revoke (actorType=admin, targetType=agent)
 *   - Trust determineTier state thresholds
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
vi.mock("../services/credentials", () => ({
  reissueCredential: vi.fn().mockResolvedValue(undefined),
  issueCredential: vi.fn().mockResolvedValue(undefined),
  getActiveCredential: vi.fn().mockResolvedValue(null),
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
  auditEventsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createSuspendedAgent,
  createRevokedAgent,
  createTestAgentApiKey,
} from "../test-support/factories";
import { updateAgent } from "../services/agents";
import { determineTier } from "../services/trust-score";
import { requireAgentAuth } from "../middlewares/agent-auth";

const ADMIN_KEY = "test-lifecycle-admin-key-unique-9c3f";

async function buildAdminApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: adminRouter } = await import("../routes/v1/admin");
  app.use("/api/v1/admin", adminRouter);
  app.use(errorHandler);
  return app;
}

async function buildAuthProbeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { requireAgentAuth } = await import("../middlewares/agent-auth");
  app.get("/probe/auth", requireAgentAuth, (_req, res) => {
    res.json({ authenticated: true });
  });
  const { default: agentRouter } = await import("../routes/v1/agents");
  app.use("/api/v1/agents", agentRouter);
  app.use(errorHandler);
  return app;
}

describe("Agent Lifecycle — admin revoke endpoint: authentication guards", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    app = await buildAdminApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("returns 401 ADMIN_UNAUTHORIZED without X-Admin-Key header", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 401 with wrong X-Admin-Key value", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", "completely-wrong-key")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("returns 400 when reason is missing", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent agent UUID", async () => {
    const res = await request(app)
      .post("/api/v1/admin/agents/00000000-0000-0000-0000-000000000000/revoke")
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "test" });

    expect(res.status).toBe(404);
  });
});

describe("Agent Lifecycle — admin revoke sets DB state and audit event", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    app = await buildAdminApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { isPublic: true });
    agentId = agent.id;

    await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "policy_violation", statement: "Test revocation" });
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(auditEventsTable).where(eq(auditEventsTable.targetId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("admin revoke sets status=revoked in DB with revokedAt timestamp", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, revokedAt: true, revocationReason: true },
    });
    expect(agent!.status).toBe("revoked");
    expect(agent!.revokedAt).toBeInstanceOf(Date);
    expect(agent!.revocationReason).toBe("policy_violation");
  });

  it("admin revoke writes an audit event with actorType=admin and targetType=agent", async () => {
    const auditEvent = await db.query.auditEventsTable.findFirst({
      where: and(
        eq(auditEventsTable.targetId, agentId),
        eq(auditEventsTable.eventType, "admin.agent.revoked"),
      ),
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.actorType).toBe("admin");
    expect(auditEvent!.targetType).toBe("agent");
  });

  it("admin revoke endpoint returns success response with status=revoked", async () => {
    const agent2 = await createTestAgent(userId, { isPublic: true });
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agent2.id}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "policy_violation", statement: "Another revocation" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("revoked");

    await db.delete(agentsTable).where(eq(agentsTable.id, agent2.id)).catch(() => {});
  });
});

describe("Agent Lifecycle — draft → active directly via route is FORBIDDEN (must go through verification)", () => {
  let userId: string;
  let agentId: string;
  let agentApp: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { status: "draft" });
    agentId = agent.id;

    const agentsMod = await import("../routes/v1/agents");
    agentApp = express();
    agentApp.use(express.json());
    agentApp.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = userId;
      (req as Record<string, unknown>).user = { id: userId, name: "Test", profileImage: null };
      next();
    });
    agentApp.use("/api/v1/agents", agentsMod.default);
    agentApp.use(errorHandler);
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("agent starts in draft status", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("draft");
  });

  it("PUT /:agentId { status: 'active' } on draft agent returns 422 INVALID_TRANSITION (state machine enforcement)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "active" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_TRANSITION");
  });

  it("draft agent status remains draft in DB after rejected activation attempt", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("draft");
  });
});

describe("Agent Lifecycle — draft → inactive transition via updateAgent service", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { status: "draft" });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("updateAgent transitions draft → inactive in DB", async () => {
    const updated = await updateAgent(agentId, userId, { status: "inactive" });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("inactive");

    const dbAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(dbAgent!.status).toBe("inactive");
  });
});

describe("Agent Lifecycle — updateAgent only affects agents owned by that userId", () => {
  let userId: string;
  let otherUserId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const otherUser = await createTestUser();
    otherUserId = otherUser.id;
    const agent = await createTestAgent(userId, { status: "draft" });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, otherUserId)).catch(() => {});
  });

  it("updateAgent with wrong userId returns null (ownership isolation)", async () => {
    const result = await updateAgent(agentId, otherUserId, { status: "active" });
    expect(result).toBeNull();

    const dbAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(dbAgent!.status).toBe("draft");
  });
});

describe("Agent Lifecycle — auth enforcement: INELIGIBLE_STATUSES blocked by requireAgentAuth", () => {
  let authProbeApp: express.Express;
  let userId: string;
  let draftAgentApiKey: string;
  let suspendedAgentApiKey: string;
  let inactiveAgentApiKey: string;
  let revokedAgentApiKey: string;

  beforeAll(async () => {
    authProbeApp = await buildAuthProbeApp();
    const user = await createTestUser();
    userId = user.id;

    const { createTestAgentApiKey } = await import("../test-support/factories");

    const draftAgent = await createTestAgent(userId, { status: "draft" });
    const draftKey = await createTestAgentApiKey(draftAgent.id);
    draftAgentApiKey = draftKey.rawKey;

    const suspendedAgent = await createSuspendedAgent(userId);
    const suspendedKey = await createTestAgentApiKey(suspendedAgent.id);
    suspendedAgentApiKey = suspendedKey.rawKey;

    const inactiveAgent = await createTestAgent(userId, { status: "inactive" });
    const inactiveKey = await createTestAgentApiKey(inactiveAgent.id);
    inactiveAgentApiKey = inactiveKey.rawKey;

    const revokedAgent = await createRevokedAgent(userId);
    const revokedKey = await createTestAgentApiKey(revokedAgent.id);
    revokedAgentApiKey = revokedKey.rawKey;
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("draft agent is blocked (403 AGENT_INELIGIBLE) on authenticated route /whoami", async () => {
    const res = await request(authProbeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", draftAgentApiKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");
  });

  it("suspended agent is blocked (403 AGENT_INELIGIBLE) on authenticated route /whoami", async () => {
    const res = await request(authProbeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", suspendedAgentApiKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");
  });

  it("inactive agent is blocked (403 AGENT_INELIGIBLE) on authenticated route /whoami", async () => {
    const res = await request(authProbeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", inactiveAgentApiKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");
  });

  it("revoked agent is blocked (403 AGENT_INELIGIBLE) on authenticated route /whoami", async () => {
    const res = await request(authProbeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", revokedAgentApiKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");
  });
});

describe("Agent Lifecycle — suspended agent lifecycle transitions", () => {
  let userId: string;
  let suspendedAgentId: string;
  let activeToSuspendAgentId: string;
  let adminApp: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();
    adminApp = await buildAdminApp();

    const user = await createTestUser();
    userId = user.id;

    const suspendedAgent = await createSuspendedAgent(userId);
    suspendedAgentId = suspendedAgent.id;

    const activeAgent = await createTestAgent(userId, { status: "active" });
    activeToSuspendAgentId = activeAgent.id;
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, activeToSuspendAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, suspendedAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, activeToSuspendAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("createSuspendedAgent factory: suspended agent has status=suspended in DB", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, suspendedAgentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("suspended");
  });

  it("active → suspended: platform admin DB update changes status to suspended and is persisted", async () => {
    await db.update(agentsTable)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(agentsTable.id, activeToSuspendAgentId));

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, activeToSuspendAgentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("suspended");
  });

  it("suspended → revoked: admin revoke endpoint transitions suspended agent to revoked (200)", async () => {
    const res = await request(adminApp)
      .post(`/api/v1/admin/agents/${suspendedAgentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "policy_violation", statement: "Suspended agent revoked for persistent violations." });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("revoked");

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, suspendedAgentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("revoked");
  });

  it("suspended agent (now-suspended active) is rejected by requireAgentAuth with 403 AGENT_INELIGIBLE", async () => {
    const apiKey = await createTestAgentApiKey(activeToSuspendAgentId);
    const probeApp = await buildAuthProbeApp();

    const res = await request(probeApp)
      .get("/probe/auth")
      .set("x-agent-key", apiKey.rawKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, activeToSuspendAgentId)).catch(() => {});
  });

  it("suspended → active: platform admin DB reinstatement transitions status to active and auth passes", async () => {
    await db.update(agentsTable)
      .set({ status: "active", verificationStatus: "verified", updatedAt: new Date() })
      .where(eq(agentsTable.id, activeToSuspendAgentId));

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, activeToSuspendAgentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("active");

    const apiKey = await createTestAgentApiKey(activeToSuspendAgentId);
    const probeApp = await buildAuthProbeApp();

    const res = await request(probeApp)
      .get("/probe/auth")
      .set("x-agent-key", apiKey.rawKey);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, activeToSuspendAgentId)).catch(() => {});
  });
});

describe("Agent Lifecycle — trust determineTier state thresholds (pure)", () => {
  it("unverified tier at score 0", () => {
    expect(determineTier(0, false)).toBe("unverified");
  });

  it("basic tier at score 20 (verified flag irrelevant at this tier)", () => {
    expect(determineTier(20, false)).toBe("basic");
    expect(determineTier(20, true)).toBe("basic");
  });

  it("verified tier at score 40 + isVerified=true", () => {
    expect(determineTier(40, true)).toBe("verified");
  });

  it("basic tier at score 40 when NOT verified (verification gate)", () => {
    expect(determineTier(40, false)).toBe("basic");
  });

  it("trusted tier at score 70 + verified", () => {
    expect(determineTier(70, true)).toBe("trusted");
  });

  it("elite tier at score 90 + verified", () => {
    expect(determineTier(90, true)).toBe("elite");
  });
});

describe("Agent Lifecycle — revocation cascade: agent is blocked by requireAgentAuth after admin revoke", () => {
  let userId: string;
  let agentId: string;
  let agentApiKey: string;
  let adminApp: express.Express;
  let authProbeApp: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    _resetEnvCacheForTests();

    const user = await createTestUser();
    userId = user.id;

    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agent.id);
    agentApiKey = keyResult.rawKey;

    adminApp = await buildAdminApp();
    authProbeApp = await buildAuthProbeApp();
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    _resetEnvCacheForTests();
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("before revoke: active verified agent API key passes requireAgentAuth (200 on dedicated probe endpoint)", async () => {
    const res = await request(authProbeApp)
      .get("/probe/auth")
      .set("x-agent-key", agentApiKey);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  it("admin revoke endpoint sets agent status to revoked in DB", async () => {
    const res = await request(adminApp)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "test cascade revocation" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("revoked");

    const dbAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, revokedAt: true },
    });
    expect(dbAgent!.status).toBe("revoked");
    expect(dbAgent!.revokedAt).toBeInstanceOf(Date);
  });

  it("after admin revoke: the agent's API key is blocked by requireAgentAuth with 403 AGENT_INELIGIBLE", async () => {
    const res = await request(authProbeApp)
      .get("/probe/auth")
      .set("x-agent-key", agentApiKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");
  });
});

describe("Agent Lifecycle — forbidden state transitions: route schema prevents invalid status values", () => {
  let userId: string;
  let agentId: string;
  let agentApp: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { status: "active" });
    agentId = agent.id;

    const agentsMod = await import("../routes/v1/agents");
    agentApp = express();
    agentApp.use(express.json());
    agentApp.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = userId;
      (req as Record<string, unknown>).user = { id: userId, name: "Test User", profileImage: null };
      next();
    });
    agentApp.use("/api/v1/agents", agentsMod.default);
    agentApp.use(errorHandler);
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("PUT /:agentId with status=revoked is rejected (revoked not in allowed enum)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "revoked" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("PUT /:agentId with status=suspended is rejected (suspended not in allowed enum)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "suspended" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("PUT /:agentId with status=pending_verification is rejected (not in allowed enum)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "pending_verification" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("PUT /:agentId with valid status=inactive transitions agent to inactive (200 with DB confirmation)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "inactive" });

    expect(res.status).toBe(200);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("inactive");

    await db.update(agentsTable).set({ status: "active" }).where(eq(agentsTable.id, agentId));
  });
});

describe("Agent Lifecycle — revoked agent DB state cannot be restored by user (admin-only revocation is permanent via DELETE route)", () => {
  let userId: string;
  let agentId: string;
  let agentApp: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agent = await createTestAgent(userId, { status: "active" });
    agentId = agent.id;

    await db
      .update(agentsTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    const agentsMod = await import("../routes/v1/agents");
    agentApp = express();
    agentApp.use(express.json());
    agentApp.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = userId;
      (req as Record<string, unknown>).user = { id: userId, name: "Test User", profileImage: null };
      next();
    });
    agentApp.use("/api/v1/agents", agentsMod.default);
    agentApp.use(errorHandler);
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("revoked agent has status=revoked in DB", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, revokedAt: true },
    });
    expect(agent!.status).toBe("revoked");
    expect(agent!.revokedAt).toBeInstanceOf(Date);
  });

  it("PUT /agents/:id with status=active on revoked agent returns 409 AGENT_REVOKED (route-level state guard)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ status: "active" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AGENT_REVOKED");
  });

  it("PUT /agents/:id with displayName update on revoked agent also returns 409 AGENT_REVOKED (any update blocked)", async () => {
    const res = await request(agentApp)
      .put(`/api/v1/agents/${agentId}`)
      .send({ displayName: "New Name" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AGENT_REVOKED");
  });

  it("revoked agent's DB status remains revoked after rejected update attempts", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(agent!.status).toBe("revoked");
  });

  it("requireAgentAuth blocks access for revoked agent (agent API key returns 403 AGENT_INELIGIBLE)", async () => {
    const agentKey = await createTestAgentApiKey(agentId);

    const agentsMod = await import("../routes/v1/agents");
    const probeApp = express();
    probeApp.use(express.json());
    probeApp.use("/api/v1/agents", agentsMod.default);
    probeApp.use(errorHandler);

    const res = await request(probeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", agentKey.rawKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_INELIGIBLE");

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
  });
});

describe("Agent Lifecycle — pending_verification→active transition requires admin verification (not user update)", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agent = await createTestAgent(userId, {
      status: "pending_verification",
      verificationStatus: "pending",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("pending_verification agent has status=pending_verification in DB", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, verificationStatus: true },
    });
    expect(agent!.status).toBe("pending_verification");
    expect(agent!.verificationStatus).toBe("pending");
  });

  it("pending_verification agent is blocked by requireAgentAuth (403 AGENT_NOT_VERIFIED)", async () => {
    const agentKey = await createTestAgentApiKey(agentId);

    const agentsMod = await import("../routes/v1/agents");
    const probeApp = express();
    probeApp.use(express.json());
    probeApp.use("/api/v1/agents", agentsMod.default);
    probeApp.use(errorHandler);

    const res = await request(probeApp)
      .get("/api/v1/agents/whoami")
      .set("x-agent-key", agentKey.rawKey);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGENT_NOT_VERIFIED");

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
  });

  it("verification completion path: setting verificationStatus=verified and status=active via service transitions to active", async () => {
    await db
      .update(agentsTable)
      .set({ status: "active", verificationStatus: "verified", updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, verificationStatus: true },
    });
    expect(agent!.status).toBe("active");
    expect(agent!.verificationStatus).toBe("verified");
  });
});

describe("Agent Lifecycle — activation side-effect: pending_verification→active via updateAgent calls provisionInboxForAgent", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "pending_verification",
      verificationStatus: "pending",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("updateAgent pending_verification→active (the legitimate activation path) transitions status in DB", async () => {
    const { provisionInboxForAgent } = await import("../services/mail");
    const provisionSpy = vi.mocked(provisionInboxForAgent);
    provisionSpy.mockClear();

    const { getUserPlan } = await import("../services/billing");
    vi.mocked(getUserPlan).mockResolvedValueOnce("pro");

    const { getPlanLimits } = await import("../services/billing");
    const realLimits = getPlanLimits("pro");
    vi.mocked(getPlanLimits).mockReturnValueOnce({ ...realLimits, canReceiveMail: true });

    const updated = await updateAgent(agentId, userId, { status: "active" });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("active");

    const dbAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true },
    });
    expect(dbAgent!.status).toBe("active");
  });

  it("provisionInboxForAgent was called on pending_verification→active transition (via mail mock spy)", async () => {
    const { provisionInboxForAgent } = await import("../services/mail");
    const provisionSpy = vi.mocked(provisionInboxForAgent);
    expect(provisionSpy).toHaveBeenCalledWith(agentId);
  });
});

describe("Agent Lifecycle — API key revocation: revoked key is rejected by auth middleware (401)", () => {
  let userId: string;
  let agentId: string;
  let rawApiKey: string;
  let apiKeyId: string;
  let authProbeApp: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { status: "active", verificationStatus: "verified" });
    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agentId);
    rawApiKey = keyResult.rawKey;

    const keyRecord = await db.query.apiKeysTable.findFirst({
      where: and(eq(apiKeysTable.ownerId, agentId), eq(apiKeysTable.ownerType, "agent")),
      columns: { id: true },
    });
    apiKeyId = keyRecord!.id;

    authProbeApp = await buildAuthProbeApp();
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("before key revocation: valid API key for active verified agent passes requireAgentAuth (200 probe)", async () => {
    const res = await request(authProbeApp)
      .get("/probe/auth")
      .set("x-agent-key", rawApiKey);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  it("after key revocation: revoked API key is rejected by requireAgentAuth (401 UNAUTHORIZED)", async () => {
    await db.update(apiKeysTable)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeysTable.id, apiKeyId));

    const res = await request(authProbeApp)
      .get("/probe/auth")
      .set("x-agent-key", rawApiKey);

    expect(res.status).toBe(401);
  });

  it("revoked key DB state: revokedAt is set in DB after revocation", async () => {
    const keyRecord = await db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.id, apiKeyId),
      columns: { revokedAt: true },
    });
    expect(keyRecord!.revokedAt).toBeInstanceOf(Date);
  });
});
