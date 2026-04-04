# Agent ID Pricing Audit

**Task:** #183 — Pre-launch pricing audit  
**Date:** 2026-04-04  
**Scope:** Full codebase audit of `getagent.id` pricing, billing, and plan logic  
**Directive:** Report only — no pricing changes  

---

## 1. Executive Summary

The Agent ID pricing system is **highly consistent** at the backend level. The canonical shared-pricing library (`lib/shared-pricing/src/index.ts`) is correctly imported by the API server and frontend. Handle-price arithmetic is consistent end-to-end. The three-function handle-entitlement model (`isEligibleForIncludedHandle` / `hasCustomHandleEntitlement` / `isAllowedHandleAccess`) is coherent and well-documented in tests. All four user-facing pricing surfaces (llms.txt, API plan details, frontend pricing page, onboarding wizard) agree on plan prices and handle counts.

No HIGH-severity issues were found. Four issues require attention before launch:

| # | Severity | Summary |
|---|----------|---------|
| RISK-001 | MEDIUM | `premiumHandleDiscount` (10% for Pro/Enterprise) computed and returned by limits API but never applied at checkout and not surfaced in any frontend copy |
| RISK-002 | LOW | `llms.txt` states "Grace period: 90 days" globally; `standard_5plus` handles have a shorter 30-day grace — tier-specific detail is omitted |
| RISK-003 | LOW | `LAUNCH_MODE=true` env flag bypasses all plan feature gates; must be absent/false at production launch |
| RISK-004 | LOW | `STRIPE_PRICE_*` env vars required for webhook plan resolution; if unset, subscription webhook events resolve to plan `"none"` silently |

---

## 2. Canonical Sources of Truth

| Concern | Canonical Source | File | Line(s) |
|---------|-----------------|------|---------|
| Handle tier prices and properties | `HANDLE_PRICING_TIERS` | `lib/shared-pricing/src/index.ts` | 16–44 |
| Handle tier lookup | `getHandlePricingTier(handle)` | `lib/shared-pricing/src/index.ts` | 47–50 |
| Included-handle eligibility (Starter/Pro automatic) | `isEligibleForIncludedHandle(plan)` | `lib/shared-pricing/src/index.ts` | 60–62 |
| Enterprise handle entitlement (custom/sales-led) | `hasCustomHandleEntitlement(plan)` | `lib/shared-pricing/src/index.ts` | 70–72 |
| Combined handle access gate | `isAllowedHandleAccess(plan)` | `lib/shared-pricing/src/index.ts` | 79–81 |
| Plan agent limits | `PLAN_LIMITS` | `artifacts/api-server/src/services/billing.ts` | 29–37 |
| Plan prices (cents) | `PLAN_PRICES` | `artifacts/api-server/src/services/billing.ts` | 39–43 |
| Plan feature gates | `getPlanLimits(plan)` | `artifacts/api-server/src/services/billing.ts` | 55–87 |
| User plan limits + discount field | `getUserPlanLimits(userId)` | `artifacts/api-server/src/services/billing.ts` | 89–115 |
| Stripe event → plan name | `getPlanFromPriceId(priceId)` | `artifacts/api-server/src/services/billing.ts` | 115–123 |
| Plan → Stripe price ID (frontend reference) | `getPriceIdFromPlan(plan, interval)` | `artifacts/api-server/src/services/billing.ts` | 125–129 |
| HTTP plan details contract | `PLAN_DETAILS` | `artifacts/api-server/src/routes/v1/billing.ts` | 30–72 |
| Handle grace period days | `startHandleGracePeriod()` | `artifacts/api-server/src/services/handle.ts` | 254–255 |
| Marketplace fee | `MARKETPLACE_FEE_BPS = 250` | `artifacts/api-server/src/services/billing.ts` | 27 |

**Authority chain:** `lib/shared-pricing` (handle tiers, eligibility functions) → `billing.ts` (plan limits, prices, checkout) → `routes/v1/billing.ts` (HTTP API) → frontend. Backend is authoritative over all frontend copy.

---

## 3. Pricing Inventory Table

### 3.1 Plan Prices

Source: `PLAN_PRICES` at `artifacts/api-server/src/services/billing.ts:39–43`; confirmed against `PLAN_DETAILS.price` at `artifacts/api-server/src/routes/v1/billing.ts:34,44,54,64`; `PRICING_PLANS` at `artifacts/agent-id/src/lib/pricing.ts:39,59`; and `llms-txt.ts:95–98`.

| Plan | Monthly (cents) | Yearly (cents) | Display monthly | Display yearly | Yearly/mo equiv | Yearly savings |
|------|----------------|---------------|-----------------|----------------|-----------------|----------------|
| Free | 0 | 0 | $0/mo | — | — | — |
| Starter | 2,900 | 29,000 | $29/mo | $290/yr | $24/mo | $58 |
| Pro | 7,900 | 79,000 | $79/mo | $790/yr | $66/mo | $158 |
| Enterprise | N/A | N/A | contact sales | — | — | — |

Yearly savings arithmetic: Starter $29×12=$348, $348−$290=$58 ✓; Pro $79×12=$948, $948−$790=$158 ✓. (`artifacts/agent-id/src/lib/pricing.ts:41–42,61–62`)

### 3.2 Handle Tier Prices

Source: `HANDLE_PRICING_TIERS` at `lib/shared-pricing/src/index.ts:16–44`.

| Tier | Characters | `annualPriceUsd` | `annualPriceCents` | `includesOnChainMint` | `includedWithPaidPlan` | `onChainMintPrice` |
|------|-----------|-----------------|--------------------|-----------------------|----------------------|--------------------|
| `reserved_1_2` | 1–2 | 0 | 0 | false | false | 0 |
| `premium_3` | 3 | 99 | 9,900 | true | false | 0 (bundled) |
| `premium_4` | 4 | 29 | 2,900 | true | false | 0 (bundled) |
| `standard_5plus` | 5+ | 0 | 0 | false | true | 500 (opt-in, $5) |

`standard_5plus.description` (line 41): "1 included automatically with Starter or Pro plan; Enterprise: custom/sales-led entitlement".

### 3.3 Other Fees

| Fee | Amount | Source |
|-----|--------|--------|
| Marketplace transaction fee | 2.5% (250 bps) | `MARKETPLACE_FEE_BPS = 250` at `billing.ts:27`; confirmed at `llms-txt.ts:90` |

---

## 4. Plan Rules Matrix

Source: `getPlanLimits()` at `artifacts/api-server/src/services/billing.ts:55–87`; `PLAN_LIMITS` at `billing.ts:29–37`.

| Feature | `none`/`free` | `starter` | `pro` | `enterprise` | Code ref |
|---------|--------------|---------|-----|------------|---------|
| `agentLimit` | 1 | 5 | 25 | 500 | `billing.ts:29–36` |
| `maxPublicAgents` | 1 | 5 | 25 | 500 | `billing.ts:29–36` |
| `maxPrivateAgents` | 1 | 5 | 25 | 500 | `billing.ts:29–36` |
| `maxSubagents` | 0 | 25 | 100 | 9,999 | `billing.ts:29–36` |
| `publicResolution` | No | Yes | Yes | Yes | `billing.ts:67` |
| `canReceiveMail` | No | Yes | Yes | Yes | `billing.ts:68` |
| `canBePublic` | No | Yes | Yes | Yes | `billing.ts:69` |
| `canListOnMarketplace` | No | Yes | Yes | Yes | `billing.ts:70–71` |
| `canUsePremiumRouting` | No | No | Yes | Yes | `billing.ts:72–73` |
| `canUseAdvancedAuth` | No | No | Yes | Yes | `billing.ts:74` |
| `analyticsAccess` | No | No | Yes | Yes | `billing.ts:75` |
| `customDomain` | No | No | Yes | Yes | `billing.ts:76` |
| `fleetManagement` | No | No | Yes | Yes | `billing.ts:78` |
| `canUseTeamFeatures` | No | No | No | Yes | `billing.ts:77` |
| `includesStandardHandle` | No | Yes | Yes | No† | `billing.ts:81` |
| `inboxAccess` | No | Yes | Yes | Yes | `billing.ts:82` |
| `tasksAccess` | No | Yes | Yes | Yes | `billing.ts:83` |
| `supportLevel` | community | email | priority | sla | `billing.ts:84` |
| `premiumHandleDiscount` | 0% | 0% | 10% | 10% | `billing.ts:104` |

†`includesStandardHandle` is `false` for Enterprise (`billing.ts:81`: `plan === "starter" || plan === "pro"`). Enterprise handle access is governed by `hasCustomHandleEntitlement()` (`lib/shared-pricing/src/index.ts:70–72`), a separate sales-led path.

### 4.1 Handle Entitlement Model

Source: `lib/shared-pricing/src/index.ts:52–81`; confirmed by tests at `artifacts/api-server/src/__tests__/pricing-plans.unit.test.ts:95–116,395–411` and `artifacts/api-server/src/__tests__/included-handle-durability.unit.test.ts:174–178`.

| Function | Starter | Pro | Enterprise | Free/None |
|----------|---------|-----|-----------|---------|
| `isEligibleForIncludedHandle(plan)` | `true` | `true` | `false` | `false` |
| `hasCustomHandleEntitlement(plan)` | `false` | `false` | `true` | `false` |
| `isAllowedHandleAccess(plan)` | `true` | `true` | `true` | `false` |

`isEligibleForIncludedHandle` gates the automatic CAS claim flow (`billing.ts:668,723,805`).  
`hasCustomHandleEntitlement` flags Enterprise as requiring a custom/sales-led process.  
`isAllowedHandleAccess` is the combined read-only gate.

### 4.2 LAUNCH_MODE Override

Source: `billing.ts:25,62–85`.

When `process.env.LAUNCH_MODE === "true"`, all agent count fields are set to 999 and all boolean feature gates (`publicResolution`, `canReceiveMail`, `canBePublic`, `canListOnMarketplace`, `canUsePremiumRouting`, `premiumRouting`, `canUseAdvancedAuth`, `analyticsAccess`, `marketplaceListing`, `inboxAccess`, `tasksAccess`, `includesStandardHandle`) are forced to `true` regardless of plan.

### 4.3 Legacy Plan Aliases

Source: `lib/db/src/schema/enums.ts:122–123`; `billing.ts:33–35,234–235`.

- DB enum `subscription_plan` includes `"builder"` and `"team"`.
- `PLAN_LIMITS` has explicit `builder` (= starter) and `team` (= pro) entries at `billing.ts:33–35`.
- `getUserPlan()` normalizes: `"builder" → "starter"`, `"team" → "pro"` at `billing.ts:234–235`.
- `requirePlanFeature()` normalizes identically at `billing.ts:1228`.

---

## 5. Handle Pricing Matrix

### 5.1 Pricing Decision Flow

Source: `createHandleCheckoutSession()` in `billing.ts`; `claimIncludedHandleBenefit()` at `billing.ts:709–776`.

```
User requests handle H (POST /api/v1/billing/handle-checkout)
  │
  ├─ len(H) ≤ 2 → RESERVED — rejected upstream
  │
  ├─ isEligibleForIncludedHandle(plan) == true         (starter or pro only)
  │   AND subscriptionsTable.includedHandleClaimed IS NULL
  │   → CLAIM PATH: no Stripe, atomic CAS (§6.3)
  │
  ├─ len(H) == 3 → premium_3: $99/yr (9,900 cents)
  │   → Stripe subscription, mode: "subscription", price_data inline
  │
  ├─ len(H) == 4 → premium_4: $29/yr (2,900 cents)
  │   → same as above
  │
  └─ len(H) ≥ 5, not eligible for included claim
      → not available standalone
```

### 5.2 Included Handle Claim — DB State

Source: `lib/db/src/schema/subscriptions.ts:35–38`.

`subscriptionsTable.includedHandleClaimed` is `varchar(64)` (stores the handle string, not a boolean). The CAS condition is `WHERE includedHandleClaimed IS NULL` (`billing.ts:764`). A historical cross-subscription guard at `billing.ts:723–736` prevents cancel-and-resubscribe bypass by checking ALL subscription rows for the user, not only the active one.

### 5.3 Handle Grace Periods

Source: `artifacts/api-server/src/services/handle.ts:254–255`.

```typescript
if (tier === "premium_3" || tier === "premium_4") return 90;
return 30;
```

| Tier | Grace period after expiry |
|------|--------------------------|
| `premium_3` | 90 days |
| `premium_4` | 90 days |
| `standard_5plus` | 30 days |

### 5.4 Post-Payment NFT State Machine

Source: `billing.ts:1422` (eligibility), `billing.ts:1435–1547` (checkout completion handler).

| Handle length | NFT eligible | Initial `nftStatus` | On-chain attempt |
|---------------|-------------|---------------------|-----------------|
| ≤ 4 chars | Yes (`handleLen <= 4` at `billing.ts:1422`) | `pending_anchor` | `registerOnChain()` at checkout completion; on success → `"active"` |
| 5+ chars (paid Stripe) | No | `none` | Not attempted |
| 5+ chars (opt-in mint, $5) | On request | `pending_anchor` | Queued via separate checkout; user calls `/claim-nft` |

---

## 6. Checkout / Billing Flow Map

### 6.1 Plan Subscription Checkout (Starter / Pro)

Source: `createCheckoutSession()` at `billing.ts:582–652`.

**Key implementation fact:** Plan checkout does NOT use Stripe env-var price IDs. It constructs a `price_data` object inline using `unit_amount` from `PLAN_PRICES[plan][billingInterval]` (`billing.ts:595–599`, `billing.ts:629–639`). The env vars `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` are used only in `getPlanFromPriceId()` (`billing.ts:115–123`) to map inbound Stripe webhook subscription events back to plan names, and are exposed in `GET /api/v1/billing/plans` (`routes/v1/billing.ts:76–79`) for informational purposes.

```
Frontend → POST /api/v1/billing/checkout
  └─ createCheckoutSession(userId, plan, billingInterval, successUrl, cancelUrl)
      billing.ts:582
      ├─ Reject plan ∈ {"free","none","enterprise"}             (billing.ts:591)
      ├─ priceAmount = PLAN_PRICES[plan][billingInterval]        (billing.ts:598)
      ├─ stripe.customers.create if no customerId               (billing.ts:611)
      ├─ stripe.checkout.sessions.create(
      │     mode: "subscription",
      │     line_items: [{ price_data: { unit_amount: priceAmount,
      │                                  recurring: { interval } } }]
      │     metadata: { userId, plan, billingInterval }
      │   )                                                      (billing.ts:624–650)
      └─ returns { url: session.url }

Stripe Webhook → POST /api/v1/billing/webhook
  ├─ checkout.session.completed (no type / plan flow)
  │   └─ handleCheckoutCompleted() at billing.ts:1296
  │       ├─ usersTable.plan updated                            (billing.ts:1568–1575)
  │       ├─ subscriptionsTable upserted                        (billing.ts:1577–1658)
  │       ├─ agentSubscriptionsTable synced                     (billing.ts:1660–1675)
  │       └─ enforceAgentLimitsForUser(userId, plan)            (billing.ts:1677)
  │
  ├─ customer.subscription.created / updated
  │   └─ handleSubscriptionCreatedOrUpdated() at billing.ts:155
  │       ├─ plan = getPlanFromPriceId(priceId)                (billing.ts:160)
  │       └─ DB upsert same as above
  │
  ├─ invoice.paid
  │   └─ handleInvoicePaid() at billing.ts:1680 — refreshes period dates
  │
  └─ customer.subscription.deleted
      └─ handleSubscriptionDeleted() at billing.ts:1767
          ├─ subscriptionsTable.status = "cancelled"
          ├─ usersTable.plan = "free"                           (billing.ts:1795)
          └─ enforceAgentLimitsForUser(userId, "none")          (billing.ts:1798)
```

### 6.2 Handle Registration Checkout (Stripe, 3-char or 4-char)

Source: `createHandleCheckoutSession()` in `billing.ts`; webhook handler for `type: "handle_registration"` at `billing.ts:1376–1552`.

```
Frontend → POST /api/v1/billing/handle-checkout
  ├─ isEligibleForIncludedHandle(plan) + IS NULL check → branch to §6.3
  ├─ checkHandleAvailability(handle) — fail-closed registrar gate
  ├─ stripe.customers.create if needed
  ├─ stripe.checkout.sessions.create(
  │     mode: "subscription",
  │     line_items: [{ price_data: { unit_amount: priceCents,
  │                                  recurring: { interval: "year" } } }]
  │     metadata: { userId, type: "handle_registration", handle, priceCents, agentId? }
  │   )                                            (billing.ts:1104–1138)
  ├─ reserveHandlesOnChain([handle]) — soft-fail pre-reservation (billing.ts:1144–1150)
  └─ returns { url: session.url, priceCents }

Stripe Webhook → checkout.session.completed (type: "handle_registration")
  billing.ts:1376
  ├─ validateHandle, isReserved, checkRegistrationLimits checks
  ├─ agentsTable updated: handle, handleTier, handlePaid=true,
  │   handleExpiresAt (+1 year), handleRegisteredAt,
  │   handleStripeSubscriptionId, nftStatus              (billing.ts:1435–1451)
  └─ if len(handle) ≤ 4: registerOnChain() → nftStatus="active" (billing.ts:1456–1547)
```

### 6.3 Included Handle Claim (Starter / Pro Automatic Benefit)

Source: `claimIncludedHandleBenefit()` at `billing.ts:709–776`.

```
POST /api/v1/billing/handle-checkout (same endpoint as §6.2)
  Conditions: isEligibleForIncludedHandle(plan)==true
              AND all subscription rows for user: includedHandleClaimed IS NULL

  ├─ Historical guard: SELECT subscriptions WHERE userId AND IS NOT NULL → limit 1
  │   rowsFound > 0 → return { claimed: false }           (billing.ts:723–736)
  ├─ Legacy agent-metadata guard                           (billing.ts:738–749)
  ├─ Atomic CAS:
  │   UPDATE subscriptions SET includedHandleClaimed=handle, ...
  │   WHERE id=userSub.id AND includedHandleClaimed IS NULL
  │   rowsAffected == 0 → concurrent race → return { claimed: false }
  │                                                        (billing.ts:754–772)
  ├─ Audit event written (billing.included_handle_claim.pending)
  ├─ assignHandleToAgent(handle, agentId, userId)
  │   on failure → attempt claim release; on release failure → log "stranded"
  └─ returns { url: null, priceCents: 0 } — no Stripe redirect
```

### 6.4 On-Chain Mint Add-On ($5, 5+ char handles)

Source: `POST /:handle/request-mint` in `artifacts/api-server/src/routes/v1/handles.ts:817–853`.

```
POST /api/v1/handles/:handle/request-mint
  └─ stripe.checkout.sessions.create(
        mode: "payment",                          (handles.ts:819)
        line_items: [{ price_data: { unit_amount: 500 } }]
        metadata: { type: "handle_mint_request", agentId, handle, userId }
     )

Stripe Webhook → checkout.session.completed (type: "handle_mint_request")
  billing.ts:1299–1373
  ├─ agentsTable.nftStatus = "pending_anchor"
  ├─ issueClaimTicket() → stored in metadata.pendingClaimTicket
  ├─ reserveHandlesOnChain([handle]) — soft-fail
  └─ nftAuditLogTable insert: mintPriceCents=500          (billing.ts:1366)
```

Note: one-time `mode: "payment"`, not a subscription.

### 6.5 Dutch Auction Bid (Post-Grace Period Handle Recovery)

Source: `POST /:handle/auction-bid` in `artifacts/api-server/src/routes/v1/handles.ts:295–320`.

```
stripe.checkout.sessions.create(
  mode: "payment",                                (handles.ts:297)
  line_items: [{ price_data: { unit_amount: auction.currentPrice } }]
  metadata: { type: "handle_auction_bid", auctionId, handle, userId, bidPrice }
)
```

### 6.6 Plan Cancellation

Source: `cancelSubscription()` at `billing.ts:131–138`.

```
stripe.subscriptions.update(id, { cancel_at_period_end: true })
→ DB status updated only on customer.subscription.deleted webhook
→ handleSubscriptionDeleted() at billing.ts:1767
```

### 6.7 Crypto Payment (USDC / USDT on Base)

Source: `createCryptoCheckoutSession()` at `billing.ts:1860–1892`; `pollForCryptoPayment()` at `billing.ts:1894–2049`.

```
POST /api/v1/billing/crypto-checkout
  └─ Returns: { paymentAddress: BASE_PLATFORM_WALLET, amount, reference, expiresAt }
      priceCents = getHandlePriceCents(handle)             (billing.ts:1870)
      USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (billing.ts:1843)
      USDT contract: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2 (billing.ts:1844)
      Chain: Base (chainId 8453); expires in 30 minutes   (billing.ts:1875)

POST /api/v1/billing/crypto-verify
  └─ Scans last 1,000 blocks for ERC-20 Transfer events (billing.ts:1919)
      expectedAmount = BigInt(expectedAmountCents) * 10000n (billing.ts:1916)
      On match: assignHandleToAgent() + same NFT anchoring as Stripe path
```

This path serves handle registrations only (not plan subscriptions).

---

## 7. Machine-Readable / Documentation Pricing Mentions

| Location | Type | Content | Status |
|----------|------|---------|--------|
| `artifacts/api-server/src/routes/llms-txt.ts:86–88` | `llms.txt` — handle pricing prose | 1–2 char: RESERVED; 3-char: $99/yr; 4-char: $29/yr; 5+: 1 included with Starter/Pro, Enterprise: custom entitlement, Free: not included | Consistent with `lib/shared-pricing/src/index.ts:16–44,41` |
| `artifacts/api-server/src/routes/llms-txt.ts:6–10` | `llms.txt` — handle pricing table | Dynamically generated from `HANDLE_PRICING_TIERS` at import time | Consistent — shares canonical source |
| `artifacts/api-server/src/routes/llms-txt.ts:89` | `llms.txt` — grace period | "Grace period: 90 days after handle expiry" (no tier qualification) | **RISK-002** — only true for premium_3/premium_4; standard_5plus has 30-day grace (`handle.ts:254–255`) |
| `artifacts/api-server/src/routes/llms-txt.ts:95–98` | `llms.txt` — plan table prose | Free=$0/1 agent; Starter=$29/$290, 1 handle included; Pro=$79/$790, 1 handle included, 25 agents; Enterprise=contact sales | Consistent with all other sources |
| `artifacts/api-server/src/routes/llms-txt.ts:90` | `llms.txt` — marketplace fee | "2.5% (250 basis points)" | Consistent with `billing.ts:27` |
| `artifacts/api-server/src/routes/v1/billing.ts:30–72` | `GET /api/v1/billing/plans` | `PLAN_DETAILS`: 4 plans, prices $0/$29/$79/contact; Starter/Pro each include "Standard handle included (5+ chars)"; Enterprise does not claim handles | Consistent with canonical sources |
| `artifacts/agent-id/src/lib/pricing.ts:19–95` | `PRICING_PLANS` (public `/pricing` page) | Free: no handle; Starter: "1 .agentid handle included (5+ chars)"; Pro: "1 .agentid handle included (5+ chars)"; Enterprise: no handle listed | Consistent with backend (1 handle, not 5) |
| `artifacts/agent-id/src/pages/OnboardingPlan.tsx:43,58` | Onboarding Step 2 | Starter: "1 included .agentid handle (5+ characters)"; Pro: "1 included .agentid handle (5+ characters) at signup" | Consistent with backend |
| `artifacts/api-server/src/__tests__/pricing-plans.unit.test.ts:20–55` | Tests — handle tiers | premium_3=$99, premium_4=$29, standard_5plus=$0, onChainMintPrice=500 | Consistent with `lib/shared-pricing/src/index.ts` |
| `artifacts/api-server/src/__tests__/pricing-plans.unit.test.ts:95–116` | Tests — `isEligibleForIncludedHandle` | starter=true, pro=true, enterprise=false, free=false, none=false | Consistent with `lib/shared-pricing/src/index.ts:60–61` |
| `artifacts/api-server/src/__tests__/pricing-plans.unit.test.ts:323–327` | Tests — enterprise model note | "Enterprise is custom/sales-led — not covered by isEligibleForIncludedHandle" | Consistent with three-function model |
| `artifacts/api-server/src/__tests__/pricing-plans.unit.test.ts:395–411` | Tests — enterprise entitlement triple | `isEligibleForIncludedHandle('enterprise')=false`, `hasCustomHandleEntitlement('enterprise')=true`, `isAllowedHandleAccess('enterprise')=true` | Correct and internally consistent |
| `artifacts/api-server/src/__tests__/included-handle-durability.unit.test.ts:163–188` | Tests — claim eligibility | starter/pro=eligible; enterprise/free/none=not eligible for automatic claim | Consistent |
| `artifacts/api-server/src/__tests__/mail-gating.unit.test.ts:95–120` | Tests — mail feature gate | free/none→402 PLAN_REQUIRED; starter→200 | Consistent with `getPlanLimits().canReceiveMail` |
| `lib/shared-pricing/src/pricing.test.ts` | Tests — shared-pricing | Verifies tier values | Consistent |

---

## 8. Contradictions and Risks

### RISK-001 — MEDIUM — `premiumHandleDiscount` Computed but Not Applied

**File:** `artifacts/api-server/src/services/billing.ts:104`

```typescript
const premiumHandleDiscount = plan === "pro" || plan === "enterprise" ? 10 : 0;
return { ...limits, premiumHandleDiscount, ... };
```
(`billing.ts:104,110`)

`getUserPlanLimits()` returns `premiumHandleDiscount: 10` for Pro and Enterprise users in the `GET /api/v1/billing/limits` response.

**What the checkout does:** `createHandleCheckoutSession()` computes the handle price using `getHandlePriceCents(handle)` from shared-pricing (`billing.ts:45–47`) and passes it directly as `unit_amount` to Stripe. No code path reduces this by the discount percentage.

**Frontend:** A grep of `artifacts/agent-id/src` for `premiumHandleDiscount` returns no matches — no component reads or displays this field.

**Impact:** Pro and Enterprise users receive `premiumHandleDiscount: 10` in their limits response, but the premium handle checkout charges full price ($99 for 3-char, $29 for 4-char). This is either a speculative field added ahead of implementation or an omission.

**Options:**
- (a) Remove `premiumHandleDiscount` from `getUserPlanLimits()` return value if no discount is intended at launch.
- (b) Apply it in `createHandleCheckoutSession()` and surface it in the handle purchase UI.

---

### RISK-002 — LOW — Grace Period in `llms.txt` Understates Tier Variation

**File:** `artifacts/api-server/src/routes/llms-txt.ts:89`

```
Grace period: 90 days after handle expiry.
```

**Actual implementation** at `artifacts/api-server/src/services/handle.ts:254–255`:

```typescript
if (tier === "premium_3" || tier === "premium_4") return 90;
return 30;   // standard_5plus
```

| Tier | Actual grace | llms.txt |
|------|-------------|---------|
| `premium_3` | 90 days | "90 days" ✓ |
| `premium_4` | 90 days | "90 days" ✓ |
| `standard_5plus` | 30 days | Not mentioned — implied 90 days ✗ |

**Impact:** Agents holding 5+ char handles (the majority of users) may expect 90 days of post-expiry grace but only receive 30. Recommendation: update `llms-txt.ts:89` to "Grace period: 90 days (3–4 char handles) or 30 days (5+ char handles) after handle expiry."

---

### RISK-003 — LOW — `LAUNCH_MODE` Flag Must Be Absent / False at Launch

**File:** `artifacts/api-server/src/services/billing.ts:25`
```typescript
const LAUNCH_MODE = process.env.LAUNCH_MODE === "true";
```

When true, all agent count limits become 999 and all feature gate booleans are forced open (`billing.ts:62–85`). If inadvertently set in production, all plan enforcement is bypassed silently.

**Recommendation:** Confirm `LAUNCH_MODE` is absent or `"false"` in the production deployment environment. Consider adding a startup `logger.warn` when `LAUNCH_MODE` is active.

---

### RISK-004 — LOW — `STRIPE_PRICE_*` Env Vars Needed for Webhook Plan Resolution

**File:** `artifacts/api-server/src/services/billing.ts:115–123`

```typescript
export function getPlanFromPriceId(priceId: string): string {
  const e = process.env;
  const priceMap: Record<string, string> = {};
  if (e.STRIPE_PRICE_STARTER_MONTHLY) priceMap[e.STRIPE_PRICE_STARTER_MONTHLY] = "starter";
  if (e.STRIPE_PRICE_STARTER_YEARLY)  priceMap[e.STRIPE_PRICE_STARTER_YEARLY]  = "starter";
  if (e.STRIPE_PRICE_PRO_MONTHLY)     priceMap[e.STRIPE_PRICE_PRO_MONTHLY]     = "pro";
  if (e.STRIPE_PRICE_PRO_YEARLY)      priceMap[e.STRIPE_PRICE_PRO_YEARLY]      = "pro";
  return priceMap[priceId] ?? "none";
}
```

`handleSubscriptionCreatedOrUpdated()` (`billing.ts:155–205`) calls this to resolve the plan name from a Stripe subscription event's price ID. If any env var is missing, the resolved plan falls back to `"none"`, which silently leaves the user on the wrong plan after a subscription webhook fires.

**Note:** These vars are NOT needed for the checkout path — checkout uses inline `price_data` (`billing.ts:629–639`). They are only required for webhook-driven resolution.

**Recommendation:** Verify all four vars are set in production before launch. `setupStripeProducts()` (`billing.ts:371–426`) creates these products and logs instructions to populate the env vars (`billing.ts:425`); confirm that step was completed.

---

## 9. Recommended Cleanup Order

| Priority | Risk | Action | Effort | File(s) |
|----------|------|--------|--------|---------|
| 1 | RISK-001 (MEDIUM) | Decide fate of `premiumHandleDiscount`: remove it or implement the discount at checkout + UI | Low–medium | `billing.ts:104,110`; optionally handle checkout + frontend |
| 2 | RISK-004 (LOW, launch-blocking) | Verify all `STRIPE_PRICE_*` env vars are populated in production | Ops config | Deployment env config |
| 3 | RISK-002 (LOW) | Update `llms-txt.ts:89` grace period to differentiate 90-day (3–4 char) vs 30-day (5+ char) | Trivial | `artifacts/api-server/src/routes/llms-txt.ts:89` |
| 4 | RISK-003 (LOW) | Confirm `LAUNCH_MODE` is absent/false in production; optionally add startup warning | Ops config | Deployment env config; optionally `billing.ts` startup |
| 5 | INFO | Add inline comments at `billing.ts:33–35` and `enums.ts:122–123` documenting that `builder`/`team` are deprecated legacy aliases pending DB migration | Trivial | `billing.ts:33–35`; `lib/db/src/schema/enums.ts:122–123` |

**No backend pricing logic changes are required.** All handle tier prices, plan prices, the three-function handle entitlement model, and checkout flows are internally consistent. The only user-visible copy inconsistency is the grace period description in `llms.txt` (RISK-002).

---

*Audit performed by static analysis of repository source files. All claims cite exact file paths and line numbers drawn from the current codebase. No pricing values were changed as part of this audit.*
