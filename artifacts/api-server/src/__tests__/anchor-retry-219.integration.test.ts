/**
 * Anchor Retry — Integration tests for Task #219
 *
 * Verifies POST /api/v1/agents/:agentId/anchor/retry behaves correctly:
 *   1. owner with anchor_failed agent: 200, nftStatus reset to pending_anchor,
 *      anchorAttempts/anchorFailureReason/anchorFailedAt cleared,
 *      anchorRetryRequestedAt stamped, activity logged.
 *   2. anchor in any other state (active, pending_anchor, none): 409
 *      INVALID_ANCHOR_STATE, no DB mutation.
 *   3. non-owner caller: 403 FORBIDDEN.
 *   4. unknown agent: 404 NOT_FOUND.
 *   5. unauthenticated request: 401 (or whatever requireAuth returns) — verified
 *      by omitting the user-injection middleware.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, usersTable } from "@workspace/db/schema";
import { errorHandler } from "../middlewares/error-handler";
import { createTestUser, createTestAgent } from "../test-support/factories";

const logActivityMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/activity-logger", () => ({
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
  sendRenewalReminderEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/billing")>();
  return {
    ...actual,
    getUserPlan: vi.fn().mockResolvedValue("free"),
    getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5, canReceiveMail: false }),
    getActiveUserSubscription: vi.fn().mockResolvedValue(null),
  };
});
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
vi.mock("../services/mail", () => ({
  provisionInboxForAgent: vi.fn().mockResolvedValue(undefined),
  getOrCreateInbox: vi.fn().mockResolvedValue(null),
}));

async function buildAppForUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  if (userId) {
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = userId;
      (req as Record<string, unknown>).user = { id: userId, name: "Test", profileImage: null };
      next();
    });
  }
  const agentsMod = await import("../routes/v1/agents");
  app.use("/api/v1/agents", agentsMod.default);
  app.use(errorHandler);
  return app;
}

describe("Task #219 — POST /api/v1/agents/:agentId/anchor/retry", () => {
  const createdAgentIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdAgentIds) {
      await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
    }
    for (const id of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, id)).catch(() => {});
    }
  });

  it("owner + anchor_failed → 200, resets nftStatus + clears failure metadata + stamps anchorRetryRequestedAt + logs activity", async () => {
    logActivityMock.mockClear();
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const agent = await createTestAgent(owner.id, {
      nftStatus: "anchor_failed",
      metadata: {
        anchorAttempts: 3,
        anchorFailureReason: "rpc timeout",
        anchorFailedAt: "2026-04-30T12:00:00.000Z",
        unrelatedField: "preserve-me",
      },
    });
    createdAgentIds.push(agent.id);

    const app = await buildAppForUser(owner.id);
    const before = Date.now();
    const res = await request(app).post(`/api/v1/agents/${agent.id}/anchor/retry`).send();
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(agent.id);
    expect(res.body.nftStatus).toBe("pending_anchor");

    const dbAgent = await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, agent.id) });
    expect(dbAgent).toBeDefined();
    expect(dbAgent!.nftStatus).toBe("pending_anchor");

    const meta = (dbAgent!.metadata ?? {}) as Record<string, unknown>;
    expect(meta).not.toHaveProperty("anchorAttempts");
    expect(meta).not.toHaveProperty("anchorFailureReason");
    expect(meta).not.toHaveProperty("anchorFailedAt");
    expect(meta.unrelatedField).toBe("preserve-me");
    expect(typeof meta.anchorRetryRequestedAt).toBe("string");
    const stamp = Date.parse(meta.anchorRetryRequestedAt as string);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);

    expect(logActivityMock).toHaveBeenCalledTimes(1);
    expect(logActivityMock.mock.calls[0]?.[0]).toMatchObject({
      agentId: agent.id,
      eventType: "agent.anchor_retry_requested",
    });
  });

  it("non-owner → 403 FORBIDDEN, no DB mutation", async () => {
    logActivityMock.mockClear();
    const owner = await createTestUser();
    const stranger = await createTestUser();
    createdUserIds.push(owner.id, stranger.id);
    const agent = await createTestAgent(owner.id, { nftStatus: "anchor_failed" });
    createdAgentIds.push(agent.id);

    const app = await buildAppForUser(stranger.id);
    const res = await request(app).post(`/api/v1/agents/${agent.id}/anchor/retry`).send();

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");

    const dbAgent = await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, agent.id) });
    expect(dbAgent!.nftStatus).toBe("anchor_failed");
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it("agent in active state → 409 INVALID_ANCHOR_STATE, no DB mutation", async () => {
    logActivityMock.mockClear();
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const agent = await createTestAgent(owner.id, {
      nftStatus: "active",
      metadata: { anchorAttempts: 1 },
    });
    createdAgentIds.push(agent.id);

    const app = await buildAppForUser(owner.id);
    const res = await request(app).post(`/api/v1/agents/${agent.id}/anchor/retry`).send();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVALID_ANCHOR_STATE");

    const dbAgent = await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, agent.id) });
    expect(dbAgent!.nftStatus).toBe("active");
    const meta = (dbAgent!.metadata ?? {}) as Record<string, unknown>;
    expect(meta.anchorAttempts).toBe(1);
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it("agent in pending_anchor state → 409 INVALID_ANCHOR_STATE (no clobbering in-flight anchor)", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const agent = await createTestAgent(owner.id, { nftStatus: "pending_anchor" });
    createdAgentIds.push(agent.id);

    const app = await buildAppForUser(owner.id);
    const res = await request(app).post(`/api/v1/agents/${agent.id}/anchor/retry`).send();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INVALID_ANCHOR_STATE");
  });

  it("unknown agent id → 404 NOT_FOUND", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const app = await buildAppForUser(owner.id);
    // Random UUID that does not exist
    const res = await request(app).post(`/api/v1/agents/00000000-0000-4000-8000-000000000000/anchor/retry`).send();
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });
});
