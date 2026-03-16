import Stripe from "stripe";
import { ReplitConnectors } from "@replit/connectors-sdk";

let stripeInstance: Stripe | null = null;

export function isStripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (key) {
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
