/**
 * Behavioral tests for Task #198 — Ownership Mismatch in Billing Settlement
 *
 * Exercises handleCheckoutCompleted() with mocked DB calls to verify:
 *   T198-A  transferred agent: current owner (ownerUserId) settles handle_mint_request correctly
 *   T198-B  former creator: cannot satisfy handle_mint_request settlement after transfer
 *   T198-C  transferred agent: current owner (ownerUserId) settles handle_registration correctly
 *   T198-D  former creator: cannot satisfy handle_registration settlement after transfer
 *   T198-E  handle_registration fallback-by-handle path: current owner settles correctly
 *   T198-F  former creator: cannot satisfy handle_registration fallback-by-handle after transfer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ─────────────────────────────────────────────────────

// Tracks calls to db.update().set().where()
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
// Tracks calls to db.insert().values()
const mockInsertValues = vi.fn().mockResolvedValue(undefined);
// Controls db.query.agentsTable.findFirst return value
const mockFindFirst = vi.fn();

vi.mock("@workspace/db", () => {
  return {
    db: {
      query: {
        agentsTable: {
          findFirst: (...a: unknown[]) => mockFindFirst(...a),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: (...a: unknown[]) => mockUpdateWhere(...a),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: (...a: unknown[]) => mockInsertValues(...a),
      }),
    },
  };
});

vi.mock("@workspace/db/schema", () => ({
  agentsTable: {
    id: "id",
    userId: "user_id",
    ownerUserId: "owner_user_id",
    handle: "handle",
    nftStatus: "nft_status",
    metadata: "metadata",
    updatedAt: "updated_at",
    handleTier: "handle_tier",
    handlePaid: "handle_paid",
    handleExpiresAt: "handle_expires_at",
    handleRegisteredAt: "handle_registered_at",
    handleStripeSubscriptionId: "handle_stripe_subscription_id",
    nftCustodian: "nft_custodian",
    erc8004AgentId: "erc8004_agent_id",
    erc8004Chain: "erc8004_chain",
    erc8004Registry: "erc8004_registry",
    chainRegistrations: "chain_registrations",
  },
  nftAuditLogTable: { id: "id", agentId: "agent_id" },
  webhookEventsTable: { id: "id", eventId: "event_id" },
  auditEventsTable: { id: "id" },
  usersTable: { id: "id" },
  subscriptionsTable: { id: "id" },
  agentSubscriptionsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: "eq", a, b })),
  and: vi.fn((...a: unknown[]) => ({ op: "and", args: a })),
  or: vi.fn((...a: unknown[]) => ({ op: "or", args: a })),
  isNull: vi.fn((a: unknown) => ({ op: "isNull", a })),
  isNotNull: vi.fn((a: unknown) => ({ op: "isNotNull", a })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ op: "inArray", a, b })),
  desc: vi.fn((a: unknown) => ({ op: "desc", a })),
  sql: vi.fn(() => ({})),
  lt: vi.fn((a: unknown, b: unknown) => ({ op: "lt", a, b })),
  gte: vi.fn((a: unknown, b: unknown) => ({ op: "gte", a, b })),
  ne: vi.fn((a: unknown, b: unknown) => ({ op: "ne", a, b })),
  ilike: vi.fn((a: unknown, b: unknown) => ({ op: "ilike", a, b })),
}));

vi.mock("../middlewares/request-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../services/stripe-client", () => ({
  getStripe: vi.fn(),
  isStripeAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/env", () => ({
  env: { NODE_ENV: "test", PORT: "3000" },
}));

// Mock handle service — needed so handle_registration validation/limit checks pass
vi.mock("../services/handle", () => ({
  getHandleTier: vi.fn().mockReturnValue({ tier: "standard" }),
  isHandleReserved: vi.fn().mockReturnValue(false),
  checkHandleRegistrationLimits: vi.fn().mockResolvedValue(null),
  markHandlePaymentComplete: vi.fn().mockResolvedValue(undefined),
}));

// Mock validate handle in agents service
vi.mock("../services/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/agents")>();
  return {
    ...actual,
    validateHandle: vi.fn().mockReturnValue(null),
  };
});

// Mock claim-ticket — handle_mint_request uses dynamic import
vi.mock("../services/claim-ticket", () => ({
  issueClaimTicket: vi.fn().mockReturnValue("claim-ticket-abc"),
}));

// Mock chains/base — handle_registration's NFT-eligible path uses dynamic import
vi.mock("../services/chains/base", () => ({
  registerOnChain: vi.fn().mockResolvedValue(null),
  reserveHandlesOnChain: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────

function makeSession(
  type: "handle_mint_request" | "handle_registration",
  opts: {
    userId: string;
    agentId?: string;
    handle?: string;
    subscriptionId?: string;
  },
): import("stripe").Stripe.Checkout.Session {
  return {
    id: "cs_test_session",
    metadata: {
      type,
      userId: opts.userId,
      agentId: opts.agentId ?? "agent-uuid-1",
      handle: opts.handle ?? "myhandle",
    },
    subscription: opts.subscriptionId ?? null,
  } as unknown as import("stripe").Stripe.Checkout.Session;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("T198-A — handle_mint_request: transferred agent current owner settles correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("findFirst is called once; when it returns the agent, nftStatus is updated to pending_anchor", async () => {
    // Arrange: current owner is bob (ownerUserId=bob), original creator is alice (userId=alice)
    // The session carries userId=bob (the paying owner)
    const agentRow = { id: "agent-uuid-1", handle: "myhandle", nftStatus: "none" };
    mockFindFirst.mockResolvedValueOnce(agentRow);

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = makeSession("handle_mint_request", { userId: "bob", agentId: "agent-uuid-1", handle: "myhandle" });

    await handleCheckoutCompleted(session);

    // Assert: db.update was called (settlement happened)
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    // The findFirst was called exactly once (no extra creator lookup)
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("findFirst receives a where clause that is the result of agentOwnerWhere (not a raw userId eq)", async () => {
    const agentRow = { id: "agent-uuid-1", handle: "myhandle", nftStatus: "none" };
    mockFindFirst.mockResolvedValueOnce(agentRow);

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = makeSession("handle_mint_request", { userId: "bob", agentId: "agent-uuid-1" });

    await handleCheckoutCompleted(session);

    const callArgs = mockFindFirst.mock.calls[0][0] as { where: unknown };
    // agentOwnerWhere builds an `and(eq(id,...), or(...))` — the top-level op must be "and"
    const where = callArgs.where as { op: string; args: unknown[] };
    expect(where.op).toBe("and");
    // The second argument to and() should be an `or(...)` from agentOwnerFilter, not a raw eq
    const secondArg = where.args[1] as { op: string };
    expect(secondArg.op).toBe("or");
  });
});

describe("T198-B — handle_mint_request: former creator cannot satisfy settlement after transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("when agent has ownerUserId=bob but session userId=alice (former creator), findFirst returns null and settlement is skipped", async () => {
    // Simulate DB returning null when queried with alice's userId (because ownerUserId=bob now)
    mockFindFirst.mockResolvedValueOnce(null);

    const { handleCheckoutCompleted } = await import("../services/billing");
    // Alice (original creator) tries to settle — but bob is now the owner
    const session = makeSession("handle_mint_request", { userId: "alice", agentId: "agent-uuid-1" });

    await handleCheckoutCompleted(session);

    // Settlement must NOT happen — no update call
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});

describe("T198-C — handle_registration: transferred agent current owner settles correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("when current owner (bob) initiates checkout, findFirst returns agent and handle is assigned", async () => {
    const agentRow = { id: "agent-uuid-1" };
    // Calls to findFirst in the handle_registration settlement path:
    //   1. Primary agentId lookup (agentOwnerWhere) → agentRow
    //   2. fullAgent metadata read (eq agentId) → { id, metadata: {} }
    //   3. markHandlePaymentComplete internal lookup (eq agentId) → { id, metadata: {} }
    mockFindFirst
      .mockResolvedValueOnce(agentRow)
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} })
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} });

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = makeSession("handle_registration", { userId: "bob", agentId: "agent-uuid-1", handle: "myhandle" });

    await handleCheckoutCompleted(session);

    // Settlement happened — update was called (handle assignment + markHandlePaymentComplete)
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
    expect(mockFindFirst).toHaveBeenCalledTimes(3);
  });

  it("primary findFirst receives agentOwnerWhere clause (and+or structure)", async () => {
    const agentRow = { id: "agent-uuid-1" };
    mockFindFirst
      .mockResolvedValueOnce(agentRow)
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} })
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} });

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = makeSession("handle_registration", { userId: "bob", agentId: "agent-uuid-1", handle: "myhandle" });

    await handleCheckoutCompleted(session);

    const firstCallArgs = mockFindFirst.mock.calls[0][0] as { where: unknown };
    const where = firstCallArgs.where as { op: string; args: unknown[] };
    // agentOwnerWhere returns and(eq(id,...), or(...))
    expect(where.op).toBe("and");
    const secondArg = where.args[1] as { op: string };
    expect(secondArg.op).toBe("or");
  });
});

describe("T198-D — handle_registration: former creator cannot satisfy settlement after transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("when both primary and fallback lookups return null (alice is former creator), settlement is skipped entirely", async () => {
    // Both findFirst calls return null: alice is not the effective owner
    mockFindFirst.mockResolvedValue(null);

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = makeSession("handle_registration", { userId: "alice", agentId: "agent-uuid-1", handle: "myhandle" });

    await handleCheckoutCompleted(session);

    // No settlement — update was never called
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});

describe("T198-E — handle_registration fallback-by-handle: current owner (bob) settles correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("when agentId is absent from metadata, fallback-by-handle path finds agent and settles", async () => {
    const agentRow = { id: "agent-uuid-1" };
    // No agentIdMeta — session has no agentId, so primary lookup is skipped
    // Fallback by-handle returns the agent (bob is effective owner via ownerUserId)
    // markHandlePaymentComplete also calls findFirst internally
    mockFindFirst
      .mockResolvedValueOnce(agentRow)
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} })
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} });

    const { handleCheckoutCompleted } = await import("../services/billing");
    // Session has no agentId → triggers the fallback-by-handle path
    const session = {
      id: "cs_test_session",
      metadata: {
        type: "handle_registration",
        userId: "bob",
        handle: "myhandle",
        // agentId intentionally absent
      },
      subscription: null,
    } as unknown as import("stripe").Stripe.Checkout.Session;

    await handleCheckoutCompleted(session);

    // Settlement happened — handle assignment + markHandlePaymentComplete updates
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
  });

  it("fallback findFirst receives an and(eq(handle,...), or(...)) clause using agentOwnerFilter", async () => {
    const agentRow = { id: "agent-uuid-1" };
    mockFindFirst
      .mockResolvedValueOnce(agentRow)
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} })
      .mockResolvedValueOnce({ id: "agent-uuid-1", metadata: {} });

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = {
      id: "cs_test_session",
      metadata: {
        type: "handle_registration",
        userId: "bob",
        handle: "myhandle",
      },
      subscription: null,
    } as unknown as import("stripe").Stripe.Checkout.Session;

    await handleCheckoutCompleted(session);

    // First findFirst call (fallback by handle) should use and(eq(handle,...), or(...))
    const firstCallArgs = mockFindFirst.mock.calls[0][0] as { where: unknown };
    const where = firstCallArgs.where as { op: string; args: unknown[] };
    expect(where.op).toBe("and");
    // Second arg should be `or(...)` from agentOwnerFilter — not a raw eq(userId)
    const secondArg = where.args[1] as { op: string };
    expect(secondArg.op).toBe("or");
  });
});

describe("T198-F — handle_registration fallback-by-handle: former creator is blocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("when fallback-by-handle lookup returns null (alice is former creator), settlement is skipped", async () => {
    // Fallback returns null: alice's userId is not the effective owner (ownerUserId=bob)
    mockFindFirst.mockResolvedValue(null);

    const { handleCheckoutCompleted } = await import("../services/billing");
    const session = {
      id: "cs_test_session",
      metadata: {
        type: "handle_registration",
        userId: "alice",
        handle: "myhandle",
      },
      subscription: null,
    } as unknown as import("stripe").Stripe.Checkout.Session;

    await handleCheckoutCompleted(session);

    // No settlement
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});
