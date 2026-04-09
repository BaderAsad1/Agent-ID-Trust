/**
 * Behavior tests for the included-handle claim durability guarantee.
 *
 * Mocks the DB layer (following the mpp.integration.test.ts pattern) so that
 * actual service functions are exercised with controlled DB responses.
 * Tests verify fail-closed pending-write semantics, plan gating, registrar
 * checks, and state machine ordering — without requiring a live database.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";

// ── DB mock ───────────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockUpdateWhere = vi.fn().mockReturnValue({ catch: vi.fn() });

// Sequence-based select mock: each call to db.select().from().where().limit()
// returns the next response in the sequence.
let _selectResponses: unknown[][] = [];
let _selectIdx = 0;

function setSelectResponses(responses: unknown[][]) {
  _selectResponses = responses;
  _selectIdx = 0;
}

const selectLimitFn = vi.fn().mockImplementation(() => {
  const val = _selectResponses[_selectIdx] ?? [];
  _selectIdx++;
  return Promise.resolve(val);
});

// Re-attach the chain on each test via beforeEach so clearAllMocks doesn't break it.
function resetDbMock() {
  _selectResponses = [];
  _selectIdx = 0;
  const limitFn = (..._a: unknown[]) => selectLimitFn();
  const chain = {
    limit: limitFn,
    // Some queries resolve at the .where() level (no .limit()) — support both
    then: (resolve: (v: unknown[]) => void) => {
      const val = _selectResponses[_selectIdx] ?? [];
      _selectIdx++;
      return Promise.resolve(val).then(resolve);
    },
  };
  const whereChain = {
    where: vi.fn().mockReturnValue(chain),
    // No-where queries also need to resolve
    then: (resolve: (v: unknown[]) => void) => {
      const val = _selectResponses[_selectIdx] ?? [];
      _selectIdx++;
      return Promise.resolve(val).then(resolve);
    },
  };
  const fromChain = { from: vi.fn().mockReturnValue(whereChain) };
  db.select.mockReturnValue(fromChain);
}

// Forward-declare so resetDbMock can reference it before mock is set up.
// select is typed as MockInstance so .mockReturnValue() is available without casting.
let db: {
  select: MockInstance;
  insert: MockInstance;
  update: MockInstance;
  query: Record<string, Record<string, MockInstance>>;
};

vi.mock("@workspace/db", () => {
  const _insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: (...a: unknown[]) => mockInsertReturning(...a),
    }),
  });
  const _update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: (...a: unknown[]) => mockUpdateWhere(...a),
    }),
  });
  const _select = vi.fn();
  const _db = {
    insert: _insert,
    update: _update,
    select: _select,
    query: {
      usersTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          stripeCustomerId: null,
          email: "test@example.com",
          displayName: "Test User",
        }),
      },
      subscriptionsTable: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  };
  db = _db;
  return { db: _db };
});

vi.mock("@workspace/db/schema", () => ({
  auditEventsTable: {
    id: "id", actorType: "actor_type", actorId: "actor_id",
    eventType: "event_type", payload: "payload", targetType: "target_type", targetId: "target_id",
  },
  subscriptionsTable: {
    id: "id", userId: "user_id", status: "status", plan: "plan",
    includedHandleClaimed: "included_handle_claimed",
    includedHandleClaimedHandle: "included_handle_claimed_handle",
  },
  usersTable: {
    id: "id", email: "email", displayName: "display_name",
    stripeCustomerId: "stripe_customer_id", plan: "plan",
  },
  agentsTable: {
    id: "id", handle: "handle", userId: "user_id", status: "status",
    handleStatus: "handle_status", nftStatus: "nft_status",
    paidThrough: "paid_through", updatedAt: "updated_at",
  },
  agentKeysTable: { id: "id", agentId: "agent_id" },
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
  sql: vi.fn(() => ({})),
  lt: vi.fn((a: unknown, b: unknown) => ({ op: "lt", a, b })),
}));

vi.mock("../middlewares/request-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../services/stripe-client", () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test" }) },
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }) },
    },
  }),
  isStripeAvailable: vi.fn().mockReturnValue(true),
}));

const mockCheckHandleAvailability = vi.fn();
const mockGetHandleTier = vi.fn().mockReturnValue({ tier: "premium_4", characterLength: 4 });
const mockAssignHandleToAgent = vi.fn();

vi.mock("../services/handle", () => ({
  checkHandleAvailability: (...a: unknown[]) => mockCheckHandleAvailability(...a),
  getHandleTier: (...a: unknown[]) => mockGetHandleTier(...a),
  assignHandleToAgent: (...a: unknown[]) => mockAssignHandleToAgent(...a),
}));

// ── Pure logic tests ──────────────────────────────────────────────────────

describe("isEligibleForIncludedHandle — plan eligibility logic", () => {
  it("returns true for starter plan", async () => {
    const { isEligibleForIncludedHandle } = await import("../services/billing");
    expect(isEligibleForIncludedHandle("starter")).toBe(true);
  });

  it("returns true for pro plan", async () => {
    const { isEligibleForIncludedHandle } = await import("../services/billing");
    expect(isEligibleForIncludedHandle("pro")).toBe(true);
  });

  it("returns false for enterprise plan (enterprise uses custom/sales-led handle entitlement, not automatic)", async () => {
    const { isEligibleForIncludedHandle, hasCustomHandleEntitlement, isAllowedHandleAccess } = await import("../services/billing");
    expect(isEligibleForIncludedHandle("enterprise")).toBe(false);
    expect(hasCustomHandleEntitlement("enterprise")).toBe(true);
    expect(isAllowedHandleAccess("enterprise")).toBe(true);
  });

  it("returns false for free plan", async () => {
    const { isEligibleForIncludedHandle } = await import("../services/billing");
    expect(isEligibleForIncludedHandle("free")).toBe(false);
  });

  it("returns false for none", async () => {
    const { isEligibleForIncludedHandle } = await import("../services/billing");
    expect(isEligibleForIncludedHandle("none")).toBe(false);
  });
});

describe("getHandlePriceCents — handle tier pricing", () => {
  it("returns 500 (¢) for standard handles (5+ chars) — $5/yr standalone retail price", async () => {
    const { getHandlePriceCents } = await import("../services/billing");
    expect(getHandlePriceCents("alice")).toBe(500);
    expect(getHandlePriceCents("longhandle")).toBe(500);
  });

  it("returns positive amount for 3-char premium handles", async () => {
    const { getHandlePriceCents } = await import("../services/billing");
    expect(getHandlePriceCents("abc")).toBeGreaterThan(0);
  });

  it("returns positive amount for 4-char premium handles", async () => {
    const { getHandlePriceCents } = await import("../services/billing");
    expect(getHandlePriceCents("abcd")).toBeGreaterThan(0);
  });
});

// ── DB-backed behavior tests ──────────────────────────────────────────────

describe("createHandleCheckoutSession — fail-closed durability guarantees", () => {
  beforeEach(() => {
    // Reset mocks that are called per-test (not part of static chain)
    mockInsertReturning.mockResolvedValue([{ id: "audit-pending-id-1" }]);
    mockCheckHandleAvailability.mockResolvedValue({ available: true });
    mockAssignHandleToAgent.mockResolvedValue(undefined);
    mockUpdateWhere.mockReturnValue({ catch: vi.fn() });
    // Rebuild db.select chain so clearAllMocks doesn't break static chain references
    resetDbMock();
  });

  it("free plan (no subscription): routes to Stripe checkout at $5/yr retail price", async () => {
    // getUserPlan → no subscription → "none"; checkUserIncludedHandleEligibility → same → not eligible
    // Both calls consume one select response each; free plan users proceed to paid Stripe checkout
    setSelectResponses([[], []]);
    const { createHandleCheckoutSession } = await import("../services/billing");
    const result = await createHandleCheckoutSession("u1", "alice", "http://ok", "http://cancel");
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("https://checkout.stripe.com/test");
    expect(result.priceCents).toBe(500); // $5/yr retail
  });

  it("free-plan subscription: routes to Stripe checkout at $5/yr retail price", async () => {
    // getUserPlan → free plan → normalized to "none"; not eligible for included handle
    const freeSub = [{ plan: "free", status: "active" }];
    setSelectResponses([freeSub, freeSub]);
    const { createHandleCheckoutSession } = await import("../services/billing");
    const result = await createHandleCheckoutSession("u1", "alice", "http://ok", "http://cancel");
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("https://checkout.stripe.com/test");
    expect(result.priceCents).toBe(500); // $5/yr retail
  });

  it("FAIL-CLOSED: returns AUDIT_WRITE_FAILED when pending audit insert returns no ID", async () => {
    // Sequence (each entry is one db.select...query result):
    //   1. getUserPlan → getActiveUserSubscription → active starter subscription
    //   2. checkUserIncludedHandleEligibility → getActiveUserSubscription → same starter sub
    //   3. checkUserIncludedHandleEligibility → claimedRows (limit 1) → [] (not already claimed)
    //   4. checkUserIncludedHandleEligibility → existingAgents (no limit) → [] (no legacy claim)
    const starterSub = [{ plan: "starter", status: "active" }];
    setSelectResponses([starterSub, starterSub, [], []]);
    mockInsertReturning.mockResolvedValue([]); // Audit insert returns no ID — triggers fail-closed
    const { createHandleCheckoutSession } = await import("../services/billing");
    const result = await createHandleCheckoutSession("u1", "alice", "http://ok", "http://cancel", "agent-1");
    expect(result.error).toBe("AUDIT_WRITE_FAILED");
    expect(result.url).toBeNull();
  });

  it("FAIL-CLOSED: returns AUDIT_WRITE_FAILED when pending audit insert throws (DB unavailable)", async () => {
    const starterSub = [{ plan: "starter", status: "active" }];
    setSelectResponses([starterSub, starterSub, [], []]);
    mockInsertReturning.mockRejectedValue(new Error("DB connection refused"));
    const { createHandleCheckoutSession } = await import("../services/billing");
    const result = await createHandleCheckoutSession("u1", "alice", "http://ok", "http://cancel", "agent-1");
    expect(result.error).toBe("AUDIT_WRITE_FAILED");
    expect(result.url).toBeNull();
  });

  it("REGISTRAR gate: returns HANDLE_NOT_AVAILABLE for included path when registrar rejects handle", async () => {
    const starterSub = [{ plan: "starter", status: "active" }];
    setSelectResponses([starterSub, starterSub, [], []]);
    mockInsertReturning.mockResolvedValue([{ id: "audit-id" }]);
    mockCheckHandleAvailability.mockResolvedValueOnce({ available: false, reason: "HANDLE_RESERVED" });
    const { createHandleCheckoutSession } = await import("../services/billing");
    const result = await createHandleCheckoutSession("u1", "alice", "http://ok", "http://cancel", "agent-1");
    expect(result.error).toBe("HANDLE_NOT_AVAILABLE");
    expect(result.url).toBeNull();
  });
});
