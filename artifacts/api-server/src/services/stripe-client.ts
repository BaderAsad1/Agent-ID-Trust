import Stripe from "stripe";
import { ReplitConnectors } from "@replit/connectors-sdk";

let stripeInstance: Stripe | null = null;

export function isStripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const isProd = process.env.NODE_ENV === "production";
  const key = isProd && process.env.STRIPE_LIVE_SECRET_KEY
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;
  if (key) {
    // Guard: prevent test keys in production and live keys in non-production.
    // A mismatch here means billing operations will silently target the wrong environment.
    const isLiveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
    const isTestKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
    if (isProd && isTestKey) {
      throw new Error("FATAL: Stripe test key detected in production environment. Set STRIPE_LIVE_SECRET_KEY to a live key.");
    }
    if (!isProd && isLiveKey) {
      throw new Error("FATAL: Stripe live key detected in non-production environment. Use a test key (sk_test_...) for STRIPE_SECRET_KEY in development/staging.");
    }
    stripeInstance = new Stripe(key, {
      apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion,
    });
    return stripeInstance;
  }

  try {
    const connectors = new ReplitConnectors();
    const proxyFetch = connectors.createProxyFetch("stripe");
    stripeInstance = new Stripe("sk_replit_connector_proxy", {
      apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(proxyFetch as typeof fetch),
    });
    return stripeInstance;
  } catch {
    throw new Error("STRIPE_SECRET_KEY is not configured and Replit Stripe connector is unavailable");
  }
}

export async function bootstrapStripeEnv(): Promise<void> {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY) {
    return;
  }

  try {
    const connectors = new ReplitConnectors();
    const connections = await connectors.listConnections({
      connector_names: "stripe",
    });

    if (connections.length === 0) {
      return;
    }

    const conn = connections[0] as Record<string, unknown>;
    const settings = (conn as { settings?: Record<string, string> }).settings;
    if (settings) {
      if (!process.env.STRIPE_SECRET_KEY && settings.secret) {
        process.env.STRIPE_SECRET_KEY = settings.secret;
      }
      if (!process.env.STRIPE_PUBLISHABLE_KEY && settings.publishable) {
        process.env.STRIPE_PUBLISHABLE_KEY = settings.publishable;
      }
      if (!process.env.STRIPE_WEBHOOK_SECRET && settings.webhook_secret) {
        process.env.STRIPE_WEBHOOK_SECRET = settings.webhook_secret;
      }
    }
  } catch {
    // Connector not available — fall back to env vars
  }
}
