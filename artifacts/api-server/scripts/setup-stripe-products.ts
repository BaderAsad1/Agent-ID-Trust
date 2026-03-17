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
console.log(`Plans: Starter ($29/mo), Pro ($79/mo), Enterprise (contact sales)`);
console.log(`Handles: 3-char=$640/yr, 4-char=$160/yr, 5+=$10/yr (included with plan)\n`);

async function setupProducts() {
  const starterProduct = await stripe.products.create({
    name: "Agent ID Starter",
    description: "Up to 5 agents, inbox access, handle eligibility (5+ chars included), public resolution",
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
    description: "Up to 25 agents, analytics dashboard, custom domains, fleet management, priority support",
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

  console.log(`\nEnterprise plan: Contact sales at ${APP_URL}/pricing (no Stripe product — custom contracts)`);

  const handle3CharProduct = await stripe.products.create({
    name: "Agent ID Handle — 3-Character",
    description: "Premium 3-character handle registration (.agentid namespace), annual renewal",
    metadata: { type: "handle", tier: "three_char", chars: "3" },
  });

  const handle3CharYearly = await stripe.prices.create({
    product: handle3CharProduct.id,
    unit_amount: 64000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { handleTier: "three_char", chars: "3", annualUsd: "640" },
  });

  console.log(`\nHandle 3-char product: ${handle3CharProduct.id}`);
  console.log(`  Annual ($640/yr): ${handle3CharYearly.id}`);

  const handle4CharProduct = await stripe.products.create({
    name: "Agent ID Handle — 4-Character",
    description: "Standard 4-character handle registration (.agentid namespace), annual renewal",
    metadata: { type: "handle", tier: "four_char", chars: "4" },
  });

  const handle4CharYearly = await stripe.prices.create({
    product: handle4CharProduct.id,
    unit_amount: 16000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { handleTier: "four_char", chars: "4", annualUsd: "160" },
  });

  console.log(`Handle 4-char product: ${handle4CharProduct.id}`);
  console.log(`  Annual ($160/yr): ${handle4CharYearly.id}`);

  const handle5PlusProduct = await stripe.products.create({
    name: "Agent ID Handle — 5+ Characters",
    description: "Standard 5+ character handle registration (.agentid namespace), included with active plan",
    metadata: { type: "handle", tier: "standard_5plus", chars: "5+" },
  });

  const handle5PlusYearly = await stripe.prices.create({
    product: handle5PlusProduct.id,
    unit_amount: 1000,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { handleTier: "standard_5plus", chars: "5+", annualUsd: "10" },
  });

  console.log(`Handle 5+ char product: ${handle5PlusProduct.id}`);
  console.log(`  Annual ($10/yr, included with plan): ${handle5PlusYearly.id}`);

  console.log("\n=== ADD THESE TO REPLIT SECRETS ===");
  console.log(`STRIPE_PRICE_STARTER_MONTHLY=${starterMonthly.id}`);
  console.log(`STRIPE_PRICE_STARTER_YEARLY=${starterYearly.id}`);
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
  console.log(`STRIPE_PRICE_HANDLE_3CHAR_YEARLY=${handle3CharYearly.id}`);
  console.log(`STRIPE_PRICE_HANDLE_4CHAR_YEARLY=${handle4CharYearly.id}`);
  console.log(`STRIPE_PRICE_HANDLE_5PLUS_YEARLY=${handle5PlusYearly.id}`);
  console.log("\nDone! Copy all STRIPE_PRICE_* values into Replit Secrets.");
  console.log("\nNote: Enterprise plan is tailored — no Stripe product required.");
  console.log("Note: 1-2 char handles are RESERVED — no Stripe product needed.");
}

setupProducts().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
