/**
 * Behavior tests for the automated HANDLE_RACE_CONFLICT recovery path.
 *
 * Two users complete Stripe checkout for the same handle within milliseconds. The
 * `agents.handle` unique constraint enforces first-write-wins; the losing user's
 * webhook fires after the winning user's row is committed, and the race-conflict
 * recovery must:
 *   1. Refund the losing payment_intent (via stripe.refunds.create with idempotency).
 *   2. Cancel the duplicate subscription (so no future renewal is billed).
 *   3. Persist refund metadata onto the originating webhook_events row.
 *   4. Send a clear notification email to the losing user.
 *
 * These tests mock Stripe + DB + email and assert the recovery function makes the
 * right outbound calls. They do not require a live database or Stripe account.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ── DB mock ───────────────────────────────────────────────────────────────

const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockFindUser = vi.fn();

vi.mock("@workspace/db", () => {
  const _update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: (...a: unknown[]) => mockUpdateWhere(...a),
    }),
  });
  return {
    db: {
      insert: vi.fn(),
      update: _update,
      select: vi.fn(),
      query: {
        usersTable: { findFirst: (...a: unknown[]) => mockFindUser(...a) },
        subscriptionsTable: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    },
  };
});

vi.mock("@workspace/db/schema", () => ({
  webhookEventsTable: {
    id: "id", provider: "provider", providerEventId: "provider_event_id",
    eventType: "event_type", payload: "payload", status: "status",
    processedAt: "processed_at", updatedAt: "updated_at",
  },
  usersTable: { id: "id", email: "email" },
  agentsTable: { id: "id", handle: "handle", userId: "user_id", ownerUserId: "owner_user_id" },
  subscriptionsTable: { id: "id" },
  auditEventsTable: { id: "id" },
  agentSubscriptionsTable: { id: "id" },
  nftAuditLogTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: "eq", a, b })),
  and: vi.fn((...a: unknown[]) => ({ op: "and", args: a })),
  or: vi.fn((...a: unknown[]) => ({ op: "or", args: a })),
  isNull: vi.fn((a: unknown) => ({ op: "isNull", a })),
  isNotNull: vi.fn((a: unknown) => ({ op: "isNotNull", a })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ op: "inArray", a, b })),
  desc: vi.fn((a: unknown) => ({ op: "desc", a })),
  ne: vi.fn((a: unknown, b: unknown) => ({ op: "ne", a, b })),
  gte: vi.fn((a: unknown, b: unknown) => ({ op: "gte", a, b })),
  lt: vi.fn((a: unknown, b: unknown) => ({ op: "lt", a, b })),
  sql: vi.fn(() => ({})),
}));

vi.mock("../middlewares/request-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Stripe mock ───────────────────────────────────────────────────────────

const mockRefundsCreate = vi.fn();
const mockSubscriptionsCancel = vi.fn();
const mockInvoicesRetrieve = vi.fn();
const mockInvoicesList = vi.fn();
const mockPaymentIntentsList = vi.fn();

vi.mock("../services/stripe-client", () => ({
  getStripe: vi.fn().mockReturnValue({
    refunds: { create: (...a: unknown[]) => mockRefundsCreate(...a) },
    subscriptions: { cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a) },
    invoices: {
      retrieve: (...a: unknown[]) => mockInvoicesRetrieve(...a),
      list: (...a: unknown[]) => mockInvoicesList(...a),
    },
    paymentIntents: { list: (...a: unknown[]) => mockPaymentIntentsList(...a) },
  }),
  isStripeAvailable: vi.fn().mockReturnValue(true),
}));

// ── Email mock ────────────────────────────────────────────────────────────

const mockSendRaceRefundEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/email", () => ({
  sendHandleRaceRefundEmail: (...a: unknown[]) => mockSendRaceRefundEmail(...a),
  sendVerificationCompleteEmail: vi.fn(),
  sendCredentialIssuedEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────

function makeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_loser_123",
    customer: "cus_loser",
    latest_invoice: "in_loser_001",
    metadata: { type: "handle_registration", handle: "alice", userId: "user-loser" },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("recoverHandleRaceConflict", () => {
  beforeEach(() => {
    mockRefundsCreate.mockReset();
    mockSubscriptionsCancel.mockReset();
    mockInvoicesRetrieve.mockReset();
    mockInvoicesList.mockReset();
    mockPaymentIntentsList.mockReset();
    mockUpdateWhere.mockReset().mockResolvedValue(undefined);
    mockFindUser.mockReset();
    mockSendRaceRefundEmail.mockReset().mockResolvedValue(undefined);
  });

  it("issues a refund, cancels the subscription, audits the event, and emails the user", async () => {
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_loser_001",
      payment_intent: "pi_loser_001",
      amount_paid: 500,
    });
    mockRefundsCreate.mockResolvedValue({ id: "re_test_123", amount: 500 });
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_loser_123", status: "canceled" });
    mockFindUser.mockResolvedValue({ email: "loser@example.com" });

    const { recoverHandleRaceConflict } = await import("../services/billing");
    const result = await recoverHandleRaceConflict({
      subscription: makeSubscription(),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "alice",
      webhookEventId: "evt_test_001",
    });

    // Refund: full amount, marked duplicate, with idempotency key tied to subscription id.
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    const [refundParams, refundOpts] = mockRefundsCreate.mock.calls[0];
    expect(refundParams).toMatchObject({
      payment_intent: "pi_loser_001",
      reason: "duplicate",
    });
    expect(refundParams.metadata).toMatchObject({
      reason_code: "HANDLE_RACE_CONFLICT",
      handle: "alice",
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      subscriptionId: "sub_loser_123",
    });
    expect(refundOpts).toEqual({ idempotencyKey: "race-refund-sub_loser_123" });

    // Subscription: cancelled with prorate:false so no surprise credit appears later.
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_loser_123", { prorate: false });

    // Email: sent to the losing user with the refund amount in dollars.
    expect(mockSendRaceRefundEmail).toHaveBeenCalledWith(
      "loser@example.com",
      "alice",
      500,
      "race-sub_loser_123",
    );

    // webhook_events row: updated to embed the collision metadata.
    expect(mockUpdateWhere).toHaveBeenCalled();

    expect(result).toMatchObject({
      refundId: "re_test_123",
      refundAmountCents: 500,
      cancelled: true,
      emailSent: true,
    });
  });

  it("falls back to invoices.list when latest_invoice is missing from the subscription payload", async () => {
    mockInvoicesList.mockResolvedValue({ data: [{ id: "in_fallback_001" }] });
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_fallback_001",
      payment_intent: "pi_fallback_001",
      amount_paid: 2900,
    });
    mockRefundsCreate.mockResolvedValue({ id: "re_fallback", amount: 2900 });
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_loser_123" });
    mockFindUser.mockResolvedValue({ email: "loser@example.com" });

    const { recoverHandleRaceConflict } = await import("../services/billing");
    const result = await recoverHandleRaceConflict({
      subscription: makeSubscription({ latest_invoice: null as unknown as string }),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "abcd",
      webhookEventId: "evt_test_002",
    });

    expect(mockInvoicesList).toHaveBeenCalledWith({ subscription: "sub_loser_123", limit: 1 });
    expect(result.refundId).toBe("re_fallback");
    expect(result.refundAmountCents).toBe(2900);
  });

  it("does not throw when refund creation fails — logs error and still cancels the subscription", async () => {
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_loser_001",
      payment_intent: "pi_loser_001",
      amount_paid: 500,
    });
    mockRefundsCreate.mockRejectedValue(new Error("Stripe transient failure"));
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_loser_123" });
    mockFindUser.mockResolvedValue({ email: "loser@example.com" });

    const { recoverHandleRaceConflict } = await import("../services/billing");
    const result = await recoverHandleRaceConflict({
      subscription: makeSubscription(),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "alice",
      webhookEventId: "evt_test_003",
    });

    expect(result.refundId).toBeNull();
    expect(result.cancelled).toBe(true); // cancellation still attempted independently
    expect(mockSubscriptionsCancel).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the losing user has no email on file — refund still succeeds", async () => {
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_loser_001",
      payment_intent: "pi_loser_001",
      amount_paid: 500,
    });
    mockRefundsCreate.mockResolvedValue({ id: "re_test_no_email", amount: 500 });
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_loser_123" });
    mockFindUser.mockResolvedValue({ email: null });

    const { recoverHandleRaceConflict } = await import("../services/billing");
    const result = await recoverHandleRaceConflict({
      subscription: makeSubscription(),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "alice",
      webhookEventId: "evt_test_004",
    });

    expect(result.refundId).toBe("re_test_no_email");
    expect(result.emailSent).toBe(false);
    expect(mockSendRaceRefundEmail).not.toHaveBeenCalled();
  });

  it("uses a stable idempotency key per subscription so duplicate webhook deliveries do not double-refund", async () => {
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_loser_001",
      payment_intent: "pi_loser_001",
      amount_paid: 500,
    });
    mockRefundsCreate.mockResolvedValue({ id: "re_idem", amount: 500 });
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_loser_123" });
    mockFindUser.mockResolvedValue({ email: "loser@example.com" });

    const { recoverHandleRaceConflict } = await import("../services/billing");

    await recoverHandleRaceConflict({
      subscription: makeSubscription(),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "alice",
      webhookEventId: "evt_test_005a",
    });
    await recoverHandleRaceConflict({
      subscription: makeSubscription(),
      losingUserId: "user-loser",
      winningUserId: "user-winner",
      handle: "alice",
      webhookEventId: "evt_test_005b",
    });

    // Both calls used the same idempotency key — Stripe will dedupe server-side.
    const keys = mockRefundsCreate.mock.calls.map(c => c[1]?.idempotencyKey);
    expect(keys).toEqual([
      "race-refund-sub_loser_123",
      "race-refund-sub_loser_123",
    ]);
  });
});
