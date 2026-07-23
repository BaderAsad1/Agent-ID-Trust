# Agent ID launch-readiness handoff

Date: 2026-07-22; final verification updated 2026-07-23
Scope: controlled production launch of the off-chain identity platform and recurring Stripe plans
Repository status: **release candidate ready**
Live deployment status: **not updated by this audit**

## Decision

The repository is ready to enter a controlled deployment process. It is not accurate to call the new release live until an operator deploys it, runs the database migrations, supplies the production secrets, and completes the post-deploy checks below.

Approved launch capabilities:

- persistent agent identities and UUID resolution;
- Ed25519 proof-of-possession, scoped OAuth, API keys, sessions, key rotation, and revocation;
- public profiles/discovery for entitled paid agents;
- trust and audit signals;
- SDK, resolver, and MCP integrations;
- recurring Stripe Starter and Pro subscriptions;
- email/domain functionality when Resend and Cloudflare production credentials are present.

Not approved for launch:

- raw USDC/USDT plan or handle upgrades;
- on-chain registration/minting;
- x402 payments;
- marketplace checkout, escrow, or seller payouts.

Keep these flags false for the initial launch:

```dotenv
ONCHAIN_MINTING_ENABLED=false
X402_ENABLED=false
MARKETPLACE_COMMERCE_ENABLED=false
```

## What was resolved

### Revenue and entitlements

- Free/None receives one non-public, directly resolvable UUID identity. It does not receive a handle, mail, public discovery, or private subagents.
- Paid behavior is granted only from active/trialing subscription state with an unexpired provider period.
- Stripe webhook processing records billing periods and uses canonical price/product configuration.
- Unsafe direct-crypto verification paths fail closed instead of crediting a successful but unrelated transaction.
- Pricing and feature limits are centralized; the marketplace fee is consistently 2.5%.

### Security and trust boundaries

- Session tokens are stored as hashes.
- Magic-link GET requests no longer consume credentials.
- Production CORS, proxy, secrets, OAuth, email webhook, Cloudflare, Redis, and billing configuration fail closed.
- Public/private identity visibility is checked on creation and update; callers cannot bypass plan restrictions with `isPublic` input.
- Marketplace payment state transitions require the correct buyer/seller authority and use provider idempotency and atomic ledger writes.
- On-chain, x402, and marketplace-money surfaces are disabled by default.

### Product truth and developer experience

- The canonical package is `@getagentid/sdk` across public instructions.
- Discovery metadata points to real routes and documents the per-agent well-known template.
- OpenAPI and generated TypeScript clients include the critical public identity and programmatic registration contracts.
- Handle expiry uses one lifecycle: 30-day reminder, 90-day grace period, then a 21-day auction for eligible off-chain handles. Anchored handles retire rather than being re-auctioned.
- Unsupported mainnet/on-chain claims were removed or explicitly labeled deferred.
- Major frontend routes are lazy-loaded and vendor chunks are split. The current main application chunk is about 548 kB / 124 kB gzip, down from the pre-remediation baseline of about 719 kB / 188 kB gzip.

### Release engineering

- `pnpm run build:release` covers the API, production web app, SDK, resolver, and both MCP packages.
- GitHub CI provisions PostgreSQL 17 and Redis 7 and blocks on migrations, typecheck, six test groups, and the release build.
- The database package has a real migration command; CI no longer mutates schema with `push --force`.
- The full migration history creates the 88-table application schema from a blank database.

## Verification record

Executed from a frozen lockfile on Node 20.20.2 and pnpm 10.33.0:

| Verification | Result |
|---|---:|
| `pnpm install --frozen-lockfile` | Pass |
| Blank PostgreSQL migration | 38/38 migrations, 89 tables |
| `pnpm run typecheck` | Pass |
| API unit | 294/294 |
| API integration | 414/414 |
| API security | 434/434 |
| Frontend | 16/16 |
| SDK | 22/22 |
| Resolver | 4/4 |
| Shared pricing | 10/10 |
| Authenticated mail browser E2E | 3/3 |
| Automated test total | **1,197/1,197** |
| `pnpm run build:release` | Pass |
| `git diff --check` | Pass |
| Merge-conflict marker scan | Pass |
| High-confidence committed-secret pattern scan | Pass |

The live service observed during the audit returned HTTP 200 for the [homepage](https://getagent.id/), `/api/healthz`, and `/.well-known/agentid-configuration`. That verifies the existing deployment, not this undelivered release candidate. `status.getagent.id` returned Cloudflare 525 and must have its origin TLS repaired.

## Production release checklist

### Before deployment

- [ ] Review and approve the complete diff; commit it on a release branch.
- [ ] Make the new GitHub `Launch Gate` workflow required on the protected branch and obtain a green Linux CI run.
- [ ] Create a production database snapshot and document its recovery point.
- [ ] Populate all variables in [`.env.example`](.env.example) from the secret manager. Use independent 32+ character secrets; do not reuse test values.
- [ ] Confirm Stripe live price IDs, publishable/secret keys, and the signed webhook endpoint.
- [ ] Confirm Redis persistence/availability, Resend domains and webhook secret, and Cloudflare zone/token scope.
- [ ] Keep on-chain, x402, and marketplace commerce flags false.
- [ ] Run an approved private dependency/SCA scan and resolve critical/high findings or record an explicit risk acceptance.

### Deploy

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/db migrate
pnpm run build:release
```

Deploy the generated server and web artifacts using the existing platform process. Migrations must complete before application traffic is shifted.

Use the migration command above as the only production schema path. Do not replace it with `drizzle-kit push --force`; migration-built PostgreSQL was validated directly by all 414 integration tests and all 434 security tests.

### Post-deploy smoke tests

- [ ] `GET /api/healthz` reports healthy database, Redis, Stripe, Cloudflare, Resend, and workers.
- [ ] `GET /.well-known/agentid-configuration` returns JSON with the production origin and valid public routes.
- [ ] Register a free account and confirm exactly one non-public UUID identity can be created.
- [ ] Confirm a free user cannot enable public visibility, mail, handles, or paid API capabilities.
- [ ] Complete a Stripe live-mode paid checkout with a controlled test customer; verify the signed webhook grants the correct plan and future period.
- [ ] Replay the Stripe event and verify it is idempotent.
- [ ] Cancel or expire the controlled subscription and verify entitlement removal.
- [ ] Authenticate a signed agent request, rotate/revoke the key, and confirm the old credential is immediately rejected and audited.
- [ ] Resolve an entitled public agent through the UUID/handle and per-agent well-known paths.
- [ ] Confirm raw crypto, on-chain, x402, and marketplace-money requests are unavailable while their flags are false.
- [ ] Verify logs, alerts, error tracking, and the external status monitor.

### Rollback criteria

Rollback traffic immediately if migrations fail, health becomes degraded, authentication or revocation regresses, webhook signatures fail, plan state differs from Stripe, private agents become publicly discoverable, or error/latency rates exceed the agreed launch threshold.

Application rollback must not blindly reverse an additive database migration. Restore application traffic to the prior compatible build, preserve the database snapshot, and investigate before any destructive schema action.

## Remaining external risks

These cannot be completed safely from source code alone:

1. Production deployment and secret injection require operator authority.
2. `status.getagent.id` needs an origin certificate/TLS repair in Cloudflare or the status provider.
3. Backup restoration and release rollback need a real infrastructure drill.
4. Stripe live-mode checkout/webhook/cancellation needs controlled real-provider validation.
5. A private SCA scan and independent penetration test still need approval and execution.
6. Mainnet contract source, audited deployment, and operational custody do not exist in this repository; on-chain claims must remain disabled.
7. Marketplace settlement needs an operational reconciliation/dispute program even though the code state machine is now safer; commerce stays disabled until separately approved.

## YC and $1M MRR positioning

Apply to YC with the narrow, demonstrable wedge: Agent ID is the identity and access-control layer that lets a company identify, authorize, audit, rotate, and revoke autonomous agents through one API.

Do not present marketplace, wallets, NFTs, and broad agent infrastructure as simultaneously live. Demonstrate one trust loop: create identity, authenticate, constrain scope, revoke, and show the request denied with an audit record.

$1M MRR is a commercial program, not an engineering completion flag. The most credible route is enterprise/team pricing with per-active-agent expansion, not tens of thousands of low-ARPA self-serve accounts. Instrument and report activation, time-to-first-verification, weekly active agents, verification volume, paid conversion, retention, expansion, gross margin, and incidents from the first design partners.
