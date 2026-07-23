# Agent ID full-system audit

Date: 2026-07-22; final verification updated 2026-07-23
Repository: `Agent-ID-Trust`
Branch audited: `master` through the final launch-remediation worktree
Overall verdict: **repository release candidate ready for a controlled off-chain identity and Stripe-subscription launch; deployment approval and external operations remain**

## Current remediation status — 2026-07-22

This section supersedes the baseline verdict and remediation instructions below. The detailed baseline findings are retained as an audit trail of what was found and why the changes were made.

All in-repository P0 blockers identified by this audit have been remediated:

- A dedicated `build:release` path now builds only deployable products and public packages; the locked install, typecheck, and complete release build pass.
- Free onboarding now creates one directly resolvable UUID identity without accidentally granting public discovery, handles, mail, or paid capabilities. Public visibility and other paid features are enforced from the authoritative subscription state.
- The unsafe raw-transaction USDC upgrade and crypto handle-checkout paths no longer grant entitlements; unsupported direct payment attempts fail closed. Optional x402 and on-chain functions remain feature-flagged off.
- Subscription access requires an active/trialing provider state and a future billing-period end. Stripe webhooks persist the authoritative period.
- Marketplace completion/payout now requires buyer acceptance, seller delivery, Stripe idempotency, Connect readiness, and atomic ledger updates. Marketplace commerce remains disabled by default pending operational approval.
- Human session tokens are hashed at rest; magic-link GET no longer redeems a token; cookie security now supports a deliberate local-development exception without weakening production.
- Pricing, marketplace fees, handle lifecycle rules, public documentation, SDK package names, discovery metadata, and generated OpenAPI clients are aligned.
- Production configuration fails closed when core secrets, Redis, Stripe, Resend, Cloudflare, OAuth, or enabled on-chain dependencies are absent.
- CI now provisions PostgreSQL and Redis and blocks on migrations, typecheck, all test suites, and the release build.
- The migration chain now creates the complete 89-table schema from an empty database. All 38 migrations applied successfully in an isolated PostgreSQL database, and the full integration and security suites pass against that migration-built schema.

Current verification evidence:

| Gate | Result |
|---|---:|
| Frozen-lockfile install | Pass |
| Empty-database migration, 38 migrations / 89 tables | Pass |
| Repository typecheck | Pass |
| API unit tests | 294/294 pass |
| API integration tests | 414/414 pass |
| API security tests | 434/434 pass |
| Frontend tests | 16/16 pass |
| TypeScript SDK tests | 22/22 pass |
| Resolver tests | 4/4 pass |
| Shared pricing tests | 10/10 pass |
| Authenticated browser E2E | 3/3 pass |
| Total automated tests | **1,197/1,197 pass** |
| API, web, SDK, resolver, and both MCP release builds | Pass |
| Diff whitespace, conflict-marker, and high-confidence secret scans | Pass |

Launch scope is intentionally narrow: persistent off-chain agent identity, cryptographic authentication, resolution, revocation/key rotation, policy/scopes, audit trails, and recurring Stripe subscriptions. On-chain minting, direct crypto upgrades, x402 payments, and marketplace commerce are not approved launch features and default to disabled.

The remaining work is external to the repository: deploy this release candidate and run migrations, provide production secrets, validate Stripe live-mode webhooks and rollback/restore procedures, repair `status.getagent.id` origin TLS, protect the branch with the new CI gate, and complete an approved SCA scan and external penetration test. See [`LAUNCH-READINESS-2026-07-22.md`](LAUNCH-READINESS-2026-07-22.md) for the release checklist.

## Baseline executive decision — superseded by the remediation status above

> The remainder of this report records the pre-remediation state observed earlier on 2026-07-22. Statements such as “required fix” and the original no-go verdict describe that baseline, not the current repository release candidate.

The system has a credible, technically differentiated core: persistent agent identities, Ed25519 proof-of-possession, scoped OAuth, API-key hygiene, signed webhooks, a resolver, an SDK, MCP support, billing, and a live deployment whose API, database, Redis, Stripe, Cloudflare, Resend, and workers all reported healthy during this audit.

It is not yet ready to scale paid traffic. Five release-blocking defects affect builds, onboarding, two crypto-payment verification paths, and subscription entitlement. The marketplace payment state machine also needs hardening before real buyer funds are put through it. Product scope and public documentation are materially inconsistent, making successful developer activation less likely even when the underlying API works.

The correct YC move is **not** to wait for $1M MRR. Apply now with an honest demo and a narrow B2B identity/control-plane story, while fixing the P0 issues before onboarding external paid customers.

## Audit scope and method

- Inventoried all 1,101 tracked files and 17 workspace packages.
- Scanned approximately 278,866 repository lines across source, tests, configuration, generated clients, assets, and metadata.
- Classified approximately 142,802 lines as handwritten code/tests after excluding generated and vendored-heavy areas.
- Ran repository-wide searches for secrets, trust boundaries, authorization, payment flows, webhooks, SSRF, crypto verification, subscription access, route/documentation drift, TODO/stub markers, merge artifacts, and dependency/runtime configuration.
- Manually traced the critical paths for sign-in, session handling, agent registration, proof-of-possession, OAuth, discovery, trust scoring, billing, Stripe webhooks, crypto payments, marketplace orders/milestones, payouts, webhook delivery, storage, and on-chain registration.
- Installed the locked dependency graph, ran type checking, builds, backend tests, frontend tests, and live production smoke checks.
- No product code was changed during this audit. This report is the only new artifact.

This is a full-repository engineering audit, not a formal penetration test, SOC 2 audit, financial audit, or legal opinion. A production database was not provided, so destructive or stateful end-to-end payment tests were not performed.

## Verification results

| Gate | Result | Evidence |
|---|---:|---|
| Locked install | Pass with warnings | 1,431 packages installed; native package build scripts were restricted |
| TypeScript typecheck | Pass | Root `pnpm typecheck` completed across the configured packages |
| Production build | **Fail** | `mockup-sandbox` cannot load `lightningcss.darwin-arm64.node` |
| API tests | **Fail** | 592 total: 410 passed, 134 failed, 48 skipped/pending; 79/165 suites passed |
| Frontend tests | **Fail** | 16 total: 14 passed, 2 failed in stale onboarding source-shape assertions |
| Diff whitespace check | Pass | `git diff --check` clean |
| Merge-conflict scan | Pass | No conflict markers in current tracked source |
| Dependency vulnerability audit | Not verified | External registry disclosure was not authorized in this environment |
| Live homepage | Pass | `https://getagent.id/` returned 200 |
| Live health | Pass | API, DB, Redis, Stripe, Cloudflare, Resend, and workers reported healthy |
| Live OpenAPI | Pass | `/api/docs/openapi.json` returned 200 JSON |
| Live discovery config | Pass | `/.well-known/agentid-configuration` returned 200 JSON |
| Live status site | **Fail** | `https://status.getagent.id/` returned Cloudflare 525 SSL handshake failure |
| Live root `llms.txt` | Drift | Returned HTML although source defines a text response; advertised canonical endpoint is `/api/llms.txt` |

The API failures are not all independent product defects. Many integration/security suites abort because `DATABASE_URL` is absent, and multiple Supertest suites fail with a null server-port harness error. That is still a release-engineering defect: the default documented test command is red, tests do not self-provision or skip cleanly, and no CI configuration exists to demonstrate a reproducible green gate.

## P0 — release blockers

### P0-1: The workspace cannot produce a reproducible production build

`pnpm build:all` fails while building `artifacts/mockup-sandbox` because Lightning CSS cannot load its Darwin ARM64 native module. [`pnpm-workspace.yaml`](pnpm-workspace.yaml) explicitly removes every Lightning CSS native package, including the current platform, and similarly removes many esbuild/Rollup/Tailwind platform binaries.

Impact: a clean checkout cannot be trusted to build or deploy. Because the root release command includes mockup, pitch, and video artifacts, non-product packages can block the production release.

Required fix:

1. Remove the override for the current/supported platform packages and approve required native build dependencies.
2. Split deployable products from mockup/pitch/video packages; make a minimal production build command.
3. Rebuild in a clean macOS and Linux CI environment.

### P0-2: First-run onboarding and the paywall contradict each other

The public product promises a free identity, but [`billing.ts`](artifacts/api-server/src/services/billing.ts) assigns Free/None an agent limit of zero. [`routes/v1/index.ts`](artifacts/api-server/src/routes/v1/index.ts) requires Starter before creating an agent without a 5+ character handle. [`GetStarted.tsx`](artifacts/agent-id/src/pages/GetStarted.tsx) creates the agent before it sends the user to a subscription checkout; the submitted `intendedPlan` does not satisfy the server's actual-plan gate.

This creates a binary failure:

- `LAUNCH_MODE=false`: new free users and users who merely selected Starter/Pro can be blocked before the checkout CTA exists.
- `LAUNCH_MODE=true`: plan limits become 999 and most paid capabilities are enabled, effectively removing the paywall.

Impact: the primary activation funnel is either broken or non-monetizing.

Required fix: choose one canonical model. Recommended: Free can create 1–3 sandbox agents; choosing a paid plan creates a Stripe subscription first, and the paid entitlement is consumed only after a verified webhook. Add an end-to-end new-user test for Free, Starter, Pro, declined checkout, and webhook delay.

### P0-3: Agentic USDC plan upgrades can be forged and replayed

[`verifyUSDCPayment`](artifacts/api-server/src/services/agentic-payment.ts) fetches `eth_getTransactionReceipt` and accepts any receipt whose status is `0x1`. It does not verify:

- the USDC contract;
- a Transfer event;
- recipient/treasury address;
- sender or checkout owner;
- amount;
- chain ID and confirmation depth;
- transaction uniqueness/replay.

On success, the caller activates both the agent and user plan. Any successful Base transaction hash can therefore activate Starter or Pro, and the same hash can be reused.

Impact: direct revenue bypass and fraudulent paid entitlements.

Required fix: disable this route until verification is replaced with a persisted payment intent containing chain, token, payer, recipient, exact amount, creation block, expiry, and unique reference. Verify finalized token logs and enforce a unique `(chain_id, tx_hash, log_index)` database constraint before granting access.

### P0-4: Handle crypto checkout can consume unrelated transfers

[`pollForCryptoPayment`](artifacts/api-server/src/services/billing.ts) scans the latest 1,000 blocks for USDC/USDT transfers to the platform wallet and accepts any value greater than or equal to the expected amount. It does not bind the transfer to the checkout's payer, creation block/time, or reference, and it does not persist/deduplicate the consumed transaction.

Impact: one customer can claim another customer's transfer, old transfers can satisfy new checkouts, and transfers can be replayed.

Required fix: use unique deposit addresses or an on-chain checkout contract/reference. Persist checkout state and atomically consume a uniquely indexed chain event.

### P0-5: One-time charges can create indefinite “active” subscriptions

The agentic Stripe preauthorization path creates a one-time PaymentIntent for a monthly/yearly price, while the USDC path is also a one-time transfer. Both call `activatePlanForUser`/`activatePlanForAgent`. [`getActiveUserSubscription`](artifacts/api-server/src/services/billing.ts) checks only `status = active`; it never checks `currentPeriodEnd`. No expiration/reconciliation worker was found.

Impact: a single monthly charge can produce indefinite access, reported MRR will not match recurring contracts, and entitlements can outlive payment.

Required fix: use Stripe Subscriptions for recurring card access. If crypto remains prepaid, create a separate prepaid entitlement that expires automatically. Every authorization check must enforce period validity, and a scheduled reconciliation job must downgrade expired/failed subscriptions.

## P1 — high-risk findings

### P1-1: Marketplace completion and payout are controlled by the seller

In [`orders.ts`](artifacts/api-server/src/services/orders.ts), the seller can confirm an order and later mark it complete. For non-milestone work, completion can trigger a Stripe Connect transfer without buyer acceptance, an arbiter decision, or a dispute window.

The database is marked completed before the external payout and ledger writes. Stripe capture/transfers in this order path do not use idempotency keys. A crash between these steps can leave external money moved while internal state or ledgers are incomplete; a retry sees an already-completed order and cannot safely resume. Sellers without Connect fall into a manual-payout queue.

Required fix: buyer-approved release or time-delayed release with a dispute path; an idempotent payout state machine/outbox; immutable double-entry ledger entries; reconciliation jobs; and operator tooling. Do not process real marketplace funds before this is tested under retries and injected failures.

### P1-2: Public SDK instructions use a different package name than the repository

The SDK manifest is [`@getagentid/sdk`](lib/sdk/package.json), and its README uses that name. Most website onboarding and docs instead instruct users to install/import `@agentid/sdk`. Dashboard Overview is one of the few pages using `@getagentid/sdk`.

Impact: the first developer integration command can fail, directly damaging activation and YC demo credibility.

Required fix: decide the canonical published package, verify it from a clean external machine, replace every code sample, and add a docs test that installs and imports the exact published package.

### P1-3: Pricing and fee definitions disagree

The shared pricing module defines 3-character handles at $99/year, 4-character at $29/year, and 5+ handles as included with Starter/Pro with no standalone price. The onboarding UI repeatedly advertises a standalone $5/year 5+ handle and renders a “Pay $5/yr” action.

Marketplace fees also have two definitions: `MARKETPLACE_FEE_BPS = 250` (2.5%) in billing and `PLATFORM_FEE_RATE = 0.10` (10%) in marketplace calculation.

Impact: customers, support, financial ledgers, and marketing cannot share one contract; the displayed checkout may not match entitlement behavior.

Required fix: one versioned pricing/entitlement module consumed by server, UI, checkout, invoices, tests, and docs. Remove all hard-coded prices and fee rates elsewhere.

### P1-4: No actual CI gate exists

There is no `.github/workflows` configuration, while [`docs/testing.md`](docs/testing.md) states that `.github/workflows/test.yml` runs blocking unit, integration, and security jobs. Root `pnpm test` only runs API tests and omits several workspace test suites. There is no enforced coverage threshold.

Impact: regressions can merge with no build, test, migration, or security evidence.

Required fix: add clean-install, lint/typecheck, unit, ephemeral-Postgres/Redis integration, security, migration, production-build, and minimal browser-smoke jobs. Protect `master` with these checks.

### P1-5: Production configuration documentation is incomplete and drifting

`.env.example` omits important production variables such as admin authorization, explicit allowed origins, trusted proxy configuration, OAuth secrets, Stripe price IDs/publishable key, Base/R2 settings, and several runtime variables. It also documents provider variables not represented in the validated schema. Code references additional aliases and legacy names outside the central environment definition.

Impact: operators can deploy an internally inconsistent environment; security behavior depends on undocumented variables.

Required fix: generate `.env.example` and deployment validation from one typed schema; fail on unknown/deprecated variables in CI; document secret ownership and rotation.

### P1-6: The on-chain product is not mainnet-release reproducible

`contracts/` contains documentation and deployment metadata but no contract source, ABI build artifact, tests, or deploy/upgrade tooling. Base mainnet proxy/implementation/registry values in `contracts/deployment.json` are empty; only Sepolia is populated.

Impact: on-chain identity claims cannot be independently built, audited, reproduced, or safely upgraded from this repository.

Required fix: check in source, tests, compiler lock/settings, ABI, deployment scripts, ownership/upgrade policy, verified deployment addresses, and incident procedures. Do not market mainnet guarantees until these exist.

### P1-7: The live status surface is broken

`https://status.getagent.id/` returned Cloudflare HTTP 525 during the audit, even while the main API health endpoint was green.

Impact: a trust-infrastructure company currently has a visibly untrustworthy status endpoint.

Required fix: correct origin TLS/certificate configuration, add external monitoring from multiple regions, and make status checks part of release verification.

## P2 — material correctness and maintainability findings

### Documentation and API drift

- 345 Express route declarations were found versus 111 OpenAPI path entries. The figures are not exactly one-to-one, but they demonstrate substantial generated-client coverage gaps.
- Documentation describes a live endpoint health probe, while [`trust-score.ts`](artifacts/api-server/src/services/trust-score.ts) explicitly scores only URL presence, HTTPS, and agent status. Any syntactically valid HTTPS URL can receive most endpoint points without being reachable.
- Root `/llms.txt` behavior in production did not match source; the well-known document advertises `/api/llms.txt`.
- Some docs describe transfer/public-listing functionality whose service implementation remains disabled or incomplete.
- The old `AUDIT-2026-04-08.md` is stale: its merge-conflict and migration-manifest conclusions no longer describe current `master`. Archive it or clearly mark it superseded.

### Authentication hardening still worth doing

- A legacy GET magic-link route still accepts a token in the query string; the newer fragment-plus-POST path is safer. Remove the legacy route after a migration window.
- Human session identifiers are stored raw in the database. Hash session IDs at rest so a read-only database leak cannot immediately become session hijacking.
- Secure cookies are unconditional, which is safe in production but makes plain-HTTP local auth workflows fail unless development uses TLS or a deliberate development exception.

### Operational and code-ownership risk

- Several core files exceed 1,500–2,600 lines, including billing, agents, dashboard, onboarding, and visual app components. Payment and entitlement state machines are difficult to reason about in files of this size.
- Build scope includes product, mockups, pitch, and video artifacts. Ownership and release boundaries are unclear.
- Python SDK metadata includes multiple generated egg-info directories; generated artifacts should be reproducible and excluded from source where appropriate.
- Dependency vulnerabilities were not verified in this run. Perform an approved private registry/SCA scan before release.

## What is already strong

The current code is materially better than the stale April audit:

- No merge-conflict markers remain in tracked source.
- Repository type checking is green.
- Production environment validation, fail-closed CORS, and trusted-proxy checks are present.
- Admin authorization combines a secret, timing-safe comparison, and an IP allowlist.
- New magic-link tokens are hashed, rate-limited, exchanged with POST, and placed in a URL fragment rather than the query.
- OAuth scope handling defaults closed; PKCE S256 and refresh grants are implemented.
- API keys are hashed, and agent authentication supports Ed25519 proof-of-possession with nonce replay prevention.
- Authenticated MCP proxying is present.
- Registered webhook delivery includes DNS-aware SSRF protections and controlled redirects.
- R2 attachment storage exists; the old report's “missing upload implementation” conclusion is obsolete.
- Migration journal entries now include the newer migrations that were missing in the old report.
- The live `/api/healthz` check reported healthy database, Redis, integrations, and workers during this audit.

## YC application recommendation

As of this audit, YC's official application page lists the Fall 2026 deadline as **July 27, 2026 at 8:00 p.m. Pacific Time**, with late applications still considered. Submit before the deadline; do not wait for arbitrary revenue maturity.

Recommended one-sentence company description:

> Agent ID is the identity and access control layer for autonomous AI agents: one API gives every agent a persistent cryptographic identity, scoped credentials, revocation, and auditable trust signals.

Do not lead with registry + domains + mail + marketplace + jobs + wallets + NFTs + payments. That breadth makes the product look unfocused. Lead with the painful enterprise wedge: companies deploying agents need to know which agent is acting, what it may do, and how to revoke it immediately.

Demo only the shortest trust loop:

1. Register an agent and issue its cryptographic identity.
2. Authenticate a signed request and resolve the identity.
3. Apply a narrow scope/policy.
4. Revoke or rotate the key.
5. Show the same request immediately denied and the action logged.

Application evidence should be honest and quantitative: active design partners, weekly active agents, verifications per day, integration time, retention, paying teams, and named customer insight. Do not imply that unfinished marketplace or mainnet paths are live.

## Path to $1M MRR

$1M MRR is a scale objective, not a YC application requirement.

At current self-serve prices, the target requires approximately:

- 34,483 Starter accounts at $29/month; or
- 12,659 Pro accounts at $79/month; or
- 16,667 accounts at a $60 blended ARPA.

That is an implausibly expensive first route for a new developer-infrastructure product. Pro also includes 25 agents for $79, only about $3.16 per allowed agent, which limits expansion revenue.

Recommended pricing architecture:

| Tier | Suggested model | Purpose |
|---|---|---|
| Developer | Free, 3 sandbox agents | Fast adoption and real integrations |
| Team | $299/month + $10–$20 per active agent | Production workloads and expansion |
| Business | From $1,500/month + usage | SSO, RBAC, policies, audit retention |
| Enterprise | $5k–$20k/month | SLA, compliance, private deployment, support |
| Payments later | 1%–2.5% | Only after marketplace settlement is trustworthy |

A more credible target mix is 100 enterprise customers at $5,000 MRR ($500k), 5,000 Pro-equivalent accounts at $79 ($395k), and roughly 3,621 Starter accounts at $29 (about $105k). An even better outcome is to replace much of the low-ARPA tail with Business contracts and per-active-agent usage.

The growth loop should be: free SDK integration → production agent verification → team policy/audit need → usage expansion → enterprise controls. Marketplace transaction revenue is optional upside, not the foundation of the first $1M MRR plan.

## Execution order

### Next 24 hours — YC/demo safety

1. Disable both unsafe crypto-payment verification paths.
2. Fix the clean production build and define a product-only build command.
3. Fix the onboarding/paywall sequence and canonical SDK package name.
4. Repair `status.getagent.id` TLS.
5. Record a 60–90 second identity/auth/revocation demo.
6. Submit the YC application before the deadline with truthful current traction.

### Next 7 days — paid beta readiness

1. Enforce subscription expiration and reconcile Stripe state.
2. Centralize pricing and entitlement definitions.
3. Add CI with ephemeral PostgreSQL/Redis and make all gates green.
4. Align OpenAPI, docs, SDK examples, and production routing.
5. Add monitoring, alerting, backup/restore verification, and a deployment rollback runbook.
6. Recruit 5–10 narrow design partners that already deploy autonomous agents.

### Next 30 days — controlled production

1. Run an external penetration test and approved dependency/SCA scan.
2. Complete contract source/test/deployment reproducibility or remove on-chain claims from the launch scope.
3. Redesign marketplace escrow as an idempotent, buyer-approved state machine before accepting funds.
4. Split oversized payment, billing, agent, and onboarding modules into owned bounded contexts.
5. Instrument the activation funnel and report weekly active agents, verification volume, retention, conversion, expansion, gross margin, and incidents.

## Go/no-go criteria

Do not call the system paid-production-ready until all of the following are true:

- clean install, production build, and complete test matrix are green in protected CI;
- no payment can be credited without exact payer/token/recipient/amount/reference verification and replay protection;
- paid access expires or renews from authoritative provider state;
- a new user can complete Free and paid onboarding end to end;
- SDK install/import commands work from a clean public environment;
- pricing shown, charged, entitled, invoiced, and documented is identical;
- status, monitoring, backup restore, and rollback procedures are tested;
- marketplace payout requires buyer/arbiter authority and survives retries/crashes;
- security and dependency reviews have no unresolved critical/high findings.

Current recommendation: **YC application — go now. External paid production launch — no-go until P0 and payment P1 findings are closed.**
