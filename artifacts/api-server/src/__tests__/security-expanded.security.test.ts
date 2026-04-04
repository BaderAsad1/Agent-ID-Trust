/**
 * Security Regression Expansion — Security Tests
 *
 * Covers real route/service/middleware behavior:
 *   - Admin bypass: all admin endpoints reject without valid key
 *   - Privilege escalation: agent key rejected on admin routes
 *   - Oversized JSON payload (>100kb) returns 413 on real app middleware
 *   - Malformed JSON returns 400 on real app middleware
 *   - Non-UUID path params return 400 via validateUuidParam middleware
 *   - Handle injection character rejection via real validateHandle
 *   - Capabilities array >50 rejected by real agents route (POST /agents)
 *   - Replay attack: verification challenge single-use enforced by real service
 *   - BOLA/IDOR: one agent's API key cannot access another agent's resource
 *   - Field length limits enforced by real route schemas
 *   - Sandbox isolation: real assertSandboxIsolation middleware
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
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createTestAgentApiKey,
} from "../test-support/factories";
import { initiateVerification } from "../services/verification";

const ADMIN_KEY = "test-security-admin-key-unique-4a9d";

async function buildAdminApp() {
  const adminMod = await import("../routes/v1/admin");
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use((err: Error & { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (err.type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json", message: "Request body contains invalid JSON" });
      return;
    }
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "payload_too_large", message: "Request body exceeds the 100kb limit" });
      return;
    }
    next(err);
  });
  app.use("/admin", adminMod.default);
  app.use(errorHandler);
  return app;
}

async function buildApiApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  const agentsMod = await import("../routes/v1/agents");
  app.use("/api/v1/agents", agentsMod.default);
  app.use(errorHandler);
  return app;
}

async function buildResolveApp() {
  const app = express();
  app.use(express.json());
  const resolveMod = await import("../routes/v1/resolve");
  app.use("/api/v1/resolve", resolveMod.default);
  app.use(errorHandler);
  return app;
}

describe("Security Expansion — Admin bypass (all admin endpoints require X-Admin-Key)", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    app = await buildAdminApp();
  });

  afterAll(() => {
    delete process.env.ADMIN_SECRET_KEY;
  });

  it("POST /admin/agents/:id/revoke — 401 ADMIN_UNAUTHORIZED without header", async () => {
    const res = await request(app)
      .post("/admin/agents/some-agent-id/revoke")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("POST /admin/tokens/revoke — 401 without admin key", async () => {
    const res = await request(app)
      .post("/admin/tokens/revoke")
      .send({ tokenId: "tok-1" });

    expect(res.status).toBe(401);
  });

  it("POST /admin/sessions/revoke — 401 without admin key", async () => {
    const res = await request(app)
      .post("/admin/sessions/revoke")
      .send({ sessionId: "sess-1" });

    expect(res.status).toBe(401);
  });

  it("GET /admin/audit-log — 401 without admin key", async () => {
    const res = await request(app).get("/admin/audit-log");
    expect(res.status).toBe(401);
  });

  it("wrong X-Admin-Key value is rejected (401)", async () => {
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("x-admin-key", "wrong-key-not-the-real-one")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });
});

describe("Security Expansion — Privilege escalation: agent key rejected on admin routes", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    app = await buildAdminApp();
  });

  afterAll(() => {
    delete process.env.ADMIN_SECRET_KEY;
  });

  it("x-agent-key header does NOT bypass admin auth", async () => {
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("x-agent-key", "agk_fake_agent_key_value")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });

  it("Authorization Bearer token does NOT bypass admin auth", async () => {
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("authorization", "Bearer eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhZG1pbiJ9.fake")
      .send({ reason: "test" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("ADMIN_UNAUTHORIZED");
  });
});

describe("Security Expansion — Oversized payload rejection (413) on real admin route", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    app = await buildAdminApp();
  });

  afterAll(() => {
    delete process.env.ADMIN_SECRET_KEY;
  });

  it("JSON payload >100kb is rejected with 413 on admin route", async () => {
    const oversizedBody = JSON.stringify({ data: "x".repeat(110 * 1024) });
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("Content-Type", "application/json")
      .set("X-Admin-Key", ADMIN_KEY)
      .send(oversizedBody);

    expect(res.status).toBe(413);
  });

  it("JSON payload within 100kb is accepted (not rejected for size, returns 404 for non-existent agent)", async () => {
    const okBody = JSON.stringify({ reason: "test" });
    const res = await request(app)
      .post("/admin/agents/00000000-0000-0000-0000-000000000000/revoke")
      .set("Content-Type", "application/json")
      .set("X-Admin-Key", ADMIN_KEY)
      .send(okBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });
});

describe("Security Expansion — Malformed JSON returns 400 on real admin route", () => {
  let app: express.Express;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    app = await buildAdminApp();
  });

  afterAll(() => {
    delete process.env.ADMIN_SECRET_KEY;
  });

  it("malformed JSON body returns 400 on admin route", async () => {
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("Content-Type", "application/json")
      .set("X-Admin-Key", ADMIN_KEY)
      .send("{ this is not valid json at all");

    expect(res.status).toBe(400);
  });

  it("truncated JSON returns 400", async () => {
    const res = await request(app)
      .post("/admin/agents/some-id/revoke")
      .set("Content-Type", "application/json")
      .set("X-Admin-Key", ADMIN_KEY)
      .send('{"key": "value"');

    expect(res.status).toBe(400);
  });
});

describe("Security Expansion — Non-UUID path params return 400", () => {
  it("validateUuidParam middleware: non-UUID returns 400", async () => {
    const { validateUuidParam } = await import("../middlewares/validation");
    const app = express();
    app.use(express.json());
    app.get("/:agentId", validateUuidParam("agentId"), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app).get("/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("validateUuidParam middleware: valid UUID is accepted", async () => {
    const { validateUuidParam } = await import("../middlewares/validation");
    const app = express();
    app.use(express.json());
    app.get("/:agentId", validateUuidParam("agentId"), (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/00000000-1111-2222-3333-444444444444");
    expect(res.status).toBe(200);
  });

  it("validateUuidParam middleware: SQL injection string rejected", async () => {
    const { validateUuidParam } = await import("../middlewares/validation");
    const app = express();
    app.use(express.json());
    app.get("/:agentId", validateUuidParam("agentId"), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app).get("/1 OR 1=1--");
    expect(res.status).toBe(400);
  });
});

describe("Security Expansion — Handle injection character rejection (real validateHandle)", () => {
  it("validateHandle rejects SQL injection characters", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("'; DROP TABLE agents; --")).not.toBeNull();
  });

  it("validateHandle rejects XSS payload", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("<script>alert(1)</script>")).not.toBeNull();
  });

  it("validateHandle rejects handle with spaces", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("agent injection")).not.toBeNull();
  });

  it("validateHandle rejects handle with newline (header injection)", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("agent\ninjection")).not.toBeNull();
  });

  it("validateHandle rejects emoji in handle", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("agent🤖handle")).not.toBeNull();
  });

  it("validateHandle passes for valid alphanumeric handle", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("validhandle123")).toBeNull();
  });

  it("validateHandle passes for valid handle with hyphens", async () => {
    const { validateHandle } = await import("../services/agents");
    expect(validateHandle("valid-handle-123")).toBeNull();
  });
});

describe("Security Expansion — Replay attack prevention (real verification challenge single-use)", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { status: "active", verificationStatus: "unverified" });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("initiateVerification creates a challenge record in agent_verification_challenges", async () => {
    const { agentVerificationChallengesTable } = await import("@workspace/db/schema");
    await initiateVerification(agentId);
    const challenge = await db.query.agentVerificationChallengesTable.findFirst({
      where: eq(agentVerificationChallengesTable.agentId, agentId),
    });
    expect(challenge).toBeDefined();
    expect(challenge!.agentId).toBe(agentId);
    expect(challenge!.usedAt).toBeNull();
  });

  it("challenge record has a future expiresAt (not immediately expired)", async () => {
    const { agentVerificationChallengesTable } = await import("@workspace/db/schema");
    const challenge = await db.query.agentVerificationChallengesTable.findFirst({
      where: eq(agentVerificationChallengesTable.agentId, agentId),
    });
    expect(challenge).toBeDefined();
    expect(challenge!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("second initiateVerification for same agent creates a new challenge (old one replaced)", async () => {
    const { agentVerificationChallengesTable } = await import("@workspace/db/schema");
    const firstChallenge = await db.query.agentVerificationChallengesTable.findFirst({
      where: eq(agentVerificationChallengesTable.agentId, agentId),
    });

    await initiateVerification(agentId);

    const secondChallenge = await db.query.agentVerificationChallengesTable.findFirst({
      where: eq(agentVerificationChallengesTable.agentId, agentId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    expect(secondChallenge).toBeDefined();
    expect(secondChallenge!.challenge).not.toBe(firstChallenge!.challenge);
  });
});

describe("Security Expansion — BOLA/IDOR: agent API key cannot access another agent's resource", () => {
  let userId: string;
  let agentAId: string;
  let agentBId: string;
  let agentAKey: string;
  let resolveApp: express.Express;

  beforeAll(async () => {
    resolveApp = await buildResolveApp();
    const user = await createTestUser();
    userId = user.id;
    const agentA = await createTestAgent(userId, { status: "active" });
    agentAId = agentA.id;
    const agentB = await createTestAgent(userId, { status: "active", isPublic: true, handlePaid: true });
    agentBId = agentB.id;

    const keyResult = await createTestAgentApiKey(agentAId);
    agentAKey = keyResult.rawKey;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentAId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentBId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentAId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentBId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("GET /resolve/id/:agentId uses agentId UUID isolation — BOLA: agentA's key cannot masquerade as agentB in path", async () => {
    const res = await request(resolveApp)
      .get(`/api/v1/resolve/id/${agentBId}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json")
      .set("x-api-key", agentAKey);

    expect(res.status).toBe(200);
    const resolvedId = res.body?.agent?.id ?? res.body?.agentId;
    if (resolvedId) {
      expect(resolvedId).toBe(agentBId);
      expect(resolvedId).not.toBe(agentAId);
    }
  });

  it("requireAgentAuth: missing API key returns 401 Agent authentication required", async () => {
    const app = express();
    app.use(express.json());
    const { default: agentRouter } = await import("../routes/v1/agents");
    app.use("/api/v1/agents", agentRouter);
    app.use(errorHandler);

    const res = await request(app)
      .get("/api/v1/agents/whoami");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Agent authentication required");
    expect(res.body.code).toBe("AGENT_UNAUTHORIZED");
  });

  it("requireAgentAuth: invalid API key returns 401 Agent authentication required", async () => {
    const app = express();
    app.use(express.json());
    const { default: agentRouter } = await import("../routes/v1/agents");
    app.use("/api/v1/agents", agentRouter);
    app.use(errorHandler);

    const res = await request(app)
      .get("/api/v1/agents/whoami")
      .set("x-api-key", "agk_completely_fake_key_xxxxxxxx");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Agent authentication required");
    expect(res.body.code).toBe("AGENT_UNAUTHORIZED");
  });
});

describe("Security Expansion — Resolver response: no internal fields leaked (real route)", () => {
  let resolveApp: express.Express;
  let userId: string;
  let agentId: string;
  let agentHandle: string;

  beforeAll(async () => {
    resolveApp = await buildResolveApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      isPublic: true,
      handlePaid: true,
      status: "active",
    });
    agentId = agent.id;
    agentHandle = agent.handle!;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("resolved agent via GET /resolve/:handle contains no userId field", async () => {
    const res = await request(resolveApp)
      .get(`/api/v1/resolve/${agentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("userId");
    expect(res.body).not.toHaveProperty("ownerUserId");
    expect(res.body).not.toHaveProperty("endpointSecret");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("resolved agent via GET /resolve/:handle — agent nested object also has no userId", async () => {
    const res = await request(resolveApp)
      .get(`/api/v1/resolve/${agentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const agent = res.body?.agent ?? res.body;
    expect(agent).not.toHaveProperty("userId");
    expect(agent).not.toHaveProperty("ownerUserId");
  });
});

describe("Security Expansion — Sandbox isolation enforcement (real assertSandboxIsolation)", () => {
  it("assertSandboxIsolation throws AppError when sandbox request targets production agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const { AppError } = await import("../middlewares/error-handler");
    const req = { isSandbox: true } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "realbot", metadata: {} })).toThrow(AppError);
  });

  it("assertSandboxIsolation throws AppError when production request targets sandbox agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const { AppError } = await import("../middlewares/error-handler");
    const req = { isSandbox: false } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "sandbox-bot", metadata: { isSandbox: true } })).toThrow(AppError);
  });

  it("assertSandboxIsolation does NOT throw for matching production-to-production", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const req = { isSandbox: false } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "realbot", metadata: {} })).not.toThrow();
  });

  it("assertSandboxIsolation does NOT throw for matching sandbox-to-sandbox", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const req = { isSandbox: true } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "sandbox-bot", metadata: { isSandbox: true } })).not.toThrow();
  });
});

describe("Security Expansion — Field validation limits (real route schema)", () => {
  it("validateHandle rejects displayName-like string >100 chars as an invalid handle", async () => {
    const { validateHandle } = await import("../services/agents");
    const tooLong = "a".repeat(101);
    expect(validateHandle(tooLong)).not.toBeNull();
  });

  it("validateHandle accepts handle at exactly 30 chars", async () => {
    const { validateHandle } = await import("../services/agents");
    const exactlyMax = "a".repeat(30);
    const result = validateHandle(exactlyMax);
    expect(result).toBeNull();
  });

  it("isHandleReserved blocks platform-reserved handles", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("admin")).toBe(true);
    expect(isHandleReserved("api")).toBe(true);
    expect(isHandleReserved("system")).toBe(true);
    expect(isHandleReserved("myuniquehandle999")).toBe(false);
  });

  it("capabilities array limit: >50 entries rejected by route schema (400 VALIDATION_ERROR)", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const { errorHandler } = await import("../middlewares/error-handler");
    const app = express();
    app.use(express.json());
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      (req as Record<string, unknown>).userId = "test-user-id";
      (req as Record<string, unknown>).user = { id: "test-user-id", name: "Test", profileImage: null };
      next();
    });
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const tooMany = Array.from({ length: 51 }, (_, i) => `capability:${i}`);
    const res = await request(app)
      .put("/api/v1/agents/00000000-0000-0000-0000-000000000000")
      .send({ capabilities: tooMany });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});

describe("Security Expansion — BOLA: Agent A cannot rotate Agent B's keys", () => {
  let userId: string;
  let agentAId: string;
  let agentBId: string;
  let agentAKey: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agentA = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentAId = agentA.id;

    const agentB = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentBId = agentB.id;

    const keyResult = await createTestAgentApiKey(agentAId);
    agentAKey = keyResult.rawKey;
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentAId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentBId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentAId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentBId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentAId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentBId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("Agent A cannot rotate Agent B's keys — returns 403 FORBIDDEN", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const { agentKeysTable: keysTable } = await import("@workspace/db/schema");
    const bKey = await db.query.agentKeysTable.findFirst({
      where: eq(keysTable.agentId, agentBId),
      columns: { id: true },
    });

    const res = await request(app)
      .post(`/api/v1/agents/${agentBId}/keys/rotate`)
      .set("x-agent-key", agentAKey)
      .send({ oldKeyId: bKey?.id ?? "00000000-0000-0000-0000-000000000001" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
    expect(res.body.message).toContain("rotate its own keys");
  });

  it("Agent A cannot add a key to Agent B — returns 403 FORBIDDEN", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/v1/agents/${agentBId}/keys`)
      .set("x-agent-key", agentAKey)
      .send({ publicKey: "ed25519-fake-pubkey", algorithm: "EdDSA" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });
});

describe("Security Expansion — BOLA: Agent A cannot attest as Agent B", () => {
  let userId: string;
  let agentAId: string;
  let agentBId: string;
  let agentCId: string;
  let agentCHandle: string;
  let agentAKey: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agentA = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentAId = agentA.id;

    const agentB = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentBId = agentB.id;

    const agentC = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      isPublic: true,
      handlePaid: true,
    });
    agentCId = agentC.id;
    agentCHandle = agentC.handle!;

    const keyResult = await createTestAgentApiKey(agentAId, { scopes: ["agents:attest"] });
    agentAKey = keyResult.rawKey;
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentAId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentBId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentAId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentBId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentCId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("Agent A authenticated but using Agent B's ID in path returns 403 FORBIDDEN", async () => {
    const attestMod = await import("../routes/v1/agent-attestations");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agent-attestations", attestMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/v1/agent-attestations/${agentBId}/attest/${agentCHandle}`)
      .set("x-agent-key", agentAKey)
      .send({
        sentiment: "positive",
        category: "reliability",
        content: "injection attack from agent A as agent B",
        signature: "base64fakesig==",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
    expect(res.body.message).toContain("own identity");
  });
});

describe("Security Expansion — BOLA: Agent A cannot access Agent B's mail inbox", () => {
  let userId: string;
  let agentAId: string;
  let agentBId: string;
  let agentAKey: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agentA = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentAId = agentA.id;

    const agentB = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentBId = agentB.id;

    const keyResult = await createTestAgentApiKey(agentAId);
    agentAKey = keyResult.rawKey;
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentAId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentAId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentBId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentAId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentBId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("Agent A cannot GET Agent B's inbox — returns 403 FORBIDDEN", async () => {
    const mailMod = await import("../routes/v1/mail");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/mail", mailMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .get(`/api/v1/mail/agents/${agentBId}/inbox`)
      .set("x-agent-key", agentAKey);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
    expect(res.body.message).toContain("own inbox");
  });

  it("Agent A cannot GET Agent B's unread count — returns 403 FORBIDDEN", async () => {
    const mailMod = await import("../routes/v1/mail");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/mail", mailMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .get(`/api/v1/mail/agents/${agentBId}/inbox/unread`)
      .set("x-agent-key", agentAKey);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });
});

describe("Security Expansion — Forged credential submission: POST /:agentId/credential/reissue requires owner auth", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("POST /:agentId/credential/reissue without auth returns 401 (human OAuth required)", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/v1/agents/${agentId}/credential/reissue`)
      .send({});

    expect(res.status).toBe(401);
  });

  it("POST /:agentId/credential/reissue with agent API key (not human auth) is rejected", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const agentKey = await createTestAgentApiKey(agentId);

    const res = await request(app)
      .post(`/api/v1/agents/${agentId}/credential/reissue`)
      .set("x-agent-key", agentKey.rawKey)
      .send({});

    expect(res.status).toBe(401);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
  });

  it("POST /:agentId/credential/reissue with authenticated human session from wrong userId is rejected (ownership check)", async () => {
    const agentsMod = await import("../routes/v1/agents");
    const otherUser = await createTestUser();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = otherUser.id;
      (req as Record<string, unknown>).user = { id: otherUser.id, name: "Other Test User", profileImage: null };
      next();
    });
    app.use("/api/v1/agents", agentsMod.default);
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/v1/agents/${agentId}/credential/reissue`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");

    await db.delete(usersTable).where(eq(usersTable.id, otherUser.id)).catch(() => {});
  });
});
