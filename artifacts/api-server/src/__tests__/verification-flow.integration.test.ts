/**
 * Verification Flow Tests — Integration
 *
 * Tests the challenge-response verification flow using real DB and crypto.
 *
 * Covers:
 * - Challenge creation
 * - Valid Ed25519 signature accepted
 * - Invalid signature rejected
 * - Expired challenge rejected
 * - Replayed (already-used) challenge rejected
 * - Wrong key rejected
 * - RSA/ECDSA label-mismatch attack rejected
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/credentials", () => ({
  reissueCredential: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../routes/v1/resolve", () => ({
  deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
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
  agentVerificationChallengesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  generateEd25519KeyPair,
  signChallenge,
  generateRsaPublicKeyB64,
} from "../test-support/crypto";
import {
  createTestUser,
  createPendingAgent,
  createTestAgentKey,
  createTestChallenge,
  createExpiredChallenge,
} from "../test-support/factories";
import { randomBytes } from "crypto";

describe("Verification Flow — verifyChallenge service", () => {
  let userId: string;
  let agentId: string;
  let kid: string;
  let publicKeyB64: string;
  let privateKeyB64: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    const agent = await createPendingAgent(userId);
    agentId = agent.id;

    const keyResult = await createTestAgentKey(agentId);
    kid = keyResult.agentKey.kid;
    publicKeyB64 = keyResult.publicKeyB64;
    privateKeyB64 = keyResult.privateKeyB64;
  });

  afterAll(async () => {
    await db.delete(agentVerificationChallengesTable).where(eq(agentVerificationChallengesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("initiateVerification creates a challenge record in the DB", async () => {
    const { initiateVerification } = await import("../services/verification");
    const result = await initiateVerification(agentId, "key_challenge");

    expect(result).toBeDefined();
    expect(result.agentId).toBe(agentId);
    expect(result.challenge).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("verifyChallenge accepts a valid Ed25519 signature", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const challengeEntry = await createTestChallenge(agentId);
    const signature = signChallenge(challengeEntry.challenge, privateKeyB64);

    const result = await verifyChallenge(agentId, challengeEntry.challenge, signature, kid);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("verifyChallenge rejects an invalid signature", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const challengeEntry = await createTestChallenge(agentId);
    const badSig = randomBytes(64).toString("base64");

    const result = await verifyChallenge(agentId, challengeEntry.challenge, badSig, kid);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("verifyChallenge rejects an expired challenge", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const expiredChallenge = await createExpiredChallenge(agentId);
    const signature = signChallenge(expiredChallenge.challenge, privateKeyB64);

    const result = await verifyChallenge(agentId, expiredChallenge.challenge, signature, kid);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("verifyChallenge rejects a replayed (already-used) challenge", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const challengeEntry = await createTestChallenge(agentId);
    const signature = signChallenge(challengeEntry.challenge, privateKeyB64);

    const first = await verifyChallenge(agentId, challengeEntry.challenge, signature, kid);
    expect(first.success).toBe(true);

    const second = await verifyChallenge(agentId, challengeEntry.challenge, signature, kid);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/not found|already used|expired/i);
  });

  it("verifyChallenge rejects a wrong (nonexistent) kid", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const challengeEntry = await createTestChallenge(agentId);
    const signature = signChallenge(challengeEntry.challenge, privateKeyB64);

    const result = await verifyChallenge(agentId, challengeEntry.challenge, signature, "kid_nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/key|kid/i);
  });

  it("verifyChallenge rejects RSA key material even when labeled ed25519 (label-mismatch attack)", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const rsaPublicKeyB64 = generateRsaPublicKeyB64();
    const rsaKid = `kid_rsa_${randomBytes(8).toString("hex")}`;

    await db.insert(agentKeysTable).values({
      agentId,
      kid: rsaKid,
      keyType: "ed25519",
      publicKey: rsaPublicKeyB64,
      status: "active",
    });

    const challengeEntry = await createTestChallenge(agentId);
    const fakeSig = randomBytes(64).toString("base64");

    const result = await verifyChallenge(agentId, challengeEntry.challenge, fakeSig, rsaKid);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ed25519|key|format/i);

    await db.delete(agentKeysTable).where(eq(agentKeysTable.kid, rsaKid)).catch(() => {});
  });

  it("verifyChallenge rejects a signature from a different agent's key", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const { privateKeyB64: otherPrivateKeyB64 } = generateEd25519KeyPair();

    const challengeEntry = await createTestChallenge(agentId);
    const wrongSig = signChallenge(challengeEntry.challenge, otherPrivateKeyB64);

    const result = await verifyChallenge(agentId, challengeEntry.challenge, wrongSig, kid);

    expect(result.success).toBe(false);
  });
});
