import { z } from "zod/v4";
import pino from "pino";
import crypto from "crypto";

const envLogger = pino({ name: "env" });

const envSchema = z.object({
  PORT: z.string().default("8080"),
  NODE_ENV: z.string().default("development"),

  DATABASE_URL: z.string().optional(),

  REDIS_URL: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MODE: z.string().optional(),

  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_HANDLE_STANDARD: z.string().optional(),
  STRIPE_PRICE_HANDLE_PREMIUM: z.string().optional(),
  STRIPE_PRICE_HANDLE_ELITE: z.string().optional(),

  LAUNCH_MODE: z.string().optional(),
  SANDBOX_MODE: z.enum(["enabled", "disabled"]).optional(),

  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().default("notifications@getagent.id"),

  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  ACTIVITY_HMAC_SECRET: z.string().optional(),
  WEBHOOK_SECRET_KEY: z.string().optional(),
  CREDENTIAL_SIGNING_SECRET: z.string().optional(),

  API_BASE_URL: z.string().default("https://getagent.id/api/v1"),

  BASE_AGENT_DOMAIN: z.string().default("getagent.id"),
  APP_URL: z.string().default("https://getagent.id"),
  AGENT_PROXY_IP: z.string().default("127.0.0.1"),
  // C2: Trust proxy configuration — MUST be set explicitly for your infrastructure topology.
  // Defaults to "false" (secure-by-default, no proxy trust) to prevent XFF spoofing in bare deployments.
  // Set TRUST_PROXY="1" for single-proxy, "2" for Cloudflare+nginx,
  // or a CIDR list (e.g., "103.21.244.0/22,103.22.200.0/22") for Cloudflare IP-based trust.
  // WARNING: Leaving this as "false" in a proxied deployment will cause req.ip to show proxy IPs.
  TRUST_PROXY: z.string().default("false"),
  MAIL_BASE_DOMAIN: z.string().default("getagent.id"),
  COOKIE_DOMAIN: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  VC_SIGNING_KEY: z.string().optional(),
  VC_PUBLIC_KEY: z.string().optional(),
  VC_KEY_ID: z.string().default("agentid-vc-key-1"),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  AUTH_BASE_URL: z.string().default("https://getagent.id"),

  REPLIT_DEV_DOMAIN: z.string().optional(),
  REPL_ID: z.string().optional(),

  LOG_LEVEL: z.string().default("info"),

  JWT_SECRET: z.string().optional(),
  OAUTH_INTROSPECTION_SECRET: z.string().optional(),

  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  PLATFORM_TREASURY_ADDRESS: z.string().optional(),
  CDP_WALLET_SECRET: z.string().optional(),
  CDP_NETWORK_ID: z.string().default("base-mainnet"),

  ADMIN_ALLOWED_IPS: z.string().optional(),

  X402_ENABLED: z.string().optional(),

  MULTI_CHAIN_ENABLED: z.string().optional(),

  ONCHAIN_MINTING_ENABLED: z.string().optional(),

  BASE_RPC_URL: z.string().optional(),
  BASE_MINTER_PRIVATE_KEY: z.string().optional(),
  BASE_HANDLE_CONTRACT: z.string().optional(),
  BASE_PLATFORM_WALLET: z.string().optional(),
  BASE_AGENTID_REGISTRAR: z.string().optional(),
  BASE_ERC8004_REGISTRY: z.string().optional(),
  BASE_CHAIN_ID: z.string().optional(),
  BASE_METADATA_URI: z.string().optional(),
  IS_TESTNET: z.enum(["true", "false"]).optional(),

  HANDLE_CLAIM_SIGNING_PRIVATE_KEY: z.string().optional(),
  HANDLE_CLAIM_ISSUER: z.string().default("agentid-api"),
  HANDLE_CLAIM_MAX_AGE_SECONDS: z.string().default("300"),

  // CORS: comma-separated list of allowed origins in production.
  // Example: "https://getagent.id,https://app.getagent.id"
  // REQUIRED in production for cross-origin requests to succeed.
  // If unset in production, CORS is fail-closed: ALL cross-origin requests are denied.
  // This is intentional — a missing env var must never silently open CORS.
  ALLOWED_ORIGINS: z.string().optional(),

  TRON_API_URL: z.string().optional(),
  TRON_MINTER_PRIVATE_KEY: z.string().optional(),
  TRON_CONTRACT_ADDRESS: z.string().optional(),
  TRON_HANDLE_MINTED_TOPIC: z.string().optional(),

  // DB pool size — read by lib/db/src/index.ts (defaults to 100 if unset).
  // Set this explicitly in production to tune connection pool capacity.
  DB_POOL_MAX: z.string().optional(),

  // Admin secret — required in production. Used by /api/v1/admin/* routes.
  // Must be a high-entropy random string (≥32 chars). All admin requests are
  // denied if this is unset (fail-closed), but env.ts validation ensures an
  // early startup failure in production rather than a silent runtime failure.
  ADMIN_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

function applyStripeAliases(): void {
  if (!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SK) {
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SK;
  }
  if (!process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_PK) {
    process.env.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PK;
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WH_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WH_SECRET;
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_ENDPOINT_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_ENDPOINT_SECRET;
  }
}

export function validateEnv(): Env {
  if (_env) return _env;
  applyStripeAliases();
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    envLogger.error("[env] Environment validation failed:");
    for (const issue of result.error.issues) {
      envLogger.error({ field: issue.path.join("."), message: issue.message }, "[env] validation issue");
    }
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  const env = result.success ? result.data : (envSchema.parse({ ...process.env, PORT: process.env.PORT || "0" }) as Env);
  _env = env;

  const isProd = env.NODE_ENV === "production";

  // Normalize VC keys: if stored as PEM, convert to JWK JSON so all downstream code works uniformly
  if (env.VC_SIGNING_KEY?.trimStart().startsWith("-----BEGIN")) {
    try {
      const key = crypto.createPrivateKey(env.VC_SIGNING_KEY);
      const jwk = key.export({ format: "jwk" }) as Record<string, string>;
      jwk.alg = "EdDSA";
      jwk.kid = env.VC_KEY_ID || "agentid-vc-key-1";
      const jwkStr = JSON.stringify(jwk);
      env.VC_SIGNING_KEY = jwkStr;
      process.env.VC_SIGNING_KEY = jwkStr;
      envLogger.info("[env] VC_SIGNING_KEY normalized from PEM to JWK format");
    } catch (e) {
      envLogger.warn({ err: e }, "[env] VC_SIGNING_KEY looks like PEM but failed to parse — validation will catch this");
    }
  }
  if (env.VC_PUBLIC_KEY?.trimStart().startsWith("-----BEGIN")) {
    try {
      const key = crypto.createPublicKey(env.VC_PUBLIC_KEY);
      const jwk = key.export({ format: "jwk" }) as Record<string, string>;
      jwk.alg = "EdDSA";
      jwk.kid = env.VC_KEY_ID || "agentid-vc-key-1";
      const jwkStr = JSON.stringify(jwk);
      env.VC_PUBLIC_KEY = jwkStr;
      process.env.VC_PUBLIC_KEY = jwkStr;
      envLogger.info("[env] VC_PUBLIC_KEY normalized from PEM to JWK format");
    } catch (e) {
      envLogger.warn({ err: e }, "[env] VC_PUBLIC_KEY looks like PEM but failed to parse — validation will catch this");
    }
  }

  if (isProd && !env.ACTIVITY_HMAC_SECRET) {
    envLogger.fatal("[env] ACTIVITY_HMAC_SECRET is required in production.");
    process.exit(1);
  }
  if (isProd && !env.WEBHOOK_SECRET_KEY) {
    envLogger.fatal("[env] WEBHOOK_SECRET_KEY is required in production.");
    process.exit(1);
  }
  if (isProd && !env.VC_SIGNING_KEY) {
    envLogger.fatal("[env] VC_SIGNING_KEY is required in production for W3C VC issuance.");
    process.exit(1);
  }
  if (isProd && env.VC_SIGNING_KEY) {
    try {
      const parsed = JSON.parse(env.VC_SIGNING_KEY);
      if (!parsed.kty || !parsed.crv || !parsed.d) {
        throw new Error("VC_SIGNING_KEY JWK is missing required fields (kty, crv, d)");
      }
      if (parsed.crv !== "Ed25519") {
        throw new Error(`VC_SIGNING_KEY must be Ed25519, got: ${parsed.crv}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      envLogger.fatal({ err: msg }, "[env] VC_SIGNING_KEY is malformed — must be a valid Ed25519 private JWK JSON string.");
      process.exit(1);
    }
  }
  if (isProd && !env.VC_PUBLIC_KEY) {
    envLogger.fatal("[env] VC_PUBLIC_KEY is required in production for W3C VC verification.");
    process.exit(1);
  }
  if (isProd && env.VC_PUBLIC_KEY) {
    try {
      const parsed = JSON.parse(env.VC_PUBLIC_KEY);
      if (!parsed.kty || !parsed.crv || !parsed.x) {
        throw new Error("VC_PUBLIC_KEY JWK is missing required fields (kty, crv, x)");
      }
      if (parsed.crv !== "Ed25519") {
        throw new Error(`VC_PUBLIC_KEY must be Ed25519, got: ${parsed.crv}`);
      }
      if (parsed.d) {
        throw new Error("VC_PUBLIC_KEY must NOT contain the private key field 'd'");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      envLogger.fatal({ err: msg }, "[env] VC_PUBLIC_KEY is malformed — must be a valid Ed25519 public JWK JSON string (no private 'd' field).");
      process.exit(1);
    }
  }
  if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
    envLogger.fatal("[env] JWT_SECRET is required in production and must be at least 32 characters.");
    process.exit(1);
  }
  if (isProd && !env.ADMIN_SECRET_KEY) {
    envLogger.fatal("[env] ADMIN_SECRET_KEY is required in production. All admin routes will deny all requests without it.");
    process.exit(1);
  }

  if (!env.REDIS_URL) {
    envLogger.warn("[env] REDIS_URL not set — rate limiting will use in-memory store, BullMQ workers disabled.");
  }
  if (!env.STRIPE_SECRET_KEY) {
    envLogger.warn("[env] STRIPE_SECRET_KEY not set — payment processing disabled.");
  }
  if (isProd && env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    envLogger.fatal("[env] STRIPE_WEBHOOK_SECRET is required in production when Stripe is enabled. Without it, all incoming webhooks will be rejected and payment events will not be processed.");
    process.exit(1);
  }
  if (!env.STRIPE_WEBHOOK_SECRET && !isProd) {
    envLogger.warn("[env] STRIPE_WEBHOOK_SECRET not set — Stripe webhook signature verification disabled. This must be set in production.");
  }
  if (!env.RESEND_API_KEY) {
    envLogger.warn("[env] RESEND_API_KEY not set — external email delivery disabled.");
  }
  if (env.LAUNCH_MODE === "true" && isProd) {
    envLogger.warn("[env] LAUNCH_MODE is enabled in PRODUCTION — all billing controls, agent limits, and subscription enforcement are BYPASSED. This must not be enabled in production.");
  }
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    envLogger.warn("[env] Cloudflare credentials not set — domain provisioning disabled.");
  }
  if (!env.ACTIVITY_HMAC_SECRET) {
    envLogger.warn("[env] ACTIVITY_HMAC_SECRET not set — using ephemeral secret (dev only).");
  }
  if (!env.WEBHOOK_SECRET_KEY) {
    envLogger.warn("[env] WEBHOOK_SECRET_KEY not set — using ephemeral encryption key (dev only).");
  }
  if (!env.CREDENTIAL_SIGNING_SECRET) {
    envLogger.warn("[env] CREDENTIAL_SIGNING_SECRET not set — using ephemeral secret (dev only).");
  }

  return env;
}

export function env(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

export function _resetEnvCacheForTests(): void {
  _env = null;
}
