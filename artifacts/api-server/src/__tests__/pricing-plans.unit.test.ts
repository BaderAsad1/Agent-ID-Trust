import { describe, it, expect } from 'vitest';
import { HANDLE_PRICING_TIERS, getHandlePricingTier, isEligibleForIncludedHandle } from '@workspace/shared-pricing';

describe('Canonical four-plan pricing model', () => {
  describe('Handle pricing tiers from shared-pricing', () => {
    it('has exactly 4 tiers (reserved + 3 purchasable)', () => {
      expect(HANDLE_PRICING_TIERS).toHaveLength(4);
    });

    it('has exactly 1 reserved tier for 1-2 char handles', () => {
      const reserved = HANDLE_PRICING_TIERS.filter(t => t.isReserved);
      expect(reserved).toHaveLength(1);
      expect(reserved[0].maxLength).toBe(2);
      expect(reserved[0].tier).toBe('reserved_1_2');
    });

    it('has premium_3 tier at $99/yr, not free, not included with plan', () => {
      const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'premium_3')!;
      expect(t).toBeDefined();
      expect(t.annualPriceUsd).toBe(99);
      expect(t.annualPriceCents).toBe(9900);
      expect(t.isFree).toBe(false);
      expect(t.includedWithPaidPlan).toBe(false);
      expect(t.includesOnChainMint).toBe(true);
    });

    it('has premium_4 tier at $29/yr, not free, not included with plan', () => {
      const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'premium_4')!;
      expect(t).toBeDefined();
      expect(t.annualPriceUsd).toBe(29);
      expect(t.annualPriceCents).toBe(2900);
      expect(t.isFree).toBe(false);
      expect(t.includedWithPaidPlan).toBe(false);
      expect(t.includesOnChainMint).toBe(true);
    });

    it('has standard_5plus tier at $0 standalone, includedWithPaidPlan=true, isFree=false', () => {
      const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'standard_5plus')!;
      expect(t).toBeDefined();
      expect(t.annualPriceUsd).toBe(0);
      expect(t.annualPriceCents).toBe(0);
      expect(t.isFree).toBe(false);
      expect(t.includedWithPaidPlan).toBe(true);
      expect(t.includesOnChainMint).toBe(false);
      expect(t.onChainMintPrice).toBe(500);
    });

    it('has no deprecated isFreeWithPlan field', () => {
      HANDLE_PRICING_TIERS.forEach(t => {
        expect(t).not.toHaveProperty('isFreeWithPlan');
      });
    });
  });

  describe('getHandlePricingTier()', () => {
    it('3-char handle → premium_3 at $99/yr', () => {
      const t = getHandlePricingTier('abc');
      expect(t.tier).toBe('premium_3');
      expect(t.annualPriceUsd).toBe(99);
    });

    it('4-char handle → premium_4 at $29/yr', () => {
      const t = getHandlePricingTier('abcd');
      expect(t.tier).toBe('premium_4');
      expect(t.annualPriceUsd).toBe(29);
    });

    it('5-char handle → standard_5plus, includedWithPaidPlan=true', () => {
      const t = getHandlePricingTier('abcde');
      expect(t.tier).toBe('standard_5plus');
      expect(t.annualPriceUsd).toBe(0);
      expect(t.includedWithPaidPlan).toBe(true);
      expect(t.isFree).toBe(false);
    });

    it('long handle → standard_5plus', () => {
      const t = getHandlePricingTier('my-long-agent-name');
      expect(t.tier).toBe('standard_5plus');
    });

    it('2-char handle → reserved', () => {
      const t = getHandlePricingTier('ab');
      expect(t.isReserved).toBe(true);
    });

    it('1-char handle → reserved', () => {
      const t = getHandlePricingTier('a');
      expect(t.isReserved).toBe(true);
    });
  });

  describe('isEligibleForIncludedHandle(plan)', () => {
    it('returns true for starter', () => {
      expect(isEligibleForIncludedHandle('starter')).toBe(true);
    });

    it('returns true for pro', () => {
      expect(isEligibleForIncludedHandle('pro')).toBe(true);
    });

    it('returns true for enterprise', () => {
      expect(isEligibleForIncludedHandle('enterprise')).toBe(true);
    });

    it('returns false for free/none (no payment)', () => {
      expect(isEligibleForIncludedHandle('free')).toBe(false);
      expect(isEligibleForIncludedHandle('none')).toBe(false);
    });

    it('returns false for unknown plan', () => {
      expect(isEligibleForIncludedHandle('unknown')).toBe(false);
    });
  });
});

describe('Plan limits mapping', () => {
  it('getPlanLimits: free/none → 1 agent', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('none').agentLimit).toBe(1);
    expect(getPlanLimits('free').agentLimit).toBe(1);
  });

  it('getPlanLimits: starter → 5 agents', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('starter').agentLimit).toBe(5);
  });

  it('getPlanLimits: builder (legacy) → 5 agents (same as starter)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('builder').agentLimit).toBe(5);
  });

  it('getPlanLimits: pro → 25 agents', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('pro').agentLimit).toBe(25);
  });

  it('getPlanLimits: team (legacy) → 25 agents (same as pro)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('team').agentLimit).toBe(25);
  });

  it('getPlanLimits: enterprise → 500 agents', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('enterprise').agentLimit).toBe(500);
  });

  it('getPlanLimits: free/none → canReceiveMail=false', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('none').canReceiveMail).toBe(false);
    expect(getPlanLimits('free').canReceiveMail).toBe(false);
  });

  it('getPlanLimits: starter → canReceiveMail=true', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('starter').canReceiveMail).toBe(true);
  });

  it('getPlanLimits: pro → canReceiveMail=true', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('pro').canReceiveMail).toBe(true);
  });
});

describe('/billing/plans response contract', () => {
  it('PLAN_DETAILS covers all four canonical plans', async () => {
    const { PLAN_DETAILS } = await import('../routes/v1/billing');
    const planIds = PLAN_DETAILS.map((p: { id: string }) => p.id);
    expect(planIds).toContain('free');
    expect(planIds).toContain('starter');
    expect(planIds).toContain('pro');
    expect(planIds).toContain('enterprise');
    expect(planIds).toHaveLength(4);
  });

  it('handle pricing derived from shared-pricing has 4 tiers', () => {
    expect(HANDLE_PRICING_TIERS.length).toBe(4);
    const tiers = HANDLE_PRICING_TIERS.map(t => t.tier);
    expect(tiers).toContain('reserved_1_2');
    expect(tiers).toContain('premium_3');
    expect(tiers).toContain('premium_4');
    expect(tiers).toContain('standard_5plus');
  });

  it('3-char annual handle price is $99 (not $640)', () => {
    const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'premium_3')!;
    expect(t.annualPriceUsd).toBe(99);
    expect(t.annualPriceUsd).not.toBe(640);
  });

  it('4-char annual handle price is $29 (not $160)', () => {
    const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'premium_4')!;
    expect(t.annualPriceUsd).toBe(29);
    expect(t.annualPriceUsd).not.toBe(160);
  });

  it('5+ char handle has $0 standalone price (not $10)', () => {
    const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'standard_5plus')!;
    expect(t.annualPriceUsd).toBe(0);
    expect(t.annualPriceUsd).not.toBe(10);
  });
});

describe('checkUserIncludedHandleEligibility via isEligibleForIncludedHandle (free-plan regression)', () => {
  it('isEligibleForIncludedHandle rejects "free" plan — free users cannot claim included handles', () => {
    expect(isEligibleForIncludedHandle('free')).toBe(false);
  });

  it('isEligibleForIncludedHandle rejects "none" plan', () => {
    expect(isEligibleForIncludedHandle('none')).toBe(false);
  });

  it('isEligibleForIncludedHandle accepts paid plans only', () => {
    expect(isEligibleForIncludedHandle('starter')).toBe(true);
    expect(isEligibleForIncludedHandle('pro')).toBe(true);
    expect(isEligibleForIncludedHandle('enterprise')).toBe(true);
  });

  it('HANDLE_TIERS from handle service are derived from shared-pricing (no local overrides)', async () => {
    const { HANDLE_TIERS } = await import('../services/handle');
    const sharedStandard = HANDLE_PRICING_TIERS.find(t => t.tier === 'standard_5plus')!;
    expect(HANDLE_TIERS.standard_5plus.includedWithPaidPlan).toBe(sharedStandard.includedWithPaidPlan);
    expect(HANDLE_TIERS.standard_5plus.annualUsd).toBe(sharedStandard.annualPriceUsd);
    const sharedPremium3 = HANDLE_PRICING_TIERS.find(t => t.tier === 'premium_3')!;
    expect(HANDLE_TIERS.premium_3.annualUsd).toBe(sharedPremium3.annualPriceUsd);
    expect(HANDLE_TIERS.premium_3.includedWithPaidPlan).toBe(false);
  });
});
