import { describe, test, expect } from "vitest";
import { HANDLE_PRICING_TIERS, getHandlePricingTier } from "./index.js";

describe("Handle pricing tiers", () => {
  const tier3 = HANDLE_PRICING_TIERS.find(t => t.minLength === 3 && (t.maxLength === 3 || t.maxLength === undefined));
  const tier4 = HANDLE_PRICING_TIERS.find(t => t.minLength === 4 && (t.maxLength === 4 || t.maxLength === undefined));
  const tier5 = HANDLE_PRICING_TIERS.find(t => t.minLength === 5);

  test("3-char tier exists and costs $640/yr", () => {
    expect(tier3).toBeDefined();
    expect(tier3!.annualPriceUsd).toBe(640);
    expect(tier3!.annualPriceCents).toBe(64000);
    expect(tier3!.isFreeWithPlan).toBe(false);
  });

  test("4-char tier exists and costs $160/yr", () => {
    expect(tier4).toBeDefined();
    expect(tier4!.annualPriceUsd).toBe(160);
    expect(tier4!.annualPriceCents).toBe(16000);
    expect(tier4!.isFreeWithPlan).toBe(false);
  });

  test("5+-char tier exists and costs $10/yr and is free with plan", () => {
    expect(tier5).toBeDefined();
    expect(tier5!.annualPriceUsd).toBe(10);
    expect(tier5!.annualPriceCents).toBe(1000);
    expect(tier5!.isFreeWithPlan).toBe(true);
  });

  test("exactly one reserved tier covering 1-2 char handles", () => {
    const reservedTiers = HANDLE_PRICING_TIERS.filter(t => t.isReserved);
    expect(reservedTiers).toHaveLength(1);
    expect(reservedTiers[0].maxLength).toBe(2);
  });

  test("exactly three purchasable tiers", () => {
    const nonReserved = HANDLE_PRICING_TIERS.filter(t => !t.isReserved);
    expect(nonReserved).toHaveLength(3);
  });

  test("FAQ display text renders correctly", () => {
    expect(`$${tier3!.annualPriceUsd}/yr and $${tier4!.annualPriceUsd}/yr`).toBe("$640/yr and $160/yr");
  });
});

describe("getHandlePricingTier()", () => {
  test("3-char handle costs $640/yr", () => {
    expect(getHandlePricingTier("abc").annualPriceUsd).toBe(640);
  });

  test("4-char handle costs $160/yr", () => {
    expect(getHandlePricingTier("abcd").annualPriceUsd).toBe(160);
  });

  test("5-char handle costs $10/yr", () => {
    expect(getHandlePricingTier("abcde").annualPriceUsd).toBe(10);
  });

  test("2-char handle is reserved", () => {
    expect(getHandlePricingTier("ab").isReserved).toBe(true);
  });
});
