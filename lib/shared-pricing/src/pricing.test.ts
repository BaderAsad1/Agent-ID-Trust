import { HANDLE_PRICING_TIERS, getHandlePricingTier } from "./index.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

const EXPECTED_PRICES: Record<string, number> = {
  "3-char": 640,
  "4-char": 160,
  "5+-char": 10,
};

const tier3 = HANDLE_PRICING_TIERS.find(t => t.minLength === 3 && (t.maxLength === 3 || t.maxLength === undefined));
const tier4 = HANDLE_PRICING_TIERS.find(t => t.minLength === 4 && (t.maxLength === 4 || t.maxLength === undefined));
const tier5 = HANDLE_PRICING_TIERS.find(t => t.minLength === 5);

assert(tier3 !== undefined, "3-char tier must exist");
assert(tier3!.annualPriceUsd === EXPECTED_PRICES["3-char"], `3-char tier price must be $${EXPECTED_PRICES["3-char"]}, got $${tier3!.annualPriceUsd}`);

assert(tier4 !== undefined, "4-char tier must exist");
assert(tier4!.annualPriceUsd === EXPECTED_PRICES["4-char"], `4-char tier price must be $${EXPECTED_PRICES["4-char"]}, got $${tier4!.annualPriceUsd}`);

assert(tier5 !== undefined, "5+-char tier must exist");
assert(tier5!.annualPriceUsd === EXPECTED_PRICES["5+-char"], `5+-char tier price must be $${EXPECTED_PRICES["5+-char"]}, got $${tier5!.annualPriceUsd}`);

assert(getHandlePricingTier("abc").annualPriceUsd === 640, "3-char handle should cost $640/yr");
assert(getHandlePricingTier("abcd").annualPriceUsd === 160, "4-char handle should cost $160/yr");
assert(getHandlePricingTier("abcde").annualPriceUsd === 10, "5-char handle should cost $10/yr");
assert(getHandlePricingTier("ab").isReserved === true, "2-char handles must be reserved");

const reservedTiers = HANDLE_PRICING_TIERS.filter(t => t.isReserved);
assert(reservedTiers.length === 1, "Exactly one reserved tier must exist");
assert(reservedTiers[0].maxLength === 2, "Reserved tier must cover 1-2 char handles");

const nonReservedTiers = HANDLE_PRICING_TIERS.filter(t => !t.isReserved);
assert(nonReservedTiers.length === 3, "Exactly three purchasable tiers must exist");

const faqText = `$${tier3!.annualPriceUsd}/yr and $${tier4!.annualPriceUsd}/yr`;
assert(faqText === "$640/yr and $160/yr", `FAQ display text must render as "$640/yr and $160/yr", got "${faqText}"`);

assert(tier3!.annualPriceCents === 64000, "3-char cents must be 64000");
assert(tier4!.annualPriceCents === 16000, "4-char cents must be 16000");
assert(tier5!.annualPriceCents === 1000, "5+ char cents must be 1000");

assert(!tier3!.isFreeWithPlan, "3-char handles are not free with plan");
assert(!tier4!.isFreeWithPlan, "4-char handles are not free with plan");
assert(tier5!.isFreeWithPlan, "5+ char handles are free with plan");

console.log("All pricing parity assertions passed.");
