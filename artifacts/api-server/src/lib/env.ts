import { z } from "zod/v4";

const envSchema = z.object({
  PORT: z.string().min(1),
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
  MAIL_BASE_DOMAIN: z.string().default("getagent.id"),
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
    console.error("[env] Environment validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  const env = result.success ? result.data : (envSchema.parse({ ...process.env, PORT: process.env.PORT || "0" }) as Env);
  _env = env;

  const isProd = env.NODE_ENV === "production";

  if (isProd && !env.ACTIVITY_HMAC_SECRET) {
    console.error("[env] FATAL: ACTIVITY_HMAC_SECRET is required in production.");
    process.exit(1);
  }
  if (isProd && !env.WEBHOOK_SECRET_KEY) {
    console.error("[env] FATAL: WEBHOOK_SECRET_KEY is required in production.");
    process.exit(1);
  }

  if (!env.REDIS_URL) {
    console.warn("[env] REDIS_URL not set — rate limiting will use in-memory store, BullMQ workers disabled.");
  }
  if (!env.STRIPE_SECRET_KEY) {
    console.warn("[env] STRIPE_SECRET_KEY not set — payment processing disabled.");
  }
  if (!env.RESEND_API_KEY) {
    console.warn("[env] RESEND_API_KEY not set — external email delivery disabled.");
  }
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    console.warn("[env] Cloudflare credentials not set — domain provisioning disabled.");
  }
  if (!env.ACTIVITY_HMAC_SECRET) {
    console.warn("[env] ACTIVITY_HMAC_SECRET not set — using ephemeral secret (dev only).");
  }
  if (!env.WEBHOOK_SECRET_KEY) {
    console.warn("[env] WEBHOOK_SECRET_KEY not set — using ephemeral encryption key (dev only).");
  }
  if (!env.CREDENTIAL_SIGNING_SECRET) {
    console.warn("[env] CREDENTIAL_SIGNING_SECRET not set — using ephemeral secret (dev only).");
  }

  return env;
}

export function env(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
