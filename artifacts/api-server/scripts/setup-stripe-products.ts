import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("ERROR: STRIPE_SECRET_KEY is not set");
  process.exit(1);
}

const isLive = key.startsWith("sk_live_");
const stripe = new Stripe(key, { apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion });
const APP_URL = process.env.APP_URL || "https://getagent.id";

console.log(`\nAgent ID — Stripe Product Setup`);
console.log(`Mode: ${isLive ? "LIVE" : "TEST"}`);
console.log(`App URL: ${APP_URL}\n`);

async function setupProducts() {
  const starterProduct = await stripe.products.create({
    name: "Agent ID Starter",
    description: "Up to 5 agents, public handle resolution, marketplace listing, 1,000 req/min",
    metadata: { plan: "starter", agentLimit: "5" },
  });

  const starterMonthly = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 2900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "starter", interval: "monthly" },
  });

  const starterYearly = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 29000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "starter", interval: "yearly" },
  });

  console.log(`Starter plan: ${starterProduct.id}`);
  console.log(`  Monthly: ${starterMonthly.id}`);
  console.log(`  Yearly:  ${starterYearly.id}`);

  const proProduct = await stripe.products.create({
    name: "Agent ID Pro",
    description: "Up to 25 agents, analytics dashboard, fleet management, 5,000 req/min",
    metadata: { plan: "pro", agentLimit: "25" },
  });

  const proMonthly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 7900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "pro", interval: "monthly" },
  });

  const proYearly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 79000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "pro", interval: "yearly" },
  });

  console.log(`Pro plan: ${proProduct.id}`);
  console.log(`  Monthly: ${proMonthly.id}`);
  console.log(`  Yearly:  ${proYearly.id}`);

  const handleProduct = await stripe.products.create({
    name: "Agent ID Handle",
    description: "Permanent agent handle registration on the .agentid namespace (ENS-style pricing)",
    metadata: { type: "handle" },
  });

  const handle5Plus = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 1000,
    currency: "usd",
    metadata: { handleTier: "standard", chars: "5+", price: "$10/yr" },
  });

  const handle4Char = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 16000,
    currency: "usd",
    metadata: { handleTier: "premium", chars: "4", price: "$160/yr" },
  });

  const handle3Char = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 64000,
    currency: "usd",
    metadata: { handleTier: "elite", chars: "3", price: "$640/yr" },
  });

  console.log(`Handle product: ${handleProduct.id}`);
  console.log(`  5+ chars ($10/yr):   ${handle5Plus.id}`);
  console.log(`  4 chars ($160/yr):   ${handle4Char.id}`);
  console.log(`  3 chars ($640/yr):   ${handle3Char.id}`);

  console.log("\n=== ADD THESE TO REPLIT SECRETS ===");
  console.log(`STRIPE_PRICE_STARTER_MONTHLY=${starterMonthly.id}`);
  console.log(`STRIPE_PRICE_STARTER_YEARLY=${starterYearly.id}`);
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
  console.log(`STRIPE_PRICE_HANDLE_STANDARD=${handle5Plus.id}`);
  console.log(`STRIPE_PRICE_HANDLE_PREMIUM=${handle4Char.id}`);
  console.log(`STRIPE_PRICE_HANDLE_ELITE=${handle3Char.id}`);
  console.log("\nDone! Copy all STRIPE_PRICE_* values into Replit Secrets.");
  console.log("\nNote: Enterprise plan is tailored — no Stripe product required.");
  console.log("Note: 1-2 char handles are RESERVED — no Stripe product needed.");
}

setupProducts().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
