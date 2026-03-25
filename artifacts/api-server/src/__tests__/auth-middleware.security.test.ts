import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";

const TEST_VC_PRIV = JSON.stringify({
  crv: "Ed25519",
  d: "hWS0_Ahm3yC2ZCOcMCQDWq71AZgPEgBfEnheH9wbyYk",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-auth-middleware",
});
const TEST_VC_PUB = JSON.stringify({
  crv: "Ed25519",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-auth-middleware",
});

process.env.VC_SIGNING_KEY = TEST_VC_PRIV;
process.env.VC_PUBLIC_KEY = TEST_VC_PUB;

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
  getSharedRedis: vi.fn().mockReturnValue(null),
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
import { buildPopJwt } from "../test-support/crypto";

async function buildProtectedApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  const { requireAgentAuth } = await import("../middlewares/agent-auth");
  app.get("/api/v1/protected", requireAgentAuth, (req, res) => {
    res.json({
      agentId: req.authenticatedAgent?.id,
      strategy: req.agentAuthStrategy,
      scopes: req.agentScopes,
      trustContext: req.agentTrustContext,
    });
  });
  app.use(errorHandler);
  return app;
}

describe("Auth Middleware — Agent-Key strategy", () => {
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

  it("valid agent key authenticates and returns agent-key strategy", async () => {
    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.strategy).toBe("agent-key");
  });

  it("revoked agent (status=revoked) returns 401 or 403", async () => {
    const revokedAgent = await createRevokedAgent(userId);
    const { rawKey: revokedKey } = await createTestAgentApiKey(revokedAgent.id);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", revokedKey);

    expect([401, 403]).toContain(res.status);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, revokedAgent.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, revokedAgent.id)).catch(() => {});
  });

  it("revoked API key (revokedAt set) on active agent returns 401", async () => {
    const { rawKey, apiKey } = await createTestAgentApiKey(agentId);

    await db.update(apiKeysTable)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeysTable.id, apiKey.id));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", rawKey);

    expect(res.status).toBe(401);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.id, apiKey.id)).catch(() => {});
  });

  it("wrong ownerType (user key) does not authenticate as agent", async () => {
    const { createTestUserApiKey } = await import("../test-support/factories");
    const { rawKey: userKey } = await createTestUserApiKey(userId);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", userKey);

    expect(res.status).toBe(401);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.hashedKey,
      (await import("crypto")).createHash("sha256").update(userKey).digest("hex")
    )).catch(() => {});
  });

  it("nonexistent key returns 401", async () => {
    const res = await request(app)
      .get("/api/v1/protected")
      .set("X-Agent-Key", "agk_nonexistent_key_that_does_not_exist_in_db_12345");

    expect(res.status).toBe(401);
  });
});

describe("Auth Middleware — Session-JWT strategy", () => {
  let userId: string;
  let agentId: string;
  let kid: string;
  let privateKeyB64: string;
  let app: express.Express;

  beforeAll(async () => {
    const { _resetEnvCacheForTests } = await import("../lib/env");
    _resetEnvCacheForTests();

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

  it("valid session JWT authenticates with session-jwt strategy", async () => {
    const nonceEntry = await createTestNonce(agentId);
    const challengeMsg = `${nonceEntry.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, sig, kid);

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${session.sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe("session-jwt");
    expect(res.body.agentId).toBe(agentId);
  });

  it("expired session returns 401", async () => {
    const nonceEntry = await createTestNonce(agentId);
    const challengeMsg = `${nonceEntry.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, sig, kid);

    await db.update(agentidSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agentidSessionsTable.sessionId, session.sessionId));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${session.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });

  it("revoked session returns 401", async () => {
    const nonceEntry = await createTestNonce(agentId);
    const challengeMsg = `${nonceEntry.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, sig, kid);

    await db.update(agentidSessionsTable)
      .set({ revoked: true })
      .where(eq(agentidSessionsTable.sessionId, session.sessionId));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${session.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });

  it("audience mismatch returns 401", async () => {
    const nonceEntry = await createTestNonce(agentId);
    const challengeMsg = `${nonceEntry.nonce}:${agentId}`;
    const { signChallenge } = await import("../test-support/crypto");
    const sig = signChallenge(challengeMsg, privateKeyB64);

    const { verifyAndIssueSession } = await import("../services/auth-session");
    const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, sig, kid);

    await db.update(agentidSessionsTable)
      .set({ audience: "https://specific-audience.example.com" })
      .where(eq(agentidSessionsTable.sessionId, session.sessionId));

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${session.sessionToken}`);

    expect([401, 403]).toContain(res.status);
  });
});

describe("Auth Middleware — PoP-JWT strategy", () => {
  let userId: string;
  let agentId: string;
  let kid: string;
  let privateKeyDer: Buffer;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
    const keyResult = await createTestAgentKey(agentId);
    kid = keyResult.agentKey.kid;
    privateKeyDer = Buffer.from(keyResult.privateKeyB64, "base64");
    app = await buildProtectedApp();
  });

  afterAll(async () => {
    await db.delete(authNoncesTable).where(eq(authNoncesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("valid PoP JWT with fresh nonce authenticates", async () => {
    const nonce = await createTestNonce(agentId);
    const token = buildPopJwt({
      agentId,
      kid,
      nonce: nonce.nonce,
      privateKeyDer,
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe("pop-jwt");
    expect(res.body.agentId).toBe(agentId);
  });

  it("replayed nonce (already consumed) returns 401", async () => {
    const consumed = await createConsumedNonce(agentId);
    const token = buildPopJwt({
      agentId,
      kid,
      nonce: consumed.nonce,
      privateKeyDer,
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${token}`);

    expect([401, 403]).toContain(res.status);
  });

  it("expired nonce returns 401", async () => {
    const expired = await createExpiredNonce(agentId);
    const token = buildPopJwt({
      agentId,
      kid,
      nonce: expired.nonce,
      privateKeyDer,
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${token}`);

    expect([401, 403]).toContain(res.status);
  });

  it("wrong audience returns 401", async () => {
    const nonce = await createTestNonce(agentId);
    const token = buildPopJwt({
      agentId,
      kid,
      nonce: nonce.nonce,
      privateKeyDer,
      aud: "https://wrong-audience.example.com",
    });

    const res = await request(app)
      .get("/api/v1/protected")
      .set("Authorization", `Bearer ${token}`);

    expect([401, 403]).toContain(res.status);
  });
});
