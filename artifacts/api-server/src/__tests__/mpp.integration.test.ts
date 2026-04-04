import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripe = {
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    capture: vi.fn(),
  },
  refunds: {
    create: vi.fn(),
  },
};

vi.mock("../services/stripe-client", () => ({
  getStripe: () => mockStripe,
  isStripeAvailable: () => true,
}));

const mockFindFirst = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: (...args: unknown[]) => mockInsertReturning(...args),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: (...args: unknown[]) => mockUpdateWhere(...args),
      }),
    }),
    query: {
      mppPaymentsTable: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

vi.mock("@workspace/db/schema", () => ({
  mppPaymentsTable: {
    id: "id",
    agentId: "agent_id",
    idempotencyKey: "idempotency_key",
    stripePaymentIntentId: "stripe_payment_intent_id",
    paymentType: "payment_type",
    resourceId: "resource_id",
    status: "status",
  },
  agentsTable: { id: "id", handle: "handle" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", conditions: args })),
  desc: vi.fn((col: unknown) => ({ op: "desc", col })),
  sql: vi.fn(),
}));

vi.mock("../middlewares/request-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockStripe.paymentIntents.create.mockResolvedValue({
    id: "pi_test_123",
    client_secret: "pi_test_123_secret_abc",
    amount: 100,
    currency: "usd",
    status: "requires_capture",
    metadata: { idempotencyKey: "test-key-123", paymentType: "premium_resolve" },
    payment_method: "pm_test",
    customer: "cus_test",
  });
  mockStripe.paymentIntents.retrieve.mockResolvedValue({
    id: "pi_test_123",
    amount: 100,
    currency: "usd",
    status: "succeeded",
    metadata: { idempotencyKey: "test-key-123", paymentType: "premium_resolve" },
    payment_method: "pm_test",
    customer: "cus_test",
  });
  mockStripe.paymentIntents.capture.mockResolvedValue({
    id: "pi_test_123",
    status: "succeeded",
  });
  mockStripe.refunds.create.mockResolvedValue({ id: "re_test_123" });
  mockFindFirst.mockResolvedValue(null);
  mockInsertReturning.mockResolvedValue([{
    id: "payment-uuid-1",
    agentId: "agent-uuid-1",
    idempotencyKey: "test-key-123",
    amountCents: 100,
    currency: "usd",
    paymentType: "premium_resolve",
    resourceId: "test-handle",
    status: "completed",
    stripePaymentIntentId: "pi_test_123",
    createdAt: new Date(),
    updatedAt: new Date(),
  }]);
});

describe("StripeMppProvider", () => {
  it("creates a PaymentIntent with correct parameters", async () => {
    const { StripeMppProvider } = await import("../services/mpp-provider");
    const provider = new StripeMppProvider();

    const result = await provider.createIntent({
      amount: 1.0,
      currency: "usd",
      initiatorType: "agent",
      initiatorId: "agent-uuid-1",
      targetType: "api_call",
      targetId: "premium_resolve",
    });

    expect(result.success).toBe(true);
    expect(result.providerReference).toBe("pi_test_123");
    expect(result.clientSecret).toBe("pi_test_123_secret_abc");
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledOnce();
  });

  it("authorizes a payment by retrieving the PaymentIntent from Stripe", async () => {
    const { StripeMppProvider } = await import("../services/mpp-provider");
    const provider = new StripeMppProvider();

    mockFindFirst.mockResolvedValueOnce({
      stripePaymentIntentId: "pi_test_123",
    });

    const result = await provider.authorizePayment({
      paymentIntentId: "payment-uuid-1",
      authorizationType: "mpp",
    });

    expect(result.success).toBe(true);
    expect(result.providerReference).toBe("pi_test_123");
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_test_123");
  });

  it("captures a requires_capture PaymentIntent", async () => {
    const { StripeMppProvider } = await import("../services/mpp-provider");
    const provider = new StripeMppProvider();

    const result = await provider.capturePayment("pi_test_123");
    expect(result.success).toBe(true);
    expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_test_123");
  });

  it("issues a partial refund", async () => {
    const { StripeMppProvider } = await import("../services/mpp-provider");
    const provider = new StripeMppProvider();

    const result = await provider.refundPayment("pi_test_123", 50);
    expect(result.success).toBe(true);
    expect(mockStripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: "pi_test_123",
      amount: 50,
    });
  });
});

describe("MPP Middleware — mppPaymentRequired", () => {
  function makeReqRes(overrides: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    authenticatedAgent?: { id: string; trustTier: string };
    originalUrl?: string;
  } = {}) {
    const req = {
      headers: overrides.headers || {},
      params: overrides.params || {},
      authenticatedAgent: overrides.authenticatedAgent,
      originalUrl: overrides.originalUrl || "/api/v1/mpp/premium-resolve/test-handle",
    } as unknown as import("express").Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    } as unknown as import("express").Response;
    const next = vi.fn() as import("express").NextFunction;
    return { req, res, next };
  }

  it("returns 402 with correct resource URL when no payment header present", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");
    const { req, res, next } = makeReqRes({
      params: { handle: "test-handle" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("PAYMENT_REQUIRED");
    expect(body.requirement.resource).toContain("/api/v1/mpp/premium-resolve/test-handle");
    expect(body.requirement.paymentType).toBe("premium_resolve");
    expect(body.requirement.resourceId).toBe("test-handle");
    expect(next).not.toHaveBeenCalled();
  });

  it("applies trust-tier discounts in the 402 response", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");
    const { req, res, next } = makeReqRes({
      authenticatedAgent: { id: "agent-1", trustTier: "elite" },
    });

    await middleware(req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.requirement.amountCents).toBe(50);
    expect(body.requirement.trustDiscount).toEqual({
      originalAmountCents: 100,
      discountPercent: 50,
      reason: "elite tier discount",
    });
  });

  it("rejects a payment header that is not a valid PI ID", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");
    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "bad_id" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks replay of a completed payment for a different paymentType", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "p-1",
        stripePaymentIntentId: "pi_test_123",
        paymentType: "other_type",
        status: "completed",
      });

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_test_123" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("PAYMENT_ALREADY_USED");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows replay of an already-completed payment for the same resource", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockFindFirst.mockResolvedValueOnce({
      id: "p-1",
      stripePaymentIntentId: "pi_test_123",
      paymentType: "premium_resolve",
      resourceId: "test-handle",
      agentId: "agent-1",
      payerAgentId: "agent-1",
      status: "completed",
    });

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_test_123" },
      params: { handle: "test-handle" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects replay of a completed payment for a different resourceId", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockFindFirst.mockResolvedValueOnce({
      id: "p-1",
      stripePaymentIntentId: "pi_test_123",
      paymentType: "premium_resolve",
      resourceId: "other-handle",
      agentId: "agent-1",
      payerAgentId: "agent-1",
      status: "completed",
    });

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_test_123" },
      params: { handle: "test-handle" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("RESOURCE_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a payment that belongs to a different agent (ownership binding)", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockFindFirst.mockResolvedValueOnce({
      id: "p-1",
      stripePaymentIntentId: "pi_test_123",
      paymentType: "premium_resolve",
      resourceId: "test-handle",
      agentId: "agent-other",
      payerAgentId: "agent-other",
      status: "completed",
    });

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_test_123" },
      params: { handle: "test-handle" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("PAYMENT_OWNERSHIP_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("requires authentication when presenting a payment header", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_test_123" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("AUTHENTICATION_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a PI whose metadata agentId does not match the caller", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockFindFirst.mockResolvedValueOnce(null);
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_stolen",
      amount: 100,
      currency: "usd",
      status: "succeeded",
      metadata: { agentId: "agent-other", paymentType: "premium_resolve" },
      payment_method: "pm_x",
      customer: "cus_x",
    });

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_stolen" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("PAYMENT_OWNERSHIP_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("verifies, captures, and records a valid first-time payment", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_new",
      amount: 100,
      currency: "usd",
      status: "requires_capture",
      metadata: { idempotencyKey: "k1", paymentType: "premium_resolve", resourceId: "test-handle" },
      payment_method: "pm_x",
      customer: "cus_x",
    });
    mockStripe.paymentIntents.capture.mockResolvedValueOnce({ id: "pi_new", status: "succeeded" });

    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_new" },
      params: { handle: "test-handle" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_new");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a PaymentIntent whose metadata paymentType does not match", async () => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(100, "Test", "premium_resolve");

    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_wrong",
      amount: 100,
      currency: "usd",
      status: "succeeded",
      metadata: { paymentType: "wrong_type" },
      payment_method: "pm_x",
      customer: "cus_x",
    });
    mockFindFirst.mockResolvedValueOnce(null);

    const { req, res, next } = makeReqRes({
      headers: { "x-mpp-payment": "pi_wrong" },
      authenticatedAgent: { id: "agent-1", trustTier: "basic" },
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toBe("PAYMENT_TYPE_MISMATCH");
    expect(next).not.toHaveBeenCalled();
  });
});

describe("createMppPaymentIntent helper", () => {
  it("creates a PaymentIntent and inserts a DB record", async () => {
    const { createMppPaymentIntent } = await import("../services/mpp-provider");

    const result = await createMppPaymentIntent({
      amountCents: 100,
      currency: "usd",
      paymentType: "premium_resolve",
      agentId: "agent-uuid-1",
    });

    expect(result.success).toBe(true);
    expect(result.paymentIntentId).toBe("pi_test_123");
    expect(result.clientSecret).toBe("pi_test_123_secret_abc");
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledOnce();
  });
});

describe("Trust-Aware Pricing", () => {
  it.each([
    ["elite", 100, 50],
    ["trusted", 100, 75],
    ["verified", 100, 90],
    ["basic", 100, 100],
    ["unverified", 100, 100],
  ])("tier %s: base %d -> final %d", async (tier, base, expected) => {
    const { mppPaymentRequired } = await import("../middlewares/mpp");
    const middleware = mppPaymentRequired(base, "Test", "test_type");
    const { req, res } = makeReqRes({
      authenticatedAgent: { id: "a-1", trustTier: tier },
    });

    await middleware(req, res, vi.fn());

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.requirement.amountCents).toBe(expected);
  });

  function makeReqRes(overrides: {
    authenticatedAgent?: { id: string; trustTier: string };
  } = {}) {
    return {
      req: {
        headers: {},
        params: {},
        authenticatedAgent: overrides.authenticatedAgent,
        originalUrl: "/api/v1/mpp/test",
      } as unknown as import("express").Request,
      res: {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
      } as unknown as import("express").Response,
    };
  }
});
