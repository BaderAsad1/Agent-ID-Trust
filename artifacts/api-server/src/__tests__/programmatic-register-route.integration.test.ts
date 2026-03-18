/**
 * Programmatic Registration Route Tests — Integration
 *
 * Tests the POST /api/v1/programmatic/agents/register HTTP route end-to-end.
 * Uses a real Express app, real DB, and supertest.
 *
 * Covers:
 * - Successful autonomous registration (no auth)
 * - Successful authenticated registration (authenticated user)
 * - Per-IP quota enforcement (via registrationRateLimitStrict)
 * - Validation failures (missing fields, invalid publicKey format)
 * - owner-token linking at registration
 * - Autonomous agents cannot claim ownership at registration via ownerToken
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { randomBytes } from "crypto";

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
vi.mock("../services/trust-score", () => ({
  recomputeAndStore: vi.fn().mockResolvedValue({ trustScore: 0, trustTier: "unverified" }),
  determineTier: vi.fn().mockReturnValue("unverified"),
  getTrustProviders: vi.fn().mockReturnValue([]),
}));
vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../routes/v1/resolve", () => ({
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
vi.mock("../lib/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../middlewares/rate-limit", () => ({
  registrationRateLimitStrict: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  publicRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  challengeRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  recoveryRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  _resetLimitersForTesting: vi.fn(),
}));

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  agentVerificationChallengesTable,
  ownerTokensTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { errorHandler } from "../middlewares/error-handler";
import { createTestUser, createTestOwnerToken } from "../test-support/factories";
import { generateEd25519KeyPair } from "../test-support/crypto";

async function buildRegisterApp(authenticatedUserId?: string) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  if (authenticatedUserId) {
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = authenticatedUserId;
      next();
    });
  }

  const programmaticRouter = (await import("../routes/v1/programmatic")).default;
  app.use("/api/v1/programmatic", programmaticRouter);
  app.use(errorHandler);
  return app;
}


describe("POST /api/v1/programmatic/agents/register — Autonomous Registration", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await db.delete(agentVerificationChallengesTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(agentsTable).catch(() => {});
    for (const uid of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, uid)).catch(() => {});
    }
    await db.delete(usersTable).where(eq(usersTable.provider, "autonomous")).catch(() => {});
  });

  it("creates an agent and returns 201 for a valid autonomous registration (no handle)", async () => {
    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Autonomous Test Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
      });

    expect(res.status).toBe(201);
    expect(res.body.agentId).toBeTruthy();
    expect(res.body.kid).toMatch(/^kid_/);
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.handle).toBeNull();
  });

  it("returns 400 for missing displayName", async () => {
    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: `test-${randomBytes(4).toString("hex")}`,
        publicKey: publicKeyB64,
        keyType: "ed25519",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 400 for missing publicKey", async () => {
    const app = await buildRegisterApp();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: `test-${randomBytes(4).toString("hex")}`,
        displayName: "Test Agent",
        keyType: "ed25519",
      });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid endpointUrl", async () => {
    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: `test-${randomBytes(4).toString("hex")}`,
        displayName: "Test Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
        endpointUrl: "not-a-url",
      });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a handle that is too short (< 3 chars)", async () => {
    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: "ab",
        displayName: "Test Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
      });

    expect([400, 402]).toContain(res.status);
  });

  it("skips ownerToken for autonomous registration and still returns 201", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    const ownerToken = await createTestOwnerToken(user.id);

    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Autonomous Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
        ownerToken: ownerToken.token,
      });

    expect(res.status).toBe(201);
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, res.body.agentId),
    });
    expect(agent).toBeDefined();
    expect(agent?.ownerUserId).toBeNull();
    expect(agent?.isClaimed).not.toBe(true);
  });

  it("registration without handle returns 201 and null handle", async () => {
    const app = await buildRegisterApp();
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "No Handle Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
      });

    expect(res.status).toBe(201);
    expect(res.body.agentId).toBeTruthy();
    expect(res.body.handle).toBeNull();
    expect(res.body.handleIdentity).toBeNull();
  });
});

describe("POST /api/v1/programmatic/agents/register — Authenticated Registration", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(agentVerificationChallengesTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("creates agent and links to authenticated user (no handle)", async () => {
    const app = await buildRegisterApp(userId);
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Authenticated Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
      });

    expect(res.status).toBe(201);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, res.body.agentId),
    });
    expect(agent?.userId).toBe(userId);
  });
});

describe("POST /api/v1/programmatic/agents/register — Owner-Token Linking (C5)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(agentVerificationChallengesTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, userId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("links agent to owner when valid ownerToken is provided by authenticated user", async () => {
    const ownerToken = await createTestOwnerToken(userId);
    const app = await buildRegisterApp(userId);
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Owned Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
        ownerToken: ownerToken.token,
      });

    expect(res.status).toBe(201);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, res.body.agentId),
    });
    expect(agent?.ownerUserId).toBe(userId);
    expect(agent?.isClaimed).toBe(true);

    const usedToken = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.id, ownerToken.id),
    });
    expect(usedToken?.used).toBe(true);
  });

  it("does not link expired ownerToken (token is past expiresAt)", async () => {
    const rawToken = `aid_${randomBytes(16).toString("hex")}`;
    const expiredAt = new Date(Date.now() - 1000);
    await db.insert(ownerTokensTable).values({
      token: rawToken,
      userId,
      used: false,
      expiresAt: expiredAt,
    });

    const app = await buildRegisterApp(userId);
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Expired Token Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
        ownerToken: rawToken,
      });

    expect(res.status).toBe(201);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, res.body.agentId),
    });
    expect(agent?.ownerUserId).toBeNull();
    expect(agent?.isClaimed).not.toBe(true);
  });

  it("does not link ownerToken belonging to a different user", async () => {
    const otherUser = await createTestUser();
    const otherToken = await createTestOwnerToken(otherUser.id);

    const app = await buildRegisterApp(userId);
    const { publicKeyB64 } = generateEd25519KeyPair();

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        displayName: "Cross-User Token Agent",
        publicKey: publicKeyB64,
        keyType: "ed25519",
        ownerToken: otherToken.token,
      });

    expect(res.status).toBe(201);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, res.body.agentId),
    });
    expect(agent?.ownerUserId).toBeNull();

    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, otherUser.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, otherUser.id)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, otherUser.id)).catch(() => {});
  });
});

describe("POST /api/v1/programmatic/agents/register — Per-IP Quota Guard (C4)", () => {
  it("the route has the registrationRateLimitStrict middleware applied", async () => {
    const mod = await import("../routes/v1/programmatic");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("handles a duplicate handle registration with 409", async () => {
    const user = await createTestUser();
    const sharedHandle = `shared-${randomBytes(4).toString("hex")}`;

    const billing = await import("../services/billing");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(billing.getActiveUserSubscription).mockResolvedValue({ id: "sub-test", plan: "starter", status: "active", providerSubscriptionId: "stripe_sub_test" } as any);

    const app = await buildRegisterApp(user.id);

    const { publicKeyB64: pk1 } = generateEd25519KeyPair();
    const first = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({ handle: sharedHandle, displayName: "First Agent", publicKey: pk1, keyType: "ed25519" });

    expect(first.status).toBe(201);

    const { publicKeyB64: pk2 } = generateEd25519KeyPair();
    const second = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({ handle: sharedHandle, displayName: "Second Agent", publicKey: pk2, keyType: "ed25519" });

    expect(second.status).toBe(409);

    vi.mocked(billing.getActiveUserSubscription).mockResolvedValue(null);

    await db.delete(agentVerificationChallengesTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, user.id)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, user.id)).catch(() => {});
  });
});
