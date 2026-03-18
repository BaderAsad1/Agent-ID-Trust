/**
 * Verification Lifecycle & Concurrent Challenge Tests — Integration
 *
 * Tests the full verification lifecycle including state transitions,
 * concurrent challenge consumption, and re-verification attempts.
 *
 * Covers:
 * - Successful verification transitions agent from pending_verification → active
 * - Verification sets verificationStatus to "verified"
 * - Re-verification attempt on already-verified agent still succeeds (idempotent)
 * - Concurrent challenge consumption: only one succeeds (CAS pattern)
 * - Challenge for wrong agent is rejected
 * - Multiple outstanding challenges: each can be used independently
 * - Already-active agent stays active after verification
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

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
import { signChallenge } from "../test-support/crypto";
import {
  createTestUser,
  createTestAgent,
  createPendingAgent,
  createTestAgentKey,
  createTestChallenge,
} from "../test-support/factories";

describe("Verification Lifecycle — State Transitions", () => {
  let userId: string;
  const agentIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    for (const id of agentIds) {
      await db.delete(agentVerificationChallengesTable).where(eq(agentVerificationChallengesTable.agentId, id)).catch(() => {});
      await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, id)).catch(() => {});
      await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("successful verification transitions agent from pending_verification → active", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agent = await createPendingAgent(userId);
    agentIds.push(agent.id);
    const { privateKeyB64, agentKey } = await createTestAgentKey(agent.id);
    const challenge = await createTestChallenge(agent.id);
    const signature = signChallenge(challenge.challenge, privateKeyB64);

    const beforeAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { status: true, verificationStatus: true },
    });
    expect(beforeAgent!.status).toBe("pending_verification");
    expect(beforeAgent!.verificationStatus).toBe("pending");

    const result = await verifyChallenge(agent.id, challenge.challenge, signature, agentKey.kid);
    expect(result.success).toBe(true);

    const afterAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { status: true, verificationStatus: true, verifiedAt: true },
    });
    expect(afterAgent!.status).toBe("active");
    expect(afterAgent!.verificationStatus).toBe("verified");
    expect(afterAgent!.verifiedAt).toBeInstanceOf(Date);
  });

  it("already-active agent stays active after verification", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agent = await createTestAgent(userId, { status: "active", verificationStatus: "pending" });
    agentIds.push(agent.id);
    const { privateKeyB64, agentKey } = await createTestAgentKey(agent.id);
    const challenge = await createTestChallenge(agent.id);
    const signature = signChallenge(challenge.challenge, privateKeyB64);

    const result = await verifyChallenge(agent.id, challenge.challenge, signature, agentKey.kid);
    expect(result.success).toBe(true);

    const afterAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { status: true, verificationStatus: true },
    });
    expect(afterAgent!.status).toBe("active");
    expect(afterAgent!.verificationStatus).toBe("verified");
  });

  it("re-verification on already-verified agent succeeds (new challenge)", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agent = await createTestAgent(userId, { verificationStatus: "verified" });
    agentIds.push(agent.id);
    const { privateKeyB64, agentKey } = await createTestAgentKey(agent.id);
    const challenge = await createTestChallenge(agent.id);
    const signature = signChallenge(challenge.challenge, privateKeyB64);

    const result = await verifyChallenge(agent.id, challenge.challenge, signature, agentKey.kid);
    expect(result.success).toBe(true);
  });
});

describe("Verification — Concurrent Challenge Consumption", () => {
  let userId: string;
  const agentIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    for (const id of agentIds) {
      await db.delete(agentVerificationChallengesTable).where(eq(agentVerificationChallengesTable.agentId, id)).catch(() => {});
      await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, id)).catch(() => {});
      await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("concurrent challenge consumption: only one of two parallel attempts succeeds", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agent = await createPendingAgent(userId);
    agentIds.push(agent.id);
    const { privateKeyB64, agentKey } = await createTestAgentKey(agent.id);
    const challenge = await createTestChallenge(agent.id);
    const signature = signChallenge(challenge.challenge, privateKeyB64);

    const [result1, result2] = await Promise.all([
      verifyChallenge(agent.id, challenge.challenge, signature, agentKey.kid),
      verifyChallenge(agent.id, challenge.challenge, signature, agentKey.kid),
    ]);

    const successes = [result1, result2].filter(r => r.success);
    const failures = [result1, result2].filter(r => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].error).toMatch(/not found|already used|concurrent|expired/i);
  });

  it("multiple outstanding challenges: each can be consumed independently", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agent = await createPendingAgent(userId);
    agentIds.push(agent.id);
    const { privateKeyB64, agentKey } = await createTestAgentKey(agent.id);

    const challenge1 = await createTestChallenge(agent.id);
    const challenge2 = await createTestChallenge(agent.id);

    const sig1 = signChallenge(challenge1.challenge, privateKeyB64);
    const sig2 = signChallenge(challenge2.challenge, privateKeyB64);

    const result1 = await verifyChallenge(agent.id, challenge1.challenge, sig1, agentKey.kid);
    expect(result1.success).toBe(true);

    const result2 = await verifyChallenge(agent.id, challenge2.challenge, sig2, agentKey.kid);
    expect(result2.success).toBe(true);
  });

  it("challenge for agent A cannot be used to verify agent B", async () => {
    const { verifyChallenge } = await import("../services/verification");

    const agentA = await createPendingAgent(userId);
    const agentB = await createPendingAgent(userId);
    agentIds.push(agentA.id, agentB.id);

    const { privateKeyB64: privA, agentKey: keyA } = await createTestAgentKey(agentA.id);
    await createTestAgentKey(agentB.id);

    const challengeForA = await createTestChallenge(agentA.id);
    const sigA = signChallenge(challengeForA.challenge, privA);

    const result = await verifyChallenge(agentB.id, challengeForA.challenge, sigA, keyA.kid);
    expect(result.success).toBe(false);
  });
});
