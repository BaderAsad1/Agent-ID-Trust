# Audit 02 — Data Integrity & Race Conditions

**Scope:** All durable write paths in `artifacts/api-server/` (services, routes, workers).
**Out of scope:** Performance, code fixes — this is an audit only.
**Method:** Static read of every service / route / worker that performs `db.insert`, `db.update`, `db.delete`, `db.transaction`, plus all paths that combine an external (Stripe / on-chain / mail) side-effect with a DB write. Schema-level constraints verified against `lib/db/src/schema/*.ts`.

> **Revision history**
> - v2 (after first code review): C1 and C2 corrected (atomic claim **does** run before Stripe in `completeOrder`; Stripe calls in `releaseMilestoneEscrow` are idempotent via stable keys). C5 reworded to acknowledge that `agent_ows_wallets.agent_id` carries a unique index — race is on the on-disk vault, not the DB row. H6 corrected (`anchorAttempts` is incremented atomically via SQL `jsonb_set(... + 1)`, not JS read-modify-write). Severity counts updated. The remaining issues in those code paths are still real, but the central evidence and severities now match the implementation.

Severities:
- **Critical** — Can cause silent fund loss, double-payout, or permanent user lockout under realistic concurrency / retry conditions.
- **High** — Can corrupt durable state (orphan rows, divergent ledger ↔ Stripe truth, lost benefit) under realistic concurrency / crash conditions.
- **Medium** — TOCTOU window protected by a downstream constraint or compensating action; rare but exploitable.
- **Low** — Cosmetic / observability gap (audit row drift, log loss) with no money or identity impact.

---

## C1. `disputes.resolveDispute` issues Stripe refund **outside** the dispute-state tx — repeatable double-refund on operator retry
**Severity:** Critical
**File:** `artifacts/api-server/src/services/disputes.ts:210-366`

### Evidence
- Pre-check at lines `227-234` is a non-transactional `findFirst` followed by JS `dispute.status === 'resolved'` check → TOCTOU.
- The Stripe `refundProviderPayment` calls at lines `243` (full) and `281` (split) **do not pass any idempotency key** to the underlying Stripe API. Verified in `services/payment-providers.ts:146-156`: `refundPayment` has no `idempotencyKey` parameter and the Stripe SDK call is `stripe.refunds.create(params)` with no second-arg request options.
- The ledger inserts at lines `249-265` and `287-303` are **outside** the dispute/order UPDATE transaction at lines `313-332`.
- The dispute → resolved UPDATE (line 314) is the actual claim, but it runs **after** money has moved.

### Repro hypothesis
1. Operator clicks "Resolve → refund_buyer" twice in rapid succession (or two operators do).
2. Both pass the `dispute.status === 'resolved'` JS check.
3. Both call `refundProviderPayment` → two real refunds at Stripe (no idempotency key).
4. Both insert two `payment_ledger` rows for the same refund. (`payment_ledger` schema at `lib/db/src/schema/payment-ledger.ts:14-45` has no unique constraint that would block this — only ordinary indexes.)
5. Both reach the dispute UPDATE; one wins, one is a no-op.

Net result: buyer gets refunded **twice**, two ledger rows created, dispute marks resolved once.

### Fix recommendation
- Pass `idempotencyKey: dispute_refund_${dispute.id}` to `stripe.refunds.create` via `refundProviderPayment` (will require widening the provider interface to accept request options).
- Wrap the dispute claim, order status update, and ledger inserts in a single transaction — and only call Stripe **after** flipping the dispute row to a durable `resolving` intermediate state via `UPDATE … WHERE status IN ('open','responded')`.
- Add a unique partial index on `payment_ledger(relatedOrderId, entryType, metadata->>'reason')` to make the duplicate refund row a constraint violation rather than a silent duplicate.

---

## C2. `cancelOrder` issues refund + transfer reversal **before** the atomic cancel UPDATE — silent double-refund on retry
**Severity:** Critical
**File:** `artifacts/api-server/src/services/orders.ts:518-628`

### Evidence
- Refund call at lines `537-546` (`refundProviderPayment`) — confirmed **no idempotency key** is propagated. `refundProviderPayment` (`services/payment-providers.ts:292-300`) accepts only `(providerName, providerReference, amountInCents?)` and `StripeProvider.refundPayment` (`:146-164`) calls `stripe.refunds.create(params)` with no request-options object.
- Transfer reversal at line `560`: `stripe.transfers.createReversal(transferId, {}, { idempotencyKey: 'order_reversal_${orderId}' })` — only the reversal is idempotent.
- Ledger inserts at lines `570-604` are **not in a tx** with the cancel UPDATE at lines `615-622`.
- The atomic cancel UPDATE only runs at line `615`, **after** money has already moved.

### Repro hypothesis
1. Concurrent `cancelOrder` calls (e.g., buyer clicks "cancel" twice within 200 ms; or front-end retries on transient 502).
2. Both pass the `status` JS check at line 530.
3. Both invoke `refundProviderPayment` → **two refunds issued at Stripe** (no idempotency key).
4. The second reaches the atomic UPDATE (line 615) and gets 0 rows → `ORDER_ALREADY_COMPLETED_OR_CANCELLED`, but the second refund has already been issued.

Even single-call: crash between the refund (line 539) and the ledger inserts (line 570) leaves Stripe refunded with no ledger trail; crash between ledger inserts and UPDATE leaves order in `confirmed` state with refund-shaped ledger rows attached → next cancel retry double-refunds.

### Fix recommendation
- Add `idempotencyKey: order_refund_${orderId}` to `refundProviderPayment` (passed through to `stripe.refunds.create` request options).
- Atomic claim UPDATE must run **first** (move order to a `cancelling` intent state, then `cancelled` after Stripe + ledger succeed) inside a transaction with the ledger inserts.
- Alternative: persist a `refund_pending` payment_ledger row keyed on `(orderId, entryType='refund')` with a unique index, so a retry hits the constraint and short-circuits.

---

## C3. `provisionOwsWallet` writes the on-disk vault **before** the unique-constrained DB insert — DB row may not match the surviving on-disk key
**Severity:** Critical
**File:** `artifacts/api-server/src/services/ows-wallet.ts:32-114`
**Callers:** `routes/v1/bootstrap.ts:339` (setImmediate), `routes/v1/programmatic.ts:666` (setImmediate). Both call sites are fire-and-forget.

### Evidence
- Schema does protect the database side: `lib/db/src/schema/agent-ows-wallets.ts:45` declares `uniqueIndex("agent_ows_wallets_agent_idx").on(table.agentId)`. Concurrent inserts can only produce **one** row.
- However, `createWallet(walletName, undefined, undefined, vaultPath)` at line `57` writes private key material to disk under `OWS_VAULT_PATH/{agentId}` **before** the DB insert at line `72`. The OWS SDK is invoked unguarded from the wallet name + vault path; concurrent invocations both target the same vault directory.
- Because the on-disk vault write happens first and the DB unique constraint only fires at line `72`, the sequence under a concurrent run is:
  1. Caller A enters, finds no existing row.
  2. Caller B enters concurrently, also finds no existing row.
  3. A calls `createWallet(...)` → writes vault file V_A with key K_A.
  4. B calls `createWallet(...)` → vault file V_B with key K_B may overwrite V_A on disk depending on the OWS SDK's atomicity (the SDK is treated as a black box here; this is the residual risk).
  5. A's `db.insert` succeeds, persisting `walletId = K_A`'s id. B's `db.insert` violates the unique constraint and throws.
  6. The surviving DB row references `K_A`, but the surviving on-disk vault is now `K_B` (B's overwrite). All subsequent signing operations either fail (if K_A's key file is gone) or sign with a key that does not match `agents.walletAddress` (if A's address was committed but only K_B is on disk).
- Subsequent partial failures are not transactional: `syncOwsWalletAccounts` (line 89), `agentsTable.walletAddress` UPDATE (line 92) are separate statements outside any tx. Crash between them leaves `agent_ows_wallets` populated but `agents.walletAddress = NULL`.
- The catch block (line 109) re-throws without compensating the on-disk write — a failed DB insert leaves an orphan vault file.

### Repro hypothesis
1. Bootstrap and programmatic verify both fire `setImmediate(provisionOwsWallet)` for the same agent (e.g., user verifies twice through different channels, or a duplicate webhook triggers re-activation).
2. Both `findFirst` returns nothing (cold).
3. Both call `createWallet(...)` → second writes the vault. Whether this overwrites or atomically rejects depends on SDK behaviour, but no callsite-level lock prevents the call sequence.
4. DB insert serialises via the unique constraint; only one row persists, but the vault file may belong to the loser of the DB race.
5. Crash between the wallet insert (line 72) and the agent UPDATE (line 92) leaves `agentsTable.walletAddress = NULL` while `agent_ows_wallets` has a row → users see "wallet provisioning" forever.

### Fix recommendation
- Acquire a Postgres advisory lock keyed on `hashtext(agentId)` at the **start** of `provisionOwsWallet`, hold it through the on-disk vault write + DB inserts. The advisory lock is the only authority that serialises the **disk** write; the unique index only serialises the DB write.
- Wrap the wallet insert + accounts insert + agent UPDATE in a single `db.transaction`. Vault creation should ideally happen **after** the DB row is reserved with a placeholder, with a compensating delete-on-rollback.
- Alternatively, key the on-disk vault path on something derived from a DB-issued primary key (insert first with a placeholder address, then derive vault path from the row id) so that two concurrent inserts target distinct on-disk paths and only the DB constraint matters.

---

## H1. `claimWebhookEvent` resets failed events to `pending` on every redelivery — re-processes side-effects multiple times
**Severity:** High
**File:** `artifacts/api-server/src/services/billing.ts:1576-1641`

### Evidence
- Lines `1593-1603`: when a row exists with status `pending` or `failed`, the helper UPDATEs status back to `pending` and returns `"retrying"` — meaning the webhook handler proceeds with the full handler logic.
- Combined with `routes/v1/webhooks.ts:208-377`: a `failed` finalize at line 375 is the path taken whenever any handler throws. Stripe will redeliver. On redelivery, this code re-runs the full handler. Many handlers (`handleCheckoutCompleted`, `handleInvoicePaid`, `handleSubscriptionCreatedOrUpdated`, `assignHandleToAgent`) write durable state and trigger external side-effects (emails, NFT mints, on-chain reservations).
- Many of those side-effects are **not idempotent** by webhook event ID (e.g., `assignHandleToAgent` is idempotent on handle ownership, but `sendAgentRegisteredEmail` is not key-tracked; `reserveHandlesOnChain` is fire-and-forget; activity log writes are not).

The TOCTOU between the SELECT (1582) and the INSERT (1605) is mitigated by `onConflictDoNothing` at line 1614 — that part is OK. The issue is the **re-processing semantics**, not the row creation.

### Repro hypothesis
1. Stripe delivers `checkout.session.completed` for a paid handle.
2. Handler completes most work (handle assigned, email queued) but throws on the trailing `reserveHandlesOnChain` chain because RPC is briefly unreachable.
3. `finalizeWebhookEvent` writes `failed`.
4. Stripe redelivers in 1 minute.
5. `claimWebhookEvent` resets to `pending`, returns `"retrying"`, handler runs again.
6. `assignHandleToAgent` is idempotent (no-op), but `sendAgentRegisteredEmail` and any activity-log inserts run again — duplicate email, duplicate audit row.

### Fix recommendation
- Track the **last processing attempt outcome** with rich detail (which steps succeeded). On retry, gate each side-effect on its own idempotency marker.
- For Stripe specifically, use a per-event-id `processed` short-circuit only when the handler completed **fully**; for partial-failure recovery, persist a per-step audit row (`webhook_step_completed (eventId, step) UNIQUE`) and skip steps already recorded.
- At minimum, add idempotency-by-event-id to email sends (key off `webhookEventId` in mail tracker) and `logActivity` (`UNIQUE(eventType, payload->>'webhookEventId')`).

---

## H2. `claimIncludedHandleBenefit` historical-claim check is **two statements** outside a tx — cancel-and-resubscribe bypass window via `releaseIncludedHandleClaim`
**Severity:** High
**File:** `artifacts/api-server/src/services/billing.ts:813-882` (non-tx variant); `:889-942` (tx variant is correct).

### Evidence
- Non-tx variant: lines `829-855` perform two **independent SELECTs** (historical claim + legacy agent-metadata claim) **before** the conditional UPDATE at line `860`.
- The conditional UPDATE atomically guards against concurrent claims **on the same active subscription row** (`WHERE id=? AND includedHandleClaimed IS NULL` at lines 867-872), but the cross-row historical guard is racy because `releaseIncludedHandleClaim` (line 949-955) unconditionally NULLs `includedHandleClaimed` with no guard for which handle was originally claimed:
  ```ts
  await db.update(subscriptionsTable)
    .set({ includedHandleClaimed: null, includedHandleClaimedAt: null, ... })
    .where(eq(subscriptionsTable.id, subscriptionId));
  ```
- A delayed compensation flow that NULLs the historical column undermines the historical-claim guard at line 829, opening a window for the user to re-claim on a fresh subscription while still owning the original handle.

### Repro hypothesis
1. User on Starter has `subscriptionA.includedHandleClaimed='alice'` and `agents.handle='alice'`.
2. User cancels Starter → `subscriptionA.status='cancelled'`, but `includedHandleClaimed` is preserved as historical record.
3. User re-subscribes → `subscriptionB` is the active row.
4. User attempts to claim `bob`. Historical check at line 829 finds `subscriptionA` → blocked. **Good.**
5. **But:** if any code path calls `releaseIncludedHandleClaim(subscriptionA.id)` (e.g., a delayed refund webhook or an operator action that compensates an unrelated assignment failure), `subscriptionA.includedHandleClaimed` is NULLed.
6. User retries claim of `bob` → historical check passes → conditional UPDATE on `subscriptionB` succeeds → user has consumed the benefit on `subscriptionB` for `bob` while the original `alice` is still owned.

### Fix recommendation
- Use `claimIncludedHandleBenefitTx` (the tx variant, lines 889-942) **everywhere**, deprecate the non-tx variant.
- Inside the tx, `SELECT … FOR UPDATE` the user's active subscription row before the historical-claim SELECT and the conditional UPDATE.
- `releaseIncludedHandleClaim` should be guarded by `WHERE includedHandleClaimed = ?` (the specific handle being released) so it cannot blanket-NULL a column whose state has moved on.

---

## H3. `recoverHandleRaceConflict` issues refund + cancel **outside** any transaction; jsonb_set on webhook_events is best-effort
**Severity:** High
**File:** `artifacts/api-server/src/services/billing.ts:1283-1494`

### Evidence
- The function has no transactional boundary at all. It performs:
  1. `stripe.refunds.create` (line 1347, idempotency-keyed `race-refund-${subscription.id}` — good).
  2. `stripe.subscriptions.cancel` (line 1391, no idempotency key — relies on Stripe-side idempotency for already-cancelled subs).
  3. `db.update(webhookEventsTable)` with `jsonb_set` (lines 1423-1438) — wrapped in its own try/catch so DB failure here is swallowed.
  4. `sendHandleRaceRefundEmail` (line 1454) — also try/catch swallowed.
- The webhook handler (`routes/v1/webhooks.ts:251-270`) calls this and treats the return value as advisory only. If the `webhook_events.payload.handleRaceConflict` write fails (line 1440), the recovery is **invisible to subsequent calls** to `getHandleCheckoutStatus` (which reads exactly that key at billing.ts:1549-1558) — the user sees `status: "pending"` forever and may attempt support escalation.
- If Stripe webhook redelivers the same `customer.subscription.created` event (e.g., handler throws downstream), `claimWebhookEvent` resets the row to `pending` (see H1) and the entire `recoverHandleRaceConflict` runs again — refund is idempotent (good), cancel is idempotent (good), but the audit `jsonb_set` could overwrite different attempt metadata (last write wins).

### Repro hypothesis
1. Two users concurrently complete checkout for handle `alice`. User A wins the DB unique-handle race; User B's webhook triggers `recoverHandleRaceConflict`.
2. Refund issued (idempotent, OK), subscription cancelled (OK).
3. Postgres has a transient hiccup → the `jsonb_set` at line 1423 throws → caught and logged → return `{ refundId, refundAmountCents, cancelled: true, emailSent: true }`.
4. `webhook_events.payload.handleRaceConflict` is never written.
5. User B polls `GET /handle/checkout-status?sessionId=...` → `getHandleCheckoutStatus` (billing.ts:1507) cannot find the recovery marker → returns `{ status: "pending" }` forever, even though a refund was issued.

### Fix recommendation
- Wrap the `jsonb_set` write in a retry-with-backoff (3 attempts).
- Persist a dedicated row in a `handle_race_recoveries` table (with unique key `(provider, providerEventId)`) instead of mutating an existing webhook_events row's payload — that row is the source of truth for `getHandleCheckoutStatus`, and a missing row = no recovery happened, a present row = recovery did happen, regardless of webhook_events row state.
- Guarantee `getHandleCheckoutStatus` does NOT report `pending` after the subscription has been cancelled: cross-check `subscription.status === 'canceled'` directly with Stripe as a fallback.

---

## H4. `agent activate` — wallet provisioning and email send are `setImmediate` fire-and-forget outside the activation tx (no recovery sweep)
**Severity:** High
**File:** `artifacts/api-server/src/routes/v1/bootstrap.ts:245-348` and `programmatic.ts:614-672`

### Evidence
- The core activation correctly uses `db.transaction` (bootstrap.ts:245-276; programmatic.ts:615-640) — API key insert, agent UPDATE, claim token consume are atomic. **Good.**
- However, after the tx commits:
  - `setImmediate(() => provisionOwsWallet(agentId, userId))` (bootstrap.ts:337-347, programmatic.ts:664-671) — **fire-and-forget, no retry, no durable queue, error only logged.**
  - `setImmediate(async () => sendAgentRegisteredEmail(...))` (bootstrap.ts:298-333) — same.
- If the Node process is killed (deploy, OOM) between the tx commit and the `setImmediate` callbacks running, the wallet is **never provisioned** and the email is **never sent**. There is no recovery path that detects "active agent without an OWS wallet row" and re-runs `provisionOwsWallet`.

### Repro hypothesis
1. User completes verification.
2. DB tx commits → agent is `active` + claim token consumed.
3. Process receives SIGTERM (deploy) before `setImmediate` callbacks fire.
4. New process starts. There is **no recovery path** that detects "active agent without an OWS wallet row" and re-runs `provisionOwsWallet`.
5. User polls `GET /agents/:id/wallet` indefinitely → `{ status: "provisioning" }`.

### Fix recommendation
- Replace `setImmediate(() => provisionOwsWallet(...))` with a durable job enqueue (use the existing worker pattern — `workers/handle-lifecycle.ts` etc. — and a `wallet_provision_jobs` table or BullMQ queue).
- Add a startup recovery sweep: on worker boot, enumerate `agents WHERE status='active' AND walletAddress IS NULL` and enqueue provisioning.
- Email send should also be durable (write to an `outbound_email_queue` table inside the activation tx; let a worker dispatch).

---

## H5. `marketplace-milestones.createMilestones` creates Stripe PaymentIntents in a loop, then DB inserts in a separate loop — orphan PIs on partial DB failure
**Severity:** High
**File:** `artifacts/api-server/src/services/marketplace-milestones.ts:26-107`

### Evidence
- Loop 1 (PI creation, lines `40-71` approximately) creates Stripe PaymentIntents for each milestone. Each PI is created with `idempotencyKey: milestone_pi_${orderId}_${i}` (good for retries).
- Loop 2 (DB insert, lines `74-104`) inserts each `marketplaceMilestonesTable` row.
- The two loops are **not in a transaction**. If loop 2 fails halfway (e.g., DB connection drop after milestone[2] inserted), the database has 3 milestones but Stripe has 5 PIs hanging in `requires_payment_method`.
- The error path explicitly handles Stripe-stage failures (cleanup at the front of the function), but **does not handle DB-stage failures**. Orphan PIs accumulate in Stripe — they will time out eventually, but a customer who attempted payment may see a charged-but-unused PI.

### Repro hypothesis
1. Buyer creates an order with 5 milestones.
2. All 5 PIs created at Stripe.
3. DB insert loop fails after milestone[2] (e.g., a constraint violation, connection reset).
4. Stripe has 5 PIs; DB has 2 milestones with valid `stripePaymentIntentId`s, 3 PIs orphaned.
5. Order is in an inconsistent state.

### Fix recommendation
- Wrap loop 2 in a `db.transaction`. On commit failure, reverse loop 1: `stripe.paymentIntents.cancel(...)` for each created PI.
- Persist the intended-PI list in a `pending_milestone_pis` row **before** loop 1 starts; on retry detect existing PIs and reuse them rather than re-creating.

---

## H6. `mail-inbound.ts` dedup is `findFirst`-then-`insert` on `externalMessageId`; attachments persisted one-by-one without a tx
**Severity:** High
**File:** `artifacts/api-server/src/services/mail-inbound.ts` (full file in scope)

### Evidence
- `findFirst({ where: eq(table.externalMessageId, id) })` followed later by `db.insert(table)` for the message — TOCTOU window between the SELECT and the INSERT. Whether duplicate inserts are blocked depends on the schema's unique constraint on `external_message_id`; verify in `lib/db/src/schema/`. Without it, two SES retries arrive in flight, both pass the SELECT, both INSERT a duplicate row.
- Attachments (separate table) are inserted in a loop **outside** the message-insert tx. Partial failure leaves a message row with a partial attachment set; replay re-inserts the missing attachments but doesn't dedupe (no observed unique key on `(messageId, externalAttachmentId)`).

### Repro hypothesis
1. SES delivers an inbound email with 5 attachments.
2. Handler crashes after persisting the message + 3 attachments.
3. SES retries → second handler run inserts a **second** message row (if no unique constraint) or skips (if there is); for attachments it inserts up to 5 more rows (no unique constraint), so the agent's inbox shows 8 attachments instead of 5.

### Fix recommendation
- Confirm or add unique constraint on `mail_messages.external_message_id`.
- Switch the dedup to `INSERT … ON CONFLICT DO NOTHING RETURNING id`; only proceed with attachments if a row was inserted.
- Wrap message + attachment inserts in a single `db.transaction`.
- Add `(messageId, externalAttachmentId)` unique index on attachments.

---

## H7. `trust-recalculation.syncOnchainReputation` deletes-then-inserts without a tx — empty-state window
**Severity:** High
**File:** `artifacts/api-server/src/workers/trust-recalculation.ts:123-156`

### Evidence
- The worker DELETEs all `agentReputationOnchainTable` rows for the agent, then INSERTs the new set, **outside any transaction**. Between the two statements, any reader that joins to that table sees zero rows → `trustScore` calculations downstream may briefly return a degraded score (or zero).
- If the INSERT fails (DB issue, validation), the DELETE has already committed and the agent has lost all on-chain reputation rows until the next worker run.

### Repro hypothesis
1. Worker runs `syncOnchainReputation(agentId)`.
2. DELETE commits.
3. INSERT throws (e.g., constraint violation due to drift).
4. Agent's on-chain reputation rows are gone until the next scheduled run (could be hours).
5. Any `recomputeAndStore` call in the meantime computes a wrong trust score.

### Fix recommendation
- Wrap DELETE + INSERT in a `db.transaction`.
- Better: compute the diff, apply only changes (UPDATE/INSERT/DELETE per chain) to avoid the empty-state window entirely.

---

## H8. `completeOrder` ledger inserts run **outside** the atomic claim — Stripe transfer success can lose its ledger row on crash
**Severity:** High (downgraded from previous v1 Critical claim; central evidence corrected)
**File:** `artifacts/api-server/src/services/orders.ts:262-516`

### Evidence (corrected)
The atomic state-claim UPDATE (`status` flips to `completed`) lives at lines `305-317` and **does run before** the Stripe capture/transfer at lines `344-389`. Two concurrent calls cannot both reach the Stripe stage — the loser of the conditional UPDATE is rejected at line 320 with `ORDER_ALREADY_COMPLETED`. The earlier v1 finding that placed Stripe before the claim was wrong.

The remaining real risks are:
1. **Ledger ↔ Stripe drift on crash.** The `payoutLedger` insert (line 394) and the three `paymentLedger` inserts (line 417) happen **after** the Stripe transfer succeeded and **outside** the atomic-claim transaction (which only contains the order UPDATE itself). If the process crashes between the Stripe transfer success at line 357-381 and the ledger inserts at line 394, the seller has been paid but the platform has no audit trail. There is no startup reconciliation that walks `completed` orders missing a `payout_ledger` row and back-fills.
2. **Stripe transfer failure leaves the order in `completed` with no compensating action.** The catch at line 383 sets `payoutStatus = 'pending_manual_payout'` and continues. The order is `completed` in DB and `payment_intent` is captured at Stripe, but no Connect transfer ever runs. Operators must manually settle. This is documented in code (line 501 `payoutNote`), so it is "explicit by design", but it is still a state where money has moved into the platform's Stripe balance without any outbound trail beyond the `pending_manual_payout` ledger entry.
3. **Single-call retry pattern is broken.** A retry that hits `ORDER_ALREADY_COMPLETED` returns `success: false` to the caller, even though the order is genuinely complete. Callers cannot distinguish "I just completed it" from "you already completed it" without an additional read.

### Repro hypothesis
1. Seller calls `completeOrder`. Atomic UPDATE commits. Stripe capture + transfer succeed (transferId returned).
2. Process is killed (SIGTERM, OOM) before the ledger insert at line 394.
3. Restart. The order shows `status='completed'`, the seller's Stripe balance reflects the transfer, but `payout_ledger` and `payment_ledger` have **no rows** for this order.
4. Operator runs reconciliation report → "0 ledger rows for $X of completed orders" → manual back-fill needed.

### Fix recommendation
- Wrap the order UPDATE (305-317) and the ledger inserts (394-466) in a single `db.transaction`. Move the Stripe capture+transfer into a saga: persist a `pending_payout` `payout_ledger` row inside the tx with the chosen idempotency keys, then call Stripe, then advance the row to `completed` in a second short tx.
- Add a startup reconciliation sweep: enumerate `completed` orders with no `payout_ledger` row and reconstruct the row from the Stripe transfer (which is recoverable via the idempotency-key + Stripe API).
- Add `(relatedOrderId, entryType)` unique partial index to `payment_ledger` for `entryType IN ('seller_payout','platform_fee','order_payment')` so a back-fill cannot insert duplicates.

---

## H9. `releaseMilestoneEscrow` Stripe transfer happens **before** the tx that records the release — tx failure after transfer success leaves silent payout
**Severity:** High (downgraded from previous v1 Critical claim; Stripe idempotency keys corrected the double-transfer concern)
**File:** `artifacts/api-server/src/services/marketplace-milestones.ts:159-327`

### Evidence (corrected)
- Stripe `paymentIntents.capture` (line 197) uses `idempotencyKey: milestone_capture_${milestoneId}` — Stripe will not double-capture under concurrency or retry.
- Stripe `transfers.create` (line 240) uses `idempotencyKey: milestone_transfer_${milestoneId}` — Stripe will not double-transfer under concurrency or retry.
- The atomic claim — UPDATE `marketplaceMilestonesTable SET status='released' WHERE id=? AND status='completed'` — runs at lines `273-291` **after** the Stripe calls. Inside the tx, the order's `releasedAmount` UPDATE (lines 293-299) and the `payoutLedger` INSERT (line 301-315) are correctly tx-scoped.
- The earlier v1 claim that two concurrent calls could each pay the seller was incorrect: Stripe's idempotency-key contract makes the second concurrent transfer call return the same already-created transfer object. Only one real payout occurs.

The remaining real risk: **the entire Stripe transfer happens before the tx that records the release.** If the tx at line 273 fails (DB outage, deadlock, validation error) **after** the transfer has cleared at Stripe, the seller has been paid but:
- `marketplaceMilestonesTable.status` is still `completed`, not `released`.
- `marketplaceOrdersTable.releasedAmount` is not incremented.
- `payoutLedger` has no row for the milestone.

A retry by the buyer will hit the JS pre-check at lines `163-173` (`milestone.status === 'completed'`), pass, re-enter Stripe — Stripe returns the same transfer (idempotent), and the tx may succeed this time. So in the optimistic case, the system self-heals on the next user-initiated retry. In the pessimistic case (no retry), the milestone is silently in `completed` state with the seller already paid, and an operator must reconcile.

### Repro hypothesis
1. Buyer triggers `releaseMilestoneEscrow`.
2. Stripe capture + transfer succeed.
3. DB tx at line 273 fails (transient deadlock or worker killed).
4. Seller is paid; milestone shows `completed`; order's `releasedAmount` is stale; no `payout_ledger` row.
5. Operator's release report reads "0 released milestones for $X of cleared transfers".

### Fix recommendation
- Persist a `pending_release` `payout_ledger` row inside a tx **before** the Stripe calls, capturing the chosen idempotency keys. Run Stripe. Advance the row to `completed` inside the same tx that flips the milestone to `released`.
- Use `SELECT … FOR UPDATE` on the milestone row inside the tx to eliminate the read-side TOCTOU at line 163.
- Add a reconciliation worker: enumerate milestones in `completed` state older than N minutes whose Stripe transfer (looked up by idempotency key) has cleared, and replay the DB tx.

---

## M1. `claimWebhookEvent` window between SELECT and INSERT is mitigated by `onConflictDoNothing`, but `status='processed'` short-circuit is fragile
**Severity:** Medium
**File:** `artifacts/api-server/src/services/billing.ts:1576-1641` (see also H1)

### Evidence
- The TOCTOU between line 1582 (SELECT) and line 1605 (INSERT) is correctly mitigated by `onConflictDoNothing` + the `inserted.length === 0` check at line 1617.
- However, the existing-row branch at line 1593 reads a possibly-stale `status` and decides "skip vs. retry" on it. There is no `FOR UPDATE` or version column. If two redeliveries land while a third is mid-processing (status `pending`), all three reset to `pending` and re-execute — handler runs concurrently 3×.

### Fix recommendation
- Use `SELECT … FOR UPDATE NOWAIT` and treat lock contention as "already_processing — return 409 to Stripe so it backs off".
- Or add `processingStartedAt` + `processingHostId` columns; only `pending` rows whose `processingStartedAt` is `NULL` or older than a stale-lease threshold (e.g., 5 min) are eligible to (re)process.

---

## M2. Bootstrap `provisionOwsWallet` race between bootstrap.ts and programmatic.ts both calling `setImmediate` for the same agent
**Severity:** Medium (downgrade of C3 from a fan-out angle)
**Files:** `bootstrap.ts:339`, `programmatic.ts:666`.

### Evidence
- Multiple code paths kick off `provisionOwsWallet` in `setImmediate` callbacks. If a user manages to traverse two activation paths (e.g., bootstrap claim + programmatic verify) for the same agent, two provisioning attempts run concurrently. Same root cause as C3 — the unique DB index serialises the row insert, but the on-disk vault and the post-insert `agentsTable` UPDATE remain unprotected.

### Fix recommendation
- Same as C3: per-agent advisory lock + idempotent INSERT in a tx.
- Plus: ensure `provisionOwsWallet` is called from exactly **one** place (e.g., a single post-activation hook that all activation routes invoke).

---

## M3. `markMilestoneComplete` JS pre-check + atomic UPDATE — small TOCTOU window
**Severity:** Medium
**File:** `artifacts/api-server/src/services/marketplace-milestones.ts:118-157`

### Evidence
- Lines `122-137` perform 2 non-transactional reads + JS guards.
- The atomic UPDATE at lines `139-150` correctly uses `WHERE id=? AND status IN ('pending','in_progress')`. Race-safe for the *milestone state*, but not for the *order ownership* read at line 128 — if seller ownership of the order changes between read and UPDATE (extreme edge), the UPDATE still proceeds.

### Fix recommendation
- Add `sellerUserId = ?` to the WHERE clause of the milestone UPDATE — the order's `sellerUserId` snapshot from line 128 should propagate into the WHERE clause via a sub-select or join.

---

## M4. `openDispute` JS check `order.status === 'disputed'` then tx UPDATE — duplicate dispute rows possible
**Severity:** Medium
**File:** `artifacts/api-server/src/services/disputes.ts:78-140`

### Evidence
- Line 90: JS check `if (order.status === 'disputed') return ALREADY_DISPUTED` — non-transactional read.
- Lines 101-119: tx wraps the order-status UPDATE + dispute INSERT.
- Two concurrent `openDispute` calls (buyer + seller within ms): both read `order.status = 'confirmed'`, both pass the JS check, both enter the tx, both insert a `marketplaceDisputesTable` row → two open disputes for the same order.
- Confirmed by schema (`lib/db/src/schema/marketplace-disputes.ts:14-46`): only ordinary indexes on `order_id`, `status`, `raised_by_user_id` — **no partial unique index** preventing two open disputes per order.
- Subsequent `respondToDispute` (line 157) uses `findFirst orderBy desc(createdAt)` so only the latest dispute is acted on — the other becomes orphaned.

### Fix recommendation
- Move the order-status check inside the tx, with `SELECT … FOR UPDATE` on the order row.
- Or add a partial unique index: `UNIQUE (orderId) WHERE status IN ('open','responded')` on `marketplace_disputes`.

---

## M5. `respondToDispute` UPDATE is unconditional on dispute status — late responses to resolved disputes silently mutate the row
**Severity:** Medium
**File:** `artifacts/api-server/src/services/disputes.ts:146-203`

### Evidence
- Line 162: JS check on `dispute.status`.
- Lines 170-179: UPDATE has no status guard in WHERE — `where(eq(marketplaceDisputesTable.id, dispute.id))` only.
- If the dispute is resolved between the SELECT (line 157) and the UPDATE (line 170), the UPDATE rewrites `status='responded'` and `respondedAt=NOW`, **un-resolving** the dispute and clobbering operator decisions.

### Fix recommendation
- Add `and(eq(...id, dispute.id), inArray(...status, ['open','responded']))` to the UPDATE WHERE clause.

---

## M6. `confirmOrder` capture happens before status UPDATE; UPDATE has no atomic status guard
**Severity:** Medium
**File:** `artifacts/api-server/src/services/orders.ts:240-260`

### Evidence
- Line 241-248: `captureProviderPayment(...)` runs before any status UPDATE.
- Lines 253-257: `db.update SET status='confirmed' WHERE id=orderId` — **no `WHERE status IN (...)` guard**. A second concurrent confirm (or a confirm racing with a cancel) overwrites whatever status had been set.
- Stripe capture has no idempotency key on this path (`captureProviderPayment` accepts none — confirmed in `services/payment-providers.ts:283-290`). Two concurrent confirms would both call Stripe capture; Stripe will idempotently no-op the second based on the PI state machine, but there is no platform-side defence.

### Fix recommendation
- Atomic claim: `WHERE id=? AND status='pending_capture'` (or whatever the precondition state is).
- Pass `idempotencyKey: order_capture_${orderId}` through `captureProviderPayment`.

---

## M7. `agent-expiry.ts` worker: ephemeral expiration UPDATEs `apiKeysTable` outside the cleanup tx
**Severity:** Medium
**File:** `artifacts/api-server/src/workers/agent-expiry.ts:36-79`

### Evidence
- Lines 36-49: agent expiry cleanup is wrapped in a tx (good).
- Around line 79: `apiKeysTable` UPDATE to revoke keys for the expired agent runs **outside** the tx. If the process crashes between tx commit and key revocation, the agent is `expired` but its API keys are still active → an "expired" agent's keys can keep making authenticated API calls.

### Fix recommendation
- Move the `apiKeysTable` UPDATE inside the same transaction as the agent-status UPDATE.

---

## M8. `handle-lifecycle.ts` `expireHandles` releases on-chain **outside** the tx; on-chain success without DB success leaves dangling chain state
**Severity:** Medium
**File:** `artifacts/api-server/src/workers/handle-lifecycle.ts:70-181`

### Evidence
- Lines 70-181: `expireHandles` performs a tx that updates `agentsTable.handle = null` and inserts an `auctionsTable` row — atomic and good.
- The `releaseHandleOnChain(handle)` call happens **after** the tx commits, fire-and-forget (no retry).
- If the on-chain release fails, the handle is freed in DB but still owned on-chain → next user to register that handle will fail at the on-chain registrar even though our DB says it's available.

### Fix recommendation
- Persist a `pending_chain_releases` row inside the tx; have a separate worker drain it with retries.

---

## M9. `nft-mint` worker overwrites `chainRegistrations` array instead of appending
**Severity:** Medium (was H6 in v1; corrected — `anchorAttempts` is incremented atomically via SQL `jsonb_set(... + 1)`, contrary to v1's claim)
**File:** `artifacts/api-server/src/workers/nft-mint.ts:99-156`

### Evidence
- `anchorAttempts` IS incremented atomically via SQL at lines 99-109:
  ```ts
  set: { metadata: sql`jsonb_set(
    COALESCE(${agentsTable.metadata}, '{}'),
    '{anchorAttempts}',
    to_jsonb(COALESCE((${agentsTable.metadata}->>'anchorAttempts')::int, 0) + 1)
  )` }
  ```
  This is correct — the v1 finding's claim of JS read-modify-write was wrong and is retracted.
- The remaining real concern is at line 153: `chainRegistrations: [chainRegEntry]` — the field is set to a single-element array, **overwriting** any prior array contents. If the worker ever runs for the same agent against multiple chains (or re-runs after a previous successful mint), the prior chain records are clobbered.
- The worker today is single-instance via `setInterval` (line 220), so the multi-worker concurrency case is not currently realistic. If the deployment ever scales workers horizontally, both the `anchorAttempts` increment (still atomic) and the chainRegistrations overwrite (not safe) would interact: two simultaneous successful mints on different chains would both write `[their own entry]` and the loser's record vanishes.
- The metadata UPDATE at lines 144-156 happens after the on-chain mint succeeds, but **outside** any DB tx wrapping the on-chain side-effect. If the process dies after the on-chain tx is mined but before the DB UPDATE, the next attempt re-enters via `nftStatus='pending_anchor'` → the agent has been re-minted on-chain but the prior attempt's tx hash is lost.

### Fix recommendation
- Replace the array overwrite with `array_append` or jsonb concatenation: `sql\`array_append(${agentsTable.chainRegistrations}, ${json}::jsonb)\``.
- Better long-term: model as a separate `agent_chain_registrations` table with `(agentId, chainId) UNIQUE`.
- Acquire a per-agent advisory lock at job start; release on completion. Necessary if workers ever scale out.
- Wrap the mint + DB update in a saga: write a `pending_mint` row with the chosen on-chain transaction nonce / idempotency hint **before** the on-chain call so re-discovery on crash recovery is deterministic.

---

## L1. `a2a.ts` payout queue insert with `logActivity` fallback — best-effort recovery
**Severity:** Low
**File:** `artifacts/api-server/src/routes/v1/a2a.ts:494-535`

### Evidence
- Insert into payout queue; on failure, falls back to `logActivity({ eventType: 'payout.queue_failure' })`.
- This is correct best-effort behavior, but the `activityLog` table is not the right system of record for unprocessed payouts. Operator visibility depends on log scraping.

### Fix recommendation
- Add a dedicated `payout_queue_failures` table with a periodic re-enqueue worker.

---

## L2. `auditEventsTable.payload` updates are best-effort `.catch(() => {})` in billing.ts
**Severity:** Low
**File:** `artifacts/api-server/src/services/billing.ts:1046-1080` (and similar)

### Evidence
- The "pending → completed/no_claim" transition writes on the audit row are fire-and-forget with `.catch(() => {})`. If they fail, the audit trail loses the "outcome" record but the operation itself proceeds correctly.
- Acceptable for an audit row; flagged for visibility because audits are the recovery surface for the included-handle saga.

### Fix recommendation
- Wrap the audit update in a 3-attempt retry with exponential backoff. On final failure, log at `error` level so on-call sees it.

---

# Summary table — every DB write path

Legend: **Tx?** = enclosed in `db.transaction`. **Idem?** = idempotent by stable key (request id, event id, business id) so a retry is a safe no-op. **Lock?** = uses Postgres advisory lock or `FOR UPDATE` to serialize concurrent writers.

| # | Path (file:line) | Operation | Tx? | Idem? | Lock? | Risk |
|---|------------------|-----------|-----|-------|-------|------|
| 1 | `services/billing.ts:1576-1641` `claimWebhookEvent` | INSERT webhook_events (with onConflictDoNothing) + UPDATE on retry | ✗ | partial (insert is) | ✗ | M1 — re-processing window |
| 2 | `services/billing.ts:1623-1641` `finalizeWebhookEvent` | UPDATE webhook_events.status | ✗ | ✓ (PK) | ✗ | low |
| 3 | `services/billing.ts:813-882` `claimIncludedHandleBenefit` | conditional UPDATE subscriptions | ✗ | ✓ (atomic) | ✗ | H2 — historical-claim TOCTOU |
| 4 | `services/billing.ts:889-942` `claimIncludedHandleBenefitTx` | same as above, in tx | ✓ | ✓ | ✗ | OK |
| 5 | `services/billing.ts:949-955` `releaseIncludedHandleClaim` | UPDATE subscriptions SET claim=NULL | ✗ | partial | ✗ | H2 — unconditional null |
| 6 | `services/billing.ts:1283-1494` `recoverHandleRaceConflict` | refund + cancel + UPDATE webhook_events.payload + email | ✗ | partial (refund only) | ✗ | H3 |
| 7 | `services/billing.ts:1011-1080` audit pending → completed | INSERT + UPDATE audit_events | ✗ | ✗ | ✗ | L2 |
| 8 | `services/orders.ts:262-516` `completeOrder` | atomic UPDATE order (305-317) + Stripe capture/transfer (344-389) + INSERT payout_ledger (394) + 3× INSERT payment_ledger (417) + UPDATE listing | ✗ (claim is atomic but ledger inserts are outside any tx) | partial (Stripe capture/transfer have idempotency keys; ledger has none) | ✗ | **H8** — ledger drift on crash; concurrency NOT a double-payout risk because the atomic claim runs first |
| 9 | `services/orders.ts:518-628` `cancelOrder` | refund + transfer reversal + 2× INSERT payment_ledger + atomic UPDATE order | ✗ | ✗ (refund has no key; reversal has key) | ✗ | **C2** |
| 10 | `services/orders.ts:240-260` `confirmOrder` | capture + UPDATE order | ✗ | ✗ | ✗ | M6 |
| 11 | `services/orders.ts:36-133` `createOrder` | Stripe PI create + INSERT order + Stripe metadata UPDATE | ✗ | ✗ | ✗ | low (no funds moved; PI is unconfirmed) |
| 12 | `services/orders.ts:135-216` `confirmPayment` | verify PI + UPDATE order + submitTask + logActivity + email | ✗ | ✗ | ✗ | low (idempotent on status check) |
| 13 | `services/marketplace-milestones.ts:26-107` `createMilestones` | N× Stripe PIs + N× INSERT milestone | ✗ | partial (PIs only) | ✗ | H5 |
| 14 | `services/marketplace-milestones.ts:118-157` `markMilestoneComplete` | atomic UPDATE milestone | ✗ | ✓ | ✗ | M3 |
| 15 | `services/marketplace-milestones.ts:159-327` `releaseMilestoneEscrow` | Stripe capture+transfer (both with stable idempotency keys) + tx(UPDATE milestone, UPDATE order, INSERT payout_ledger) | partial (claim is in tx, Stripe is not but is idempotent) | ✓ at Stripe (per-milestone keys); ✗ for ledger on tx-failure replay | ✗ | **H9** — tx failure post-transfer leaves seller paid with no ledger |
| 16 | `services/disputes.ts:78-140` `openDispute` | tx(UPDATE order, INSERT dispute) | ✓ | ✗ (no unique on open dispute, schema confirmed) | ✗ | M4 |
| 17 | `services/disputes.ts:146-203` `respondToDispute` | UPDATE dispute (no status guard) | ✗ | ✗ | ✗ | M5 |
| 18 | `services/disputes.ts:210-366` `resolveDispute` | refund/capture + INSERT payment_ledger + tx(UPDATE dispute, UPDATE order) | partial | ✗ (refund has no key) | ✗ | **C1** |
| 19 | `services/ows-wallet.ts:32-114` `provisionOwsWallet` | on-disk vault write (createWallet) + INSERT agent_ows_wallets (unique idx on agent_id) + sync accounts + UPDATE agents | ✗ (vault and DB ops not joined) | partial (DB row protected by unique index; vault file is not) | ✗ | **C3** — on-disk vault race even when DB unique constraint serializes the row |
| 20 | `services/ows-wallet.ts:146-178` `deleteOwsWallet` | on-disk delete + DELETE row + UPDATE agents | ✗ | ✓ (DELETE is) | ✗ | low |
| 21 | `services/agents.ts` (multiple, e.g. `:469` create/activate) | INSERT agent + downstream | varies | varies | ✗ | C3 amplifier |
| 22 | `services/verification.ts` (challenge insert/consume) | INSERT challenge, conditional UPDATE on consume | ✓ for tx variant | ✓ (conditional) | ✗ | low |
| 23 | `services/mail-inbound.ts` message + attachments persist | findFirst-then-INSERT message + N× INSERT attachment | ✗ | partial (depends on schema unique constraint — verify) | ✗ | H6 |
| 24 | `routes/v1/bootstrap.ts:245-276` activate | tx(INSERT api_key, UPDATE agent, UPDATE claim_token) | ✓ | ✓ (claim token consumed atomically) | ✗ | OK; downstream H4 |
| 25 | `routes/v1/bootstrap.ts:337-347` post-activate provision | setImmediate fire-and-forget | ✗ | ✗ | ✗ | H4 |
| 26 | `routes/v1/programmatic.ts:614-640` verify | tx(INSERT api_key, UPDATE agent, INSERT claim_token) | ✓ | ✓ | ✗ | OK; downstream H4 |
| 27 | `routes/v1/programmatic.ts:828-835` create api-key | INSERT api_keys | ✗ | ✗ | ✗ | low (single-row insert) |
| 28 | `routes/v1/programmatic.ts:898-…` rotate api-key | tx(INSERT new + UPDATE old) | ✓ | ✓ | ✗ | OK |
| 29 | `routes/v1/webhooks.ts:208-377` Stripe webhook dispatcher | claim → handler → finalize | wrapping handler, but inner handlers vary | partial | ✗ | H1, M1 |
| 30 | `routes/v1/marketplace.ts` (order create / confirm / dispute open) | wrappers for above services | inherits | inherits | ✗ | inherits H8/C2/C1/M4 |
| 31 | `routes/v1/a2a.ts:494-535` payout queue | INSERT payout_queue + activity_log fallback | ✗ | partial | ✗ | L1 |
| 32 | `workers/nft-mint.ts:99-156` `processPendingAnchors` | atomic SQL increment of anchorAttempts (`jsonb_set + 1`) + on-chain mint + UPDATE agent (overwrites chainRegistrations array) | ✗ | partial (counter is atomic; chainRegistrations is overwrite) | ✗ | M9 |
| 33 | `workers/handle-lifecycle.ts:70-181` `expireHandles` | tx(UPDATE agent, INSERT auction) + on-chain release | partial (chain outside) | ✗ | ✗ | M8 |
| 34 | `workers/agent-expiry.ts:36-79` `expireAgents` | tx(UPDATE agents) + UPDATE api_keys | partial | ✗ | ✗ | M7 |
| 35 | `workers/trust-recalculation.ts:123-156` `syncOnchainReputation` | DELETE + INSERT chain reputation rows | ✗ | ✗ | ✗ | H7 |
| 36 | `workers/trust-recalculation.ts` recompute store | UPDATE agent.trustScore | ✗ | ✓ (derived, recomputable) | ✗ | low |

## Aggregate counts (revised)
- **Critical:** 3 paths (#9 cancelOrder, #18 resolveDispute, #19 provisionOwsWallet vault race).
- **High:** 7 distinct findings (H1 webhook reprocessing, H2 included-handle, H3 race-recovery, H4 setImmediate fire-and-forget, H5 createMilestones, H6 mail-inbound, H7 trust-recalculation, H8 completeOrder ledger drift, H9 milestone tx-failure post-transfer) — note H1/H8/H9 cover multiple table rows.
- **Medium:** 9 paths (M1–M9).
- **Low:** 2 paths (L1, L2).

## Cross-cutting recommendations (audit-only — no code changes here)
1. **All Stripe write calls must propagate an `idempotencyKey`** through `payment-providers.ts`. Today `refundProviderPayment` and `captureProviderPayment` accept no such parameter (verified at `payment-providers.ts:132-164,283-300`) — every refund/capture is non-idempotent across retries, which is the root cause of the remaining Critical findings (cancelOrder, resolveDispute) and M6.
2. **Funds-moving operations should follow the saga pattern**: persist a durable `pending_*` row inside a tx, then call Stripe, then advance the row to `completed` inside another tx. Today H8 (completeOrder ledger drift), H9 (milestone tx-failure), C1 (resolveDispute), and C2 (cancelOrder) all rely on best-effort sequencing instead.
3. **All worker read-modify-write counters** should use SQL atomic increments. The `nft-mint` worker is already correct (`jsonb_set + 1`); audit other workers (e.g., `marketplace_listings.totalHires` at orders.ts:323-329 uses `sql\`${...} + 1\`` — also correct) and confirm no JS-side increments remain.
4. **Per-aggregate advisory locks** (Postgres `pg_advisory_xact_lock(hashtext(agentId))`) should bracket fan-in flows — wallet provisioning, agent activation, milestone release. Multiple call paths (bootstrap + programmatic verify) currently fire `setImmediate(provisionOwsWallet)` for the same agent simultaneously; the on-disk vault step is unprotected even though the DB row insert is.
5. **Webhook re-processing semantics** need a state machine, not a status reset. Today `claimWebhookEvent` resets `failed`/`pending` rows back to `pending` on every redelivery, with no concurrency guard. Combined with non-idempotent inner side-effects, every Stripe redelivery is a re-execution of side-effects.
6. **All `setImmediate(fn)` patterns** that perform durable side-effects after a successful response (wallet provisioning, registration emails, NFT mint kick-off) need to be replaced with durable enqueue. Today a deploy or OOM kill between tx commit and `setImmediate` callback execution silently drops the work with no recovery sweep.

End of audit.
