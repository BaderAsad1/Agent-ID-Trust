/**
 * Programmatic Registration Tests — Integration
 *
 * Tests the self-registration flow at the service level.
 *
 * Covers:
 * - Happy path agent creation (service level)
 * - Handle validation failures
 * - Key type enforcement (ed25519 only)
 * - Basic DB state after successful registration
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

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentVerificationChallengesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateEd25519KeyPair } from "../test-support/crypto";
import { createTestUser } from "../test-support/factories";

describe("Programmatic Registration — Service Level", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(agentVerificationChallengesTable).catch(() => {});
    await db.delete(agentKeysTable).catch(() => {});
    await db.delete(apiKeysTable).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("createAgent creates an agent in the DB with correct defaults", async () => {
    const { createAgent } = await import("../services/agents");
    const { randomBytes } = await import("crypto");
    const handle = `test-reg-${randomBytes(4).toString("hex")}`;

    const agent = await createAgent({
      userId,
      handle,
      displayName: "Test Registration Agent",
      isPublic: false,
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBeTruthy();
    expect(agent.userId).toBe(userId);
    expect(agent.displayName).toBe("Test Registration Agent");
    expect(agent.status).toBe("draft");
    expect(agent.verificationStatus).toBe("unverified");
    expect(agent.isPublic).toBe(false);
  });

  it("createAgentKey rejects non-ed25519 key types", async () => {
    const { createAgent } = await import("../services/agents");
    const { createAgentKey } = await import("../services/agent-keys");
    const { randomBytes } = await import("crypto");

    const agent = await createAgent({
      userId,
      handle: `test-key-type-${randomBytes(4).toString("hex")}`,
      displayName: "Test Agent Key Type",
      isPublic: false,
    });

    await expect(
      createAgentKey({ agentId: agent.id, keyType: "RS256", publicKey: "pk" }),
    ).rejects.toThrow(/ed25519/i);

    await expect(
      createAgentKey({ agentId: agent.id, keyType: "rsa", publicKey: "pk" }),
    ).rejects.toThrow(/ed25519/i);

    await expect(
      createAgentKey({ agentId: agent.id, keyType: "P-256", publicKey: "pk" }),
    ).rejects.toThrow(/ed25519/i);
  });

  it("createAgentKey accepts ed25519 key type and creates a record in DB", async () => {
    const { createAgent } = await import("../services/agents");
    const { createAgentKey } = await import("../services/agent-keys");
    const { randomBytes } = await import("crypto");

    const { publicKeyB64 } = generateEd25519KeyPair();
    const agent = await createAgent({
      userId,
      handle: `test-with-key-${randomBytes(4).toString("hex")}`,
      displayName: "Test Agent With Key",
      isPublic: false,
    });

    const key = await createAgentKey({
      agentId: agent.id,
      keyType: "ed25519",
      publicKey: publicKeyB64,
    });

    expect(key.id).toBeTruthy();
    expect(key.kid).toMatch(/^kid_/);
    expect(key.keyType).toBe("ed25519");
    expect(key.publicKey).toBe(publicKeyB64);
    expect(key.status).toBe("active");
  });

  it("validateHandle rejects handles shorter than 3 characters", async () => {
    const { validateHandle } = await import("../services/agents");

    const error = validateHandle("ab");
    expect(error).toBeTruthy();
    expect(error).toMatch(/3|100|alphanumeric/i);
  });

  it("validateHandle rejects handles with invalid characters", async () => {
    const { validateHandle } = await import("../services/agents");

    expect(validateHandle("bad handle")).toBeTruthy();
    expect(validateHandle("UPPERCASE")).toBeTruthy();
    expect(validateHandle("has_underscore")).toBeTruthy();
    expect(validateHandle("-startswith")).toBeTruthy();
    expect(validateHandle("endswith-")).toBeTruthy();
  });

  it("validateHandle accepts valid handles", async () => {
    const { validateHandle } = await import("../services/agents");

    expect(validateHandle("valid-handle")).toBeNull();
    expect(validateHandle("abc123")).toBeNull();
    expect(validateHandle("my-agent-123")).toBeNull();
    expect(validateHandle("testhandle")).toBeNull();
  });

  it("initiateVerification creates a challenge record", async () => {
    const { createAgent } = await import("../services/agents");
    const { initiateVerification } = await import("../services/verification");
    const { randomBytes } = await import("crypto");

    const agent = await createAgent({
      userId,
      handle: `test-verify-${randomBytes(4).toString("hex")}`,
      displayName: "Test Verify Agent",
      isPublic: false,
    });

    const challenge = await initiateVerification(agent.id, "key_challenge");

    expect(challenge.challenge).toBeTruthy();
    expect(challenge.agentId).toBe(agent.id);
    expect(challenge.method).toBe("key_challenge");
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const agentRecord = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
    });
    expect(agentRecord?.verificationStatus).toBe("pending");
  });

  it("standard API key is created with correct aid_ prefix", async () => {
    const { createApiKey } = await import("../services/api-keys");
    const { createAgent } = await import("../services/agents");
    const { randomBytes } = await import("crypto");

    const agent = await createAgent({
      userId,
      handle: `std-key-test-${randomBytes(4).toString("hex")}`,
      displayName: "Standard Key Test Agent",
      isPublic: false,
    });

    const result = await createApiKey({
      ownerType: "agent",
      ownerId: agent.id,
      name: "standard-key",
      sandbox: false,
    });

    expect(result.rawKey).toMatch(/^aid_/);
    expect(result.apiKey.keyPrefix).toMatch(/^aid_/);
    expect(result.apiKey.keyPrefix.length).toBeLessThanOrEqual(12);
  });
});

describe("Programmatic Registration — Handle Validation", () => {
  it("1-2 character handles are detected as reserved tier", async () => {
    const { getHandleTier } = await import("../services/handle");
    const tier1 = getHandleTier("a");
    const tier2 = getHandleTier("ab");
    expect(tier1.tier).toBe("reserved_1_2");
    expect(tier2.tier).toBe("reserved_1_2");
  });

  it("3-4 character handles are detected as premium tier", async () => {
    const { getHandleTier } = await import("../services/handle");
    const tier3 = getHandleTier("abc");
    const tier4 = getHandleTier("abcd");
    expect(tier3.tier).toMatch(/premium/);
    expect(tier4.tier).toMatch(/premium/);
  });

  it("5+ character handles are detected as standard tier", async () => {
    const { getHandleTier } = await import("../services/handle");
    const tier5 = getHandleTier("abcde");
    expect(tier5.tier).toBe("standard_5plus");
  });
});
