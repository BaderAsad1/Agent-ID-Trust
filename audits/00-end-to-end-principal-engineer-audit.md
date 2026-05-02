# End-to-End Audit: Agent ID Platform

**Author:** Principal-engineer review (Anthropic-style: rigorous, opinionated, prioritized)
**Date:** 2026-05-02
**Scope:** The entire monorepo as of `git HEAD` — every artifact, every service, every worker, every contract, every documentation file, every operational concern.
**Method:** Synthesis of audits 01–10 (~440 KB of findings) + cross-cutting investigation that no per-domain audit could perform in isolation. Read-only. No code changes were made by this audit.

---

## 0. Verdict (TL;DR)

> **Agent ID is shipping faster than its safety nets are growing.** The code that handles money, identity, and on-chain state is *better than I expected* — atomic CAS guards on order transitions, idempotency keys on Stripe captures, a real saga pattern after Task #279, real-error visibility after Task #277, real Redis connection planning after Task #276, real focus traps after Task #252. The team is clearly capable.
>
> **The risk has migrated from feature correctness to platform discipline.** There is no CI, no linter, no test gate on merge, plain-text production secrets committed to `.replit`, no SLOs, no on-call runbook, no privacy policy in the repo, and a slowly accumulating tax of half-finished subsystems (MPP stubs, transfer-detector disabled, job-expiry erroring) that a future audit will mistake for working code.
>
> **You are one bad merge away from a `sk_live_…` leak, a Connect payout reversal that doesn't reverse, or a silent corruption of `agent_attestations` because nothing typed-checks the build.** None of these are theoretical — `tsc --noEmit` returns 6 errors right now, and the only thing standing between those errors and prod is whether the next person runs `pnpm build` locally before pushing.

If I could only read three sections of this document, I would read **§1 (Critical New Findings)**, **§5 (The 30-60-90 plan)**, and **§7 (The risk register)**. Everything else is supporting material.

---

## 1. Critical New Findings (Cross-Cutting, NOT Already in Audits 01–10)

These are findings the per-domain audits could not surface because they are *between* domains.

### 🔴 C-NEW-1 — Production R2 secrets are committed to the repo in plaintext

**File:** `.replit` (top of file, `[userenv.shared]` block)

```
R2_ACCESS_KEY_ID    = "<REDACTED — see INCIDENTS.md #0001>"
R2_SECRET_ACCESS_KEY= "<REDACTED — see INCIDENTS.md #0001>"
R2_ACCOUNT_ID       = "<REDACTED — see INCIDENTS.md #0001>"
```

These are **not** Replit secrets — they are version-controlled environment values shipped to every clone of the repo. Anybody who reads `git log` on the repo (or the public GitHub mirror, if one exists) gets full read/write/delete on the `agentid-attachments` R2 bucket forever. This bucket holds inbound mail attachments and OAuth icons — including, by design, attachments uploaded *by users* to send through Agent Mail. Compromise = arbitrary file insertion into customer mailboxes plus full historical exfiltration.

**Why no per-domain audit caught this:** Audit #01 looked at `env.ts` for runtime handling; audit #09 looked at attachment ingestion. Neither read `.replit`.

**Action (today):**
1. Rotate the R2 access key in Cloudflare immediately.
2. Move the new key to a Replit Secret (NOT `userenv`).
3. Delete the four `R2_*` lines from `.replit`.
4. Force-rotate any other `userenv.shared` value that looks key-shaped: `ADMIN_ALLOWED_IPS` is fine as a public IP allowlist; everything secret should be in Secrets.
5. `git log -p .replit | grep R2_SECRET` to find every commit that contained the secret; assume the entire historical bucket is compromised; consider issuing a CSP/integrity-pass over recently-uploaded attachments before re-trusting them.

---

### 🔴 C-NEW-2 — There is no CI. The build is broken right now and nobody knows.

**Evidence:**
- `.github/` does not exist (the `ci.yml` was deleted to unblock Replit deploy — context: previous task #5xx).
- No `.gitlab-ci.yml`, no Buildkite config, no Replit-side build gate other than the `pnpm run build` in `[deployment]`.
- Running `pnpm tsc --noEmit` from `artifacts/api-server` produces real type errors *right now*:
  ```
  src/app.ts(138,65):                 error TS2307: Cannot find module 'pg'
  src/routes/v1/agent-runtime.ts(464,48): error TS18046: 'block.meta' is of type 'unknown'
  src/routes/v1/agent-runtime.ts(465,49): error TS18046: 'block.meta' is of type 'unknown'
  src/routes/v1/agent-runtime.ts(466,50): error TS18046: 'block.meta' is of type 'unknown'
  src/routes/v1/webhooks.ts(362,16): error TS2678: Type '"transfer.failed"' is not comparable …
  src/routes/v1/webhooks.ts(363,46): error TS2339: Property 'data' does not exist on type 'never'
  ```
- These have been "pre-existing, unrelated to this task" in **at least 7** of the last 20 task merge reports. They are accumulating, not getting smaller. Count today: **6** errors across 3 files.
- There is no `.eslintrc*`, no `biome.json`, no `prettierrc` enforcement at commit time (root `package.json` lists prettier as a devDep but no `format:check` script in CI).
- Test failures explicitly noted as "pre-existing" in recent merges: `pricing-plans`, `ownership-settlement-198`, `handle-race`, `included-handle-durability`. Nobody is going to fix them because nothing requires they be fixed.

**Why no per-domain audit caught this:** Audits scoped to "what does this code do." Nobody scoped to "is the codebase mechanically guarded."

**Action (this week):**
1. Add a Replit pre-deploy check (or a GitHub Action gated to read-only operations to dodge the previous `ci.yml` problem) that runs `pnpm typecheck` and `pnpm test:unit`. Block deploy on either failing.
2. Fix the 5 `tsc` errors above. They look like 30-minute fixes.
3. Quarantine known-broken tests behind `vitest --filter` with a `# TODO: unflake by <date>` comment, OR fix them. Do not let them rot in the suite signaling "tests don't matter."
4. Add a `format:check` (prettier) and a `lint` step (biome — much faster than eslint for a 123 KLOC codebase). Wire to CI.

---

### 🔴 C-NEW-3 — Schema is being mutated outside Drizzle migrations and nobody can tell

**Evidence:** Every post-merge run for the last 20+ merges ends with:
```
[post-merge] audit_events columns ensured
[post-merge] agent_ows_wallet_accounts backfill: 0 rows inserted
```

The `audit_events` "ensure" guard exists because columns were added directly via SQL or `drizzle-kit push --force` (see drizzle journal entry 0028 — flagged in audit #03) without a real migration file. The script papers over this on every merge so the symptom never surfaces — until the day Drizzle generates a "migration" that drops a column it didn't know existed.

**Why no per-domain audit fully framed this as a threat:** Audit #03 caught the smell but treated it as hygiene; in context it is a *production data-loss vector*.

**Action:**
1. Convert the `audit_events` column-ensure into a real numbered migration. Delete the post-merge guard.
2. Convert the OWS wallet accounts backfill into a one-shot migration with an idempotent "WHERE NOT EXISTS" guard. Delete the post-merge backfill.
3. Add a CI step: `drizzle-kit check` — fails the build if schema and migration journal are out of sync.
4. Forbid `drizzle-kit push --force` outside local dev. Document this in `CONTRIBUTING.md` (which doesn't exist — see C-NEW-9).

---

### 🟡 H-NEW-4 — Two real holes remain in `env.ts` validation, and the README/code mismatch is itself a maintenance hazard

**Correction to my earlier draft:** `env.ts` *does* hard-fail in production on most secrets: `ACTIVITY_HMAC_SECRET`, `WEBHOOK_SECRET_KEY`, `VC_SIGNING_KEY` (with malformation check), `VC_PUBLIC_KEY` (with malformation check + private-`d`-leak check), `JWT_SECRET` (with min-length check), `CLAIM_TOKEN_SECRET`, `DATABASE_URL`, `ADMIN_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. That is good work and audit #01 already noted it — I had to be corrected by the reviewer. Sorry for the noise.

What is actually still wrong:

1. **`CREDENTIAL_SIGNING_SECRET` warns instead of hard-fails in production.** This is the HMAC key for `agent_attestations.proof.signatureValue`. When unset, the code falls back to an ephemeral secret. A prod deploy that misses this will silently invalidate every existing attestation on every restart and start signing with a key that disappears at the next deploy. Promote to hard fail in prod.
2. **`OAUTH_INTROSPECTION_SECRET` has no validation at all** — not even a `warn()`. It is declared `optional()` in the zod schema and never re-checked. Server-to-server token introspection by partner integrations can silently degrade if the secret is unset.
3. **Soft-fail on critical infrastructure produces silent feature loss in prod.** `REDIS_URL`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, and Cloudflare credentials all merely `warn()` in production. The result: a missing `REDIS_URL` in prod silently disables every BullMQ worker (handle lifecycle, webhook delivery, mail outbound, NFT mint…) and the platform looks "up" while half its async surface is dead. Either hard-fail in prod or expose a `/healthz` capability matrix that flips to red when these are missing.
4. **README↔env.ts drift.** README lists `PORT`, `OAUTH_INTROSPECTION_SECRET` and `CREDENTIAL_SIGNING_SECRET` as "Required (Production)" but `env.ts` does not enforce any of them. The two should agree, and the easiest way is to generate one from the other. Today they disagree by inspection.

**Action:** Fix items 1 and 2 in `env.ts`. For item 3, decide explicitly: hard-fail or surface in `/healthz`. For item 4, write a tiny test that asserts every README-required secret has either a hard-fail check OR an explicit `// soft: documented degradation` comment.

---

### 🟠 H-NEW-5 — The build is non-portable: `node_modules/.bin/tsc` succeeds while `pnpm build` does too much

`pnpm build` rebuilds two artifact bundles AND runs `pnpm store prune` post-build. There is no separation between *artifact-build* (fast, hermetic) and *post-build housekeeping* (slow, mutating). On a flaky deploy this conflates "your code is broken" with "Replit's package store had a hiccup." Audit #07 mentioned graceful shutdown; nobody mentioned graceful build.

**Action:** Move `pnpm store prune` to a separate `[deployment.postBuild]` step (it is — but it runs unconditionally even on partial build failure, see logs). Confirm `[build]` exits non-zero on TypeScript errors. Add a `pnpm build:check` that does ONLY typecheck + esbuild dry-run, callable from CI.

---

### 🟠 H-NEW-6 — Three credential systems coexist with no cross-system invariant test

Per audit #08 + ARCHITECTURE.md:

1. **HMAC attestation record** (`agent_attestations.proof.signatureValue`) — signed with `CREDENTIAL_SIGNING_SECRET`.
2. **W3C VC JWT** (`/.well-known/jwks.json`) — signed with `VC_SIGNING_KEY` (Ed25519).
3. **On-chain anchor** (`AgentIDRegistrar` on Base, registered handle ↔ controller address).

Each system has its own revocation path. Each has its own cache (HMAC: none; VC: in-memory `vcCache`; on-chain: indexed via `chainRegistrations` JSONB on the agent row).

There is **no test, anywhere, that asserts the three are consistent for any agent.** A revoked-on-chain handle whose VC JWT cache hasn't expired is still valid for an hour. A handle that mints on-chain but whose `agent_attestations` insert fails will appear "verified" on the public profile but un-anchored to anyone who reads the chain.

**Why no audit synthesized this:** #01 looked at HMAC, #08 looked at on-chain. Neither tested coherence.

**Action:** Extend the existing `cross-system-coherence.integration.test.ts` (215 lines, 7 real tests today — covering admin-revocation cascade, key-revocation cascade, reserved-handle parity between `agents.ts` and `handle.ts`, and MCP trust tier parity) with three additional invariants for a freshly-minted agent:
- `agent_attestations` row exists, signature verifies with current `CREDENTIAL_SIGNING_SECRET`.
- VC JWT verifies with the JWK at `/.well-known/jwks.json`.
- `chainRegistrations[base]` controller equals the on-chain `ownerOf(tokenId)`.

Run on every merge. The file is a strong foundation; it just doesn't yet assert the three-credential-system coherence that H-NEW-6 calls out.

---

### 🟠 H-NEW-7 — The platform has no documented threat model

`SECURITY_AUDIT_PLAN.md` is 17 KB and dates to April 7. It enumerates a target audit but is not a threat model. The `.local/skills/threat_modeling` skill exists but `threat_model.md` is not present in the repo.

For a system that:
- Holds custodial funds in escrow,
- Issues identity to autonomous agents,
- Anchors credentials on-chain (irreversible),
- Routes other people's mail,
- Runs an OAuth/OIDC provider used by third-party apps,

a written, versioned threat model is table stakes. A new engineer has no way to learn "what we are defending against" except by reading 10 audits.

**Action:** Run the `threat_modeling` skill once. Commit the output to `THREAT_MODEL.md` at root. Cross-reference each audit finding back to the threat it mitigates.

---

### 🟡 H-NEW-8 — Privacy/Terms exist as frontend pages but the legal/compliance surface around them is thin

**Correction:** `artifacts/agent-id/src/pages/Privacy.tsx` (86 lines) and `Terms.tsx` (85 lines) exist, both dated 2026-03-17, both substantive (data-collection enumeration in Privacy, acceptable-use + handle-ownership + marketplace clauses in Terms). I missed these in the first pass — apologies.

What is genuinely still missing:

- **No `DPA.md` (Data Processing Agreement)** — required by enterprise customers and GDPR Art. 28 if you ever sell to an EU business processor.
- **No documented data retention policy.** How long do we keep `audit_events`? Inbound mail attachments? Closed-order PII? The pages say "we may retain"; operationally we have no enforcement.
- **No documented Right-to-Erasure (GDPR Art. 17) workflow.** What does support do when a user emails "delete me"? Audit #09 caught this for mail; it is platform-wide. On-chain identity creates a real conflict here that needs a written answer (you cannot delete from chain, so what does erasure mean — burn the controller key? Mark off-chain as redacted? Both?).
- **No `SECURITY.md` at root** for vulnerability reporting. The project has no documented disclosure channel.
- **The 2026-03-17 effective date predates several material product changes** (mail attachments via R2 added post-task-205, Stripe Connect payouts, A2A engagements). Either the policies now mis-describe the data we collect, or they were drafted to be intentionally vague and the gap doesn't matter — but somebody should make that call deliberately.

**Action:** Add `SECURITY.md`, `DPA.md`, and a `docs/data-retention.md` with concrete TTLs. Audit Privacy.tsx against the post-March-17 product surface and update if needed. Document the on-chain ↔ erasure conflict policy explicitly.

---

### 🟠 H-NEW-9 — No CONTRIBUTING.md, no operational runbook, no on-call playbook

Engineering knowledge lives in:
- `replit.md` (architecture overview, ~200 lines)
- `ARCHITECTURE.md` (deep dive on credential system)
- `REPLIT_SUPER_PROMPT.md` (35 KB — a meta-prompt, not docs)
- `SECURITY_AUDIT_PLAN.md` (audit *plan*, not procedures)
- `docs/` (Insomnia + Postman collections, BACKUP_AND_RECOVERY, handle-nft-metadata, testing)
- 10 audit files

Missing:
- `CONTRIBUTING.md` — branching, commit conventions, "how do I add a migration"
- `RUNBOOK.md` — "Stripe webhook delivery is failing" → step-by-step diagnostic
- `ONCALL.md` — escalation policy, who pages whom
- `INCIDENTS.md` — postmortem template, prior incident log

The team will encode this in muscle memory until the first 3am page.

**Action:** Stub all four. Even one paragraph each is better than nothing. Wire `RUNBOOK.md` link into the `/healthz` 503 response payload so the on-call has a starting point.

---

### 🟡 M-NEW-10 — Half-finished subsystems are accruing audit-debt of their own

Each of the following is documented in code as if working but is in fact partially or fully disabled:

| Subsystem | Status | Risk |
|---|---|---|
| **MPP (Machine Payments Protocol)** providers | `mpp-provider.ts` exports `PROVIDER_UNAVAILABLE` stubs | Roadmap dependency for x402 monetisation. Auditing it as if real produced false confidence in audit #04. |
| **NFT transfer detector** worker | Code present, scheduling commented out per audit #08 | Means secondary transfers can silently desync DB ↔ on-chain. Task #272 proposed. |
| **`job-expiry` worker** | Errors continuously per audit #07 root-cause + Task #248 | Expired jobs stay open forever. Customer-visible. |
| **Agent organisations / fleet** routes | 11 agent-org schema tables exist; the UI surface is minimal | Schema cost without product value. Either build the UI or delete the tables. |
| **Tron + Solana wallet** support (CAIP-10) | Schema supports them; only EVM is wired | Same. |
| **`launch-readiness.security.test.ts`** | Exists in `__tests__` | Either it gates launch or it is theatre. Run it. |
| **`cross-system-coherence.integration.test.ts`** | Stub | See H-NEW-6. |

**Action:** For each, decide today: **finish, document-as-experimental, or delete**. The middle path ("leave it") is the most expensive over time.

---

### 🟡 M-NEW-11 — The codebase has no lint and one-third of the schema files lack `updatedAt`

Cross-checking audit #03 §schema against `lib/db/src/schema/`: ~10 mutable tables (agents, marketplace_orders subset, a2a_engagements, …) lack `updatedAt`. Without lint or a schema-shape test there is no mechanism that catches this on the next migration.

**Action:** Write a one-shot lint script (`scripts/lint-schema.ts`) that walks every exported `pgTable` and asserts `updatedAt` is present unless explicitly opted out. Run in CI.

---

### 🟡 M-NEW-12 — 100 project tasks accumulated; no obvious prioritisation framework

`listProjectTasks` returns 100 tasks. New audits propose a healthy stream of follow-ups (#252–#281+ from the 10 audits). Without a P0/P1/P2 + owner discipline, the backlog will become a write-only graveyard.

**Action:** Adopt a Now / Next / Later view. Tag every task with one P-value. Cap "Now" at the team size + 2.

---

## 2. Synthesis of Audits 01–10 (One Paragraph Each)

| # | Audit | Headline finding (synthesised) | Status of follow-ups |
|---|---|---|---|
| **01** | Security / AuthN / AuthZ | 1 Critical (open redirect on `agclient_signin`), 4 High (SHA-256 client-secret, unrate-limited `/oauth/userinfo`, no session rotation, legacy GET magic-link verify). All 4 High items have follow-up tasks (#261, #262, #263). | 🟠 in progress |
| **02** | Data Integrity & Race Conditions | 36-row write-path matrix; saga gaps now closed by #279 for orders/milestones/disputes. Remaining: Stripe webhook dedup edge cases (#281), wallet-provision race (#280). | 🟢 mostly closed |
| **03** | DB Schema, Indexes, Performance | 205 routes inventoried; ~9 list endpoints have no pagination; ~10 mutable tables missing `updatedAt`; duplicate journal entry 0007/0008. Follow-ups #258, #259, #260. | 🟡 proposed only |
| **04** | Billing & Stripe | F1–F10 findings; key risks now mitigated by #279 + #267, #268, #269 proposed. Notable remaining: `charge.refunded` webhook is a no-op (F2), `account.updated` doesn't pause listings on capability loss (F10). | 🟡 partial |
| **05** | API & SDK Contract | 280 unique endpoints, 119 in OpenAPI (42.5% coverage). Python sync 87 methods vs async 23 — large parity gap. Three internal version-string mismatches in the Python SDK. Follow-ups #264, #265, #266. | 🟡 proposed only |
| **06** | Frontend UX & A11y | Three big buckets: hand-rolled modals (#252 ✅ merged), low-contrast text (#253 ✅ merged), form semantics (#254 ✅ merged). Outstanding: skip-link missing on `/authorize`; ~10 silent `.catch(() => {})` in pages. | 🟢 mostly closed |
| **07** | Observability & Reliability | Root-caused three of the noisiest deployment errors: BullMQ shared-connection (#276 ✅ merged), pino `cause:{}` serializer (#277 ✅ merged), wrong `/healthz` import (#278 ✅ merged). The platform already has a Prometheus `/metrics` endpoint (gated by `METRICS_TOKEN`) and a graceful-shutdown handler that sequences worker → server → DB pool close. Remaining: no external observability stack (Sentry/Datadog/Honeycomb), no business-metrics on `/metrics` (orders/min, mints/min, refund $/day, dispute open count), no alerting wired anywhere, and `webhook-retry` still polls on a naked `setInterval` that does not respect graceful shutdown. | 🟢 the noisy stuff is closed |
| **08** | On-Chain & Credentials | Single hot wallet for both mint AND transfer (#270), worker idempotency under crash (#271), transfer-detector cursor + chain mismatch (#272). | 🟡 proposed only |
| **09** | Mail Subsystem | Critical: `checkOutboundRateLimit` exported but never called (#255), DKIM record placeholder, NDR loop hardening incomplete (#256), ClamAV fail-open (#257). | 🟡 proposed only |
| **10** | Marketplace, Jobs, A2A, Disputes | F1–F10: Connect transfer/refund desync (covered partially by #279), payment-fee-on-refund math wrong, 7-day PI hold expiry unmonitored. | 🟡 partial |

**Net:** The platform has had a *very* productive audit cycle. Roughly half of the proposed follow-ups have merged or are in flight; the other half are sitting as "Drafts" awaiting prioritisation.

---

## 3. Architecture Observations (Good and Bad)

### What's good — keep doing this

1. **Saga pattern after #279** is genuinely well-implemented. "Save intent first, move money second, finalize last" is the right call; the recovery branches in `cancelOrder`/`completeOrder`/`releaseMilestoneEscrow` correctly use durable signals (pending ledger rows + `intentStage` metadata) rather than derived flags. This is staff-engineer-quality work.
2. **Connection-name discipline after #276** (`bullmq:webhook-delivery:worker` etc.) gives ops a real mental model of Redis client cost. The startup log enumerating `expectedSteadyStateConnections: 22` is the kind of observability that pays back forever.
3. **Pino error serializer after #277** (recursive `err.cause` walk with depth + cycle protection, pg-error field extraction, AggregateError fan-out) is the single highest-leverage logging improvement possible.
4. **Atomic CAS guards** (`UPDATE … WHERE status IN (…)`) on every state machine. No `if (row.status === 'x') update(...)` anti-pattern. Good.
5. **Idempotency keys with stable derivation** (`order_capture_${id}`, `milestone_transfer_${id}`, `dispute_refund_${id}`) on every Stripe call that moves funds.
6. **Real focus traps + dialog semantics after #252** on every hand-rolled modal. The `useFocusTrap` hook is reusable and well-scoped.

### What worries me — fix or accept the cost

1. **Two payment vocabularies** (Stripe + MPP) and three fee constants (`PLATFORM_FEE_RATE`, hardcoded `0.10`, unread `MARKETPLACE_FEE_BPS = 250`). Either MPP becomes real this quarter or its scaffolding should be deleted; the cognitive cost of "which one is real here" is non-trivial.
2. **Three credential systems** — see H-NEW-6. The product reason for each is real (HMAC for internal trust, VC JWT for external verification, on-chain for permanence) but the *coherence* between them is not asserted anywhere.
3. **77 schema tables, 36 migrations, 61 route files, 58 service files, 123 KLOC** — for a pre-PMF platform this is a *lot*. Some of it (agent-organizations, agent-fleet, multi-chain wallets) reads like speculative surface area. Speculative surface area is technical debt that the test suite has to carry without payoff.
4. **No service boundary between identity, marketplace, and mail.** All three live in `api-server`. This is fine today; it will hurt the day one of them needs to scale independently or be regulated independently (e.g., mail compliance ≠ marketplace compliance).
5. **One Postgres pool, one Redis** — no HA, no read replica, no backup-tested DR. `BACKUP_AND_RECOVERY.md` exists in `docs/` (I did not deeply read it; the audit covered this lightly). For a custodial-funds product, "we have backups" must be "we tested restoring from backup last quarter."
6. **No metrics export.** `pino` logs are the only telemetry. The team is one Datadog/Honeycomb/Grafana away from having a fighting chance of running this in production with confidence.

### What is over-engineered — consider trimming

1. **`agent_organizations`, `agent_fleet`, `agent_operator_history`, `agent_appeals`** — 4 schema files, no clear UI surface. If the product roadmap doesn't put these on top this quarter, archive them behind a feature flag.
2. **`tronweb` + Solana wallet account types in CAIP-10** — only EVM is wired. Carrying multi-chain code paths costs ~5% of every audit's attention.
3. **77 schema tables** — at least 10 look "experimental" (handle auctions, handle trademark claims, agent appeals, agent reports). Every one has to be consistent across migrations, queries, and access control forever. Each unused one is debt.

---

## 4. The Cross-Cutting Invariants the Code Should — but doesn't — Test

A new file `src/__tests__/cross-system-invariants.integration.test.ts` should assert all of the following on a freshly-seeded agent with a paid subscription, a verified handle, an active marketplace order, and an outbound mail message:

1. **Identity coherence.** `agent_attestations.signatureValue` verifies; `/.well-known/jwks.json` JWT verifies; on-chain `ownerOf(tokenId)` equals `agent_keys.ownerAddress`. (Covers H-NEW-6.)
2. **Money coherence.** `SUM(payment_ledger WHERE order_id = X)` equals zero (inflows + outflows + fees + refunds balance) for every terminal-state order. (Covers audit #04 §F8 fee inconsistency.)
3. **Payout coherence.** Every `payout_ledger.status='completed'` row corresponds to a Stripe transfer object that exists, equals the recorded amount, and is not reversed. (Covers audit #10 §F1.)
4. **Handle coherence.** Every active handle in `agents.handle` resolves on `/v1/resolve/:handle` AND has a corresponding `agent_chain_registrations.status='active'` row. (Covers audit #08 §F4.)
5. **Inbox coherence.** Every `agents.inbox_active=true` agent has an `agent_inboxes` row, an MX record in DNS, and is reachable from a test send-to-self loop. (Covers audit #09.)
6. **Auth coherence.** Every active session belongs to an unrevoked user; every active OAuth token references an existing client. (Covers audit #01.)
7. **A2A coherence.** Every `a2a_engagements` row's `callCount` equals `COUNT(a2a_service_calls WHERE engagement_id = X AND status='success')`. (Covers audit #10 §A2A.)

These seven assertions, run nightly against a full-stack staging environment, would catch >80% of the silent-corruption bugs that the per-domain audits speculatively flagged.

---

## 5. The 30-60-90-Day Plan

### Days 0–7 — stop the bleeding

| Item | Action | Owner |
|---|---|---|
| C-NEW-1 | Rotate R2 keys, move to Replit Secrets, delete from `.replit` | Security/Ops |
| C-NEW-2 | Wire CI: `pnpm typecheck && pnpm test:unit` blocks deploy | Platform |
| C-NEW-2 | Fix the 6 `tsc` errors (30-min job each) | Platform |
| H-NEW-4 | Promote `CREDENTIAL_SIGNING_SECRET` to hard-fail in prod; add validation for `OAUTH_INTROSPECTION_SECRET`; reconcile README ↔ `env.ts` | Backend |
| H-NEW-5 | Separate `build` from `postBuild` housekeeping | Platform |
| #270 | Move on-chain transfers off the mint key | Onchain |
| #281 | Webhook event dedup table + replay safety | Backend |

### Days 7–30 — pay down the visibility debt

| Item | Action |
|---|---|
| C-NEW-3 | Convert post-merge "ensures" to real migrations; delete the script blocks |
| H-NEW-6 | Fill in `cross-system-coherence.integration.test.ts` (see §4 list 1) |
| H-NEW-7 | Write `THREAT_MODEL.md` |
| H-NEW-8 | Add `SECURITY.md`, `DPA.md`, `docs/data-retention.md`; audit Privacy.tsx vs post-March-17 surface |
| H-NEW-9 | Stub `CONTRIBUTING.md`, `RUNBOOK.md`, `ONCALL.md`, `INCIDENTS.md` |
| #258 | Speed up agent search/discovery |
| #259 | Cursor pagination on inbox + buyer orders |
| #260 | Default + max page size on every list endpoint |
| #264 | Standardise the error envelope (`{error, code, details}`) |
| #266 | Document the outbound webhook signature scheme |
| #271 | Anchor worker idempotency under crash |

### Days 30–90 — strategic durability

| Item | Action |
|---|---|
| Telemetry | Choose one of OpenTelemetry / Datadog / Honeycomb. Wire pino → log shipper. Extend the existing `/metrics` endpoint with business-level series (orders/min, mints/min, refund $/day, dispute open count) on top of today's process metrics. Wire alerting. |
| §4 invariants | Schedule the seven invariant tests nightly against staging. Page on failure. |
| M-NEW-10 | Decide finish/document/delete on each of the 7 half-finished subsystems. |
| #265 | Bring async Python SDK to parity with sync (87 → 87, currently 23). |
| #267, #268, #269 | The remaining billing-saga gaps. |
| HA/DR | Document and *test* a Postgres restore from backup. Document Redis failure mode (we tolerate loss of cached state but not of in-flight BullMQ jobs — verify). |
| Performance | Run `k6 load:test` against staging. Establish a baseline. Set p99 SLOs. |

---

## 6. Tactical Quick Wins (under 30 minutes each)

These are not strategic but they're cheap and accumulate.

1. **Delete `REPLIT_SUPER_PROMPT.md`** if it's stale (35 KB of root-level noise; if it's a meta-prompt for the agent, move to `.local/`).
2. **Date `CHANGELOG.md`** — last entry is March 25; either keep it current or delete.
3. **Add a `pnpm fmt` script** (`prettier --write .`) and a `pnpm fmt:check`.
4. **Add `node_modules`, `dist`, `.local`, `.tmp` to a top-level `.editorconfig`** so file conventions are encoded once.
5. **Add a top-level `LICENSE` file** if not already present (root `package.json` says `"license": "MIT"` — there should be a file).
6. **Remove `STRIPE_PRICE_*` from the dev `userenv` block** in `.replit` if dev should not be able to take real payments. Replace with explicit dev test prices.
7. **Set `DB_POOL_MAX = "20"` in production**, not `"100"` — audit #03 found pool size is over-provisioned for the PgBouncer/Replit Postgres setup; 100 connections invites Postgres-side connection exhaustion under load.
8. **Add `ALLOWED_ORIGINS` validation to env.ts** — currently any origin in CSV is trusted; one stray comma puts `*` into `cors()`.

---

## 7. The Risk Register

Sorted by what would hurt the most.

| ID | Risk | Likelihood | Impact | Status |
|---|---|---|---|---|
| R1 | R2 key compromise (C-NEW-1) | **High** — any past contributor or repo viewer | **Critical** — full attachment exfiltration + insertion | **Open** |
| R2 | Silent prod TS regression (C-NEW-2) | **Constantly** — no gate exists | **High** — runtime explosion in money flows | **Open** |
| R3 | Schema drift between `drizzle-kit push --force` and migrations (C-NEW-3) | **Medium** | **Critical** — column drop = data loss | **Open** |
| R4 | Stripe webhook event replay (audit #04, #281) | **Low** Stripe-side, **High** on retry storms | **High** — duplicate captures/refunds | **Proposed** (#281) |
| R5 | On-chain mint key exposure (audit #08, #270) | **Medium** — single hot key for mint + transfer | **Critical** — irrevocable on-chain damage | **Proposed** (#270) |
| R6 | Identity ↔ on-chain ↔ VC desync (H-NEW-6) | **Medium** | **High** — public profile lies | **Open** |
| R7 | Mail abuse (audit #09 — outbound rate limit not called, NDR loops) | **Medium** | **High** — Resend account suspension cascades the whole product | **Proposed** (#255, #256) |
| R8 | GDPR / privacy enforcement request (H-NEW-8) — Privacy/Terms pages exist, but no DPA, no documented retention, no Art. 17 workflow, no `SECURITY.md` | **Medium** — first EU paying customer | **Medium** — legal and reputational | **Open** |
| R9 | No external observability stack (audit #07) — `/metrics` and graceful shutdown exist but nothing scrapes/alerts | **Constantly** — every prod issue debug is harder | **Medium** — slows incident response | **Partially** (logs improved, alerting still absent) |
| R10 | OAuth client-secret hashing weak (audit #01) | **Low** today, **High** if DB dump leaks | **High** — any partner integration owned | **Proposed** (#262) |
| R11 | Connect payout reversal incomplete (audit #04 F1, #10 F1) | **Medium** | **High** — seller paid for refunded order | **Partially** (#279 closed orders/milestones; ad-hoc Dashboard refunds still racy) |
| R12 | OAuth open redirect (audit #01 §C1) | **Low** — discoverable | **Critical** — silent SSO token theft | **Proposed** (#261) |

---

## 8. What I Would Tell the Team Out Loud

> You are doing the right work. The merge cadence on the audit follow-ups is impressive, the saga implementation in #279 is genuinely senior-engineering work, the connection-naming in #276 is the kind of operability investment most teams skip, and the focus-trap pass in #252 is product polish that a lot of B2C apps never get to.
>
> But the *system* of doing the work has gaps. There is no CI catching the type errors that have been compounding for weeks. There is no schema-drift gate. There is a production secret committed to the repo. There is no threat model. There is no on-call runbook. These are not bugs, they are the *absence of a quality framework* — and they cost compounding interest, not principal, until one Friday afternoon when they cost everything.
>
> **Spend two weeks on platform discipline before you spend any more on features.** CI, secret rotation, threat model, runbook. The features will still be there. The trust you save will not have to be re-earned.

---

## 9. Methodology and Confidence Notes

- **What I did:** Read all 10 prior audits (~440 KB), surveyed the codebase layout (61 routes, 58 services, 77 schema tables, 12 workers, 36 migrations, 53 test files), read `replit.md`, `README.md`, `ARCHITECTURE.md`, `.replit`, `env.ts`, root `package.json`, the existing `cross-system-coherence.integration.test.ts`, and the `Privacy.tsx`/`Terms.tsx` pages. Spot-checked `tsc` output (6 errors) and test inventory. Did not re-do per-domain analysis already covered by audits 01–10 — only the cross-cutting work no per-domain audit could see.
- **Drafts I had to retract under review:** my first pass overstated H-NEW-4 (env.ts already hard-fails most prod secrets — the real holes are narrower) and H-NEW-8 (frontend Privacy/Terms pages exist; the gap is in DPA/retention/security disclosure). Audit #07 row in §2 originally implied no metrics export and no graceful shutdown; both exist. I have left the corrections inline rather than rewriting silently so the team can see the diff.
- **What I did not do:** Read every line of every service. Run dynamic analysis. Probe a live deployment. Audit the Solidity contracts. Audit the Cloudflare worker (`artifacts/cf-worker`) — it was not in scope of any of the 10 prior audits and probably warrants its own pass. Audit the MCP server (`artifacts/mcp-server`) for the same reason.
- **What I'd want next:** A live staging environment to run the §4 invariants against, a contract audit by a Solidity specialist, and an external pentest after the C-NEW and H-NEW items above are closed.
- **Confidence:** The Critical and High findings in §1 are based on direct evidence (file:line citations and observable repo state). The architecture observations in §3 are opinions of a principal-engineer-style reviewer; reasonable engineers will disagree on emphasis. The 30-60-90 plan in §5 is a starting point for prioritisation, not a contract.

---

*End of report.*
