/**
 * Resolver Correctness — Integration Tests
 *
 * Tests the resolve endpoint with real DB state.
 * Core state-based resolution (active→200, revoked→410, etc.) is covered by
 * resolve-states.integration.test.ts. This file adds:
 *   - UUID validation (non-UUID agentId → 400 INVALID_ID)
 *   - Well-formed UUID that doesn't exist → 404
 *   - Handle normalization (case-insensitive, .agentid suffix stripping)
 *   - Reserved handle rejection (pure service)
 *   - Sandbox isolation enforcement
 *   - Response shape: no userId/privateKey leakage (active agent)
 *   - DID format correctness
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
import { usersTable, agentsTable, agentKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createRevokedAgent,
} from "../test-support/factories";

async function buildResolveApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: resolveRouter } = await import("../routes/v1/resolve");
  app.use("/api/v1/resolve", resolveRouter);
  app.use(errorHandler);
  return app;
}

describe("Resolver — UUID validation on /resolve/id/:agentId", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await buildResolveApp();
  });

  it("returns 400 INVALID_ID for non-UUID agentId", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/id/not-a-valid-uuid")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_ID");
  });

  it("returns 400 for path with SQL injection chars", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/id/'; DROP TABLE agents; --")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect([400, 404]).toContain(res.status);
  });

  it("returns 404 for well-formed UUID that doesn't exist", async () => {
    const res = await request(app)
      .get("/api/v1/resolve/id/00000000-0000-0000-0000-000000000000")
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
  });
});

describe("Resolver — active public agent resolves successfully with correct shape", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;
  let agentHandle: string;

  beforeAll(async () => {
    app = await buildResolveApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      isPublic: true,
      handlePaid: true,
      status: "active",
      verificationStatus: "verified",
    });
    agentId = agent.id;
    agentHandle = agent.handle!;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("GET /resolve/:handle returns 200 for active public agent (machine User-Agent)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${agentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
  });

  it("resolved agent response does not contain userId or ownerUserId", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${agentHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.body).not.toHaveProperty("userId");
    expect(res.body).not.toHaveProperty("ownerUserId");
    expect(res.body).not.toHaveProperty("endpointSecret");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("handle normalization: uppercase handle resolves same agent as lowercase (200)", async () => {
    const upperHandle = agentHandle.toUpperCase();
    const res = await request(app)
      .get(`/api/v1/resolve/${upperHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
  });
});

describe("Resolver — revoked agent returns 410", () => {
  let app: express.Express;
  let userId: string;
  let revokedAgentId: string;
  let revokedHandle: string;

  beforeAll(async () => {
    app = await buildResolveApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createRevokedAgent(userId);
    revokedAgentId = agent.id;
    revokedHandle = agent.handle!;

    await db.update(agentsTable)
      .set({ isPublic: true, handlePaid: true })
      .where(eq(agentsTable.id, revokedAgentId));
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.id, revokedAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("GET /resolve/:handle returns 410 AGENT_REVOKED for revoked agent", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${revokedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("AGENT_REVOKED");
  });

  it("GET /resolve/id/:agentId returns 200 for revoked agent (ID endpoint shows all states)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/id/${revokedAgentId}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
  });

  it("revocation response includes revocation statement semantics (revokedAt, reason, did)", async () => {
    const reason = "policy_violation_test";
    const statement = "Agent was revoked for testing revocation statement.";
    await db.update(agentsTable)
      .set({ revocationReason: reason, revocationStatement: statement })
      .where(eq(agentsTable.id, revokedAgentId));

    const res = await request(app)
      .get(`/api/v1/resolve/${revokedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("AGENT_REVOKED");
    expect(res.body.revocation).toBeDefined();
    expect(res.body.revocation.revokedAt).toBeDefined();
    expect(res.body.revocation.reason).toBe(reason);
    expect(res.body.revocation.statement).toBe(statement);
    expect(res.body.revocation.did).toMatch(/^did:web:getagent\.id:agents:/);
  });
});

describe("Resolver — suspended agent is hidden (404) from public handle resolution", () => {
  let app: express.Express;
  let userId: string;
  let suspendedAgentId: string;
  let suspendedHandle: string;

  beforeAll(async () => {
    app = await buildResolveApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, {
      handle: `susp-${Date.now().toString(36)}`,
      status: "active",
      isPublic: true,
      handlePaid: true,
    });
    suspendedAgentId = agent.id;
    suspendedHandle = agent.handle!;

    await db.update(agentsTable)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(agentsTable.id, suspendedAgentId));
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.id, suspendedAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("GET /resolve/:handle returns 404 AGENT_NOT_FOUND for suspended agent (limited output)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${suspendedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });

  it("GET /resolve/id/:agentId returns 200 for suspended agent (UUID endpoint shows all states)", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/id/${suspendedAgentId}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.agent.status).toBe("suspended");
  });
});

describe("Resolver — handle utilities (pure unit)", () => {
  it("normalizeHandle lowercases the handle", async () => {
    const { normalizeHandle } = await import("../utils/handle");
    expect(normalizeHandle("MYHANDLE")).toBe("myhandle");
    expect(normalizeHandle("MyHandle")).toBe("myhandle");
    expect(normalizeHandle("myhandle")).toBe("myhandle");
  });

  it("normalizeHandle strips .agentid and .agent suffixes", async () => {
    const { normalizeHandle } = await import("../utils/handle");
    expect(normalizeHandle("mybot.agentid")).toBe("mybot");
    expect(normalizeHandle("mybot.agent")).toBe("mybot");
    expect(normalizeHandle("MYBOT.AGENTID")).toBe("mybot");
  });

  it("formatDID produces did:agentid: prefix", async () => {
    const { formatDID } = await import("../utils/handle");
    expect(formatDID("mybot")).toBe("did:agentid:mybot");
  });

  it("formatDID does not produce null or undefined in the DID", async () => {
    const { formatDID } = await import("../utils/handle");
    const did = formatDID("agent-uuid-123");
    expect(did).not.toContain("null");
    expect(did).not.toContain("undefined");
    expect(did).toBe("did:agentid:agent-uuid-123");
  });

  it("formatDomain produces <handle>.<basedomain> format", async () => {
    const { formatDomain } = await import("../utils/handle");
    const domain = formatDomain("mybot");
    expect(domain).toContain("mybot");
    expect(domain).toContain(".");
  });
});

describe("Resolver — reserved handle rejection (pure service)", () => {
  it("isHandleReserved returns true for 'admin'", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("admin")).toBe(true);
  });

  it("isHandleReserved returns true for 'system'", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("system")).toBe(true);
  });

  it("isHandleReserved returns true for 'root'", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("root")).toBe(true);
  });

  it("isHandleReserved returns true for 'api'", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("api")).toBe(true);
  });

  it("isHandleReserved returns false for a novel handle", async () => {
    const { isHandleReserved } = await import("../services/agents");
    expect(isHandleReserved("mymyuniqueagent123")).toBe(false);
  });
});

describe("Resolver — sandbox isolation enforcement (pure middleware)", () => {
  it("assertSandboxIsolation throws AppError for sandbox request to production agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const { AppError } = await import("../middlewares/error-handler");
    const req = { isSandbox: true } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "realbot", metadata: {} })).toThrow(AppError);
  });

  it("assertSandboxIsolation throws AppError for production request to sandbox agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const { AppError } = await import("../middlewares/error-handler");
    const req = { isSandbox: false } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "sandbox-bot", metadata: { isSandbox: true } })).toThrow(AppError);
  });

  it("assertSandboxIsolation does NOT throw for production request to production agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const req = { isSandbox: false } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "realbot", metadata: {} })).not.toThrow();
  });

  it("assertSandboxIsolation does NOT throw for sandbox request to sandbox agent", async () => {
    const { assertSandboxIsolation } = await import("../middlewares/sandbox");
    const req = { isSandbox: true } as unknown as import("express").Request;
    expect(() => assertSandboxIsolation(req, { handle: "sandbox-bot", metadata: { isSandbox: true } })).not.toThrow();
  });

  it("isAgentSandbox detects sandbox by handle prefix", async () => {
    const { isAgentSandbox } = await import("../middlewares/sandbox");
    expect(isAgentSandbox({ handle: "sandbox-mybot" })).toBe(true);
    expect(isAgentSandbox({ handle: "realbot" })).toBe(false);
  });

  it("isAgentSandbox detects sandbox by metadata flag", async () => {
    const { isAgentSandbox } = await import("../middlewares/sandbox");
    expect(isAgentSandbox({ handle: null, metadata: { isSandbox: true } })).toBe(true);
    expect(isAgentSandbox({ handle: null, metadata: { isSandbox: false } })).toBe(false);
  });
});

describe("Resolver — duplicate-handle race: DB unique constraint prevents two agents claiming same handle", () => {
  let userId: string;
  let firstAgentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    if (firstAgentId) {
      await db.delete(agentsTable).where(eq(agentsTable.id, firstAgentId)).catch(() => {});
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("first createAgent with a given handle succeeds", async () => {
    const { createAgent } = await import("../services/agents");
    const uniqueHandle = `race-test-${Date.now()}`;
    const agent = await createAgent({
      userId,
      handle: uniqueHandle,
      displayName: "Race Test Agent",
    });
    expect(agent.id).toBeDefined();
    expect(agent.handle).toBe(uniqueHandle);
    firstAgentId = agent.id;
  });

  it("second createAgent with the same handle throws HANDLE_CONFLICT or DB constraint error", async () => {
    const { createAgent } = await import("../services/agents");
    const sameHandle = (await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, firstAgentId),
      columns: { handle: true },
    }))!.handle!;

    await expect(
      createAgent({
        userId,
        handle: sameHandle,
        displayName: "Duplicate Race Agent",
      })
    ).rejects.toThrow();
  });

  it("concurrent duplicate-handle creation via Promise.all: DB unique constraint ensures exactly one succeeds", async () => {
    const { createAgent } = await import("../services/agents");
    const contestedHandle = `concurrent-race-${Date.now()}`;

    const user2 = await createTestUser();
    try {
      const results = await Promise.allSettled([
        createAgent({ userId, handle: contestedHandle, displayName: "Racer A" }),
        createAgent({ userId: user2.id, handle: contestedHandle, displayName: "Racer B" }),
        createAgent({ userId, handle: contestedHandle, displayName: "Racer C" }),
      ]);

      const fulfilled = results.filter(r => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string; handle: string | null }>[];
      const rejected = results.filter(r => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);
      expect(fulfilled[0].value.handle).toBe(contestedHandle);

      const winners = await db.select({ id: agentsTable.id }).from(agentsTable)
        .where(eq(agentsTable.handle, contestedHandle));
      expect(winners.length).toBe(1);

      for (const win of winners) {
        await db.delete(agentsTable).where(eq(agentsTable.id, win.id)).catch(() => {});
      }
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, user2.id)).catch(() => {});
    }
  });

  it("after race, only one agent exists with the contested handle", async () => {
    const handle = (await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, firstAgentId),
      columns: { handle: true },
    }))!.handle!;

    const { count } = await import("drizzle-orm");
    const result = await db
      .select({ c: count() })
      .from(agentsTable)
      .where(eq(agentsTable.handle, handle));

    expect(Number(result[0].c)).toBe(1);
  });
});

describe("Resolver — claimed vs unclaimed agent output contract", () => {
  let app: express.Express;
  let userId: string;
  let claimedUserId: string;
  let unclaimedAgentId: string;
  let claimedAgentId: string;
  let unclaimedHandle: string;
  let claimedHandle: string;

  beforeAll(async () => {
    app = await buildResolveApp();

    const user = await createTestUser();
    userId = user.id;

    const claimedOwner = await createTestUser();
    claimedUserId = claimedOwner.id;

    const unclaimedAgent = await createTestAgent(userId, {
      isPublic: true,
      handlePaid: true,
      status: "active",
      verificationStatus: "unverified",
    });
    unclaimedAgentId = unclaimedAgent.id;
    unclaimedHandle = unclaimedAgent.handle!;

    const claimedAgent = await createTestAgent(userId, {
      isPublic: true,
      handlePaid: true,
      status: "active",
      verificationStatus: "unverified",
    });
    claimedAgentId = claimedAgent.id;
    claimedHandle = claimedAgent.handle!;

    await db.update(agentsTable)
      .set({ ownerUserId: claimedUserId, claimedAt: new Date() })
      .where(eq(agentsTable.id, claimedAgentId));
  });

  afterAll(async () => {
    await db.delete(agentsTable).where(eq(agentsTable.id, unclaimedAgentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, claimedAgentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, claimedUserId)).catch(() => {});
  });

  it("unclaimed agent resolves 200 with status=active", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${unclaimedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.agent.status).toBe("active");
  });

  it("claimed agent resolves 200 with status=active", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${claimedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.agent.status).toBe("active");
  });

  it("neither claimed nor unclaimed resolver response exposes userId or ownerUserId", async () => {
    const [unclaimed, claimed] = await Promise.all([
      request(app).get(`/api/v1/resolve/${unclaimedHandle}`).set("User-Agent", "curl/7.88.1").set("Accept", "application/json"),
      request(app).get(`/api/v1/resolve/${claimedHandle}`).set("User-Agent", "curl/7.88.1").set("Accept", "application/json"),
    ]);

    expect(unclaimed.body.agent).not.toHaveProperty("userId");
    expect(unclaimed.body.agent).not.toHaveProperty("ownerUserId");
    expect(claimed.body.agent).not.toHaveProperty("userId");
    expect(claimed.body.agent).not.toHaveProperty("ownerUserId");
  });

  it("unclaimed agent response does not expose claimedAt field", async () => {
    const res = await request(app)
      .get(`/api/v1/resolve/${unclaimedHandle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.body.agent).not.toHaveProperty("claimedAt");
  });

  it("both agents return valid DID format in resolver response", async () => {
    const [unclaimed, claimed] = await Promise.all([
      request(app).get(`/api/v1/resolve/${unclaimedHandle}`).set("User-Agent", "curl/7.88.1").set("Accept", "application/json"),
      request(app).get(`/api/v1/resolve/${claimedHandle}`).set("User-Agent", "curl/7.88.1").set("Accept", "application/json"),
    ]);

    expect(unclaimed.body.agent.did).toMatch(/^did:web:getagent\.id:agents:/);
    expect(claimed.body.agent.did).toMatch(/^did:web:getagent\.id:agents:/);
    expect(unclaimed.body.agent.machineIdentity.agentId).toBe(unclaimedAgentId);
    expect(claimed.body.agent.machineIdentity.agentId).toBe(claimedAgentId);
  });
});
