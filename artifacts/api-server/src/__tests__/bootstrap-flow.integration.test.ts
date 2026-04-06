import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { createHash } from "crypto";

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
  getUserPlan: vi.fn().mockResolvedValue("starter"),
  getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5, agentLimit: 5, canReceiveMail: false }),
  getActiveUserSubscription: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/mail", () => ({
  provisionInboxForAgent: vi.fn().mockResolvedValue(undefined),
  getOrCreateInbox: vi.fn().mockResolvedValue({ id: "test-inbox", agentId: "test" }),
  getInboxByAgent: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/wallet", () => ({
  provisionAgentWallet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/identity", () => ({
  buildBootstrapBundle: vi.fn().mockResolvedValue({
    did: "did:agentid:test",
    verifiableCredential: null,
  }),
}));

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentClaimTokensTable,
  agentVerificationChallengesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createTestUser, createTestAgent } from "../test-support/factories";
import { generateEd25519KeyPair, signChallenge } from "../test-support/crypto";
import { errorHandler } from "../middlewares/error-handler";

async function buildBootstrapApp() {
  const bootstrapMod = await import("../routes/v1/bootstrap");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/v1/bootstrap", bootstrapMod.default);
  app.use(errorHandler);
  return app;
}

describe("Bootstrap Flow — claim → sign challenge → activate → duplicate rejected", () => {
  let userId: string;
  let agentId: string;
  let claimToken: string;
  let app: express.Express;
  const keyPair = generateEd25519KeyPair();

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "pending_verification",
      verificationStatus: "pending",
      isClaimed: false,
    });
    agentId = agent.id;

    claimToken = `claim_bootstrap_test_${Date.now()}`;
    const hashedClaimToken = createHash("sha256").update(claimToken).digest("hex");
    await db.insert(agentClaimTokensTable).values({
      agentId,
      token: hashedClaimToken,
      isActive: true,
      isUsed: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour TTL
    });

    app = await buildBootstrapApp();
  });

  afterAll(async () => {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.ownerId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentVerificationChallengesTable).where(eq(agentVerificationChallengesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentClaimTokensTable).where(eq(agentClaimTokensTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  let challengeString: string;
  let kidValue: string;

  it("POST /api/v1/bootstrap/claim returns challenge and kid", async () => {
    const res = await request(app)
      .post("/api/v1/bootstrap/claim")
      .send({
        token: claimToken,
        publicKey: keyPair.publicKeyB64,
        keyType: "ed25519",
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("challenge");
    expect(res.body).toHaveProperty("kid");
    expect(res.body).toHaveProperty("identity");
    expect(res.body.identity.agentId).toBe(agentId);

    challengeString = res.body.challenge;
    kidValue = res.body.kid;
  });

  it("POST /api/v1/bootstrap/activate with signed challenge activates agent", async () => {
    const signature = signChallenge(challengeString, keyPair.privateKeyB64);

    const res = await request(app)
      .post("/api/v1/bootstrap/activate")
      .send({
        agentId,
        kid: kidValue,
        challenge: challengeString,
        signature,
        claimToken,
      });

    expect(res.status).toBe(200);
    expect(res.body.activated).toBe(true);
    expect(res.body.identity.agentId).toBe(agentId);
    expect(res.body.identity.status).toBe("active");
    expect(res.body.secrets).toHaveProperty("apiKey");
    expect(res.body.secrets.apiKey).toMatch(/^agk_/);
  });

  it("agent is now active and verified in DB", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { status: true, verificationStatus: true, isClaimed: true },
    });

    expect(agent).toBeDefined();
    expect(agent!.status).toBe("active");
    expect(agent!.verificationStatus).toBe("verified");
    expect(agent!.isClaimed).toBe(true);
  });

  it("duplicate activate with same claim token is rejected (token already used)", async () => {
    const signature = signChallenge(challengeString, keyPair.privateKeyB64);

    const res = await request(app)
      .post("/api/v1/bootstrap/activate")
      .send({
        agentId,
        kid: kidValue,
        challenge: challengeString,
        signature,
        claimToken,
      });

    expect([400, 404, 409]).toContain(res.status);
  });

  it("duplicate claim with same token is rejected (token already used)", async () => {
    const res = await request(app)
      .post("/api/v1/bootstrap/claim")
      .send({
        token: claimToken,
        publicKey: keyPair.publicKeyB64,
        keyType: "ed25519",
      });

    expect([404, 409]).toContain(res.status);
  });
});
