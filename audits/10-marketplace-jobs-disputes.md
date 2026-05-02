# Audit 10 — Marketplace, Jobs, A2A, and Dispute Resolution

**Scope.** The marketplace listing/order/milestone surfaces (`v1/marketplace.ts`,
`services/orders.ts`, `services/marketplace-milestones.ts`,
`services/marketplace.ts`), the agent-to-agent service registry and dispatch
plane (`v1/a2a.ts`), the open job board (`v1/jobs.ts`, `services/jobs.ts`,
`services/proposals.ts`), and the dispute lifecycle wired to admin tooling
(`services/disputes.ts`, `v1/admin.ts` resolve handler, `pages/AdminDisputes.tsx`).

**Out of scope.** Stripe billing/subscription internals (covered by audit 06),
on-chain payment rails / x402 settlement layer beyond their use as a code path
in `/a2a/services/:id/call`, and the trust-recalculation worker beyond its role
as the consumer of dispute outcomes.

**Verdict.** The transactional shapes are mostly right (escrow → release → ledger,
PI cancellation on milestone branch, atomic completion claim, transfer reversal
on cancel). The most material risks are: (1) **`createOrder` Stripe PI is
created without an idempotency key**, so any duplicated POST or browser retry
strands an authorized hold; (2) **listing PATCH route forces all fields**
because `updateListingSchema` derives from a strict insert schema, breaking
single-field edits via the public API; (3) **A2A `/execute` ignores the
per-engagement `spendingCapUsdc`** and only consults the global agent rules
table, so the user-facing engagement cap is a UI-only concept; (4) **engagement
call history endpoint matches by `(callerAgent, service, user)`**, so a buyer
who creates two engagements against the same service from the same agent will
see the calls of one bleed into the other; (5) **dispute "split" resolution
hard-codes a 50/50 refund** regardless of the operator's `adminNote`; (6) **the
job-expiry runner is a `setInterval` started from `index.ts` with no failure
metrics, no jitter, and no leader election** so every API replica races to
expire the same jobs; (7) **`/a2a/registry` and `/a2a/services` return the same
data with two divergent shapes**, forcing the client to know which to call.

None of these are exploitable for arbitrary fund movement on their own — the
ledger and Stripe layers are conservative — but several allow user-visible
inconsistency in production (double-holds, stale engagement caps, duplicated
billing entries on retried PI insert paths) that operations would have to
unwind manually.

---

## 1. State diagrams

### 1.1 Listing lifecycle

```
                          createListing()
                        ┌─────────────────┐
       (no row)  ──────►│      draft      │
                        └────────┬────────┘
                                 │ updateListing({status:"active"})
                                 │  └─ requires verification + active Stripe Connect
                                 ▼
                        ┌─────────────────┐
            ┌──────────►│     active      │◄────────────┐
            │           └────────┬────────┘             │
            │                    │                      │
            │ updateListing      │ updateListing        │ updateListing
            │ ({status:"active"})│ ({status:"paused"})  │ ({status:"active"})
            │                    │                      │
            │           ┌────────▼────────┐             │
            │           │     paused      │─────────────┘
            │           └────────┬────────┘
            │                    │ deleteListing()  (soft-close)
            │                    ▼
            │           ┌─────────────────┐
            └───────────│     closed      │   ◄── terminal
                        └─────────────────┘
```

Notes:

* `closed` is reached only via `deleteListing`, which is a *soft* close — the
  row stays for order history. There is no admin path to take a closed listing
  back to `active`; per the schema the enum permits it but the route does not
  surface a way to do so.
* `updateListing` re-runs `checkListingEligibility(..., requireConnect: true)`
  only on the `paused→active` / `draft→active` transition, not on a no-op
  `active→active` save. That is correct, but means an agent that *loses* its
  Stripe Connect activation later will still keep the listing live — see §3.

### 1.2 Order lifecycle (Stripe-rail; non-milestone)

```
        createOrder()
        ┌──────────────────┐
        │ payment_pending  │  ◄── Stripe PI created in capture_method=manual
        └────────┬─────────┘
                 │ confirmPayment() (buyer confirms PI on client)
                 │   └─ verifies PI.status == "requires_capture"
                 ▼
        ┌──────────────────┐         submitTask() spawns assigned task here
        │     pending      │
        └────────┬─────────┘
                 │ confirmOrder() (seller accepts)
                 │   └─ Stripe capture (no transfer yet)
                 ▼
        ┌──────────────────┐
        │    confirmed     │
        └────────┬─────────┘
                 │ (no explicit transition — completeOrder accepts both)
                 ▼
        ┌──────────────────┐                cancelOrder()
        │   in_progress    │──────────────────────────────┐
        └────────┬─────────┘                              │
                 │ completeOrder() (seller)               │
                 │   └─ atomic CAS on status              │
                 │   └─ Stripe transfer to seller Connect ▼
                 │   └─ writes payoutLedger + 3 paymentLedger rows
                 │                                ┌──────────────────┐
                 ▼                                │    cancelled     │
        ┌──────────────────┐                      │   (refund + tx   │
        │    completed     │ ◄── terminal         │    reversal if   │
        └──────────────────┘                      │    captured)     │
                                                  └──────────────────┘
                                  openDispute() (any party, any non-terminal status)
                                                      │
                                                      ▼
                                            ┌──────────────────┐
                                            │     disputed     │
                                            └──────────────────┘
                                              (resolved by admin →
                                               cancelled or completed)
```

### 1.3 Order lifecycle (milestone branch)

```
  createOrder() ──► payment_pending
                          │
                          │ POST /orders/:id/milestones (buyer adds N milestones)
                          │   └─ creates one PI per milestone
                          │   └─ cancels the order-level PI (if Stripe rail)
                          │
                          │ confirmPayment() — SKIPS the PI verification step
                          │   because hasMilestones is true; only flips status
                          ▼
                       pending ──confirmOrder()──► confirmed
                                                       │
                                                       │ (per-milestone loop)
                                                       │
                       ┌──────── milestone state ──────┘
                       ▼
              ┌────────────────┐
              │    pending     │  ◄── milestone created, PI uncaptured
              └───────┬────────┘
                      │ markMilestoneComplete() (seller)
                      ▼
              ┌────────────────┐
              │   completed    │
              └───────┬────────┘
                      │ releaseMilestoneEscrow() (buyer)
                      │   └─ Stripe capture per-milestone PI
                      │   └─ Stripe transfer to seller Connect
                      │   └─ atomic CAS, writes payout + ledger
                      ▼
              ┌────────────────┐
              │    released    │   ◄── terminal for milestone
              └────────────────┘

  All milestones released ──► completeOrder() succeeds (CAS check)
  Any milestone unreleased ──► completeOrder() returns MILESTONES_NOT_RELEASED
```

### 1.4 Dispute lifecycle

```
  any non-terminal order ── openDispute() ──► order.status = "disputed"
                                                      │
                                                      ▼
                                            ┌──────────────────┐
                                            │       open       │
                                            └────────┬─────────┘
                                                     │ respondToDispute() (counterparty)
                                                     ▼
                                            ┌──────────────────┐
                                            │    responded     │
                                            └────────┬─────────┘
                                                     │ admin resolveDispute()
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                     refund_buyer            release_seller              split
                     (Stripe refund)         (Stripe capture)        (50% refund,
                     order→cancelled         order→completed           rest captured)
                     seller agent gets       buyer agent gets        no trust penalty
                     dispute_lost (-8)       dispute_abusive (-8)    (intentional)
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │     resolved     │   ◄── terminal
                                            └──────────────────┘
```

### 1.5 A2A engagement & service-call lifecycle

```
                user creates engagement (UI flow)
                          │
                          ▼
                ┌────────────────────┐
                │ a2aEngagement row  │ ── spendingCapUsdc, paymentModel,
                │  status = active   │    pricePerUnit captured here
                └────────┬───────────┘
                         │
                         │ caller agent posts /a2a/services/:id/call
                         │   └─ x402 settlement (chain), receipt signed
                         │   └─ payout_queue insert (provider)
                         │   └─ engagement row NOT incremented on this branch
                         │
                         │ caller agent posts /a2a/services/:id/execute
                         │   └─ checkA2ASpendingRules(agent, cents)
                         │      ── consults agentSpendingRulesTable, NOT
                         │         the engagement.spendingCapUsdc
                         │   └─ delegation JWT signed (5-min ttl)
                         │   └─ HTTP forward to provider endpointUrl
                         │   └─ a2a_service_calls insert (success/failed/timeout)
                         │   └─ engagement.callCount++ + totalSpentUsdc
                         ▼
                ┌────────────────────┐
                │   a2aServiceCall   │  status ∈ {success, failed, timeout}
                │  + signed receipt  │  receipt covers (callId, both DIDs,
                │  + provider payout │   amount, executionMs, timestamp)
                └────────────────────┘
```

### 1.6 Job post lifecycle

```
              POST /jobs (poster)
                    │
                    ▼
              ┌──────────┐
              │   open   │ ◄── proposalsCount counter incremented as
              └────┬─────┘     proposals come in (no cap)
                   │
        ┌──────────┼──────────────────────────────────────────┐
        │          │                                          │
        │          │ POST /jobs/:id/accept-proposal            │ expireJobs() tick
        │          │   └─ creates linked order (linkedOrderId) │   (setInterval, 60s)
        │          ▼                                          ▼
        │   ┌──────────┐                                ┌──────────┐
        │   │ in_progress │ ◄── linked task / order   │ expired  │  ◄── terminal
        │   └────┬─────┘     drives this transition    └──────────┘
        │        │ poster marks complete
        │        ▼
        │   ┌──────────┐
        │   │completed │  ◄── terminal
        │   └──────────┘
        │
        │ updateJob({status:"cancelled"}) (poster)
        ▼
   ┌──────────┐
   │cancelled │  ◄── terminal
   └──────────┘
```

---

## 2. Correctness of state transitions

### 2.1 Confirmed-correct invariants

* **Order CAS on completion** — `completeOrder` updates with
  `WHERE status IN ('confirmed','in_progress')` and treats zero-row update as
  `ORDER_ALREADY_COMPLETED`. A second concurrent caller cannot double-trigger
  payouts. (`services/orders.ts:305-321`)
* **Cancel CAS** — `cancelOrder` mirrors this with `status NOT IN
  ('completed','cancelled')`. (`services/orders.ts:615-626`)
* **Milestone release CAS inside transaction** — release uses
  `WHERE status='completed'` and rolls the txn back with
  `MILESTONE_ALREADY_RELEASED`. The Stripe capture itself uses an
  idempotency key (`milestone_capture_${id}`) and the transfer uses
  `milestone_transfer_${id}`. (`services/marketplace-milestones.ts:268-318`)
* **`completeOrder` blocks unreleased milestones** with a clear
  `MILESTONES_NOT_RELEASED` error including the offending titles. Without this,
  the order-level capture path could double-charge a milestone order whose
  per-milestone PIs are still live.
  (`services/orders.ts:284-302`)
* **Dispute responder must be the counterparty** —
  `respondToDispute` blocks `dispute.raisedByUserId === userId` with
  `CANNOT_RESPOND_TO_OWN_DISPUTE`. (`services/disputes.ts:166-168`)
* **Order-level PI is cancelled when milestones are introduced**. This is the
  single most important monetary invariant in the milestone branch: without it
  the buyer would have both an order-level hold and per-milestone holds against
  their card. The cancellation runs only when `paymentRail === "stripe"`.
  (`services/marketplace-milestones.ts:61-71`)

### 2.2 Issues and risks

#### M-01 (high) — `createOrder` Stripe PI lacks an idempotency key

`stripe.paymentIntents.create({...})` in `services/orders.ts:69-91` is called
with no idempotency key. The ordinary buyer flow is "click Buy → POST
/listings/:id/order → Stripe.js confirms the returned client_secret". If the
network double-sends the POST (single-page apps, browser retries on 5xx,
operator double-click, mobile keepalive replays) the API will create **two**
PaymentIntents and only persist the second one in `marketplaceOrdersTable.providerPaymentReference`. The first PI sits in `requires_payment_method` /
`requires_confirmation` until it expires 24h later, holding nothing on the
card; that is harmless but it does pollute the Stripe dashboard.

The more material variant: if the POST succeeded server-side but the client
saw a timeout and retried, both PIs may end up confirmed by the buyer (some
Stripe.js paths can confirm a PI from a stale `clientSecret` attached to a
prior order draft); only the order row points to the second PI. The first is
silently captured at `confirmOrder`/`completeOrder` time… except there's no
order pointing to it, so it never is. Funds would clear and then auto-refund
when the PI uncapturable window passes.

The fix is one line — `{ idempotencyKey: ${input.listingId}_${input.buyerUserId}_${input.selectedPackage ?? 'default'} }` on the create call. The
milestone PI loop has the same issue
(`services/marketplace-milestones.ts:42-58`).

#### M-02 (medium) — `confirmPayment` accepts milestone orders without verifying *any* milestone PI

`services/orders.ts:151-169` checks the order-level PI status only when
`hasMilestones === false`. When milestones exist the function logs "skipping
order-level PI validation; milestones hold their own escrow" and flips status
to `pending`. Combined with the fact that **the buyer is not actually required
to have authorized any milestone PI before this happens**, a buyer can:

1. POST `/listings/:id/order` (creates order, status `payment_pending`).
2. POST `/orders/:id/milestones` with N milestones (creates per-milestone PIs).
3. POST `/orders/:id/confirm-payment` *without ever confirming any milestone
   PI* (status flips to `pending`, `submitTask` fires, the seller agent is
   notified of work).
4. The seller now sees an "incoming work" notification for an order whose
   actual cash holds are zero — every milestone release will fail at
   `releaseMilestoneEscrow` with `PAYMENT_INTENT_INVALID_STATE`.

This is not a fund-loss bug (the seller cannot extract money), but it is an
abuse vector for free-loading a seller agent's compute / time. The milestone
release path correctly refuses to release uncaptured PIs
(`services/marketplace-milestones.ts:212-217`), so the *outcome* is bounded,
but the failure mode is invisible until the buyer tries to release.

Suggested guard: in `confirmPayment` for the milestone branch, verify that at
least one milestone PI is in `requires_capture` before launching the task; or
require that *every* milestone PI is. The milestone branch in `createMilestones`
already returns the client secrets so the front end has the means to confirm
them.

#### M-03 (medium) — `updateListing` PATCH forces all fields via wrong schema

`v1/marketplace.ts` (around the PATCH `/listings/:listingId` handler) parses
the body with `createListingSchema.omit({...})` rather than a partial of it
(`updateListingSchema = createListingSchema.partial()` does not exist in this
file). The result is that a single-field PATCH like
`{ "status": "paused" }` returns `VALIDATION_ERROR: title is required`. The
service-layer signature `UpdateListingInput` is fully optional
(`services/marketplace.ts:35-47`), so this is a route-only break.

The frontend `MarketplaceListing.tsx` works around this by always re-sending
the full listing body — but any third-party API consumer using the documented
`PATCH` semantics will fail.

#### M-04 (medium) — A2A `/execute` ignores per-engagement spending cap

`POST /a2a/services/:serviceId/execute` calls `checkA2ASpendingRules(callingAgent.id, amountCents)`
(`v1/a2a.ts:676-679`). That helper reads from `agentSpendingRulesTable`, which
is a *global, per-agent* config set by the agent owner. The
`a2aEngagementsTable.spendingCapUsdc` field — surfaced in the UI as the
engagement's "spending cap" and even validated on engagement creation — is
never consulted on the execute path. `engagement.totalSpentUsdc` is incremented
*after* the call (so even if a future check were added, it would not stop the
call that pushed it over the cap).

Practical effect: a buyer who creates an engagement with `spendingCapUsdc=10`
will keep getting billed up to whatever their global agent rule is (default
$100/day in the rules table). The cap displayed on the engagement card is
cosmetic.

The `/call` branch has the same shape — both paths use
`checkA2ASpendingRules` only.

#### M-05 (medium) — Engagement call history queries by tuple, not engagement

`GET /a2a/engagements/:id/calls` (`v1/marketplace.ts:932-960`) selects calls
by `(callerAgentId, serviceId, userId)` rather than by `engagement_id`. The
inline comment justifies this as backwards-compat for calls made before the
engagement_id column existed.

Failure case: a user creates engagement A against service S from agent X with
spendingCap=5, exhausts it, then creates engagement B against the same S from
the same X with cap=20. The "calls" view of engagement A will now also show
the calls billed against engagement B (and vice versa), and the summary
counters on the engagement row will diverge from the call list because the
counters *are* incremented per-engagement (`v1/a2a.ts:920-936`).

Fix: prefer `engagement_id = :id` and only fall back to the tuple when
`engagement_id IS NULL`, or expose a one-shot backfill that stamps the
engagement_id on legacy rows.

#### L-01 (low) — Dispute `split` resolution hard-codes 50/50

`services/disputes.ts:276-303` computes `refundCents = Math.floor(fullCents/2)`
unconditionally for `resolution === "split"`. The admin UI captures
`adminNote` but offers no way to specify a split percentage; the operator
cannot, e.g., refund 30% / release 70%. The trust-score side-effect path also
explicitly applies *no* penalty for `split`
(`v1/admin.ts:649-656`), which is reasonable for a true 50/50 but becomes
miscalibrated if the actual "split" is mostly buyer-favourable or
mostly-seller favourable. As a "MVP semantics" choice this is fine; flag it as
a known constraint of the operator UX.

#### L-02 (low) — Dispute resolution email send is best-effort but non-transactional

`resolveDispute` writes the dispute → resolved row inside a transaction, then
sends emails *outside* it (`services/disputes.ts:313-363`). If the process
crashes between commit and email send, the audit-trail will say "resolved" but
neither party will be notified. This is consistent with the rest of the
codebase's treatment of email and is fine, but worth recording: there is no
"resend resolution email" admin action.

#### L-03 (low) — `confirmOrder` skips capture for milestone orders but still flips state

`services/orders.ts:240-250` skips the capture call when `hasMilestones`. That
is the correct semantic, but it also flips `status → confirmed` which then
makes the order eligible for `completeOrder` *before* every milestone is
released. The downstream guard
(`completeOrder.MILESTONES_NOT_RELEASED`) catches this, so it is a UX issue
not a correctness one — the seller may attempt to "complete" a milestone
order multiple times and only get a 409 each time.

#### L-04 (low) — Listing `closed` is not a true terminal state

`updateListing` does not validate that `status` is changing from a
non-`closed` row, and `deleteListing` does. So an admin (or an owner with the
listing id) can technically PATCH a closed listing back to `paused` /
`active`. The `paused→active` transition re-runs Stripe Connect eligibility
so this is benign, but it means "closed" and "paused" are semantically the
same row and the UI just treats one as deleted.

---

## 3. Monetary safety

### 3.1 Where money enters and leaves

| Surface | Authorisation | Capture | Transfer | Refund | Reversal on cancel |
| --- | --- | --- | --- | --- | --- |
| Order (Stripe) | PI manual capture at `createOrder` | `confirmOrder` | `completeOrder` Connect transfer | `cancelOrder` (captured branch) | Yes — `transfers.createReversal` with idempotency |
| Milestone | per-milestone PI manual capture | `releaseMilestoneEscrow` | Same call, Connect transfer | (none — no milestone-level cancel/refund path) | **No** |
| A2A `/call` (x402) | on-chain settlement | n/a (atomic) | provider payout queue | (none) | n/a |
| A2A `/execute` (HTTP) | none — billed after success | n/a | provider payout queue | (none) | n/a |

### 3.2 Findings

* **F-01 (high) — Milestone release has no reversal path.** If a milestone
  release executes the Stripe capture *and then* the Stripe transfer fails,
  the catch block (`services/marketplace-milestones.ts:260-266`) only logs and
  marks the payout as `pending_manual_payout`. The buyer's funds have already
  been captured by the platform and are sitting on the platform's Stripe
  balance with no automated path to either pay the seller or refund the buyer.
  Compare with `cancelOrder` which explicitly reverses transfers. There is no
  `cancelMilestone` route at all; once a milestone is `released` it is
  terminal.

* **F-02 (medium) — Milestone payout note is wrong on Stripe Connect failure.**
  When `transfers.create` throws inside the milestone release, the catch only
  resets `milestonePayoutStatus = "pending_manual_payout"` — it does **not**
  reset `stripeTransferId`, but `stripeTransferId` is initialised to `null`
  before the try, so this is fine. However, the surrounding payoutLedger row
  records `payoutType: "milestone_release"` and the user-visible payout
  history (audit 06 territory) will show this as "pending" without any
  actionable error. Operators must read API logs to find out why.

* **F-03 (medium) — A2A `/execute` charges the caller before payout-queue
  insert succeeds.** The flow at `v1/a2a.ts:837-873` increments service call
  count, signs the receipt, then attempts the payout-queue insert in a
  try/catch. If the insert fails (e.g. db hiccup) the caller has been billed
  in `engagement.totalSpentUsdc` and sees a successful response with a signed
  receipt, but the provider has no payout row. The fallback at the `/call`
  branch (`v1/a2a.ts:511-535`) writes an `agent_activity_log` row marked
  `a2a.payout_fallback` so an operator can reconcile; the `/execute` branch
  does **not** do this. Either copy the activity-log fallback or invert the
  ordering (insert payout first, then increment counters).

* **F-04 (low) — `createOrder` accepts a `selectedPackage` that does not match
  any package** is correctly rejected (`PACKAGE_NOT_FOUND`,
  `services/orders.ts:58-60`), but the listing-level `priceAmount` is used as
  the fallback when no package is selected — even on listings that *only*
  define packages and have a null `priceAmount`. The `Number(null) === 0`
  coercion would silently create a $0 order. Verify the listing creation
  schema mandates a non-null `priceAmount` for "no packages" listings, or
  reject `priceAmount === 0` explicitly in `createOrder`.

* **F-05 (low) — `cancelOrder` records the platform fee reversal row even
  when the platform fee was never written.** The completed-order ledger writes
  three rows (payment, fee, payout); `cancelOrder` writes two (refund + fee
  reversal) regardless of whether `completeOrder` actually wrote them. For
  orders cancelled before `completeOrder` runs (i.e. `confirmed` and
  `in_progress` states without a successful `completeOrder` call), the
  platform-fee-reversal entry is bogus — there's no original entry to reverse.
  This shows up in the ledger as a phantom fee credit. Workaround: only write
  the reversal pair if a corresponding `entryType: "platform_fee"` row
  already exists.

* **F-06 (low) — Platform fee rate is duplicated in two places.**
  `services/marketplace.ts` defines `PLATFORM_FEE_RATE = 0.10` and
  `marketplace-milestones.ts:238` redefines `platformFeeRate = 0.10`. A single
  shared constant would prevent drift the next time pricing changes.

* **F-07 (info) — Refund of a `release_seller` after capture is impossible.**
  Once `resolveDispute({resolution:"release_seller"})` captures the PI, an
  operator who later realises the resolution was wrong has no admin route to
  reverse it (no `re-open dispute`, no `admin/orders/:id/refund`). For a
  marketplace this is normally fine because Stripe disputes can still be
  filed by the cardholder, but it is worth surfacing as a known gap.

### 3.3 Idempotency posture summary

| Operation | Idempotency key | Duplicate-safe? |
| --- | --- | --- |
| Order PI create | **none** | No — see M-01 |
| Order capture | `order_capture_${orderId}` | Yes |
| Order Connect transfer | `order_transfer_${orderId}` | Yes |
| Order transfer reversal | `order_reversal_${orderId}` | Yes |
| Milestone PI create | **none** | No — same shape as M-01 |
| Milestone capture | `milestone_capture_${milestoneId}` | Yes |
| Milestone Connect transfer | `milestone_transfer_${milestoneId}` | Yes |
| Dispute refund | none (delegated to `refundProviderPayment`) | depends on provider impl |
| A2A payout queue insert | `callId` is unique constraint (one row per call) | Yes |

---

## 4. Anti-abuse posture

### 4.1 What is in place

* **Marketplace listing eligibility** — only verified, active agents whose
  owners have the right plan can publish (`services/marketplace.ts:73-98`).
  Stripe Connect activation is required for the `→active` transition.
* **Reviews provider sybil filter** — `trust-score.ts:162-193` filters
  reviews by `(rating between 1 and 5)`, joined to a marketplace order with
  `priceAmount > 0`. Free / promotional listings cannot generate trust score.
* **Dispute response gate** — only the counterparty can respond.
* **Order self-purchase block** — `createOrder` returns
  `CANNOT_ORDER_OWN_LISTING` (`services/orders.ts:47-49`).
* **A2A delegation JWT** — short-lived (5 min), audience-bound to the
  provider's endpoint, includes call_id as `jti`.
* **Order/dispute participant auth** — every read path filters by
  `(buyerUserId === userId OR sellerUserId === userId)`.
* **Job-board verification gates** — `verifiedOnly` and `minTrustScore`
  filters on job posts (schema-level, enforced in proposals service).
* **A2A receipt signing** — `signA2AReceipt` produces a base64 receipt + sig
  on every completed call; provider can replay it for the buyer's records.
* **Spending rules table** — global per-agent A2A daily / per-call cap.

### 4.2 Gaps

* **A-01 (medium) — Job board has no per-poster rate limit.** `POST /jobs`
  goes straight to `createJob`. There is no per-user throttle, no captcha, no
  budget bound, no minimum trust to post. A single spammer can flood the
  board with junk listings at line speed; the bidder UX (Jobs.tsx) loads all
  open jobs with pagination but no anti-spam scoring. Combined with the open
  search/index in `listJobs`, this is the most likely abuse vector against
  marketplace surfaces.

* **A-02 (medium) — A2A engagement creation has no cap.** Same shape — a
  single user can create unlimited engagements against the same service from
  the same agent. Coupled with M-05 above (call history mis-attribution), an
  attacker can create thousands of engagements as a denial-of-clarity attack
  on a high-volume buyer's dashboard.

* **A-03 (low) — Dispute reason / description is free-text up to 255 / no
  limit.** `disputeSchema.description` is an unbounded `z.string().optional()`
  (`v1/marketplace.ts:617-621`). The DB column is `text` so length isn't
  bounded there either. A dispute description is shown to the seller in
  email; an attacker could submit a 1MB body containing HTML the email
  renderer might mishandle. Cap to ~4 KB and strip HTML on send.

* **A-04 (low) — A2A `/execute` payload size cap is on the request body
  only.** The 64 KB guard at `v1/a2a.ts:683-686` measures
  `JSON.stringify(payload)` *after* parsing (so multi-MB JSON is already in
  memory by the time we check). Front the route with the existing express
  body-parser limit, or check `req.headers['content-length']` first.

* **A-05 (low) — Provider response is never size-bounded.** The fetch in
  `/execute` does `await providerResponse.json()` (`v1/a2a.ts:769-771`)
  without a size limit. A malicious provider could return gigabytes of JSON
  and OOM the API.

* **A-06 (low) — `/a2a/registry` and `/a2a/services` duplicate data with
  divergent shapes.** `v1/marketplace.ts:727` and the registry endpoint in
  `v1/a2a.ts` (the `/services` GET handler) serve the same underlying rows
  but the keys differ (`pricing.amount` vs `pricePerCallUsdc`,
  `agentHandle` vs `handle` etc.). Not a security risk, but new clients
  bind to one shape and break when they hit the other. Consolidate or
  deprecate the marketplace one.

* **A-07 (low) — Dispute "abusive buyer" trust event applies even when the
  outcome was based on insufficient evidence.** `release_seller` always
  applies `dispute_abusive` weight 8 to the buyer's first agent (by
  createdAt). If the buyer has no agent yet (raw user-only account), no
  penalty is recorded — a buyer can dispute multiple times with no agent and
  bear no trust cost. Tie penalties to the user-facing reputation model, not
  just the agent.

### 4.3 Spending caps actually enforced

| Cap source | Enforced on `/call` | Enforced on `/execute` | Enforced on Stripe order |
| --- | --- | --- | --- |
| Engagement `spendingCapUsdc` | No | No | n/a |
| `agentSpendingRulesTable` global | Yes | Yes | n/a |
| Plan-level `canListOnMarketplace` | n/a | n/a | Yes (listing creation) |
| Per-listing daily order limit | n/a | n/a | **None** |

The "per-listing daily order limit" is something the listing UX implies in
copy but is not enforced server-side; for the v1 launch this is acceptable,
but flag it for orchestrator agents that can place dozens of orders from one
account in a few minutes (especially during beta when fraud detection is
sparse).

---

## 5. UX of failure modes

### 5.1 Errors with good UX

* `MILESTONES_NOT_RELEASED` returns the offending titles + statuses so the
  seller knows exactly which milestone to chase.
  (`services/orders.ts:292-302`)
* `CANNOT_RESPOND_TO_OWN_DISPUTE` is plumbed all the way to a 403 with a
  distinct error code (`v1/marketplace.ts:684-697`).
* `ORDER_ALREADY_COMPLETED` and `MILESTONE_ALREADY_RELEASED` are explicit,
  separate error codes from the generic 409 — clients can branch on them.
* Admin dispute resolve UI shows per-card success / error messages with
  unique data-testids (`pages/AdminDisputes.tsx:200-202`).

### 5.2 Errors with bad UX

* **U-01 (medium) — `PAYMENT_INTENT_FAILED` collapses every Stripe error.**
  `createOrder` catches all Stripe errors and returns the literal string
  `"PAYMENT_INTENT_FAILED"`. The buyer-side UI cannot distinguish "card
  declined" from "Stripe API outage" from "platform fee misconfigured".

* **U-02 (medium) — `STRIPE_CAPTURE_FAILED: <message>` leaks raw Stripe
  message strings to the buyer.** `releaseMilestoneEscrow` returns the raw
  `err.message` in the error body
  (`services/marketplace-milestones.ts:218-222`). For most Stripe errors this
  is helpful, but some include card BIN ranges, IP, or partial PAN suffixes
  in the failure reason. Sanitise to a small allowlist.

* **U-03 (medium) — Engagement spending-cap violation message is misleading.**
  `checkA2ASpendingRules` returns "spending cap exceeded" using the *global*
  rules cap, but the UI shows the engagement cap. A user who set engagement
  cap = $10 sees the cap exceeded error fire at the global cap (e.g. $100)
  with no obvious connection to the displayed value. (See M-04.)

* **U-04 (low) — Admin dispute UI auto-stores the admin key in
  sessionStorage** — `pages/AdminDisputes.tsx:9-11` reads from
  `sessionStorage('agentid:admin_key')` and writes back on first successful
  load. Fine for an internal tool, but it means the admin key is recoverable
  from the browser DevTools storage panel. Consider asking on every load (no
  storage) for an operator-grade tool.

* **U-05 (low) — Dispute `resolved` view doesn't show the final paymentAction.**
  Admin UI displays `dispute.resolution` post-resolve but not `paymentAction`
  (refunded / captured / split / skipped). When a `release_seller` resolution
  is marked but Stripe capture was a no-op (already-captured branch), the
  operator has no UI signal that no money moved.

* **U-06 (low) — A2A call failure response leaks provider HTTP body to
  caller.** The 502 PROVIDER_ERROR includes
  `{ provider_status, provider_body }` (`v1/a2a.ts:799-803`) — this is
  exactly what a debugging caller wants but means a provider's internal stack
  trace can be relayed to anyone who calls them. For paid providers this is
  probably the right tradeoff; document it as intentional.

* **U-07 (low) — `BuyerOrders.tsx` and `Marketplace.tsx` do not surface
  payout status to the buyer.** When a seller completes an order and the
  Stripe Connect payout falls back to `pending_manual_payout`, the buyer's
  view shows `completed` and the seller's view (`MyListings`) shows
  `completed` — neither shows that funds have not actually moved. Power
  sellers will discover this only via the payout history page.

### 5.3 Concurrency & retry UX

* The buyer-side `confirm-payment` flow is **not** idempotent at the route
  level (no per-order key); however, the underlying state-machine guard
  (`if (order.status !== "payment_pending") return INVALID_STATUS`) makes a
  duplicate call return `INVALID_STATUS:pending`. This is functionally
  correct but reads as a "you broke something" error to the buyer rather than
  "we already processed this".
* Same for `complete-order` — the second concurrent request returns
  `ORDER_ALREADY_COMPLETED` which is a fine code to branch on but the
  default UI shows it as a generic error toast.
* The job-expiry runner (see below) has no guard against running on multiple
  replicas. `expireJobs` does an `UPDATE ... WHERE status='open' AND expiresAt
  < now()` which is racy-but-safe (worst case: two replicas log the same
  expiration); however, the side-effects emitted in `logJobEvent` will fire
  twice per replica per minute, polluting analytics.

---

## 6. Process & worker observations

* **The "job-expiry worker" is a `setInterval` in `index.ts`.** There is no
  `workers/job-expiry.ts`. `startJobExpiryRunner` is wired regardless of
  whether Redis is available, every API replica runs it, every 60s with no
  jitter. (`artifacts/api-server/src/index.ts:97-113`) This is the simplest
  possible scheduler and works for a single-replica deployment, but should be
  promoted to a queue-backed worker (alongside `trust-recalculation`,
  `handle-lifecycle`, etc.) before horizontal scale-out. There is also no
  `recordWorkerSuccess`/`recordWorkerFailure` instrumentation — health
  endpoints will not see this worker at all.

* **`trust-recalculation` is the right pattern** — paginated batches,
  worker-failure recording, leader-elected via Redis at startup. Use it as
  the template for a future job-expiry worker.

* **No worker exists for cleaning up `payment_pending` orders that never get
  confirmed.** A buyer who initiates `createOrder` and abandons the flow
  leaves an order in `payment_pending` forever. The PI Stripe-side will
  eventually expire (24h default) but the order row will not. There's no
  janitor. Consider a 1h sweeper that cancels unconfirmed orders.

---

## 7. Summary of findings

| ID | Sev | Area | One-liner |
| --- | --- | --- | --- |
| M-01 | high | Orders | `createOrder` Stripe PI lacks an idempotency key |
| F-01 | high | Milestones | Released milestone with failed transfer has no reversal |
| M-02 | medium | Orders | `confirmPayment` accepts milestone orders without verifying any milestone PI |
| M-03 | medium | Listings | PATCH `/listings/:id` forces all fields (wrong schema) |
| M-04 | medium | A2A | Engagement `spendingCapUsdc` is never enforced server-side |
| M-05 | medium | A2A | Engagement call history queries by tuple, leaks across engagements |
| F-02 | medium | Milestones | Failed Connect transfer leaves payout note empty of reason |
| F-03 | medium | A2A | `/execute` charges caller before payout-queue insert; no fallback log |
| A-01 | medium | Jobs | No per-poster rate limit on job creation |
| A-02 | medium | A2A | No cap on engagement creation per (user, agent, service) |
| U-01 | medium | Orders | `PAYMENT_INTENT_FAILED` collapses every Stripe error |
| U-02 | medium | Milestones | Raw Stripe error messages reach the buyer |
| U-03 | medium | A2A | Spending-cap error references wrong cap value |
| L-01 | low | Disputes | `split` resolution hard-coded 50/50 |
| L-02 | low | Disputes | Resolution emails are non-transactional with no resend |
| L-03 | low | Orders | Milestone `confirmOrder` flips status before any milestone released |
| L-04 | low | Listings | `closed` is not enforced as terminal |
| F-04 | low | Orders | `Number(null) === 0` could create $0 orders on package-only listings |
| F-05 | low | Orders | Cancel writes a fee-reversal entry even when no fee was charged |
| F-06 | low | Marketplace | Platform fee constant duplicated across two files |
| F-07 | info | Disputes | No admin path to reverse a `release_seller` after capture |
| A-03 | low | Disputes | Dispute description is unbounded text |
| A-04 | low | A2A | `/execute` payload-size guard runs after JSON.parse |
| A-05 | low | A2A | Provider response is not size-bounded |
| A-06 | low | A2A | `/a2a/registry` and `/a2a/services` duplicate data with divergent shapes |
| A-07 | low | Disputes | Buyers without agents bear no trust penalty for abusive disputes |
| U-04 | low | Admin | Admin key persists in sessionStorage |
| U-05 | low | Admin | Resolved dispute view omits paymentAction |
| U-06 | low | A2A | Provider error body is relayed to caller (intentional, document it) |
| U-07 | low | Orders | Buyer view does not surface `pending_manual_payout` |
| W-01 | medium | Workers | Job-expiry runner is a `setInterval` in `index.ts`; no leader, no metrics |
| W-02 | low | Workers | No janitor for stale `payment_pending` orders |

The two highest-leverage fixes — adding an idempotency key to `createOrder`'s
PI creation (M-01) and a transfer-failure reversal path on milestone release
(F-01) — are each a few lines and would close the only failure modes that
require manual platform-side reconciliation. M-04, M-05 and A-01 are the
easiest user-trust wins after that.
