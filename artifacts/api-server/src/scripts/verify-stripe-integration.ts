import Stripe from "stripe";
import { bootstrapStripeEnv, getStripe, isStripeAvailable } from "../services/stripe-client";

async function verify() {
  await bootstrapStripeEnv();

  const key = process.env.STRIPE_SECRET_KEY;
  const connectorMode = !key && isStripeAvailable();

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("FAIL: Cannot initialize Stripe client:", (e as Error).message);
    console.error("  Ensure STRIPE_SECRET_KEY is set or the Replit Stripe connector is connected.");
    process.exit(1);
  }

  console.log("=== Stripe Integration Verification ===\n");

  if (key) {
    console.log("1. Key mode:", key.startsWith("sk_test_") ? "TEST" : key.startsWith("sk_live_") ? "LIVE" : "UNKNOWN");
  } else if (connectorMode) {
    console.log("1. Key mode: CONNECTOR_PROXY (via Replit Stripe integration)");
  }
  console.log("   Publishable key:", process.env.STRIPE_PUBLISHABLE_KEY ? "SET" : "MISSING");
  console.log("   Webhook secret:", process.env.STRIPE_WEBHOOK_SECRET ? "SET" : "MISSING");
  console.log("   isStripeAvailable():", isStripeAvailable());

  const EXPECTED_URL = "https://getagent.id/api/v1/webhooks/stripe";
  const REQUIRED_EVENTS = [
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.refunded",
  ];

  console.log("\n2. Webhook verification:");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = endpoints.data.find((e) => e.url === EXPECTED_URL);

  if (!endpoint) {
    console.error("   FAIL: No webhook endpoint found for", EXPECTED_URL);
    process.exit(1);
  }

  console.log("   Webhook ID:", endpoint.id);
  console.log("   URL:", endpoint.url);
  console.log("   Status:", endpoint.status);
  console.log("   Events registered:", endpoint.enabled_events.length);

  const missing = REQUIRED_EVENTS.filter(
    (e) => !endpoint.enabled_events.includes(e as Stripe.WebhookEndpointCreateParams.EnabledEvent),
  );
  if (missing.length > 0) {
    console.error("   FAIL: Missing events:", missing.join(", "));
    process.exit(1);
  }

  for (const evt of REQUIRED_EVENTS) {
    console.log("   ✓", evt);
  }

  console.log("\n3. Health check verification:");
  try {
    const resp = await fetch("http://localhost:8080/api/healthz");
    const healthData = await resp.json() as { services: { stripe: { configured: boolean } } };
    const stripeHealth = healthData.services?.stripe?.configured;
    console.log("   GET /api/healthz → stripe.configured:", stripeHealth);
    if (!stripeHealth) {
      console.error("   FAIL: stripe.configured is not true");
      process.exit(1);
    }
    console.log("   ✓ Health check confirms Stripe configured");
  } catch {
    console.log("   SKIP: API server not running (health check unavailable)");
  }

  console.log("\n=== All checks passed ===");
}

verify().catch((e) => {
  console.error("Verification failed:", e.message);
  process.exit(1);
});
