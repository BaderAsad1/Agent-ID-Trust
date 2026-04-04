import { describe, test, expect } from "vitest";
import { HANDLE_PRICING_TIERS, getHandlePricingTier, isEligibleForIncludedHandle } from "./index.js";

describe("Handle pricing tiers", () => {
  const tier3 = HANDLE_PRICING_TIERS.find(t => t.minLength === 3 && (t.maxLength === 3 || t.maxLength === undefined));
  const tier4 = HANDLE_PRICING_TIERS.find(t => t.minLength === 4 && (t.maxLength === 4 || t.maxLength === undefined));
  const tier5 = HANDLE_PRICING_TIERS.find(t => t.minLength === 5);

  test("3-char tier exists and costs $99/yr", () => {
    expect(tier3).toBeDefined();
    expect(tier3!.annualPriceUsd).toBe(99);
    expect(tier3!.annualPriceCents).toBe(9900);
    expect(tier3!.includedWithPaidPlan).toBe(false);
  });

  test("4-char tier exists and costs $29/yr", () => {
    expect(tier4).toBeDefined();
    expect(tier4!.annualPriceUsd).toBe(29);
    expect(tier4!.annualPriceCents).toBe(2900);
    expect(tier4!.includedWithPaidPlan).toBe(false);
  });

  test("5+-char tier exists with $0 standalone price and is included with paid plan", () => {
    expect(tier5).toBeDefined();
    expect(tier5!.annualPriceUsd).toBe(0);
    expect(tier5!.annualPriceCents).toBe(0);
    expect(tier5!.includedWithPaidPlan).toBe(true);
    expect(tier5!.isFree).toBe(false);
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
    expect(`$${tier3!.annualPriceUsd}/yr and $${tier4!.annualPriceUsd}/yr`).toBe("$99/yr and $29/yr");
  });

  test("no tier claims Free plan includes handles", () => {
    const includedTiers = HANDLE_PRICING_TIERS.filter(t => t.includedWithPaidPlan);
    includedTiers.forEach(t => {
      expect(t.isFree).toBe(false);
    });
  });
});

describe("getHandlePricingTier()", () => {
  test("3-char handle costs $99/yr", () => {
    expect(getHandlePricingTier("abc").annualPriceUsd).toBe(99);
  });

  test("4-char handle costs $29/yr", () => {
    expect(getHandlePricingTier("abcd").annualPriceUsd).toBe(29);
  });

  test("5-char handle has $0 standalone price and includedWithPaidPlan=true", () => {
    const tier = getHandlePricingTier("abcde");
    expect(tier.annualPriceUsd).toBe(0);
    expect(tier.includedWithPaidPlan).toBe(true);
  });

  test("2-char handle is reserved", () => {
    expect(getHandlePricingTier("ab").isReserved).toBe(true);
  });
});

describe("isEligibleForIncludedHandle()", () => {
  test("starter is eligible", () => {
    expect(isEligibleForIncludedHandle("starter")).toBe(true);
  });

  test("pro is eligible", () => {
    expect(isEligibleForIncludedHandle("pro")).toBe(true);
  });

  test("enterprise is NOT eligible via isEligibleForIncludedHandle — enterprise uses custom/sales-led entitlement", () => {
    expect(isEligibleForIncludedHandle("enterprise")).toBe(false);
  });

  test("free is NOT eligible — free plan does not include handles", () => {
    expect(isEligibleForIncludedHandle("free")).toBe(false);
  });

  test("none is NOT eligible", () => {
    expect(isEligibleForIncludedHandle("none")).toBe(false);
  });

  test("unknown plan is NOT eligible", () => {
    expect(isEligibleForIncludedHandle("unknown")).toBe(false);
  });
});

describe("Pricing entitlement contract", () => {
  test("standard_5plus tier is the only included-with-plan tier", () => {
    const included = HANDLE_PRICING_TIERS.filter(t => t.includedWithPaidPlan);
    expect(included).toHaveLength(1);
    expect(included[0].tier).toBe("standard_5plus");
  });

  test("starter and pro both have includesStandardHandle=true via isEligibleForIncludedHandle", () => {
    expect(isEligibleForIncludedHandle("starter")).toBe(true);
    expect(isEligibleForIncludedHandle("pro")).toBe(true);
  });

  test("isEligibleForIncludedHandle is consistent: starter/pro yes; enterprise/free/none no", () => {
    const automaticPlans = ["starter", "pro"];
    const nonAutomaticPlans = ["enterprise", "free", "none", ""];
    // Starter and Pro: automatic 1-handle benefit
    automaticPlans.forEach(p => expect(isEligibleForIncludedHandle(p)).toBe(true));
    // Enterprise: custom/sales-led (not automatic), Free/none: no handles
    nonAutomaticPlans.forEach(p => expect(isEligibleForIncludedHandle(p)).toBe(false));
  });
});
