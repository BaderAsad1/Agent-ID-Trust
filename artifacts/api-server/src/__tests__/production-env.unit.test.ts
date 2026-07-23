import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCacheForTests, validateEnv } from "../lib/env";

const originalEnv = { ...process.env };

const productionEnv: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://agentid:secret@db.internal:5432/agentid",
  REDIS_URL: "redis://redis.internal:6379",
  ALLOWED_ORIGINS: "https://getagent.id,https://app.getagent.id",
  TRUST_PROXY: "1",
  ACTIVITY_HMAC_SECRET: "activity-secret-that-is-at-least-32-characters",
  WEBHOOK_SECRET_KEY: "webhook-secret-that-is-at-least-32-characters",
  CREDENTIAL_SIGNING_SECRET: "credential-secret-that-is-at-least-32-characters",
  JWT_SECRET: "jwt-secret-that-is-at-least-32-characters-long",
  CLAIM_TOKEN_SECRET: "claim-secret-that-is-at-least-32-characters",
  ADMIN_SECRET_KEY: "admin-secret-that-is-at-least-32-characters",
  ADMIN_ALLOWED_IPS: "127.0.0.1",
  OAUTH_INTROSPECTION_SECRET: "introspection-secret-at-least-32-characters",
  VC_SIGNING_KEY: JSON.stringify({ kty: "OKP", crv: "Ed25519", d: "private", x: "public" }),
  VC_PUBLIC_KEY: JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "public" }),
  STRIPE_SECRET_KEY: "sk_live_test_value",
  STRIPE_PUBLISHABLE_KEY: "pk_live_test_value",
  STRIPE_WEBHOOK_SECRET: "whsec_test_value",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_YEARLY: "price_starter_yearly",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
  STRIPE_PRICE_HANDLE_STANDARD: "price_handle_standard",
  STRIPE_PRICE_HANDLE_PREMIUM: "price_handle_premium",
  STRIPE_PRICE_HANDLE_ELITE: "price_handle_elite",
  RESEND_API_KEY: "re_test_value",
  RESEND_WEBHOOK_SECRET: "whsec_resend_test_value",
  CLOUDFLARE_API_TOKEN: "cloudflare-test-token",
  CLOUDFLARE_ZONE_ID: "cloudflare-test-zone",
  X402_ENABLED: "false",
  ONCHAIN_MINTING_ENABLED: "false",
};

function setProductionEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, productionEnv);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  _resetEnvCacheForTests();
}

function expectStartupFailure(overrides: Record<string, string | undefined>) {
  setProductionEnv(overrides);
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  expect(() => validateEnv()).toThrow("process.exit(1)");
  expect(exit).toHaveBeenCalledWith(1);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  _resetEnvCacheForTests();
});

describe("production environment launch gate", () => {
  it("accepts a complete production configuration", () => {
    setProductionEnv();
    expect(validateEnv().NODE_ENV).toBe("production");
  });

  it("fails closed without Stripe billing", () => {
    expectStartupFailure({ STRIPE_SECRET_KEY: undefined });
  });

  it("fails closed without verified Stripe webhooks", () => {
    expectStartupFailure({ STRIPE_WEBHOOK_SECRET: undefined });
  });

  it("fails closed without outbound email", () => {
    expectStartupFailure({ RESEND_API_KEY: undefined });
  });

  it.each([
    "OAUTH_INTROSPECTION_SECRET",
    "RESEND_WEBHOOK_SECRET",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ZONE_ID",
  ])("fails closed when %s is missing", (name) => {
    expectStartupFailure({ [name]: undefined });
  });

  it("rejects wildcard CORS origins", () => {
    expectStartupFailure({ ALLOWED_ORIGINS: "*" });
  });

  it("rejects undersized production secrets", () => {
    expectStartupFailure({ ADMIN_SECRET_KEY: "too-short" });
  });
});
