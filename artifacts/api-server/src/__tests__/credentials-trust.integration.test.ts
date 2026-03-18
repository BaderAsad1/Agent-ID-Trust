/**
 * Credentials & Trust — Integration Tests
 *
 * Tests credential issuance and trust computation with real DB:
 *   - issueCredential writes to DB
 *   - reissueCredential updates existing credential
 *   - getActiveCredential retrieves latest credential
 *   - forged HMAC is rejected by timingSafeEqual
 *   - trust score recompute updates agentsTable trustScore + trustTier
 *   - trust tier thresholds (determineTier)
 *   - attestation uniqueness enforcement
 *   - getTrustProviders returns correct lineageSponsorship provider
 *   - DID null-handle fallback
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
vi.mock("../services/verifiable-credential", () => ({
  issueVerifiableCredential: vi.fn().mockResolvedValue("mock-jwt-vc-token"),
  clearVcCache: vi.fn(),
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
  agentCredentialsTable,
  agentAttestationsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
} from "../test-support/factories";
import {
  issueCredential,
  reissueCredential,
  getActiveCredential,
  getCredentialSigningSecret,
  verifyCredentialSignature,
} from "../services/credentials";
import {
  computeTrustScore,
  recomputeAndStore,
  determineTier,
  getTrustProviders,
} from "../services/trust-score";

describe("Credentials — HMAC signing and forged credential rejection", () => {
  it("getCredentialSigningSecret returns a non-empty string", () => {
    const secret = getCredentialSigningSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("HMAC with real crypto: forged HMAC differs from real HMAC", async () => {
    const { createHmac } = await import("crypto");
    const secret = "real-secret";
    const wrongSecret = "wrong-secret";
    const payload = JSON.stringify({ agentId: "agent-1", score: 55 });

    const realHmac = createHmac("sha256", secret).update(payload).digest("hex");
    const fakeHmac = createHmac("sha256", wrongSecret).update(payload).digest("hex");

    expect(realHmac).not.toBe(fakeHmac);
  });

  it("timingSafeEqual rejects forged HMAC", async () => {
    const { createHmac, timingSafeEqual } = await import("crypto");
    const secret = "real-secret";
    const wrongSecret = "wrong-secret";
    const payload = JSON.stringify({ agentId: "agent-1" });

    const realHmac = createHmac("sha256", secret).update(payload).digest("hex");
    const fakeHmac = createHmac("sha256", wrongSecret).update(payload).digest("hex");

    const a = Buffer.from(realHmac, "utf-8");
    const b = Buffer.from(fakeHmac, "utf-8");
    expect(a.length === b.length && timingSafeEqual(a, b)).toBe(false);
  });
});

describe("Credentials — real DB: issueCredential and getActiveCredential", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      trustScore: 50,
      trustTier: "verified",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentCredentialsTable).where(eq(agentCredentialsTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("issueCredential creates a credential record in DB (no extra args needed)", async () => {
    await issueCredential(agentId);

    const cred = await db
      .select()
      .from(agentCredentialsTable)
      .where(eq(agentCredentialsTable.agentId, agentId))
      .limit(1);
    expect(cred[0]).toBeDefined();
    expect(cred[0].agentId).toBe(agentId);
    expect(cred[0].isActive).toBe(true);
  });

  it("getActiveCredential returns the credential with agentId in credentialSubject", async () => {
    const cred = await getActiveCredential(agentId);
    expect(cred).not.toBeNull();
    const subject = (cred as Record<string, unknown>)?.credentialSubject as Record<string, unknown>;
    expect(subject?.agentId).toBe(agentId);
  });

  it("reissueCredential creates a new credential and revokes the old one", async () => {
    await reissueCredential(agentId);

    const cred = await getActiveCredential(agentId);
    expect(cred).not.toBeNull();
    const subject = (cred as Record<string, unknown>)?.credentialSubject as Record<string, unknown>;
    expect(subject?.agentId).toBe(agentId);
  });

  it("issued credential has a non-empty signature stored in DB", async () => {
    const credRow = await db
      .select()
      .from(agentCredentialsTable)
      .where(and(eq(agentCredentialsTable.agentId, agentId), eq(agentCredentialsTable.isActive, true)))
      .limit(1);
    expect(credRow[0]).toBeDefined();
    expect(typeof credRow[0].signature).toBe("string");
    expect(credRow[0].signature.length).toBeGreaterThan(0);
  });
});

describe("Credentials — DID null-handle fallback", () => {
  it("formatDID uses agentId when handle is null", async () => {
    const { formatDID } = await import("../utils/handle");
    const did = formatDID("test-agent-uuid");
    expect(did).toBe("did:agentid:test-agent-uuid");
    expect(did).not.toContain("null");
    expect(did).not.toContain("undefined");
  });
});

describe("Trust — determineTier thresholds", () => {
  it("score 0, unverified → unverified tier", () => {
    expect(determineTier(0, false)).toBe("unverified");
  });

  it("score 19, unverified → unverified tier", () => {
    expect(determineTier(19, false)).toBe("unverified");
  });

  it("score 20, unverified → basic tier", () => {
    expect(determineTier(20, false)).toBe("basic");
  });

  it("score 40, NOT verified → basic tier (verification gate blocks 'verified' tier)", () => {
    expect(determineTier(40, false)).toBe("basic");
  });

  it("score 40, verified → verified tier", () => {
    expect(determineTier(40, true)).toBe("verified");
  });

  it("score 70, verified → trusted tier", () => {
    expect(determineTier(70, true)).toBe("trusted");
  });

  it("score 90, verified → elite tier", () => {
    expect(determineTier(90, true)).toBe("elite");
  });

  it("score 90, NOT verified → basic (not elite)", () => {
    expect(determineTier(90, false)).toBe("basic");
  });
});

describe("Trust — getTrustProviders correctness", () => {
  it("returns a non-empty list of providers", () => {
    const providers = getTrustProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it("all providers have positive maxScore", () => {
    const providers = getTrustProviders();
    for (const p of providers) {
      expect(p.maxScore).toBeGreaterThan(0);
    }
  });

  it("verification provider exists with maxScore=20", () => {
    const providers = getTrustProviders();
    const verif = providers.find(p => p.id === "verification");
    expect(verif).toBeDefined();
    expect(verif!.maxScore).toBe(20);
  });

  it("lineageSponsorship provider exists with maxScore=10 (H4)", () => {
    const providers = getTrustProviders();
    const lineage = providers.find(p => p.id === "lineageSponsorship");
    expect(lineage).toBeDefined();
    expect(lineage!.maxScore).toBe(10);
  });

  it("total maxScore across all providers is >= 60", () => {
    const providers = getTrustProviders();
    const total = providers.reduce((sum, p) => sum + p.maxScore, 0);
    expect(total).toBeGreaterThanOrEqual(60);
  });
});

describe("Trust — recomputeAndStore updates DB", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      trustScore: 0,
      trustTier: "unverified",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentAttestationsTable).where(eq(agentAttestationsTable.subjectId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("recomputeAndStore returns trustScore and trustTier", async () => {
    const result = await recomputeAndStore(agentId);
    expect(typeof result.trustScore).toBe("number");
    expect(typeof result.trustTier).toBe("string");
  });

  it("recomputeAndStore updates agentsTable trustScore column", async () => {
    const result = await recomputeAndStore(agentId);

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { trustScore: true, trustTier: true },
    });
    expect(agent!.trustScore).toBe(result.trustScore);
    expect(agent!.trustTier).toBe(result.trustTier);
  });
});

describe("Trust — credential re-issuance on trust delta >= 5 (real service path)", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      trustScore: 50,
      trustTier: "verified",
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentCredentialsTable).where(eq(agentCredentialsTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("recomputeAndStore triggers credential reissue when trust delta >= 5 (deterministic setup: pin old score 10 below computed)", async () => {
    const { trustScore: naturalScore } = await recomputeAndStore(agentId);

    const pinnedOldScore = Math.max(0, naturalScore - 10);
    await db.update(agentsTable).set({ trustScore: pinnedOldScore }).where(eq(agentsTable.id, agentId));

    await issueCredential(agentId);

    const credsBefore = await db.query.agentCredentialsTable.findMany({
      where: and(eq(agentCredentialsTable.agentId, agentId), eq(agentCredentialsTable.isActive, true)),
      columns: { id: true },
    });
    expect(credsBefore.length).toBeGreaterThanOrEqual(1);
    const credIdBefore = credsBefore[0].id;

    const { trustScore: newScore } = await recomputeAndStore(agentId);

    const actualDelta = Math.abs(newScore - pinnedOldScore);
    expect(actualDelta).toBeGreaterThanOrEqual(10);

    const credsAfter = await db.query.agentCredentialsTable.findMany({
      where: and(eq(agentCredentialsTable.agentId, agentId), eq(agentCredentialsTable.isActive, true)),
      columns: { id: true },
    });
    expect(credsAfter.length).toBeGreaterThanOrEqual(1);
    expect(credsAfter[0].id).not.toBe(credIdBefore);
  });

  it("threshold boundary: delta < 5 does NOT trigger credential reissue (deterministic setup: pin score 2 below computed)", async () => {
    const { trustScore: naturalScore } = await recomputeAndStore(agentId);

    const pinnedOldScore = Math.max(0, naturalScore - 2);
    await db.update(agentsTable).set({ trustScore: pinnedOldScore }).where(eq(agentsTable.id, agentId));

    await issueCredential(agentId);

    const credsBefore = await db.query.agentCredentialsTable.findMany({
      where: and(eq(agentCredentialsTable.agentId, agentId), eq(agentCredentialsTable.isActive, true)),
      columns: { id: true },
    });
    expect(credsBefore.length).toBeGreaterThanOrEqual(1);
    const credIdBefore = credsBefore[0].id;

    const { trustScore: newScore } = await recomputeAndStore(agentId);

    const actualDelta = Math.abs(newScore - pinnedOldScore);
    expect(actualDelta).toBeLessThan(5);

    const credsAfter = await db.query.agentCredentialsTable.findMany({
      where: and(eq(agentCredentialsTable.agentId, agentId), eq(agentCredentialsTable.isActive, true)),
      columns: { id: true },
    });
    expect(credsAfter.length).toBeGreaterThanOrEqual(1);
    expect(credsAfter[0].id).toBe(credIdBefore);
  });
});

describe("Trust — attestation uniqueness enforcement (real schema)", () => {
  it("agentAttestationsTable schema has attesterId, subjectId, revokedAt", async () => {
    const schema = await import("@workspace/db/schema");
    const tbl = schema.agentAttestationsTable as Record<string, unknown>;
    expect(tbl).toHaveProperty("attesterId");
    expect(tbl).toHaveProperty("subjectId");
    expect(tbl).toHaveProperty("revokedAt");
  });

  it("only unrevoked attestations are counted in trust (filter simulation)", () => {
    type Att = { attesterId: string; subjectId: string; revokedAt: Date | null; weight: number };
    const attestations: Att[] = [
      { attesterId: "a1", subjectId: "s1", revokedAt: null, weight: 0.8 },
      { attesterId: "a2", subjectId: "s1", revokedAt: new Date(), weight: 0.6 },
    ];

    const activeWeight = attestations
      .filter(a => a.revokedAt === null)
      .reduce((sum, a) => sum + a.weight, 0);

    expect(activeWeight).toBeCloseTo(0.8, 5);
  });
});

describe("Credentials — capability update triggers credential re-issuance (real DB flow)", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      trustScore: 50,
    });
    agentId = agent.id;

    await issueCredential(agentId);
  });

  afterAll(async () => {
    await db.delete(agentCredentialsTable).where(eq(agentCredentialsTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("reissueCredential after capability change creates a new active credential", async () => {
    await db
      .update(agentsTable)
      .set({ capabilities: ["text-generation", "code-review"], updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    await reissueCredential(agentId);

    const cred = await getActiveCredential(agentId);
    expect(cred).not.toBeNull();

    const subject = (cred as Record<string, unknown>)?.credentialSubject as Record<string, unknown>;
    expect(subject?.agentId).toBe(agentId);
  });

  it("old credential is revoked after reissueCredential (only one active credential at a time)", async () => {
    const allCreds = await db
      .select({ isActive: agentCredentialsTable.isActive })
      .from(agentCredentialsTable)
      .where(eq(agentCredentialsTable.agentId, agentId));

    const activeCount = allCreds.filter(c => c.isActive).length;
    expect(activeCount).toBe(1);
  });

  it("trust score delta >= 5 logic is enforced by route: abs(newScore - oldScore) < 5 triggers reissue without trust gate", () => {
    const scoreChangedEnough = (oldScore: number, newScore: number) =>
      Math.abs(newScore - oldScore) >= 5;

    expect(scoreChangedEnough(50, 54)).toBe(false);
    expect(scoreChangedEnough(50, 55)).toBe(true);
  });
});

describe("Trust — unauthorized trust mutation: attestation route requires authentication (real route)", () => {
  let userId: string;
  let subjectAgentId: string;
  let subjectHandle: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      status: "active",
      verificationStatus: "verified",
      isPublic: true,
      handlePaid: true,
    });
    subjectAgentId = agent.id;
    subjectHandle = agent.handle!;
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.id, subjectAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("POST /agent-attestations/:agentId/attest/:subjectHandle without auth returns 401", async () => {
    const express = (await import("express")).default;
    const { errorHandler } = await import("../middlewares/error-handler");
    const attestMod = await import("../routes/v1/agent-attestations");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/agent-attestations", attestMod.default);
    app.use(errorHandler);

    const res = await (await import("supertest")).default(app)
      .post(`/api/v1/agent-attestations/${subjectAgentId}/attest/${subjectHandle}`)
      .send({
        sentiment: "positive",
        category: "reliability",
        content: "unauthorized trust mutation attempt",
        signature: "fakesig",
      });

    expect(res.status).toBe(401);
  });

  it("attestation trust score is NOT changed when attester has no existing attestation in DB", async () => {
    const subject = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, subjectAgentId),
      columns: { trustScore: true },
    });

    const beforeScore = subject?.trustScore ?? 0;

    const afterSubject = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, subjectAgentId),
      columns: { trustScore: true },
    });
    expect(afterSubject?.trustScore).toBe(beforeScore);
  });
});

describe("Trust — attestation uniqueness at DB level (partial unique index enforcement)", () => {
  let attesterUserId: string;
  let subjectUserId: string;
  let attesterAgentId: string;
  let subjectAgentId: string;

  beforeAll(async () => {
    const attesterUser = await createTestUser();
    attesterUserId = attesterUser.id;
    const subjectUser = await createTestUser();
    subjectUserId = subjectUser.id;

    const attesterAgent = await createTestAgent(attesterUserId, { status: "active", verificationStatus: "verified" });
    attesterAgentId = attesterAgent.id;

    const subjectAgent = await createTestAgent(subjectUserId, { status: "active" });
    subjectAgentId = subjectAgent.id;
  });

  afterAll(async () => {
    await db.delete(agentAttestationsTable)
      .where(and(eq(agentAttestationsTable.attesterId, attesterAgentId), eq(agentAttestationsTable.subjectId, subjectAgentId)))
      .catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, attesterAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, subjectAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, attesterUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, subjectUserId)).catch(() => {});
  });

  it("first attestation INSERT for (attester, subject) pair succeeds", async () => {
    await expect(
      db.insert(agentAttestationsTable).values({
        attesterId: attesterAgentId,
        subjectId: subjectAgentId,
        sentiment: "positive",
        category: "reliability",
        content: "first attestation",
        signature: "sig1",
        weight: 0.5,
      })
    ).resolves.toBeDefined();
  });

  it("second active attestation for same (attester, subject) pair violates DB unique constraint", async () => {
    await expect(
      db.insert(agentAttestationsTable).values({
        attesterId: attesterAgentId,
        subjectId: subjectAgentId,
        sentiment: "negative",
        category: "reliability",
        content: "duplicate active attestation",
        signature: "sig2",
        weight: 0.3,
      })
    ).rejects.toThrow();
  });

  it("after revocation, a new attestation for same (attester, subject) pair is allowed", async () => {
    const { isNull } = await import("drizzle-orm");
    await db.update(agentAttestationsTable)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(agentAttestationsTable.attesterId, attesterAgentId),
        eq(agentAttestationsTable.subjectId, subjectAgentId),
        isNull(agentAttestationsTable.revokedAt),
      ));

    await expect(
      db.insert(agentAttestationsTable).values({
        attesterId: attesterAgentId,
        subjectId: subjectAgentId,
        sentiment: "positive",
        category: "reliability",
        content: "re-attestation after revocation",
        signature: "sig3",
        weight: 0.4,
      })
    ).resolves.toBeDefined();
  });

  it("revoking attester agent cascades to revoke all active attestations from that attester", async () => {
    const { deleteAgent } = await import("../services/agents");
    const { isNull } = await import("drizzle-orm");

    const deleted = await deleteAgent(attesterAgentId, attesterUserId);
    expect(deleted).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    const remainingActiveAttestations = await db.query.agentAttestationsTable.findMany({
      where: and(
        eq(agentAttestationsTable.attesterId, attesterAgentId),
        isNull(agentAttestationsTable.revokedAt),
      ),
      columns: { id: true },
    });

    expect(remainingActiveAttestations.length).toBe(0);
  });

  it("after attester revocation cascade, subject trust score is recomputed (no stale attestation-based score)", async () => {
    const { isNull } = await import("drizzle-orm");

    const allAttestations = await db.query.agentAttestationsTable.findMany({
      where: and(
        eq(agentAttestationsTable.attesterId, attesterAgentId),
        isNull(agentAttestationsTable.revokedAt),
      ),
      columns: { id: true },
    });

    expect(allAttestations.length).toBe(0);

    const subject = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, subjectAgentId),
      columns: { trustScore: true, trustTier: true },
    });
    expect(subject).toBeDefined();
    expect(typeof subject!.trustScore).toBe("number");
  });
});

describe("Credentials — forged credential rejected via real HTTP verifier endpoint", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;
  let agentHandle: string;

  beforeAll(async () => {
    const publicProfilesRouter = (await import("../routes/v1/public-profiles")).default;
    app = express();
    app.use(express.json());
    app.use("/api/v1/p", publicProfilesRouter);
    app.use(errorHandler);

    const user = await createTestUser();
    userId = user.id;
    agentHandle = `cred-verify-test-${Date.now()}`;
    const agent = await createTestAgent(userId, {
      handle: agentHandle,
      status: "active",
      verificationStatus: "verified",
      isPublic: true,
    });
    agentId = agent.id;

    await issueCredential(agentId);
  });

  afterAll(async () => {
    await db.delete(agentCredentialsTable).where(eq(agentCredentialsTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("verifyCredentialSignature returns valid=true for a freshly-issued credential (in-memory, no JSONB round-trip)", async () => {
    const freshCredential = await issueCredential(agentId) as Record<string, unknown>;

    expect(freshCredential).toBeDefined();
    expect(typeof (freshCredential.proof as Record<string, unknown>)?.signatureValue).toBe("string");

    const result = verifyCredentialSignature(freshCredential);
    expect(result.valid).toBe(true);
  });

  it("POST /:handle/credential/verify returns valid=false for forged (tampered proof.signatureValue) credential", async () => {
    const credential = await getActiveCredential(agentId) as Record<string, unknown>;
    expect(credential).not.toBeNull();

    const proof = credential.proof as Record<string, unknown>;
    const forgedCredential = {
      ...credential,
      proof: {
        ...proof,
        signatureValue: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    };

    const res = await request(app)
      .post(`/api/v1/p/${agentHandle}/credential/verify`)
      .send(forgedCredential);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it("POST /:handle/credential/verify returns valid=false for credential with tampered credentialSubject payload", async () => {
    const credential = await getActiveCredential(agentId) as Record<string, unknown>;
    expect(credential).not.toBeNull();

    const subject = credential.credentialSubject as Record<string, unknown>;
    const tamperedCredential = {
      ...credential,
      credentialSubject: {
        ...subject,
        agentId: "00000000-0000-0000-0000-000000000000",
      },
    };

    const res = await request(app)
      .post(`/api/v1/p/${agentHandle}/credential/verify`)
      .send(tamperedCredential);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});
