import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { validateEnv, _resetEnvCacheForTests } from "../lib/env";

function parseRequiredProductionTable(): string[] {
  const readmePath = path.resolve(__dirname, "../../../../README.md");
  const md = fs.readFileSync(readmePath, "utf8");
  const lines = md.split("\n");
  const headerIdx = lines.findIndex((l) => /^###\s+Required\s+\(Production\)\s*$/.test(l));
  if (headerIdx === -1) throw new Error('README is missing "### Required (Production)" header');

  const names: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^###\s+/.test(line)) break;
    const m = line.match(/^\|\s*`([A-Z0-9_]+)`\s*\|/);
    if (m) names.push(m[1]);
  }
  if (names.length === 0) throw new Error("Parsed zero variables from README Required (Production) table");
  return names;
}

function generateEd25519Jwks(): { priv: string; pub: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privJwk = privateKey.export({ format: "jwk" }) as Record<string, string>;
  const pubJwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  privJwk.alg = "EdDSA";
  pubJwk.alg = "EdDSA";
  return { priv: JSON.stringify(privJwk), pub: JSON.stringify(pubJwk) };
}

function buildValidProdEnv(): Record<string, string> {
  const { priv, pub } = generateEd25519Jwks();
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pw@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    ALLOWED_ORIGINS: "https://getagent.id",
    TRUST_PROXY: "1",
    WEBHOOK_SECRET_KEY: "a".repeat(64),
    ACTIVITY_HMAC_SECRET: "b".repeat(64),
    CLAIM_TOKEN_SECRET: "c".repeat(64),
    JWT_SECRET: "d".repeat(64),
    OAUTH_INTROSPECTION_SECRET: "e".repeat(64),
    CREDENTIAL_SIGNING_SECRET: "f".repeat(64),
    VC_SIGNING_KEY: priv,
    VC_PUBLIC_KEY: pub,
    ADMIN_SECRET_KEY: "g".repeat(64),
    ADMIN_ALLOWED_IPS: "127.0.0.1",
    STRIPE_SECRET_KEY: "sk_live_test",
    STRIPE_PUBLISHABLE_KEY: "pk_live_test",
    STRIPE_WEBHOOK_SECRET: "whsec_" + "h".repeat(40),
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
    STRIPE_PRICE_STARTER_YEARLY: "price_starter_yearly",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly",
    STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
    STRIPE_PRICE_HANDLE_STANDARD: "price_handle_standard",
    STRIPE_PRICE_HANDLE_PREMIUM: "price_handle_premium",
    STRIPE_PRICE_HANDLE_ELITE: "price_handle_elite",
    RESEND_API_KEY: "re_live_test",
    RESEND_WEBHOOK_SECRET: "whsec_resend_test",
    CLOUDFLARE_API_TOKEN: "cloudflare-token",
    CLOUDFLARE_ZONE_ID: "cloudflare-zone",
  };
}

describe("README Required (Production) ↔ env.ts parity", () => {
  const originalEnv = { ...process.env };
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetEnvCacheForTests();
    for (const k of Object.keys(process.env)) delete process.env[k];
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, originalEnv);
    _resetEnvCacheForTests();
  });

  it("baseline: a fully-populated production env validates without exiting", () => {
    Object.assign(process.env, buildValidProdEnv());
    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  const required = parseRequiredProductionTable();

  it("README lists at least one required variable", () => {
    expect(required.length).toBeGreaterThan(0);
  });

  for (const name of required) {
    it(`hard-fails in production when ${name} is missing`, () => {
      const valid = buildValidProdEnv();
      delete valid[name];
      Object.assign(process.env, valid);
      expect(() => validateEnv()).toThrow(/process\.exit\(1\)/);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  }
});
