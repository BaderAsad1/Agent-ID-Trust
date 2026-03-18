/**
 * Auth Strategy Tests — Integration
 *
 * Tests all three agent auth strategies using real DB operations.
 *
 * Covers:
 * - API key strategy (X-Agent-Key): valid, revoked, wrong key
 * - PoP-JWT strategy: valid nonce accepted, replayed nonce rejected,
 *   expired nonce rejected, wrong agent's nonce, unregistered key
 * - Session-JWT strategy: valid session, expired, revoked
 * - Revoked/suspended agents denied on all strategies
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisConfigured: vi.fn().mockReturnValue(false),
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
  authNoncesTable,
  agentidSessionsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { errorHandler } from "../middlewares/error-handler";
import {
  createTestUser,
  createTestAgent,
  createRevokedAgent,
  createSuspendedAgent,
  createTestAgentKey,
  createTestAgentApiKey,
  createTestNonce,
  createExpiredNonce,
  createConsumedNonce,
  createTestSession,
} from "../test-support/factories";
import { generateEd25519KeyPair, buildPopJwt } from "../test-support/crypto";

async function buildProtectedApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  const { requireAgentAuth } = await import("../middlewares/agent-auth");
  app.get("/api/v1/protected", requireAgentAuth, (req, res) => {
    res.json({
      agentId: req.authenticatedAgent?.id,
      strategy: req.agentAuthStrategy,
    });
  });
  app.use(errorHandler);
  return app;
}

describe("Auth Strategy — API Key (X-Agent-Key)", () => {
  let userId: string;
  let agentId: string;
  let rawKey: string;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
    const keyResult = await createTestAgentApiKey(agentId);
    rawKey = keyResult.rawKey;
    app = await buildProtectedApp();
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("authenticates with a valid X-Agent-Key", async () => {
    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.strategy).toBe("agent-key");
  });

  it("returns 401 with a wrong X-Agent-Key", async () => {
    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", "agk_wrongkey12345678901234567890");

    expect(res.status).toBe(401);
  });

  it("returns 401 with no auth header", async () => {
    const res = await request(app).get("/api/v1/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 or 403 for a revoked agent's API key", async () => {
    const revokedAgent = await createRevokedAgent(userId);
    const { rawKey: revokedKey } = await createTestAgentApiKey(revokedAgent.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", revokedKey);

    expect([401, 403]).toContain(res.status);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, revokedAgent.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, revokedAgent.id)).catch(() => {});
  });

  it("returns 401 or 403 for a suspended agent's API key", async () => {
    const suspendedAgent = await createSuspendedAgent(userId);
    const { rawKey: suspendedKey } = await createTestAgentApiKey(suspendedAgent.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", suspendedKey);

    expect([401, 403]).toContain(res.status);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, suspendedAgent.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, suspendedAgent.id)).catch(() => {});
  });
});

describe("Auth Strategy — PoP-JWT", () => {
  let userId: string;
  let agentId: string;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
    app = await buildProtectedApp();
  });

  afterAll(async () => {
    await db.delete(authNoncesTable).where(eq(authNoncesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("authenticates with a valid PoP-JWT signed nonce", async () => {
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);
    const nonceEntry = await createTestNonce(agentId, "agentid");

    const jwt = buildPopJwt({
      agentId,
      kid: agentKey.kid,
      nonce: nonceEntry.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.strategy).toBe("pop-jwt");
  });

  it("rejects a replayed (already-consumed) nonce", async () => {
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);
    const consumedNonce = await createConsumedNonce(agentId);

    const jwt = buildPopJwt({
      agentId,
      kid: agentKey.kid,
      nonce: consumedNonce.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("rejects an expired nonce in DB", async () => {
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);
    const expiredNonce = await createExpiredNonce(agentId);

    const jwt = buildPopJwt({
      agentId,
      kid: agentKey.kid,
      nonce: expiredNonce.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("rejects a JWT with an expired exp claim", async () => {
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);
    const nonceEntry = await createTestNonce(agentId, "agentid");

    const jwt = buildPopJwt({
      agentId,
      kid: agentKey.kid,
      nonce: nonceEntry.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
      expOffsetSeconds: -60,
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("rejects a JWT signed by an unregistered key", async () => {
    const { privateKeyDer } = generateEd25519KeyPair();
    const nonceEntry = await createTestNonce(agentId, "agentid");

    const jwt = buildPopJwt({
      agentId,
      kid: "kid_nonexistent_key",
      nonce: nonceEntry.nonce,
      privateKeyDer,
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("rejects a JWT when nonce belongs to a different agent", async () => {
    const user2 = await createTestUser();
    const agent2 = await createTestAgent(user2.id);
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);

    const nonceForAgent2 = await createTestNonce(agent2.id, "agentid");

    const jwt = buildPopJwt({
      agentId,
      kid: agentKey.kid,
      nonce: nonceForAgent2.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);

    await db.delete(authNoncesTable).where(eq(authNoncesTable.agentId, agent2.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agent2.id)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, user2.id)).catch(() => {});
  });
});

describe("Auth Strategy — Session JWT", () => {
  let userId: string;
  let agentId: string;
  let kid: string;
  let privateKeyB64: string;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
    const keyResult = await createTestAgentKey(agentId);
    kid = keyResult.agentKey.kid;
    privateKeyB64 = keyResult.privateKeyB64;
    app = await buildProtectedApp();
  });

  afterAll(async () => {
    await db.delete(agentidSessionsTable).where(eq(agentidSessionsTable.agentId, agentId)).catch(() => {});
    await db.delete(authNoncesTable).where(eq(authNoncesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("authenticates with a valid session JWT", async () => {
    const nonceEntry = await createTestNonce(agentId);
    const challengeMessage = `${nonceEntry.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const signature = signChallenge(challengeMessage, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, signature, kid);

    expect(session.sessionToken).toBeTruthy();

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${session.sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.strategy).toBe("session-jwt");
  });

  it("rejects an expired session", async () => {
    const nonce = await createTestNonce(agentId);
    const challengeMsg = `${nonce.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const sess = await verifyAndIssueSession(agentId, nonce.nonce, sig, kid);

    await db.update(agentidSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agentidSessionsTable.sessionId, sess.sessionId));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${sess.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });

  it("rejects a revoked session", async () => {
    const nonce = await createTestNonce(agentId);
    const challengeMsg = `${nonce.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession, revokeSession } = await import("../services/auth-session");
    const sess = await verifyAndIssueSession(agentId, nonce.nonce, sig, kid);

    await revokeSession(sess.sessionId, "test");

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${sess.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });
});

describe("Agent Status Enforcement — All Auth Strategies", () => {
  let userId: string;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    app = await buildProtectedApp();
  });

  afterAll(async () => {
    await db.delete(agentidSessionsTable).catch(() => {});
    await db.delete(authNoncesTable).catch(() => {});
    await db.delete(apiKeysTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("revoked agent is denied via API key strategy", async () => {
    const revoked = await createRevokedAgent(userId);
    const { rawKey } = await createTestAgentApiKey(revoked.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect([401, 403]).toContain(res.status);
  });

  it("suspended agent is denied via API key strategy", async () => {
    const suspended = await createSuspendedAgent(userId);
    const { rawKey } = await createTestAgentApiKey(suspended.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect([401, 403]).toContain(res.status);
  });

  it("inactive agent is denied via API key strategy", async () => {
    const inactive = await createTestAgent(userId, {
      status: "inactive",
      verificationStatus: "verified",
    });
    const { rawKey } = await createTestAgentApiKey(inactive.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect([401, 403]).toContain(res.status);
  });

  it("revoked agent is denied via PoP-JWT strategy", async () => {
    const revoked = await createRevokedAgent(userId);
    const { agentKey, privateKeyB64 } = await createTestAgentKey(revoked.id);
    const nonceEntry = await createTestNonce(revoked.id, "agentid");

    const jwt = buildPopJwt({
      agentId: revoked.id,
      kid: agentKey.kid,
      nonce: nonceEntry.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("suspended agent is denied via PoP-JWT strategy", async () => {
    const suspended = await createSuspendedAgent(userId);
    const { agentKey, privateKeyB64 } = await createTestAgentKey(suspended.id);
    const nonceEntry = await createTestNonce(suspended.id, "agentid");

    const jwt = buildPopJwt({
      agentId: suspended.id,
      kid: agentKey.kid,
      nonce: nonceEntry.nonce,
      privateKeyDer: Buffer.from(privateKeyB64, "base64"),
      aud: "agentid",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect([401, 403]).toContain(res.status);
  });

  it("revoked agent is denied via session-JWT strategy", async () => {
    const activeAgent = await createTestAgent(userId);
    const { agentKey, privateKeyB64 } = await createTestAgentKey(activeAgent.id);
    const nonceEntry = await createTestNonce(activeAgent.id);
    const challengeMsg = `${nonceEntry.nonce}:${activeAgent.id}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);
    const { verifyAndIssueSession } = await import("../services/auth-session");
    const sess = await verifyAndIssueSession(activeAgent.id, nonceEntry.nonce, sig, agentKey.kid);

    await db.update(agentsTable)
      .set({ status: "revoked", revokedAt: new Date(), revocationReason: "test" })
      .where(eq(agentsTable.id, activeAgent.id));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${sess.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });

  it("suspended agent is denied via session-JWT strategy", async () => {
    const activeAgent = await createTestAgent(userId);
    const { agentKey, privateKeyB64 } = await createTestAgentKey(activeAgent.id);
    const nonceEntry = await createTestNonce(activeAgent.id);
    const challengeMsg = `${nonceEntry.nonce}:${activeAgent.id}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);
    const { verifyAndIssueSession } = await import("../services/auth-session");
    const sess = await verifyAndIssueSession(activeAgent.id, nonceEntry.nonce, sig, agentKey.kid);

    await db.update(agentsTable)
      .set({ status: "suspended" })
      .where(eq(agentsTable.id, activeAgent.id));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${sess.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });
});
