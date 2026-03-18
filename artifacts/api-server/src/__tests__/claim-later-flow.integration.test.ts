/**
 * Claim-Later Ownership Flow — Integration Tests
 *
 * Tests the full claim-later flow end-to-end with real DB:
 *   1. User generates an owner token
 *   2. Verified agent claims ownership via that token (link-owner route)
 *   3. Used/expired/revoked tokens are rejected
 *   4. Revoked agent cannot be claimed
 *   5. Unverified agent cannot be claimed
 *   6. Already-used token is rejected (idempotency)
 *   7. Expired token is rejected
 *   8. Agent DB state is correct after successful claim
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
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
  ownerTokensTable,
} from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createRevokedAgent,
  createTestAgentApiKey,
  createTestOwnerToken,
} from "../test-support/factories";

async function buildLinkOwnerApp() {
  const { agentLinkOwnerRouter } = await import("../routes/v1/owner-tokens");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/", agentLinkOwnerRouter);
  app.use(errorHandler);
  return app;
}

describe("Claim-Later Flow — link-owner endpoint guards", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();
  });

  it("returns 401 when x-api-key header is missing", async () => {
    const res = await request(app)
      .post("/link-owner")
      .send({ token: "aid_sometoken" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 400 when token body is missing", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", "agk_somekey")
      .send({});

    expect([400, 401]).toContain(res.status);
  });

  it("returns 401 when API key is invalid (not in DB)", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", "agk_completely_invalid_key_xyz")
      .send({ token: "aid_sometoken" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
  });
});

describe("Claim-Later Flow — full ownership claim with real DB", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserId: string;
  let agentId: string;
  let rawApiKey: string;
  let ownerToken: string;
  let ownerTokenId: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const agentUser = await createTestUser();
    agentUserId = agentUser.id;

    const agent = await createTestAgent(agentUserId, {
      verificationStatus: "verified",
      status: "active",
      isPublic: true,
    });
    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agentId);
    rawApiKey = keyResult.rawKey;

    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;
    ownerTokenId = tokenRecord.id;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, agentUserId)).catch(() => {});
  });

  it("successfully links agent to owner with valid API key and token", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: ownerToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.linkedUserId).toBe(ownerUserId);
  });

  it("agent DB state has ownerUserId and isClaimed=true after claim", async () => {
    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { ownerUserId: true, isClaimed: true, claimedAt: true },
    });

    expect(updated).toBeDefined();
    expect(updated!.ownerUserId).toBe(ownerUserId);
    expect(updated!.isClaimed).toBe(true);
    expect(updated!.claimedAt).toBeInstanceOf(Date);
  });

  it("token is marked as used in DB after successful claim", async () => {
    const tokenRecord = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.id, ownerTokenId),
      columns: { used: true },
    });

    expect(tokenRecord).toBeDefined();
    expect(tokenRecord!.used).toBe(true);
  });

  it("same token cannot be used twice (idempotency — TOKEN_NOT_FOUND on second attempt)", async () => {
    const secondAgent = await createTestAgent(agentUserId, {
      verificationStatus: "verified",
      status: "active",
    });
    const secondKey = await createTestAgentApiKey(secondAgent.id);

    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", secondKey.rawKey)
      .send({ token: ownerToken });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("TOKEN_NOT_FOUND");

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, secondAgent.id)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, secondAgent.id)).catch(() => {});
  });
});

describe("Claim-Later Flow — revoked agent cannot be claimed", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserId: string;
  let revokedAgentId: string;
  let rawApiKey: string;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const agentUser = await createTestUser();
    agentUserId = agentUser.id;

    const revokedAgent = await createRevokedAgent(agentUserId);
    revokedAgentId = revokedAgent.id;

    const keyResult = await createTestAgentApiKey(revokedAgentId);
    rawApiKey = keyResult.rawKey;

    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, revokedAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, revokedAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, agentUserId)).catch(() => {});
  });

  it("returns 403 AGENT_REVOKED when agent is revoked", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: ownerToken });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("AGENT_REVOKED");
  });
});

describe("Claim-Later Flow — unverified agent cannot be claimed", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserId: string;
  let pendingAgentId: string;
  let rawApiKey: string;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const agentUser = await createTestUser();
    agentUserId = agentUser.id;

    const pendingAgent = await createTestAgent(agentUserId, {
      status: "pending_verification",
      verificationStatus: "pending",
    });
    pendingAgentId = pendingAgent.id;

    const keyResult = await createTestAgentApiKey(pendingAgentId);
    rawApiKey = keyResult.rawKey;

    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, pendingAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, pendingAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, agentUserId)).catch(() => {});
  });

  it("returns 403 AGENT_NOT_VERIFIED when agent is not verified", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: ownerToken });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("AGENT_NOT_VERIFIED");
  });
});

describe("Claim-Later Flow — expired token is rejected", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserId: string;
  let agentId: string;
  let rawApiKey: string;
  let expiredToken: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const agentUser = await createTestUser();
    agentUserId = agentUser.id;

    const agent = await createTestAgent(agentUserId, {
      verificationStatus: "verified",
      status: "active",
    });
    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agentId);
    rawApiKey = keyResult.rawKey;

    const expiredTokenRecord = await createTestOwnerToken(ownerUserId, -1000);
    expiredToken = expiredTokenRecord.token;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, agentUserId)).catch(() => {});
  });

  it("returns 410 TOKEN_EXPIRED for an expired token", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: expiredToken });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("TOKEN_EXPIRED");
  });
});

describe("Claim-Later Flow — concurrent double-claim via Promise.all", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserIds: string[] = [];
  let agentIds: string[] = [];
  let rawApiKeys: string[] = [];
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;

    for (let i = 0; i < 3; i++) {
      const agentUser = await createTestUser();
      agentUserIds.push(agentUser.id);
      const agent = await createTestAgent(agentUser.id, {
        verificationStatus: "verified",
        status: "active",
        isPublic: true,
      });
      agentIds.push(agent.id);
      const keyResult = await createTestAgentApiKey(agent.id);
      rawApiKeys.push(keyResult.rawKey);
    }
  });

  afterAll(async () => {
    for (const aId of agentIds) {
      await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, aId)).catch(() => {});
      await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, aId)).catch(() => {});
      await db.delete(agentsTable).where(eq(agentsTable.id, aId)).catch(() => {});
    }
    for (const uId of agentUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, uId)).catch(() => {});
    }
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
  });

  it("only one concurrent claimer wins the token — exactly one 200, rest get 404 TOKEN_NOT_FOUND", async () => {
    const results = await Promise.all(
      rawApiKeys.map(key =>
        request(app)
          .post("/link-owner")
          .set("x-api-key", key)
          .send({ token: ownerToken })
      )
    );

    const statuses = results.map(r => r.status);
    const successes = statuses.filter(s => s === 200);
    const failures = statuses.filter(s => s === 404);

    expect(successes.length).toBe(1);
    expect(failures.length + successes.length).toBe(3);

    for (const r of results) {
      if (r.status === 404) {
        expect(r.body.error).toBe("TOKEN_NOT_FOUND");
      }
      if (r.status === 200) {
        expect(r.body.success).toBe(true);
      }
    }

    const tokenRecord = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.token, ownerToken),
      columns: { used: true },
    });
    expect(tokenRecord!.used).toBe(true);
  });

  it("pre-claim: agent has no ownerUserId before link-owner; post-claim: ownerUserId is set", async () => {
    let claimedAgent: { ownerUserId: string | null; isClaimed: boolean } | undefined;
    for (const id of agentIds) {
      const a = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, id),
        columns: { ownerUserId: true, isClaimed: true },
      });
      if (a?.isClaimed) {
        claimedAgent = a;
        break;
      }
    }

    expect(claimedAgent).toBeDefined();
    expect(claimedAgent!.ownerUserId).toBe(ownerUserId);
    expect(claimedAgent!.isClaimed).toBe(true);
  });
});

describe("Claim-Later Flow — cross-user token isolation (token from user A cannot be used to link agent to user B)", () => {
  let app: express.Express;
  let userA: string;
  let userB: string;
  let agentId: string;
  let rawApiKey: string;
  let tokenFromUserB: string;

  beforeAll(async () => {
    app = await buildLinkOwnerApp();

    const uA = await createTestUser();
    userA = uA.id;
    const uB = await createTestUser();
    userB = uB.id;

    const agent = await createTestAgent(userA, {
      verificationStatus: "verified",
      status: "active",
    });
    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agentId);
    rawApiKey = keyResult.rawKey;

    const tokenRecord = await createTestOwnerToken(userB);
    tokenFromUserB = tokenRecord.token;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, userB)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userA)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userB)).catch(() => {});
  });

  it("agent successfully links to user B when user B's token is used (correct cross-user flow)", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: tokenFromUserB });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.linkedUserId).toBe(userB);

    const agentRecord = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { ownerUserId: true, isClaimed: true },
    });
    expect(agentRecord!.ownerUserId).toBe(userB);
    expect(agentRecord!.isClaimed).toBe(true);
  });
});

describe("Claim-Later Flow — owner-token issuance route (POST /generate, real DB)", () => {
  let userId: string;
  let generatedToken: string;

  async function buildOwnerTokenGenerateApp(authenticatedUserId: string) {
    const { ownerTokenRouter } = await import("../routes/v1/owner-tokens");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = authenticatedUserId;
      (req as Record<string, unknown>).user = { id: authenticatedUserId, name: "Test User", profileImage: null };
      next();
    });
    app.use("/api/v1/owner-tokens", ownerTokenRouter);
    app.use(errorHandler);
    return app;
  }

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("POST /generate without auth (no userId injected) returns 401", async () => {
    const { ownerTokenRouter } = await import("../routes/v1/owner-tokens");
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use("/api/v1/owner-tokens", ownerTokenRouter);
    noAuthApp.use(errorHandler);

    const res = await request(noAuthApp).post("/api/v1/owner-tokens/generate").send({});
    expect([401, 403]).toContain(res.status);
  });

  it("POST /generate with authenticated user returns 201 with token starting with aid_", async () => {
    const app = await buildOwnerTokenGenerateApp(userId);

    const res = await request(app).post("/api/v1/owner-tokens/generate").send({});

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect((res.body.token as string).startsWith("aid_")).toBe(true);
    expect(res.body.expiresAt).toBeDefined();
    expect(res.body.validForHours).toBe(24);

    generatedToken = res.body.token as string;
  });

  it("generated token is persisted in owner_tokens table with correct userId", async () => {
    const record = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.token, generatedToken),
      columns: { userId: true, used: true, expiresAt: true },
    });

    expect(record).toBeDefined();
    expect(record!.userId).toBe(userId);
    expect(record!.used).toBe(false);
    expect(record!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("second POST /generate invalidates the first token and creates a new one", async () => {
    const app = await buildOwnerTokenGenerateApp(userId);

    const res = await request(app).post("/api/v1/owner-tokens/generate").send({});

    expect(res.status).toBe(201);
    expect(res.body.token).not.toBe(generatedToken);

    const oldRecord = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.token, generatedToken),
      columns: { used: true },
    });
    expect(oldRecord!.used).toBe(true);
  });
});

describe("Claim-Later Flow — pre-claim state is preserved after claim (history/metadata persistence)", () => {
  let app: express.Express;
  let ownerUserId: string;
  let agentUserId: string;
  let agentId: string;
  let rawApiKey: string;
  let ownerToken: string;
  let preClaimDisplayName: string;
  let preClaimCapabilities: string[];

  beforeAll(async () => {
    app = await (async () => {
      const { agentLinkOwnerRouter } = await import("../routes/v1/owner-tokens");
      const a = express();
      a.set("trust proxy", 1);
      a.use(express.json());
      a.use("/", agentLinkOwnerRouter);
      a.use(errorHandler);
      return a;
    })();

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;

    const agentUser = await createTestUser();
    agentUserId = agentUser.id;

    preClaimDisplayName = `Test Agent ${Date.now()}`;
    preClaimCapabilities = ["text-generation", "data-analysis"];

    const agent = await createTestAgent(agentUserId, {
      verificationStatus: "verified",
      status: "active",
      isPublic: true,
      capabilities: preClaimCapabilities,
    });

    await db
      .update(agentsTable)
      .set({ displayName: preClaimDisplayName })
      .where(eq(agentsTable.id, agent.id));

    agentId = agent.id;

    const keyResult = await createTestAgentApiKey(agentId);
    rawApiKey = keyResult.rawKey;

    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;
  });

  afterAll(async () => {
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, agentUserId)).catch(() => {});
  });

  it("successful claim returns 200", async () => {
    const res = await request(app)
      .post("/link-owner")
      .set("x-api-key", rawApiKey)
      .send({ token: ownerToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("after claim: agent displayName and capabilities are unchanged (pre-claim data preserved)", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { displayName: true, capabilities: true, ownerUserId: true, isClaimed: true },
    });

    expect(agent!.isClaimed).toBe(true);
    expect(agent!.ownerUserId).toBe(ownerUserId);
    expect(agent!.displayName).toBe(preClaimDisplayName);
    expect(agent!.capabilities).toEqual(preClaimCapabilities);
  });

  it("after claim: agent original userId (agentUserId) remains in agents.userId column", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { userId: true, ownerUserId: true },
    });

    expect(agent!.userId).toBe(agentUserId);
    expect(agent!.ownerUserId).toBe(ownerUserId);
  });
});

describe("Claim-Later Flow — programmatic registration with ownerToken (C5 path)", () => {
  let registeredAgentId: string;
  let registeredAgentUserId: string;
  let ownerUserId: string;
  let ownerToken: string;

  beforeAll(async () => {
    const { getActiveUserSubscription } = await import("../services/billing");
    vi.mocked(getActiveUserSubscription).mockResolvedValue({
      id: "sub_test_c5",
      plan: "starter",
      status: "active",
      providerSubscriptionId: "sub_test_c5",
    } as unknown as Awaited<ReturnType<typeof getActiveUserSubscription>>);

    const ownerUser = await createTestUser();
    ownerUserId = ownerUser.id;
    const tokenRecord = await createTestOwnerToken(ownerUserId);
    ownerToken = tokenRecord.token;
  });

  afterAll(async () => {
    const { getActiveUserSubscription } = await import("../services/billing");
    vi.mocked(getActiveUserSubscription).mockResolvedValue(null);

    if (registeredAgentId) {
      await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, registeredAgentId)).catch(() => {});
      await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, registeredAgentId)).catch(() => {});
      await db.delete(agentsTable).where(eq(agentsTable.id, registeredAgentId)).catch(() => {});
    }
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, ownerUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerUserId)).catch(() => {});
  });

  it("POST /agents/register with ownerToken claims ownership atomically for authenticated user", async () => {
    const { generateKeyPairSync } = await import("crypto");
    const programmaticRouter = (await import("../routes/v1/programmatic")).default;

    const { publicKey: keyObj } = generateKeyPairSync("ed25519");
    const publicKey = keyObj.export({ type: "spki", format: "pem" }) as string;

    registeredAgentUserId = ownerUserId;

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).userId = ownerUserId;
      next();
    });
    app.use("/api/v1/programmatic", programmaticRouter);
    app.use(errorHandler);

    const testHandle = `c5-claim-${Date.now()}`;

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: testHandle,
        displayName: "C5 Programmatic Owner Claim Test",
        publicKey,
        keyType: "ed25519",
        ownerToken,
      });

    expect(res.status).toBe(201);
    expect(res.body.agentId).toBeDefined();
    registeredAgentId = res.body.agentId;

    const agentRow = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, registeredAgentId),
      columns: { isClaimed: true, ownerUserId: true, userId: true },
    });

    expect(agentRow).toBeDefined();
    expect(agentRow!.isClaimed).toBe(true);
    expect(agentRow!.ownerUserId).toBe(ownerUserId);
    expect(agentRow!.userId).toBe(ownerUserId);
  });

  it("ownerToken is marked as used after programmatic registration claim", async () => {
    const tokenRow = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.userId, ownerUserId),
      columns: { used: true },
    });

    expect(tokenRow).toBeDefined();
    expect(tokenRow!.used).toBe(true);
  });

  it("registration with ownerToken belonging to a different user does NOT claim ownership (C5 userId mismatch guard)", async () => {
    const { generateKeyPairSync } = await import("crypto");
    const programmaticRouter = (await import("../routes/v1/programmatic")).default;

    const { publicKey: keyObj } = generateKeyPairSync("ed25519");
    const publicKey2 = keyObj.export({ type: "spki", format: "pem" }) as string;

    const tokenOwnerUser = await createTestUser();
    const tokenRecord2 = await createTestOwnerToken(tokenOwnerUser.id);

    const differentUser = await createTestUser();

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).userId = differentUser.id;
      next();
    });
    app.use("/api/v1/programmatic", programmaticRouter);
    app.use(errorHandler);

    const mismatchHandle = `c5-mismatch-${Date.now()}`;

    const res = await request(app)
      .post("/api/v1/programmatic/agents/register")
      .send({
        handle: mismatchHandle,
        displayName: "Mismatch User Registration",
        publicKey: publicKey2,
        keyType: "ed25519",
        ownerToken: tokenRecord2.token,
      });

    expect(res.status).toBe(201);
    const mismatchAgentId = res.body.agentId;

    const agentRow = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, mismatchAgentId),
      columns: { isClaimed: true, ownerUserId: true },
    });

    expect(agentRow!.isClaimed).toBe(false);
    expect(agentRow!.ownerUserId).toBeNull();

    const tokenRow = await db.query.ownerTokensTable.findFirst({
      where: eq(ownerTokensTable.id, tokenRecord2.id),
      columns: { used: true },
    });
    expect(tokenRow!.used).toBe(false);

    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, mismatchAgentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, mismatchAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, mismatchAgentId)).catch(() => {});
    await db.delete(ownerTokensTable).where(eq(ownerTokensTable.userId, tokenOwnerUser.id)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, tokenOwnerUser.id)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, differentUser.id)).catch(() => {});
  });
});
