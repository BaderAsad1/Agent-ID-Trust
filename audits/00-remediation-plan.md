# Agent ID — Audit Remediation Plan

**Source of issues:** `audits/00-end-to-end-principal-engineer-audit.md` + audits 01–10.
**Goal:** Convert findings into ordered, scoped, owner-ready work items.
**Format per item:** scope (one sentence), files, acceptance test (objective), effort (S/M/L), dependencies, parallel-safe with which other items, recommended runner (main agent / isolated task agent).

> **How to read effort:** S = under one day, M = 1–3 days, L = a week or more.
> **Parallelism rules:** Items that touch the same file or migrate the same schema must serialize. Items that are pure new additions (new test file, new doc, new env-validation block) can fan out.

---

## WAVE 0 — Stop the bleeding (Days 0–2, all hands)

These cannot wait for prioritisation. Do them today.

### W0.1 — Rotate R2 keys, move to Replit Secrets, purge from `.replit`
- **Why:** C-NEW-1. Plaintext production secrets in version control. Bucket holds inbound user mail attachments.
- **Files:** `.replit` (delete `R2_*` lines from `[userenv.shared]`), Replit Secrets dashboard, `artifacts/api-server/src/lib/attachment-storage.ts` (no code change — same env var names).
- **Acceptance:**
  1. Old R2 access key shows as revoked in Cloudflare dashboard.
  2. New R2 key is set as a Replit Secret (not `userenv`).
  3. `git grep R2_SECRET` returns zero hits in tracked files.
  4. Production `/healthz` reports `r2: ok` (or equivalent), attachments still upload + presign.
  5. Document in `INCIDENTS.md` (W2.4 below) as Incident 0001 with the rotation timestamp and hash of the old key for audit trail.
- **Effort:** S (~2 hours). **Dependencies:** none. **Parallel-safe with:** all others.
- **Runner:** main agent + ops human in the loop for Cloudflare console.

### W0.2 — Wire a typecheck + unit-test gate before deploy
- **Why:** C-NEW-2. Six TS errors are live in prod paths today; nothing prevents merging more.
- **Files:** `.replit` (add to `[deployment]` a pre-build step that runs `pnpm typecheck && pnpm --filter @workspace/api-server run test:unit`); OR add a tiny GitHub Action that runs read-only on PRs and posts status (does not block deploy directly but blocks merge).
- **Acceptance:**
  1. A PR with a deliberately-introduced `let x: number = "foo"` fails the gate.
  2. A PR with a deliberately-broken unit test fails the gate.
  3. `[deployment]` build phase exits non-zero if either fails.
- **Effort:** S. **Dependencies:** W0.3 (must clean current 6 errors before turning the gate on, otherwise deploy is permanently red).
- **Runner:** main agent (touches `.replit` and possibly `.github/`).

### W0.3 — Fix the six pre-existing TypeScript errors
- **Why:** C-NEW-2. Required to enable W0.2.
- **Files:**
  - `artifacts/api-server/src/app.ts:138` (missing `pg` types — install `@types/pg` or replace import).
  - `artifacts/api-server/src/routes/v1/agent-runtime.ts:464–466` (`block.meta` is `unknown` — narrow with zod parse or type guard).
  - `artifacts/api-server/src/routes/v1/webhooks.ts:362–363` (`"transfer.failed"` not in Stripe SDK union for the bound version — either upgrade SDK, switch to a known event name, or guard with `if ((event.type as string) === "transfer.failed")` and `as Stripe.Event` cast).
- **Acceptance:** `pnpm tsc --noEmit` from `artifacts/api-server` exits 0. No `// @ts-ignore` introduced.
- **Effort:** S (~3 hours total). **Dependencies:** none.
- **Parallel-safe with:** everything except W0.2.
- **Runner:** main agent or isolated task agent (single file each — fan out as 3 parallel sub-tasks if isolated agent).

---

## WAVE 1 — Visibility and discipline (Days 2–14)

The "platform discipline" arc the audit kept calling out.

### W1.1 — Convert post-merge "ensures" into real Drizzle migrations
- **Why:** C-NEW-3. Schema drift will eventually produce a migration that drops a column it didn't know existed.
- **Files:**
  - `scripts/post-merge.sh` (delete the `audit_events columns ensured` block and the `agent_ows_wallet_accounts backfill` block).
  - `lib/db/drizzle/` (new numbered migration that runs the same `ALTER TABLE … ADD COLUMN IF NOT EXISTS` and `INSERT … ON CONFLICT` statements idempotently).
  - `lib/db/src/schema/audit-events.ts` (verify the schema reflects the columns being ensured).
- **Acceptance:**
  1. Fresh DB (`drizzle-kit migrate` from empty) has all expected columns + initial wallet rows.
  2. `scripts/post-merge.sh` no longer mentions `ensured` or `backfill`.
  3. Run `drizzle-kit check` — exits 0 (added in W1.2).
- **Effort:** M. **Dependencies:** none. **Parallel-safe with:** W1.2 (different files).
- **Runner:** isolated task agent — well-scoped, single artifact.

### W1.2 — Add `drizzle-kit check` to the deploy gate
- **Why:** Prevents the next instance of W1.1.
- **Files:** `.replit` (add `pnpm --filter @workspace/db exec drizzle-kit check` to the typecheck pre-build step from W0.2).
- **Acceptance:** Deliberately editing a schema file without generating a migration fails the gate.
- **Effort:** S. **Dependencies:** W1.1 (must be clean first).
- **Runner:** main agent.

### W1.3 — Add `pnpm fmt:check` (prettier) and `pnpm lint` (biome) to the deploy gate
- **Why:** No formatter or linter today; H-NEW-2/M-NEW-11 framing.
- **Files:**
  - Root `package.json` (add `fmt`, `fmt:check`, `lint` scripts).
  - New `biome.json` (recommended config for monorepo TS/TSX, 2-space, single-quote, no semicolons OR opposite — match what the codebase mostly does today; do `prettier --write .` once first to pick a baseline).
  - `.editorconfig` (project-wide line endings, indent width).
  - `.replit` deploy gate to call `pnpm fmt:check && pnpm lint`.
- **Acceptance:** `pnpm fmt:check && pnpm lint` exits 0 on a fresh checkout. PR introducing `var x` fails lint.
- **Effort:** M (the formatter sweep across 123 KLOC will produce a large mechanical diff — do this in one PR labelled `chore: introduce biome + prettier baseline` with no logic changes).
- **Dependencies:** W0.3 (don't mix lint sweep with type fixes). **Parallel-safe with:** W1.1.
- **Runner:** isolated task agent (mechanical, easy to review).

### W1.4 — Promote `CREDENTIAL_SIGNING_SECRET` to hard-fail in prod, validate `OAUTH_INTROSPECTION_SECRET`, decide capability matrix vs hard-fail for soft secrets
- **Why:** H-NEW-4 (corrected).
- **Files:** `artifacts/api-server/src/lib/env.ts`.
- **Acceptance:**
  1. `NODE_ENV=production CREDENTIAL_SIGNING_SECRET=` (unset) — process exits 1.
  2. `NODE_ENV=production OAUTH_INTROSPECTION_SECRET=` (unset) — process exits 1.
  3. README's "Required (Production)" table matches the set of hard-fail variables exactly. Add a unit test that parses the README table and asserts each name is hard-failed in `validateEnv`.
- **Effort:** S. **Dependencies:** none.
- **Runner:** main agent.

### W1.5 — Quarantine or fix the four known-broken test suites
- **Why:** H-NEW-2 collateral. Pre-existing failures train the team to ignore red.
- **Files:**
  - `artifacts/api-server/src/__tests__/pricing-plans*.test.ts`
  - `artifacts/api-server/src/__tests__/ownership-settlement-198.unit.test.ts`
  - `artifacts/api-server/src/__tests__/handle-race*.test.ts`
  - `artifacts/api-server/src/__tests__/included-handle-durability*.test.ts`
- **Acceptance:** Each suite either passes OR is excluded from the unit project in `vitest.config.ts` with a `// QUARANTINE: <task-ref> by <date>` comment and a tracking item in the queue. Suite count is non-zero in either case.
- **Effort:** M (debug effort varies; if any single one is >4 hours, quarantine and file follow-up).
- **Dependencies:** W0.2 should land first so a green suite stays green.
- **Runner:** isolated task agents (one per suite — fan out 4-way).

### W1.6 — Standardise the API error envelope (was task #264)
- **Why:** Audit #05. Today endpoints return mixed `{error: "msg"}`, `{message}`, `{code, message}`, plain strings.
- **Files:** `artifacts/api-server/src/lib/error-envelope.ts` (new), `artifacts/api-server/src/middleware/error-handler.ts`, every route in `routes/v1/*.ts` that throws ad-hoc shapes.
- **Acceptance:**
  1. Every error response from `/api/v1/**` matches `{error: {code: string, message: string, details?: object}}`.
  2. Integration test asserts the shape across a sample of 20 endpoints (auth fail, 404, 422 zod, 429, 500).
  3. OpenAPI spec describes the error schema once and references it everywhere.
- **Effort:** L. **Dependencies:** none. **Parallel-safe with:** anything not touching error paths.
- **Runner:** isolated task agent — wide scope, mechanical with one design call up front.

---

## WAVE 2 — Documentation, runbook, threat model (Days 5–21)

These are mostly write-once, read-many. Independent, fan out hard.

### W2.1 — `THREAT_MODEL.md`
- **Why:** H-NEW-7.
- **Files:** new `THREAT_MODEL.md` at root.
- **Acceptance:** Document covers (a) assets (handles, escrow funds, mail attachments, OAuth tokens, on-chain identities), (b) trust boundaries (browser → API, agent → API, partner → OAuth, Stripe webhooks, Cloudflare webhooks, Resend webhooks), (c) actor inventory (anonymous, end user, agent, partner integration, support admin, on-chain attacker), (d) attack scenarios (with at least one per audit-01–10 finding cross-referenced), (e) explicitly-accepted risks. Use STRIDE or similar — pick one and stick with it.
- **Effort:** M (~1.5 days).
- **Runner:** isolated task agent using `threat_modeling` skill, then human review.

### W2.2 — `SECURITY.md`
- **Why:** H-NEW-8 (corrected).
- **Files:** new `SECURITY.md` at root.
- **Acceptance:** GitHub displays a "Security policy" link. Contains: vulnerability disclosure email, scope, expected response time, safe-harbour clause, supported versions, hall of fame (optional).
- **Effort:** S.
- **Runner:** main agent (uses standard template).

### W2.3 — `DPA.md`, `docs/data-retention.md`, GDPR Art. 17 workflow note
- **Why:** H-NEW-8.
- **Files:** new `DPA.md` (template — flag for legal review), new `docs/data-retention.md` (concrete TTLs per data class: audit_events 12mo, mail attachments 90d after delete-from-trash, IP logs 30d, etc), new `docs/right-to-erasure.md` (workflow including the on-chain conflict policy).
- **Acceptance:** Each doc is non-empty and has at least one concrete decision per section. Tagged `// LEGAL REVIEW PENDING` where appropriate.
- **Effort:** M.
- **Runner:** isolated task agent + human legal review (queue legal-review as out-of-band).

### W2.4 — `CONTRIBUTING.md`, `RUNBOOK.md`, `ONCALL.md`, `INCIDENTS.md`
- **Why:** H-NEW-9.
- **Files:** four new docs at root.
- **Acceptance:**
  - `CONTRIBUTING.md`: how to add a migration, run tests, branch naming, commit convention, the "no em dashes" rule, list of skills available.
  - `RUNBOOK.md`: one section per failure mode (Stripe webhook delivery failing, Redis down, mint wallet out of gas, Resend webhook 5xx, Cloudflare API down, R2 down). Each section has diagnostic commands + first remediation step + escalation criteria.
  - `ONCALL.md`: who pages whom, hours, escalation chain, communication channels.
  - `INCIDENTS.md`: postmortem template + log table (start with Incident 0001 = the R2 rotation from W0.1).
- **Effort:** L (RUNBOOK alone is ~3 days for a thorough job).
- **Dependencies:** none. **Parallel-safe with:** all other doc work.
- **Runner:** isolated task agent (CONTRIBUTING + INCIDENTS are short; RUNBOOK and ONCALL are longer — split into two task agents if speed matters).

### W2.5 — Reconcile `replit.md`, `ARCHITECTURE.md`, `README.md` and delete the dead docs
- **Why:** Quick win.
- **Files:**
  - Delete `REPLIT_SUPER_PROMPT.md` (35KB, stale meta-prompt) — move to `.local/` if it's still used by tooling, otherwise delete.
  - Update `CHANGELOG.md` (last entry March 25) or delete.
  - Verify `SECURITY_AUDIT_PLAN.md` — supersede with the audit reports' index.
  - Audit `ARCHITECTURE.md` against current code paths.
- **Acceptance:** `git grep -l 'TODO' *.md` returns no surprises in root docs. README's pricing/plan table matches `lib/shared-pricing` exactly.
- **Effort:** S.
- **Runner:** main agent.

---

## WAVE 3 — Coherence and invariant tests (Days 14–35)

The "we have systems but no glue test" arc.

### W3.1 — Extend `cross-system-coherence.integration.test.ts` with the credential-system invariants
- **Why:** H-NEW-6.
- **Files:** `artifacts/api-server/src/__tests__/cross-system-coherence.integration.test.ts`.
- **Acceptance:** New `describe("credential coherence")` block asserts for a freshly-minted agent: HMAC attestation verifies, VC JWT verifies against `/.well-known/jwks.json`, on-chain `ownerOf(tokenId)` equals controller. All three within 5 seconds of mint.
- **Effort:** M. **Dependencies:** depends on W0.3 being green (so the test suite runs at all in CI).
- **Runner:** isolated task agent.

### W3.2 — Money coherence invariant test
- **Why:** Audit #04 §F8 / audit #02. Sum of `payment_ledger` for a terminal-state order should equal zero.
- **Files:** `artifacts/api-server/src/__tests__/money-coherence.integration.test.ts` (new).
- **Acceptance:** Test creates an order, captures, completes, refunds, asserts `SUM(amount * sign) = 0` per order. Repeats for milestone, dispute, agentic-pay, x402 flows.
- **Effort:** M. **Dependencies:** none. **Parallel-safe with:** W3.1.
- **Runner:** isolated task agent.

### W3.3 — Payout coherence invariant test
- **Why:** Audit #10 §F1. Every `payout_ledger.status='completed'` must correspond to a real, non-reversed Stripe transfer.
- **Files:** `artifacts/api-server/src/__tests__/payout-coherence.integration.test.ts` (new) + a small reconciler script `scripts/reconcile-payouts.ts` that can be run nightly.
- **Acceptance:** Test exercises completeOrder → Stripe transfer mock → status=completed; flips Stripe-side reversed=true; reconciler flags the row.
- **Effort:** M. **Dependencies:** W3.2 patterns.
- **Runner:** isolated task agent.

### W3.4 — Handle / inbox / auth / a2a coherence invariants
- **Why:** §4 of the principal-engineer audit lists 7 invariants total; W3.1–3.3 cover three. The remaining four are similar shape, can fan out.
- **Files:** four new `*-coherence.integration.test.ts` files.
- **Effort:** M each, L total. **Parallel-safe with each other.**
- **Runner:** four isolated task agents in parallel.

### W3.5 — Wire all coherence tests into nightly staging run
- **Why:** Tests in CI catch new bugs; nightly catches drift in long-running data.
- **Files:** new `scripts/nightly-coherence.sh`, GH Action or Replit scheduled deploy that runs against staging DB, alert wiring (depends on W4.1).
- **Acceptance:** A failing assertion produces a page within 15 minutes of the nightly run.
- **Effort:** S after W3.1–3.4. **Dependencies:** W3.1–3.4, W4.1.
- **Runner:** main agent.

---

## WAVE 4 — Telemetry and alerting (Days 21–60)

### W4.1 — Choose and integrate one observability vendor
- **Why:** Audit #07. `/metrics` exists but nothing scrapes; pino logs but nothing alerts.
- **Decision required:** Sentry (errors) + Better Stack/Honeycomb (metrics+logs) is one option. Datadog is another. Pick one before starting.
- **Files:** `artifacts/api-server/src/lib/telemetry.ts` (new), `artifacts/api-server/src/index.ts` (init at boot), `artifacts/api-server/src/middleware/error-handler.ts` (forward to vendor).
- **Acceptance:**
  1. Uncaught error in any route appears in vendor dashboard within 60s.
  2. `/metrics` series are scraped on a 30s interval.
  3. PagerDuty (or equivalent) page fires on `error_rate > 1% for 5m`.
- **Effort:** L. **Dependencies:** W2.4 ONCALL (need somebody to page).
- **Runner:** isolated task agent.

### W4.2 — Add business metrics to `/metrics`
- **Why:** Audit #07. Process metrics ≠ business health.
- **Files:** `artifacts/api-server/src/app.ts` `/metrics` handler, `artifacts/api-server/src/lib/business-metrics.ts` (new — counters/gauges).
- **Acceptance:** `/metrics` exposes `agentid_orders_created_total{status}`, `agentid_payouts_completed_dollars`, `agentid_disputes_open_count`, `agentid_mints_total{chain}`, `agentid_redis_connection_count`, `agentid_event_loop_lag_seconds`. Each is exercised by a unit test.
- **Effort:** M. **Dependencies:** W4.1 helps (you'll want to graph them immediately).
- **Runner:** isolated task agent.

### W4.3 — Replace `webhook-retry` `setInterval` with BullMQ scheduler
- **Why:** Audit #07. `setInterval` does not respect graceful shutdown; two passes can overlap.
- **Files:** `artifacts/api-server/src/workers/webhook-retry.ts`, `artifacts/api-server/src/workers/index.ts` registration.
- **Acceptance:** Worker uses `Queue.upsertJobScheduler` with `concurrency: 1`. SIGTERM stops new pulls within 1s. No two passes can overlap.
- **Effort:** S. **Runner:** main agent (similar pattern to existing workers).

---

## WAVE 5 — Audits 01–10 follow-ups already proposed but not yet merged (Days 14–60, parallel)

Each is already scoped in its parent audit. List by priority:

| Wave-5 ID | Source | Title | Effort | Runner |
|---|---|---|---|---|
| 5.1 | #261 (audit #01) | Close OAuth open redirect on `agclient_signin` | S | task agent |
| 5.2 | #262 (audit #01) | Replace SHA-256 OAuth client-secret hash with bcrypt/argon2 | M | task agent |
| 5.3 | #263 (audit #01) | Rate-limit `/oauth/userinfo`, add session rotation, retire legacy GET magic-link verify | M | task agent |
| 5.4 | #270 (audit #08) | Move on-chain transfers off the mint hot key | L | task agent |
| 5.5 | #271 (audit #08) | NFT mint worker idempotency under crash | M | task agent |
| 5.6 | #272 (audit #08) | Transfer-detector cursor + chain-mismatch handling | M | task agent |
| 5.7 | #281 (audit #02/#04) | Webhook event dedup table + replay safety | M | task agent |
| 5.8 | #267 (audit #04) | `charge.refunded` webhook handler updates order/ledger | M | task agent |
| 5.9 | #268 (audit #04) | `account.updated` capability loss → pause listings + notify | M | task agent |
| 5.10 | #269 (audit #04) | Single fee constant; remove the three sources of truth | S | task agent |
| 5.11 | #258 (audit #03) | Speed up agent search/discovery (indexes + query plan) | M | task agent |
| 5.12 | #259 (audit #03) | Cursor pagination on inbox + buyer orders | M | task agent |
| 5.13 | #260 (audit #03) | Default + max page size on every list endpoint | S | task agent |
| 5.14 | #265 (audit #05) | Bring async Python SDK to parity with sync (87 vs 23 methods) | L | task agent |
| 5.15 | #266 (audit #05) | Document outbound webhook signature scheme | S | task agent |
| 5.16 | #255 (audit #09) | Wire `checkOutboundRateLimit` into outbound mail path | S | task agent |
| 5.17 | #256 (audit #09) | NDR-loop hardening + DKIM record finalisation | M | task agent |
| 5.18 | #257 (audit #09) | ClamAV: fail-closed for paid plans, surface result to UI | M | task agent |
| 5.19 | (audit #04 §F9) | PI hold expiry monitor for escrow PIs older than 5 days | S | task agent |
| 5.20 | (audit #04 §F4) | Add idempotency keys to remaining `paymentIntents.create` call sites (createOrder, createMilestones, createTaskPaymentIntent, processAgentUpgrade) | S | task agent |

**Parallelism:** Items in this wave are mostly independent and can run as parallel task agents. Limit factor is reviewer attention, not code.

---

## WAVE 6 — Trim the surface (Days 30–90)

The "decide finish/document/delete" arc from M-NEW-10.

### W6.1 — Decision matrix for the seven half-finished subsystems
- **Why:** M-NEW-10. Each is auditing-debt today.
- **Process:** 30-minute meeting per subsystem to decide one of: **finish**, **document-as-experimental**, **delete**.

| Subsystem | Recommendation (mine, debatable) |
|---|---|
| MPP providers (`mpp-provider.ts` stubs) | **Document-as-experimental** behind feature flag, OR delete — depends on x402 product roadmap. |
| NFT transfer detector worker | **Finish** — secondary transfers without it desync DB ↔ chain (see #272). |
| `job-expiry` worker | **Finish** — customer-visible bug today (audit #07). |
| Agent organisations / fleet schema (~4 tables) | **Delete** if no UI in next quarter. |
| Tron + Solana wallet types | **Delete** — only EVM is wired. |
| `launch-readiness.security.test.ts` | **Finish** — gate launch on it. |
| `cross-system-coherence.integration.test.ts` | **Finish** — see W3.1. |

- **Effort:** S to decide; effort to execute is per-subsystem.
- **Runner:** human decision; isolated task agents to execute deletions; existing audit follow-ups for the "finish" choices.

### W6.2 — Delete `agent_organizations`, `agent_fleet`, `agent_operator_history`, `agent_appeals` tables (if W6.1 says delete)
- **Files:** schema files, route files, services, migrations.
- **Effort:** L (~1 week — schema deletes are touchy because of historical data).
- **Acceptance:** After running locally + on staging, `pnpm typecheck && pnpm test` is green and `drizzle-kit check` confirms migration history is clean.
- **Runner:** isolated task agent. **Dependencies:** W6.1 decision.

### W6.3 — Right-size `DB_POOL_MAX` in production
- **Why:** Quick win #7. Currently 100; PgBouncer/Replit Postgres prefers ~20.
- **Files:** `.replit` `[userenv.production]`.
- **Acceptance:** Set to `"20"`, observe Postgres-side `pg_stat_activity` count, confirm no `too many connections` errors over 24h.
- **Effort:** S. **Runner:** main agent.

### W6.4 — Add `ALLOWED_ORIGINS` validation in env.ts
- **Why:** Quick win #8.
- **Files:** `artifacts/api-server/src/lib/env.ts` and `cors.ts` setup.
- **Acceptance:** A wildcard or empty entry causes `process.exit(1)` at boot in production. Unit test asserts.
- **Effort:** S. **Runner:** main agent.

---

## WAVE 7 — Out-of-scope-of-prior-audits items worth booking now

### W7.1 — Audit `artifacts/cf-worker`
- **Why:** Cloudflare worker was not in scope of any prior audit. It is internet-facing.
- **Effort:** M. **Runner:** isolated task agent + new `audits/11-cf-worker.md`.

### W7.2 — Audit `artifacts/mcp-server`
- **Why:** Same as W7.1.
- **Effort:** M. **Runner:** isolated task agent + `audits/12-mcp-server.md`.

### W7.3 — Solidity contract audit
- **Why:** On-chain code is irreversible. A specialist firm pass costs less than one production exploit.
- **Effort:** L (external vendor; budget + lead time).
- **Runner:** procurement.

### W7.4 — External pentest
- **Why:** After Waves 0–4 close, an external pentest validates the platform-discipline work landed correctly.
- **Effort:** L (external vendor).
- **Runner:** procurement, scheduled for after W4 completion.

---

## Sequencing Cheat Sheet

```
DAY 0 ────────► DAY 7 ────────► DAY 14 ────────► DAY 30 ────────► DAY 60 ────────► DAY 90

W0.1 (R2)  ──┐
W0.3 (TS)  ──┼──► W0.2 (CI gate) ──► W1.2 (drizzle gate)
W1.1 (mig) ──┘                       W1.3 (lint)
                                     W1.4 (env hard-fails)
                                     W1.5 (test quarantine)
                                     W1.6 (error envelope) ───────────────────────►

W2.1 (threat model) ──┐
W2.2 (SECURITY.md)   ──┼─► W2.3 (DPA / retention) ──► W2.5 (doc cleanup)
W2.4 (runbooks)      ──┘                            (legal review out-of-band)

                       W3.1 (cred coherence) ──┐
                       W3.2 (money)           ──┼──► W3.5 (nightly run)
                       W3.3 (payout)          ──┤
                       W3.4 (4 more)          ──┘

                                     W4.1 (vendor) ──► W4.2 (biz metrics)
                                     W4.3 (webhook-retry)

                                     W5.1–5.20 (audit follow-ups) ──────────────────►

                                                       W6.1 (decisions) ──► W6.2 (deletes)
                                                       W6.3 (pool)       
                                                       W6.4 (origins)    

                                                                    W7.1 (cf-worker)
                                                                    W7.2 (mcp-server)
                                                                    W7.3 (Solidity audit)
                                                                    W7.4 (pentest)
```

---

## Capacity model

- **Wave 0** (3 items, mostly S): 1 engineer, 2 days.
- **Wave 1** (6 items, mix): 2 engineers, 1.5 weeks.
- **Wave 2** (5 items, mostly write-once): 1 engineer + legal-review out-of-band, 1.5 weeks.
- **Wave 3** (5 items, all M): 2 engineers, 2 weeks.
- **Wave 4** (3 items, one L): 1 engineer + ops, 3 weeks.
- **Wave 5** (20 items, mix): 2–3 engineers in parallel via task agents, 4–6 weeks.
- **Wave 6** (4 items): 1 engineer + 1 decision meeting, 1 week of effort across 2 calendar weeks.
- **Wave 7** (4 items, 2 external): scheduled around budget; internal items M each.

**Total internal effort:** ~10–12 engineer-weeks.
**Calendar time with sensible parallelism:** ~10 calendar weeks for internal items; external pentest adds ~6 weeks of lead time on top.

---

## Recommended first batch to queue (Plan mode)

If you want to switch to Plan mode and queue tasks now, I would propose **exactly these eight first** so the team is not overwhelmed:

1. **W0.1** — Rotate R2 keys, purge from `.replit`. (S, blocks nothing else but is critical.)
2. **W0.3** — Fix the 6 TypeScript errors. (S, blocks W0.2.)
3. **W0.2** — Wire typecheck + unit-test deploy gate. (S, after W0.3.)
4. **W1.1** — Convert post-merge ensures into real migrations. (M, independent.)
5. **W1.4** — Promote `CREDENTIAL_SIGNING_SECRET` to hard-fail; validate `OAUTH_INTROSPECTION_SECRET`. (S.)
6. **W2.2** — Write `SECURITY.md`. (S, independent.)
7. **W3.1** — Extend `cross-system-coherence` with credential invariants. (M, after W0.3.)
8. **5.16** (existing #255) — Wire `checkOutboundRateLimit` into outbound mail. (S, prevents Resend account suspension.)

These eight close the highest-impact items the audit raised, and three of them (W0.1, W0.2, W0.3) eliminate ongoing risk every day they're not done.

The remaining 50+ items can be queued in subsequent batches as the first batch lands, to keep the "in-flight" count tractable per M-NEW-12.

---

*End of plan.*
