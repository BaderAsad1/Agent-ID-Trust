/**
 * Session Lifecycle Tests — Integration
 *
 * Tests session creation, validation, expiry, and revocation.
 *
 * Covers:
 * - Session creation after challenge-response
 * - Session validation
 * - Session expiry
 * - Explicit session revocation
 * - Revoked session cannot be reused
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
  authNoncesTable,
  agentidSessionsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createTestAgentKey,
  createTestNonce,
  createExpiredNonce,
} from "../test-support/factories";
import { signChallenge } from "../test-support/crypto";

/** Helper: create a fresh key + nonce and issue a session. Returns session and key details. */
async function issueSession(agentId: string) {
  const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);
  const nonceEntry = await createTestNonce(agentId);
  const challengeMessage = `${nonceEntry.nonce}:${agentId}`;
  const signature = signChallenge(challengeMessage, privateKeyB64);
  const { verifyAndIssueSession } = await import("../services/auth-session");
  const session = await verifyAndIssueSession(agentId, nonceEntry.nonce, signature, agentKey.kid);
  return { session, agentKey, privateKeyB64 };
}

describe("Session Lifecycle", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(authNoncesTable).where(eq(authNoncesTable.agentId, agentId)).catch(() => {});
    await db.delete(agentidSessionsTable).where(eq(agentidSessionsTable.agentId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("createAuthChallenge creates a nonce for a valid agent", async () => {
    const { createAuthChallenge } = await import("../services/auth-session");

    const result = await createAuthChallenge(agentId);

    expect(result.nonce).toBeTruthy();
    expect(result.agentId).toBe(agentId);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("verifyAndIssueSession creates a valid session JWT after successful challenge", async () => {
    const { session } = await issueSession(agentId);

    expect(session.sessionToken).toBeTruthy();
    expect(session.sessionId).toBeTruthy();
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(session.scopes).toBeInstanceOf(Array);
    expect(session.scopes.length).toBeGreaterThan(0);

    const dbSession = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, session.sessionId),
    });
    expect(dbSession).toBeDefined();
    expect(dbSession!.revoked).toBe(false);
  });

  it("introspectToken returns active=true for a valid session", async () => {
    const { introspectToken } = await import("../services/auth-session");
    const { session } = await issueSession(agentId);

    const introspection = await introspectToken(session.sessionToken);

    expect(introspection.active).toBe(true);
    expect(introspection.sessionId).toBe(session.sessionId);
  });

  it("verifyAndIssueSession rejects an invalid signature", async () => {
    const { verifyAndIssueSession } = await import("../services/auth-session");
    const { agentKey } = await createTestAgentKey(agentId);

    const nonceEntry = await createTestNonce(agentId);
    const badSignature = Buffer.from("invalidsig").toString("base64");

    await expect(
      verifyAndIssueSession(agentId, nonceEntry.nonce, badSignature, agentKey.kid),
    ).rejects.toThrow(/signature/i);
  });

  it("verifyAndIssueSession rejects an expired nonce", async () => {
    const { verifyAndIssueSession } = await import("../services/auth-session");
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);

    const expiredNonce = await createExpiredNonce(agentId);
    const challengeMessage = `${expiredNonce.nonce}:${agentId}`;
    const signature = signChallenge(challengeMessage, privateKeyB64);

    await expect(
      verifyAndIssueSession(agentId, expiredNonce.nonce, signature, agentKey.kid),
    ).rejects.toThrow(/nonce|expired/i);
  });

  it("verifyAndIssueSession rejects a replayed (already consumed) nonce", async () => {
    const { verifyAndIssueSession } = await import("../services/auth-session");
    const { agentKey, privateKeyB64 } = await createTestAgentKey(agentId);

    const nonceEntry = await createTestNonce(agentId);
    const challengeMessage = `${nonceEntry.nonce}:${agentId}`;
    const signature = signChallenge(challengeMessage, privateKeyB64);

    await verifyAndIssueSession(agentId, nonceEntry.nonce, signature, agentKey.kid);

    await expect(
      verifyAndIssueSession(agentId, nonceEntry.nonce, signature, agentKey.kid),
    ).rejects.toThrow(/nonce|consumed|invalid/i);
  });

  it("revokeSession marks a session as revoked and introspect returns inactive", async () => {
    const { revokeSession, introspectToken } = await import("../services/auth-session");
    const { session } = await issueSession(agentId);

    const revoked = await revokeSession(session.sessionId, "test");
    expect(revoked).toBe(true);

    const dbSession = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, session.sessionId),
    });
    expect(dbSession!.revoked).toBe(true);
    expect(dbSession!.revokedAt).toBeInstanceOf(Date);

    const introspection = await introspectToken(session.sessionToken);
    expect(introspection.active).toBe(false);
  });

  it("revokeSession returns false when session belongs to another agent", async () => {
    const { revokeSession } = await import("../services/auth-session");
    const { session } = await issueSession(agentId);

    const fakeOtherAgentId = "00000000-0000-0000-0000-000000000001";
    const revoked = await revokeSession(session.sessionId, "test", fakeOtherAgentId);
    expect(revoked).toBe(false);
  });

  it("introspectToken returns active=false for an expired session", async () => {
    const { introspectToken } = await import("../services/auth-session");
    const { session } = await issueSession(agentId);

    await db.update(agentidSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agentidSessionsTable.sessionId, session.sessionId));

    const introspection = await introspectToken(session.sessionToken);
    expect(introspection.active).toBe(false);
  });
});
