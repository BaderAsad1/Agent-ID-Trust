/**
 * Outbound mail rate-limit — wiring tests (audit #09 / task #289).
 *
 * Verifies that:
 *   1. `assertOutboundRateLimit` blocks the (N+1)th send within the window
 *      and the (N+1)th call throws a typed `RateLimitError`.
 *   2. The error envelope produced by `errorHandler` is the standard
 *      { error, message, details, requestId } shape with HTTP 429 and a
 *      `Retry-After` header.
 *   3. `deliverOutbound` returns a transport-level failure (not a thrown error)
 *      when the limit is hit, so worker / NDR / notification call sites cannot
 *      hand the message to Resend.
 *   4. The block is recorded in `audit_events` (durable abuse-triage signal).
 *   5. The `agentid_mail_outbound_rate_limited_total{reason}` counter is bumped.
 *   6. Resetting the window restores the ability to send.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/env", () => ({
  env: () => ({
    OUTBOUND_MAIL_LIMIT_NONE: "0",
    OUTBOUND_MAIL_LIMIT_STARTER: "3",
    OUTBOUND_MAIL_LIMIT_PRO: "5",
    OUTBOUND_MAIL_LIMIT_ENTERPRISE: "-1",
    OUTBOUND_MAIL_LIMIT_USER: "10",
    OUTBOUND_MAIL_LIMIT_SYSTEM: "2",
    NODE_ENV: "test",
    MAIL_BASE_DOMAIN: "getagent.id",
    FROM_EMAIL: "test@getagent.id",
    RESEND_API_KEY: "re_test_key",
  }),
}));

let outboundCount = 0;
const auditInserts: Array<Record<string, unknown>> = [];

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
    query: {
      agentsTable: { findFirst: () => Promise.resolve(null) },
    },
  },
  agentMessagesTable: {
    agentId: "agent_id",
    direction: "direction",
    createdAt: "created_at",
    senderUserId: "sender_user_id",
  },
  auditEventsTable: {},
  agentsTable: {},
  outboundMessageDeliveriesTable: {},
}));

vi.mock("../lib/redis", () => ({
  isRedisConfigured: () => false,
  createBullMQConnection: () => ({}),
}));

describe("Outbound mail rate limit — assertOutboundRateLimit", () => {
  beforeEach(async () => {
    outboundCount = 0;
    auditInserts.length = 0;
    const mod = await import("../services/mail-rate-limit");
    mod._resetRateLimitMetrics();
    mod._resetSystemBuckets();
  });

  it("allows up to the per-agent limit and blocks the (N+1)th send", async () => {
    const { assertOutboundRateLimit, RateLimitError, getRateLimitMetrics } = await import("../services/mail-rate-limit");

    // Limit for "starter" = 3. Simulate 0..2 successful sends.
    for (outboundCount = 0; outboundCount < 3; outboundCount++) {
      const decision = await assertOutboundRateLimit({ agentId: "agent-1", plan: "starter" });
      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(3);
    }

    // 4th attempt: count is now 3 (= limit) → must throw.
    outboundCount = 3;
    let caught: unknown;
    try {
      await assertOutboundRateLimit({ agentId: "agent-1", plan: "starter" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RateLimitError);
    const err = caught as InstanceType<typeof RateLimitError>;
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(err.retryAfterSeconds).toBe(3600);
    expect(err.bucket).toBe("agent:agent-1");

    // Audit row written with structured payload.
    expect(auditInserts.length).toBe(1);
    const audit = auditInserts[0];
    expect(audit.eventType).toBe("mail.outbound.rate_limited");
    expect(audit.actorType).toBe("agent");
    expect(audit.actorId).toBe("agent-1");
    expect((audit.payload as { limit: number }).limit).toBe(3);

    // Metric counter incremented.
    const { rateLimited } = getRateLimitMetrics();
    expect(rateLimited.get("agent_quota")).toBe(1);
  });

  it("treats enterprise plan as unlimited", async () => {
    const { assertOutboundRateLimit } = await import("../services/mail-rate-limit");
    outboundCount = 99_999;
    const decision = await assertOutboundRateLimit({ agentId: "agent-2", plan: "enterprise" });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(-1);
  });

  it("blocks system bucket after configured limit and recovers when reset", async () => {
    const { assertOutboundRateLimit, RateLimitError, _resetSystemBuckets } = await import("../services/mail-rate-limit");

    await assertOutboundRateLimit({ systemKey: "ndr:foo@example.com" });
    await assertOutboundRateLimit({ systemKey: "ndr:foo@example.com" });
    await expect(
      assertOutboundRateLimit({ systemKey: "ndr:foo@example.com" }),
    ).rejects.toBeInstanceOf(RateLimitError);

    _resetSystemBuckets();
    await expect(
      assertOutboundRateLimit({ systemKey: "ndr:foo@example.com" }),
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe("RateLimitError → 429 mapping in errorHandler", () => {
  it("returns standard envelope with Retry-After header", async () => {
    const { errorHandler } = await import("../middlewares/error-handler");
    const { RateLimitError } = await import("../services/mail-rate-limit");

    const app = express();
    app.get("/boom", (_req, _res, next) => {
      next(new RateLimitError("Too many", 1234, 3, 4, "agent:abc"));
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("1234");
    expect(res.body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(res.body.message).toBe("Too many");
    expect(res.body.details).toMatchObject({
      limit: 3,
      current: 4,
      bucket: "agent:abc",
      retryAfterSeconds: 1234,
    });
  });
});

describe("deliverOutbound integration with the rate limiter", () => {
  beforeEach(async () => {
    outboundCount = 0;
    auditInserts.length = 0;
    const mod = await import("../services/mail-rate-limit");
    mod._resetRateLimitMetrics();
    mod._resetSystemBuckets();
  });

  it("returns success=false (without invoking Resend) when the agent is over quota", async () => {
    const { deliverOutbound } = await import("../services/mail-transport");

    // Force the agent to be at-quota.
    outboundCount = 5;

    const result = await deliverOutbound({
      messageId: "msg-1",
      from: "agent@getagent.id",
      to: "external@example.com",
      subject: "hi",
      body: "hello",
      bodyFormat: "text",
      agentId: "agent-blocked",
      metadata: { plan: "starter" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate limit/i);
    // Audit row was written → durable abuse-triage record exists.
    expect(auditInserts.some((r) => r.eventType === "mail.outbound.rate_limited")).toBe(true);
  });

  it("does not gate internal getagent.id ↔ getagent.id mail (uses no Resend quota)", async () => {
    const { deliverOutbound } = await import("../services/mail-transport");
    outboundCount = 999_999;
    const result = await deliverOutbound({
      messageId: "msg-internal",
      from: "alice@getagent.id",
      to: "bob@getagent.id",
      body: "hi",
      bodyFormat: "text",
      agentId: "agent-x",
      metadata: { plan: "starter" },
    });
    expect(result.success).toBe(true);
    expect(result.providerName).toBe("internal");
  });
});
