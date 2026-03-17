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
  const builderProduct = await stripe.products.create({
    name: "Agent ID Builder",
    description: "Up to 5 agents, public resolution, priority routing, marketplace listing",
    metadata: { plan: "builder", agentLimit: "5" },
  });

  const builderMonthly = await stripe.prices.create({
    product: builderProduct.id,
    unit_amount: 900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "builder", interval: "monthly" },
  });

  const builderYearly = await stripe.prices.create({
    product: builderProduct.id,
    unit_amount: 8600,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "builder", interval: "yearly" },
  });

  console.log(`Builder plan: ${builderProduct.id}`);
  console.log(`  Monthly: ${builderMonthly.id}`);
  console.log(`  Yearly:  ${builderYearly.id}`);

  const proProduct = await stripe.products.create({
    name: "Agent ID Pro",
    description: "Up to 25 agents, analytics dashboard, custom domains, fleet management",
    metadata: { plan: "pro", agentLimit: "25" },
  });

  const proMonthly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 2900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "pro", interval: "monthly" },
  });

  const proYearly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 27900,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "pro", interval: "yearly" },
  });

  console.log(`Pro plan: ${proProduct.id}`);
  console.log(`  Monthly: ${proMonthly.id}`);
  console.log(`  Yearly:  ${proYearly.id}`);

  const teamProduct = await stripe.products.create({
    name: "Agent ID Team",
    description: "Up to 100 agents, organization namespaces, SLA, enterprise support",
    metadata: { plan: "team", agentLimit: "100" },
  });

  const teamMonthly = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 9900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "team", interval: "monthly" },
  });

  const teamYearly = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 95000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "team", interval: "yearly" },
  });

  console.log(`Team plan: ${teamProduct.id}`);
  console.log(`  Monthly: ${teamMonthly.id}`);
  console.log(`  Yearly:  ${teamYearly.id}`);

  const handleProduct = await stripe.products.create({
    name: "Agent ID Handle",
    description: "Permanent agent handle registration on the .agentid namespace",
    metadata: { type: "handle" },
  });

  const handleStandard = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 500,
    currency: "usd",
    metadata: { handleTier: "standard", chars: "5+" },
  });

  const handlePremium = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 2500,
    currency: "usd",
    metadata: { handleTier: "premium", chars: "3-4" },
  });

  const handleElite = await stripe.prices.create({
    product: handleProduct.id,
    unit_amount: 10000,
    currency: "usd",
    metadata: { handleTier: "elite", chars: "1-2" },
  });

  console.log(`Handle product: ${handleProduct.id}`);
  console.log(`  Standard (5+ chars): ${handleStandard.id}`);
  console.log(`  Premium (3-4 chars): ${handlePremium.id}`);
  console.log(`  Elite (1-2 chars):   ${handleElite.id}`);

  console.log("\n=== ADD THESE TO REPLIT SECRETS ===");
  console.log(`STRIPE_PRICE_BUILDER_MONTHLY=${builderMonthly.id}`);
  console.log(`STRIPE_PRICE_BUILDER_YEARLY=${builderYearly.id}`);
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
  console.log(`STRIPE_PRICE_TEAM_MONTHLY=${teamMonthly.id}`);
  console.log(`STRIPE_PRICE_TEAM_YEARLY=${teamYearly.id}`);
  console.log(`STRIPE_PRICE_HANDLE_STANDARD=${handleStandard.id}`);
  console.log(`STRIPE_PRICE_HANDLE_PREMIUM=${handlePremium.id}`);
  console.log(`STRIPE_PRICE_HANDLE_ELITE=${handleElite.id}`);
  console.log("\nDone! Copy all STRIPE_PRICE_* values into Replit Secrets.");
}

setupProducts().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
