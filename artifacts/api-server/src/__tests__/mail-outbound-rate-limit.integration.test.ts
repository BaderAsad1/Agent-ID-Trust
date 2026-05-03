/**
 * Outbound mail rate-limit — route integration tests (audit #09 / task #289).
 *
 * Drives the real `routes/v1/mail.ts` POST /agents/:id/messages handler with
 * supertest to verify the end-to-end contract:
 *
 *   1. The first N sends succeed (HTTP 201) when the per-agent budget is N.
 *   2. The (N+1)th send is rejected with HTTP 429, a `Retry-After` header,
 *      and the standard `{error, message, details, requestId}` envelope.
 *   3. Once the simulated send count drops back under the limit (window
 *      reset), sends succeed again.
 *
 * This is the integration-level coverage explicitly required by the audit
 * acceptance criteria — the unit test in `mail-rate-limit.unit.test.ts`
 * verifies the limiter primitives in isolation; this file proves they are
 * wired into the actual HTTP route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { errorHandler } from "../middlewares/error-handler";

let outboundCount = 0;
const auditInserts: Array<Record<string, unknown>> = [];

vi.mock("../lib/env", () => ({
  env: () => ({
    OUTBOUND_MAIL_LIMIT_NONE: "0",
    OUTBOUND_MAIL_LIMIT_STARTER: "2",
    OUTBOUND_MAIL_LIMIT_PRO: "5",
    OUTBOUND_MAIL_LIMIT_ENTERPRISE: "-1",
    OUTBOUND_MAIL_LIMIT_USER: "100",
    OUTBOUND_MAIL_LIMIT_SYSTEM: "10",
    NODE_ENV: "test",
    MAIL_BASE_DOMAIN: "getagent.id",
    FROM_EMAIL: "test@getagent.id",
    RESEND_API_KEY: "re_test_key",
  }),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count: outboundCount }]),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        auditInserts.push(row);
        return Promise.resolve();
      },
    }),
  },
  agentMessagesTable: {
    id: "id",
    agentId: "agent_id",
    direction: "direction",
    createdAt: "created_at",
    senderUserId: "sender_user_id",
  },
  auditEventsTable: {},
  agentsTable: {},
  inboxesTable: {},
  messagesTable: {},
  messageAttachmentsTable: {},
  subscriptionsTable: {},
  usersTable: {},
}));

const mockSendMessage = vi.fn();
const mockVerifyAgentOwnership = vi.fn();
const mockGetThreadById = vi.fn();
const mockGetInboxByAgent = vi.fn();
const mockReplyToThread = vi.fn();

vi.mock("../services/mail", () => ({
  verifyAgentOwnership: mockVerifyAgentOwnership,
  sendMessage: mockSendMessage,
  getThreadById: mockGetThreadById,
  getInboxByAgent: mockGetInboxByAgent,
  getOrCreateInbox: vi.fn(),
  getInboxStats: vi.fn(),
  replyToThread: mockReplyToThread,
}));

const mockGetAgentById = vi.fn();
vi.mock("../services/agents", () => ({
  getAgentById: mockGetAgentById,
}));

const mockGetAgentPlan = vi.fn();
const mockGetPlanLimits = vi.fn();
vi.mock("../services/billing", () => ({
  getAgentPlan: mockGetAgentPlan,
  getPlanLimits: mockGetPlanLimits,
}));

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middlewares/replit-auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId?: string }).userId = "user-test-1";
    next();
  },
}));

vi.mock("../middlewares/agent-auth", () => ({
  requireAgentAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../middlewares/sandbox", () => ({
  // Called directly in mail.ts as `assertSandboxIsolation(req, agent)` — NOT
  // as Express middleware. Make it a no-op function so the route handler
  // continues past it.
  assertSandboxIsolation: () => {},
  isAgentSandbox: () => false,
}));

async function buildMailApp() {
  const app = express();
  app.use(express.json());
  // Stamp a stable request id so the error envelope has a deterministic field.
  app.use((req, _res, next) => {
    (req as Request & { requestId?: string }).requestId = "req-test";
    next();
  });
  const { default: mailRouter } = await import("../routes/v1/mail");
  app.use("/", mailRouter);
  app.use(errorHandler);
  return app;
}

describe("POST /agents/:id/messages — outbound rate limit (integration)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    outboundCount = 0;
    auditInserts.length = 0;

    mockVerifyAgentOwnership.mockResolvedValue(true);
    mockGetAgentById.mockResolvedValue({ id: "agent-rl", handle: "rl", userId: "user-test-1" });
    mockGetAgentPlan.mockResolvedValue("starter");
    mockGetPlanLimits.mockReturnValue({ canReceiveMail: true, canSendMail: true });
    mockSendMessage.mockImplementation(async () => {
      outboundCount += 1;
      return { id: `msg-${outboundCount}`, agentId: "agent-rl", direction: "outbound" };
    });

    const rl = await import("../services/mail-rate-limit");
    rl._resetRateLimitMetrics();
    rl._resetSystemBuckets();

    app = await buildMailApp();
  });

  function send() {
    return request(app)
      .post("/agents/agent-rl/messages")
      .send({
        direction: "outbound",
        senderType: "agent",
        recipientAddress: "external@example.com",
        subject: "hi",
        body: "hello",
      });
  }

  it("admits the first N sends and returns 429 + Retry-After on the (N+1)th", async () => {
    // starter limit = 2 → 2 successful sends, 3rd should be rejected.
    const r1 = await send();
    expect(r1.status).toBe(201);

    const r2 = await send();
    expect(r2.status).toBe(201);

    const r3 = await send();
    expect(r3.status).toBe(429);
    expect(r3.headers["retry-after"]).toBe("3600");
    expect(r3.body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(r3.body.message).toMatch(/rate limit/i);
    expect(r3.body.details).toMatchObject({
      limit: 2,
      bucket: "agent:agent-rl",
      retryAfterSeconds: 3600,
    });

    // sendMessage was NOT called for the rejected request.
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // Audit row was written for the block.
    const blockedAudits = auditInserts.filter((r) => r.eventType === "mail.outbound.rate_limited");
    expect(blockedAudits.length).toBe(1);

    // /metrics counter incremented.
    const { getRateLimitMetrics } = await import("../services/mail-rate-limit");
    expect(getRateLimitMetrics().rateLimited.get("agent_quota")).toBe(1);
  });

  it("emits X-RateLimit-* headers on successful sends so clients can back off proactively", async () => {
    // First send — bucket starts at 0/2, so after admit Remaining = 2 - 0 - 1 = 1.
    const r1 = await send();
    expect(r1.status).toBe(201);
    expect(r1.headers["x-ratelimit-limit"]).toBe("2");
    expect(r1.headers["x-ratelimit-remaining"]).toBe("1");
    const reset1 = Number(r1.headers["x-ratelimit-reset"]);
    expect(Number.isFinite(reset1)).toBe(true);
    // Reset is now + 3600s (the 1h window). Allow generous slack for slow CI.
    const nowSec = Math.ceil(Date.now() / 1000);
    expect(reset1).toBeGreaterThanOrEqual(nowSec + 3500);
    expect(reset1).toBeLessThanOrEqual(nowSec + 3700);

    // Second (last admitted) send — Remaining = 2 - 1 - 1 = 0.
    const r2 = await send();
    expect(r2.status).toBe(201);
    expect(r2.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("emits X-RateLimit-* headers on successful thread replies", async () => {
    mockReplyToThread.mockImplementation(async () => {
      outboundCount += 1;
      return { id: `reply-${outboundCount}`, agentId: "agent-rl", direction: "outbound" };
    });

    const r = await request(app)
      .post("/agents/agent-rl/threads/00000000-0000-0000-0000-000000000001/reply")
      .send({ body: "thanks!" });

    expect(r.status).toBe(201);
    expect(r.headers["x-ratelimit-limit"]).toBe("2");
    expect(r.headers["x-ratelimit-remaining"]).toBe("1");
    expect(Number.isFinite(Number(r.headers["x-ratelimit-reset"]))).toBe(true);
  });

  it("allows sends again once the simulated window resets (count drops below limit)", async () => {
    // Saturate the bucket.
    await send();
    await send();
    const blocked = await send();
    expect(blocked.status).toBe(429);

    // Simulate the rolling window expiring — the DB count drops back to 0.
    outboundCount = 0;
    const recovered = await send();
    expect(recovered.status).toBe(201);
  });
});
