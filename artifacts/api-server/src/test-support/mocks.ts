/**
 * Centralized vi.mock() declarations for external services.
 *
 * Import this file in test files that need to mock external services.
 * The vi.mock() calls are hoisted automatically by vitest.
 *
 * Usage:
 *   import { setupExternalMocks } from '../test-support/mocks';
 *   setupExternalMocks(); // call in beforeAll or at module level
 *
 * NOTE: vi.mock() must be called at the top level of test files for hoisting.
 * This file exports helper functions to set up mock implementations.
 */
import { vi } from "vitest";

/** Mock Stripe — returns a stub that prevents real API calls */
export function mockStripe() {
  vi.mock("stripe", () => ({
    default: vi.fn().mockImplementation(() => ({
      customers: { create: vi.fn(), retrieve: vi.fn() },
      subscriptions: { create: vi.fn(), list: vi.fn() },
      invoices: { list: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    })),
  }));
}

/** Mock Resend — prevents real email sends */
export function mockResend() {
  vi.mock("resend", () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({ id: "mock-email-id", error: null }),
      },
    })),
  }));
}

/** Mock the email service module directly */
export function mockEmailService() {
  vi.mock("../services/email", () => ({
    sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
    sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  }));
  vi.mock("../services/email.js", () => ({
    sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
    sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock Coinbase AgentKit — prevents real blockchain calls */
export function mockCoinbase() {
  vi.mock("@coinbase/agentkit", () => ({
    AgentKit: vi.fn(),
  }));
  vi.mock("@coinbase/cdp-sdk", () => ({
    CdpClient: vi.fn(),
  }));
}

/** Mock Cloudflare DNS — prevents real DNS API calls */
export function mockCloudflare() {
  vi.mock("cloudflare", () => ({
    default: vi.fn(),
  }));
}

/** Mock Redis — returns an in-memory stub */
export function mockRedis() {
  vi.mock("../lib/redis", () => ({
    getRedis: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
    }),
    isRedisConfigured: vi.fn().mockReturnValue(false),
  }));
}

/** Mock activity logger — prevents DB writes for activity logging */
export function mockActivityLogger() {
  vi.mock("../services/activity-logger", () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock trust score recomputation — prevents DB reads/writes */
export function mockTrustScore() {
  vi.mock("../services/trust-score", () => ({
    recomputeAndStore: vi.fn().mockResolvedValue({ trustScore: 0, trustTier: "unverified" }),
    determineTier: vi.fn().mockReturnValue("unverified"),
    getTrustProviders: vi.fn().mockReturnValue([]),
  }));
}

/** Mock credentials service */
export function mockCredentials() {
  vi.mock("../services/credentials", () => ({
    reissueCredential: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock webhook delivery */
export function mockWebhookDelivery() {
  vi.mock("../services/webhook-delivery", () => ({
    deliverWebhookEvent: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock activity log signed */
export function mockActivityLog() {
  vi.mock("../services/activity-log", () => ({
    logSignedActivity: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock billing/plan service */
export function mockBillingService() {
  vi.mock("../services/billing", () => ({
    getUserPlan: vi.fn().mockResolvedValue("free"),
    getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5 }),
    getActiveUserSubscription: vi.fn().mockResolvedValue(null),
  }));
}

/** Mock resolve cache */
export function mockResolveCache() {
  vi.mock("../routes/v1/resolve", () => ({
    deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
  }));
}

/** Mock handle reservation service */
export function mockHandleService() {
  vi.mock("../services/handle", () => ({
    getHandleTier: vi.fn().mockReturnValue({ tier: "standard_5plus", annualCents: 0, annualUsd: 0 }),
    checkHandleAvailability: vi.fn().mockResolvedValue({ available: true }),
    assignHandleToAgent: vi.fn().mockResolvedValue(undefined),
  }));
}
