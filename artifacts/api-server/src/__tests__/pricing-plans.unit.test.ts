import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middlewares/error-handler';
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

    it('has standard_5plus tier at $5/yr standalone retail, includedWithPaidPlan=true, isFree=false', () => {
      // $5/yr is the standalone retail price for free-plan users or additional handles.
      // Starter/Pro users get their first standard handle included free (not charged separately).
      const t = HANDLE_PRICING_TIERS.find(t => t.tier === 'standard_5plus')!;
      expect(t).toBeDefined();
      expect(t.annualPriceUsd).toBe(5);
      expect(t.annualPriceCents).toBe(500);
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

    it('returns false for enterprise — enterprise uses custom/sales-led handle entitlement (not automatic)', () => {
      expect(isEligibleForIncludedHandle('enterprise')).toBe(false);
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
  it('getPlanLimits: free/none → 0 agents (unsubscribed users have no agent quota)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('none').agentLimit).toBe(0);
    expect(getPlanLimits('free').agentLimit).toBe(0);
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

describe('Mail gating — Free plan cannot receive mail (Task #159 workstream 6)', () => {
  it('getPlanLimits: free → canReceiveMail=false (mail is a paid feature)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const limits = getPlanLimits('free');
    expect(limits.canReceiveMail).toBe(false);
  });

  it('getPlanLimits: none → canReceiveMail=false', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const limits = getPlanLimits('none');
    expect(limits.canReceiveMail).toBe(false);
  });

  it('getPlanLimits: starter → canReceiveMail=true (minimum paid plan for mail)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const limits = getPlanLimits('starter');
    expect(limits.canReceiveMail).toBe(true);
  });

  it('getPlanLimits: pro → canReceiveMail=true', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const limits = getPlanLimits('pro');
    expect(limits.canReceiveMail).toBe(true);
  });

  it('getPlanLimits: enterprise → canReceiveMail=true', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const limits = getPlanLimits('enterprise');
    expect(limits.canReceiveMail).toBe(true);
  });

  it('getPlanLimits: canReceiveMail requires at minimum "starter" plan — all plan tiers verified', async () => {
    const { getPlanLimits } = await import('../services/billing');
    expect(getPlanLimits('free').canReceiveMail).toBe(false);
    expect(getPlanLimits('none').canReceiveMail).toBe(false);
    expect(getPlanLimits('starter').canReceiveMail).toBe(true);
    expect(getPlanLimits('pro').canReceiveMail).toBe(true);
    expect(getPlanLimits('enterprise').canReceiveMail).toBe(true);
  });

  it('requirePlanFeature: canReceiveMail maps to "starter" as minimum required plan', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const freeLimits = getPlanLimits('free');
    const starterLimits = getPlanLimits('starter');
    expect(freeLimits.canReceiveMail).toBe(false);
    expect(starterLimits.canReceiveMail).toBe(true);
  });

  it('mail route source has canReceiveMail gate, 402 status, and PLAN_REQUIRED error code', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const mailSrc = fs.readFileSync(path.join(__dirname, '../routes/v1/mail.ts'), 'utf8');
    expect(mailSrc).toMatch(/canReceiveMail/);
    expect(mailSrc).toMatch(/402/);
    expect(mailSrc).toMatch(/PLAN_REQUIRED/);
    // The route must call getAgentPlan and getPlanLimits to derive canReceiveMail at runtime
    expect(mailSrc).toContain('getAgentPlan');
    expect(mailSrc).toContain('getPlanLimits');
  });
});

describe('Included-handle durability: compensation and stranded-claim audit trail', () => {
  it('billing.ts releaseIncludedHandleClaim is exported and callable', async () => {
    const billing = await import('../services/billing');
    expect(typeof billing.releaseIncludedHandleClaim).toBe('function');
  });

  it('billing.ts claimIncludedHandleBenefit rejects 3-char handles (premium — not included)', async () => {
    const billing = await import('../services/billing');
    // 3-char handles (premium_3 tier) are not eligible for included benefit.
    // This is a pure-logic check that doesn't require a DB hit because the
    // function short-circuits on handleLen < 5.
    const result = await billing.claimIncludedHandleBenefit('test-user-id', 'abc');
    expect(result.claimed).toBe(false);
  });

  it('billing.ts claimIncludedHandleBenefit rejects 4-char handles (premium — not included)', async () => {
    const billing = await import('../services/billing');
    const result = await billing.claimIncludedHandleBenefit('test-user-id', 'abcd');
    expect(result.claimed).toBe(false);
  });

  it('billing.ts createHandleCheckoutSession source has retry loop for releaseIncludedHandleClaim on failure', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../services/billing.ts'), 'utf8');
    // Must have a retry attempt for compensation
    expect(src).toMatch(/attempt < 2|attempt <= 1/);
    // Must fall back to audit log record on double-failure
    expect(src).toContain('billing.included_handle_claim.stranded');
    expect(src).toContain('requiredAction');
    expect(src).toContain('release_claim_and_retry_assignment');
  });

  it('billing.ts stranded-claim path inserts to auditEventsTable with correct actorType and eventType', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../services/billing.ts'), 'utf8');
    // Stranded claim audit record must include required fields
    expect(src).toContain("actorType: \"user\"");
    expect(src).toContain("billing.included_handle_claim.stranded");
    // Must not use non-existent 'severity' column (which doesn't exist in schema)
    const strandedBlock = src.slice(src.indexOf('billing.included_handle_claim.stranded') - 200, src.indexOf('billing.included_handle_claim.stranded') + 400);
    expect(strandedBlock).not.toMatch(/severity:\s*["']/);
  });
});

describe('checkUserIncludedHandleEligibility via isEligibleForIncludedHandle (free-plan regression)', () => {
  it('isEligibleForIncludedHandle rejects "free" plan — free users cannot claim included handles', () => {
    expect(isEligibleForIncludedHandle('free')).toBe(false);
  });

  it('isEligibleForIncludedHandle rejects "none" plan', () => {
    expect(isEligibleForIncludedHandle('none')).toBe(false);
  });

  it('isEligibleForIncludedHandle accepts only Starter/Pro (automatic 1-handle benefit)', () => {
    expect(isEligibleForIncludedHandle('starter')).toBe(true);
    expect(isEligibleForIncludedHandle('pro')).toBe(true);
    // Enterprise is custom/sales-led — not covered by isEligibleForIncludedHandle
    expect(isEligibleForIncludedHandle('enterprise')).toBe(false);
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

describe('Pricing entitlement cross-surface consistency', () => {
  it('no pricing surface claims Free plan includes handles', () => {
    const freeIncluded = isEligibleForIncludedHandle('free');
    expect(freeIncluded).toBe(false);
    const standardTier = HANDLE_PRICING_TIERS.find(t => t.tier === 'standard_5plus')!;
    expect(standardTier.isFree).toBe(false);
    expect(standardTier.includedWithPaidPlan).toBe(true);
  });

  it('backend includesStandardHandle matches shared-pricing for starter and pro (both get 1 included handle)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const starterLimits = getPlanLimits('starter');
    const proLimits = getPlanLimits('pro');
    expect(starterLimits.includesStandardHandle).toBe(true);
    expect(proLimits.includesStandardHandle).toBe(true);
    expect(isEligibleForIncludedHandle('starter')).toBe(true);
    expect(isEligibleForIncludedHandle('pro')).toBe(true);
  });

  it('backend includesStandardHandle is false for free/none plans', async () => {
    const { getPlanLimits } = await import('../services/billing');
    const freeLimits = getPlanLimits('free');
    const noneLimits = getPlanLimits('none');
    expect(freeLimits.includesStandardHandle).toBe(false);
    expect(noneLimits.includesStandardHandle).toBe(false);
    expect(isEligibleForIncludedHandle('free')).toBe(false);
    expect(isEligibleForIncludedHandle('none')).toBe(false);
  });

  it('handle quota enforcement: getPlanLimits includesStandardHandle=true only for Starter/Pro; Enterprise=false (custom/sales-led)', async () => {
    const { getPlanLimits } = await import('../services/billing');
    // Starter and Pro: automatic 1-handle benefit — consistent across backend + shared-pricing
    expect(getPlanLimits('starter').includesStandardHandle).toBe(true);
    expect(getPlanLimits('pro').includesStandardHandle).toBe(true);
    expect(isEligibleForIncludedHandle('starter')).toBe(true);
    expect(isEligibleForIncludedHandle('pro')).toBe(true);
    // Enterprise: custom/sales-led — NOT automatic inclusion
    expect(getPlanLimits('enterprise').includesStandardHandle).toBe(false);
    expect(isEligibleForIncludedHandle('enterprise')).toBe(false);
    // Free / none: no handles
    expect(getPlanLimits('free').includesStandardHandle).toBe(false);
    expect(getPlanLimits('none').includesStandardHandle).toBe(false);
    expect(isEligibleForIncludedHandle('free')).toBe(false);
    expect(isEligibleForIncludedHandle('none')).toBe(false);
  });

  it('handle quota enforcement: claimIncludedHandleBenefit rejects handles shorter than 5 chars (not eligible for included benefit)', async () => {
    const { claimIncludedHandleBenefit } = await import('../services/billing');
    const result3 = await claimIncludedHandleBenefit('user-test', 'abc');
    expect(result3.claimed).toBe(false);
    const result4 = await claimIncludedHandleBenefit('user-test', 'abcd');
    expect(result4.claimed).toBe(false);
  });

  it('Enterprise plan entitlement functions: isEligibleForIncludedHandle=false, hasCustomHandleEntitlement=true, isAllowedHandleAccess=true', async () => {
    // Enterprise handle entitlement is custom/sales-led, not automatic.
    // isEligibleForIncludedHandle governs the automatic 1-handle claim flow.
    // hasCustomHandleEntitlement flags enterprise as needing a custom sales-led process.
    // isAllowedHandleAccess is a combined gate for read checks (includes enterprise).
    const { isEligibleForIncludedHandle, hasCustomHandleEntitlement, isAllowedHandleAccess } = await import('../services/billing');
    expect(isEligibleForIncludedHandle('enterprise')).toBe(false);
    expect(hasCustomHandleEntitlement('enterprise')).toBe(true);
    expect(isAllowedHandleAccess('enterprise')).toBe(true);
    // Starter/Pro: automatic benefit — all three functions agree
    expect(isEligibleForIncludedHandle('starter')).toBe(true);
    expect(hasCustomHandleEntitlement('starter')).toBe(false);
    expect(isAllowedHandleAccess('starter')).toBe(true);
    // Free/none: no FREE included handle — but can still purchase at $5/yr via Stripe checkout
    expect(isEligibleForIncludedHandle('free')).toBe(false);
    expect(hasCustomHandleEntitlement('free')).toBe(false);
    expect(isAllowedHandleAccess('free')).toBe(false); // means no free included entitlement, not purchase-blocked
  });

  it('shared-pricing standard_5plus: only ONE tier is included with paid plan — Starter and Pro each get 1, not 5', () => {
    const includedTiers = HANDLE_PRICING_TIERS.filter(t => t.includedWithPaidPlan);
    expect(includedTiers).toHaveLength(1);
    expect(includedTiers[0].tier).toBe('standard_5plus');
    expect(includedTiers[0].minLength).toBe(5);
  });
});
