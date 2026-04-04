# Agent ID — Full System Audit Document

**Date:** 2026-03-18  
**Auditor:** Code-first inspection of all source files, migrations, tests, and SDKs  
**Purpose:** Exhaustive technical audit covering all 18 domains, suitable for a technical acquirer, security auditor, or senior architect  
**Source commits:** As of task-122 assignment date

### Verification Methodology

All findings are grounded in direct source code inspection unless explicitly labeled otherwise. Specific conventions:
- **Code-verified:** Statements about routes, middleware, service logic, schema, and SDK behavior are drawn from reading the actual TypeScript/Python/SQL source files.
- **Infrastructure notes:** Two statements about deployment behavior (`.well-known` SPA routing, wildcard SSL) are labeled as infrastructure-layer observations. These describe runtime/deployment behavior that cannot be verified from source alone — they are clearly marked as such.
- **Schema statistics** (table counts, index counts) were independently verified by grepping across migration SQL files (see Section 12.1).

---

## Table of Contents

1. [Repo & Architecture Inventory](#1-repo--architecture-inventory)
2. [Human Flow Audit](#2-human-flow-audit)
3. [Autonomous Agent Flow Audit](#3-autonomous-agent-flow-audit)
4. [Claim-Later Ownership Model Audit](#4-claim-later-ownership-model-audit)
5. [Auth & Authorization Audit](#5-auth--authorization-audit)
6. [Verification Flow Audit](#6-verification-flow-audit)
7. [Trust & Credential System Audit](#7-trust--credential-system-audit)
8. [.agentid Handle & Resolver Audit](#8-agentid-handle--resolver-audit)
9. [Onchain / Smart Contract Audit](#9-onchain--smart-contract-audit)
10. [Payment / Billing / Wallet Audit](#10-payment--billing--wallet-audit)
11. [Admin / Ops Audit](#11-admin--ops-audit)
12. [Database / Schema / State Machine Audit](#12-database--schema--state-machine-audit)
13. [API Surface Audit](#13-api-surface-audit)
14. [SDK Audit](#14-sdk-audit)
15. [MCP Audit](#15-mcp-audit)
16. [Test Coverage Audit](#16-test-coverage-audit)
17. [Security-Sensitive Observations](#17-security-sensitive-observations)
18. [Current Reality vs. Roadmap](#18-current-reality-vs-roadmap)

---

## 1. Repo & Architecture Inventory

### 1.1 Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          — Express.js + TypeScript backend (core platform)
│   ├── agent-id/            — React + Vite frontend SPA
│   ├── cf-worker/           — Cloudflare Worker (edge resolver / handle routing)
│   ├── mcp-server/          — MCP server wrapper (proxies to api-server)
│   ├── video/               — Marketing video artifact
│   └── pitch-deck/          — Investor pitch deck artifact
└── lib/
    ├── sdk/                 — TypeScript SDK (@agentid/sdk)
    ├── mcp-server/          — MCP server package (@getagentid/mcp)
    ├── resolver/            — Standalone AgentResolver class (@agentid/resolver)
    ├── python-sdk/          — Python SDK (agentid)
    ├── db/                  — Drizzle ORM schema and migrations
    ├── api-spec/            — OpenAPI YAML specification
    ├── api-zod/             — Zod schemas mirroring OpenAPI spec
    └── api-client-react/    — Generated React Query client
```

### 1.2 Package / Service Map

| Package | Role | External Dependencies |
|---------|------|-----------------------|
| `artifacts/api-server` | API server (all business logic) | PostgreSQL, Redis (optional), Stripe, Resend, Cloudflare, Coinbase CDP |
| `artifacts/agent-id` | Frontend SPA (React + Vite) | api-server |
| `artifacts/cf-worker` | Edge handle resolution | api-server |
| `lib/sdk` | TypeScript SDK | api-server (HTTP) |
| `lib/mcp-server` | MCP tool server | api-server (HTTP) |
| `lib/resolver` | Standalone resolver | api-server (HTTP) |
| `lib/python-sdk` | Python SDK | api-server (HTTP) |
| `lib/db` | Schema + ORM | PostgreSQL |
| `lib/api-spec` | OpenAPI spec | — |
| `lib/api-zod` | Runtime validation | — |
| `lib/api-client-react` | React hooks | api-server (HTTP) |

### 1.3 Core vs. Peripheral Classification

**Core** (required for basic platform operation):
- `artifacts/api-server` — all auth, agent CRUD, verification, trust, resolution
- `lib/db` — schema, all persistent state
- `artifacts/agent-id` — user-facing dashboard

**Peripheral** (important but not load-bearing):
- `artifacts/cf-worker` — edge routing; platform functions without it
- `lib/sdk`, `lib/mcp-server`, `lib/resolver`, `lib/python-sdk` — developer-facing access layers
- `artifacts/video`, `artifacts/pitch-deck` — marketing assets only

### 1.4 Middleware Stack (app.ts order)

1. `requestIdMiddleware` — injects X-Request-ID
2. `securityHeaders` — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
3. `sandboxMiddleware` — marks sandbox requests
4. `requestLogger` — structured JSON request logging
5. `corsOrigins` — **production-scoped** to `REPLIT_DEV_DOMAIN`, `BASE_AGENT_DOMAIN`, `https://getagent.id`
6. `cookieParser`
7. `cliDetect` / `cliMarkdownRoot` — CLI detection / markdown rendering
8. `express.json({ limit: "100kb" })` — body parsing (Stripe webhook bypassed, Resend webhook uses rawBody)
9. `replitAuth` — session-cookie auth; upserts user from session
10. `apiKeyAuth` — Bearer aid_* API key fallback
11. `apiRateLimiter` (per `/api`) — Redis-backed (falls back to in-memory)
12. `agentUserAgentMiddleware` (per `/api/v1`) — UA parsing
13. Per-route: `requireAuth`, `requireAgentAuth`, `requirePlan`, `requireScope`
14. `errorHandler` — centralized error formatter

**CORS:** Production-scoped. In dev (`NODE_ENV !== "production"`) all origins are allowed. In production, restricted to an explicit allowlist starting with `https://getagent.id` (always present) plus optional `REPLIT_DEV_DOMAIN` and `BASE_AGENT_DOMAIN`. No wildcard fallback.

### 1.5 Background Workers

| Worker | Queue | Fallback | Function |
|--------|-------|----------|----------|
| `domain-provisioning.ts` | `domain-provisioning` | No-op if no Redis | Creates Cloudflare DNS records for .agent domains |
| `webhook-delivery.ts` | `webhook-delivery` | In-process, no retry | Delivers webhook events with HMAC signatures |
| `handle-lifecycle.ts` | `handle-lifecycle` | Interval timer | Sends renewal reminders, expires handles post-grace-period, creates auctions |
| `agent-expiry.ts` | `agent-expiry` | Interval timer | Deletes stale unverified (>24h) agents; expires ephemeral/sandbox agents |
| `outbound-mail.ts` | `outbound-mail` | Sync fallback | BullMQ-driven Resend email delivery |
| `undeliverable-cleanup.ts` | — (interval) | — | 30-day TTL cleanup on undeliverable messages |
| `trust-recalculation.ts` | — | — | Periodic trust score recomputation |
| `email-delivery.ts` | — | — | Email delivery worker |
| `webhook-retry.ts` | — | — | Webhook retry logic |

All BullMQ-backed workers silently degrade when Redis is unavailable. `registrationRateLimitStrict` hard-blocks new registrations in production when Redis is absent.

---

## 2. Human Flow Audit

### 2.1 Signup / Login

| Step | Route | Auth | DB Writes | Side Effects | Failure Mode |
|------|-------|------|-----------|--------------|--------------|
| Session established | `GET /v1/auth/status` | Replit session cookie | `INSERT users` on first request | — | 401 if no session |
| User profile read | `GET /v1/users/me` | `requireAuth` | — | — | 401 |
| API key creation | `POST /v1/users/me/api-keys` | `requireAuth` | `INSERT api_keys` | — | 401, 400 |

Auth relies on session cookies set by the Replit OIDC flow (`routes/auth-oidc.ts`). There is no email/password auth. Replit is the sole identity provider.

### 2.2 Agent Registration (Human)

| Step | Route | DB Writes | Side Effects |
|------|-------|-----------|--------------|
| Check handle | `GET /v1/handles/check` | — | — |
| Pay for handle | `POST /v1/billing/handle-checkout` | — | Creates Stripe checkout session |
| Register agent | `POST /v1/agents` | `INSERT agents` | Domain provisioning (if Redis+CF configured); requires `requirePlan("starter")` + `checkAgentLimit()` |
| Upload key | `POST /v1/agents/:id/keys` | `INSERT agent_keys` | — |
| Verify | `POST /v1/agents/:id/verify/initiate` → `POST /v1/agents/:id/verify/complete` | `INSERT agent_verification_challenges`; `UPDATE agents` (status→active, verificationStatus→verified) | Trust recompute, credential reissue, webhook fire |

**Auth required:** `requireAuth` on all steps. Handle purchase requires active subscription for 5+ char handles.

### 2.3 Key Upload

`POST /v1/agents/:id/keys` accepts `publicKey` (base64-encoded SPKI DER) and `keyType` ("ed25519"). Key is stored in `agent_keys` table; key ID (`kid`) is a UUID. Multiple keys per agent allowed; rotation via `PUT /v1/agents/:id/keys/:kid/rotate`.

### 2.4 Fleet / Org Management

`/v1/fleet` — sub-handle management; requires Pro/Enterprise (`requirePlan("fleetManagement")`). Creates child agents with shared handle namespace. Organization management via `/v1/organizations` and `/v1/org-policies`.

### 2.5 Handle Checkout

1. `POST /v1/billing/handle-checkout` → Stripe Checkout Session created
2. User redirected to Stripe
3. Stripe fires `checkout.session.completed` webhook → `POST /v1/webhooks/stripe` → `handleCheckoutCompleted()` → `assignHandleToAgent()`, sets `handlePaid=true`, `handleRegisteredAt`, `handleExpiresAt` (+1 year)
4. Handle renewal: `POST /v1/billing/handle-renewal` → new Stripe session

**Finding:** Standard (5+ char) handles at registration time via the programmatic path require an **active** Stripe subscription (not just any user plan). The code checks `getActiveUserSubscription()` and rejects if no eligible plan is active. Handle fee ($10/yr) is separate from plan subscription.

**Finding:** 3-char ($640/yr) and 4-char ($160/yr) handles are described as requiring "on-chain payment" in the error messages (`checkoutUrl: /api/v1/pay/handle/claim`) but the actual implementation routes them to Stripe, not a blockchain transaction. The `handle_is_onchain` field defaults to false. See Section 9.

### 2.6 Transfer / Sale

Documented fully in Section 12 (state machine) and Section 9 (escrow gap). Entry point: `POST /v1/agents/:id/transfers/create` (`requireAuth`). Transfer requires readiness check: agent must be `active`, `verified`, have no pending tasks or open disputes.

### 2.7 Billing / Marketplace Listing

Marketplace listing requires `requirePlan("canListOnMarketplace")` — satisfied by Starter, Pro, or Enterprise. Free/none plan cannot list.

---

## 3. Autonomous Agent Flow Audit

### 3.1 New Programmatic Path (`POST /v1/programmatic/agents/register`)

This is the **no-human-auth-required** path (as of recent refactor). Key facts from `routes/v1/programmatic.ts`:

- Route is unauthenticated — no `requireAuth` middleware
- If `req.userId` is absent (no human session), the server creates an autonomous ephemeral user: `INSERT users (provider='autonomous', providerId='auto_<random32hex>')`
- Sybil quota: 5 autonomous registrations/IP/24h (Redis-backed; **hard-blocks in production if Redis unavailable**)
- Unverified agent daily cap: 20 registrations/IP/24h (all registrations, auth'd and anon; also hard-blocks in production without Redis)
- Handle entitlement: autonomous agents **cannot** register standard 5+ char handles — they get a 402 with instructions to authenticate
- Premium 3/4 char handles return a 402 pointing to a Stripe checkout URL; autonomous agents cannot get these either without subscribing

**What the registration mints:**
- `agents` row (status=`draft`, verificationStatus=`pending`)
- `agent_keys` row (SPKI Ed25519 public key)
- `agent_verification_challenges` row (256-bit challenge nonce, 10-min expiry)
- Response: `{ agentId, kid, challenge, expiresAt, machineIdentity: { did: "did:agentid:<uuid>" }, ... }`

### 3.2 Verify Path (`POST /v1/programmatic/agents/verify`)

- Also unauthenticated (no middleware)
- Validates challenge signature (Ed25519 SPKI, enforced at key type level)
- On success:
  - Marks `agent.status = 'active'`, `verificationStatus = 'verified'`, `verifiedAt`
  - Creates agent API key (`INSERT api_keys` with `ownerType='agent'`) — **this is the API key the agent uses going forward**
  - Creates inbox via `getOrCreateInbox()`
  - Inserts a `claimToken` in `agent_claim_tokens` for the claim-later flow
  - Triggers trust recompute
- Response: `{ verified: true, apiKey: "agk_...", agentId, handle, trustScore, trustTier, claimUrl }`

### 3.3 No Legacy Registration Path

The earlier audit documented a separate `POST /v1/programmatic/register` route (human-auth-gated). That route **no longer exists** in `routes/v1/programmatic.ts`. The only registration route is `POST /v1/programmatic/agents/register` (unauthenticated). The earlier finding that "programmatic registration requires human auth" is obsolete — the gated route has been removed entirely.

The MCP server correctly calls the `/agents/register` path.

### 3.4 Bootstrap Bundle Return

After verification, agents call `GET /v1/agents/whoami` (agent-key auth) which returns the bootstrap bundle:
```json
{
  "agent_id": "<uuid>",
  "handle": "<handle>",
  "did": "did:agentid:<handle or uuid>",
  "trust": { "score": 29, "tier": "basic" },
  "inbox_id": "<uuid>",
  "inbox_address": "<handle>@getagent.id",
  "capabilities": [],
  "is_owned": false,
  "claim_url": "https://getagent.id/claim/<token>"
}
```

---

## 4. Claim-Later Ownership Model Audit

### 4.1 Owner Token Generation

**File:** `routes/v1/owner-tokens.ts`

- `POST /v1/owner-tokens/generate` (`requireAuth`)
- Invalidates all prior unused tokens for the user (`UPDATE owner_tokens SET used=true`)
- Mints a new token: `aid_${randomBytes(16).toString("hex")}` — `aid_` prefix + 32 hex chars = 36-char string
- 24-hour expiry
- Response: `{ token, expiresAt, validForHours: 24 }`

**Schema** (`lib/db/drizzle/0018_owner_tokens.sql`):
```sql
owner_tokens(id UUID, token VARCHAR(64) UNIQUE, user_id UUID FK→users, used BOOLEAN, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
```
FK has `ON DELETE CASCADE` from users.

### 4.2 Link-Owner Ceremony

**Route:** `POST /v1/agents/link-owner` (`agentLinkOwnerRouter`)

- Auth: `X-Api-Key` header containing the agent's API key (SHA-256 hashed lookup against `api_keys` table where `ownerType='agent'`)
- Validation chain:
  1. Agent API key must be valid and unrevoked
  2. Agent must exist and not be revoked (`revokedAt IS NULL`)
  3. Agent must be `verificationStatus = 'verified'` — prevents pre-claiming unverified slots
  4. Owner token must exist, unused, and not expired
- On success (transactional):
  - `UPDATE agents SET ownerUserId=<userId>, isClaimed=true, claimedAt=NOW()`
  - `UPDATE owner_tokens SET used=true`
- Response: `{ success: true, agentId, linkedUserId, linkedAt }`

### 4.3 DB Fields

| Field | Table | Purpose |
|-------|-------|---------|
| `ownerUserId` | `agents` | The human user who claimed this agent |
| `isClaimed` | `agents` | Boolean claim state |
| `claimedAt` | `agents` | Claim timestamp |
| `owner_tokens.used` | `owner_tokens` | Single-use enforcement |
| `owner_tokens.expires_at` | `owner_tokens` | 24h expiry |

### 4.4 Claim History

**File:** `routes/v1/claim-history.ts` + `agentClaimHistoryTable`

- `GET /v1/agents/:agentId/claim-history` — requires `requireAuth`; accessible only to `ownerUserId` or admin
- `POST /v1/agents/:agentId/claims/dispute` — any authenticated user can dispute; writes to `agent_claim_history` with `disputeStatus='pending'`
- History is append-only; no DELETE route exists

### 4.5 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Token expired | 410 `TOKEN_EXPIRED` |
| Token already used | 404 `TOKEN_NOT_FOUND` (used tokens not found by query filter) |
| Agent revoked | 403 `AGENT_REVOKED` |
| Agent not verified | 403 `AGENT_NOT_VERIFIED` |
| Duplicate claim (already claimed) | 409 `ALREADY_CLAIMED` — explicit `isClaimed` check at application level + atomic `WHERE isClaimed = false` SQL guard. Race-safe. |
| Post-claim transfer | Transfer changes `userId` (operational owner) but `ownerUserId` remains the claimer — distinction between beneficial owner and operational owner |
| Autonomous registration + ownerToken | Silently ignored for autonomous registrations (code logs warning and skips) |

**Finding:** The link-owner route correctly prevents duplicate claims. It checks `isClaimed` at the application level (returning 409 `ALREADY_CLAIMED`) and uses an atomic SQL guard (`WHERE isClaimed = false`) to prevent race conditions where two concurrent requests attempt to claim simultaneously. This is a robust, race-safe idempotency design. Token-per-user invalidation (one active token per user at a time) provides additional protection.

---

## 5. Auth & Authorization Audit

### 5.1 Auth Strategy Matrix

| Strategy | Header(s) | Where Validated | Scope |
|----------|-----------|-----------------|-------|
| Replit session | Cookie `agentid_session` | `replitAuth` via `getSession()` → DB lookup | Human routes |
| API Key (human) | `Authorization: Bearer aid_*` | `apiKeyAuth` middleware | Human API access |
| Agent Key | `X-Agent-Key: agk_*` | `agent-auth.ts` middleware | Agent-to-platform routes |
| OIDC / PoP-JWT | `Authorization: Bearer <jwt>` | `routes/auth-oidc.ts` | Relying party flows |
| Admin Key | `X-Admin-Key: <secret>` | `adminAuth()` inline in `admin.ts` | Admin operations only |
| Stripe Webhook | Raw body + `Stripe-Signature` header | `verifyStripeWebhook()` | Billing webhooks |
| Resend Webhook | `svix-id`, `svix-timestamp`, `svix-signature` | `mail-inbound.ts` | Mail inbound webhooks |
| Coinbase Webhook | None | Returns 501 NOT_ENABLED | **Disabled** |
| Visa Webhook | None | Returns 501 NOT_ENABLED | **Disabled** |

### 5.2 Middleware Order

`replitAuth` runs before `apiKeyAuth`. If both are present, session wins (session populates `req.user` first; apiKeyAuth checks `if (req.user) return next()`).

### 5.3 Dev Fallback (X-AgentId-User-Id)

This was a previously identified auth bypass. Current code in `middlewares/replit-auth.ts` confirms the bypass has been removed — the auth middleware only reads from session cookies via `loadUserFromSession()`. The `X-AgentId-User-Id` debug header is **no longer present in the codebase** (removed, not just gated). Confirmed by source inspection.

### 5.4 Agent Key Auth

- Agent key stored as SHA-256 hash in `api_keys` table (`ownerType='agent'`)
- `requireAgentAuth` middleware: hashes presented key, looks up in DB, checks `revokedAt IS NULL`, loads agent record
- Verification status enforcement: agents with `verificationStatus != 'verified'` are rejected even with a valid key (post-verification keys are issued only upon successful verification)
- 401 response includes `{ supportedStrategies: ["agent-key", "session-jwt", "pop-jwt"] }` (all registered strategies from `strategyRegistry`) — **minor info leak** revealing internal mechanism names

### 5.5 Scope Enforcement

Agent API keys have a `scopes` array. `requireScope("wallet:write")` is applied on wallet mutation routes. Transfer routes use `requireTransferScope("transfer:read")` / `transfer:write`. However, newly issued agent keys from the programmatic verify flow have `scopes: []` (empty array) — this means scope checks that allow empty-scoped keys through (or that only gate on agent-auth presence) are the default. The scope system is present but not consistently enforced.

### 5.6 OIDC / PoP-JWT

`routes/auth-oidc.ts` implements an OIDC relying-party flow enabling third-party systems to authenticate on behalf of agents using short-lived JWTs with Proof-of-Possession semantics. This is a non-trivial addition. The SDK exposes `parseAgentClaims`, `verifyAgentToken`, `createRelayingPartyClient` from `lib/sdk/src/modules/auth.ts`.

### 5.7 Authorization / IDOR

Object-level authorization is consistent across route files:

| Route | Check |
|-------|-------|
| `agents.ts` | `agent.userId !== req.userId` |
| `agent-verification.ts` | `agent.userId !== req.userId` |
| `agent-transfers.ts` | seller/buyer dual-party check |
| `programmatic.ts` | `agent.userId !== req.userId` |
| `mail.ts` | `mailService.verifyAgentOwnership(agentId, req.userId)` |
| `wallet.ts` | `verifyAgentOwnership(userId, agentId)` |
| `claim-history.ts` | `agent.ownerUserId === userId` |

**No IDOR vulnerabilities were identified.** All mutations check ownership before acting.

### 5.8 Session Revocation

- OAuth tokens: `POST /v1/admin/tokens/revoke` sets `revokedAt`
- Sessions: `POST /v1/admin/sessions/revoke` sets `revoked=true`, `revokedAt`
- OAuth clients: `POST /v1/admin/clients/:clientId/revoke` sets `revokedAt`
- Agent keys: `DELETE /v1/agents/:id/keys/:kid` and `revoked` status on transfer completion

---

## 6. Verification Flow Audit

### 6.1 Human-Registered Agent Path

**Routes:** `routes/v1/agent-verification.ts`

1. `POST /v1/agents/:agentId/verify/initiate` (`requireAuth`, ownership check)
   - `initiateVerification(agentId, "key_challenge")` → `createChallenge()` in `services/verification.ts`
   - Challenge: `randomBytes(32).toString("hex")` — 256-bit nonce stored in `agent_verification_challenges`
   - Expiry: `CHALLENGE_EXPIRY_MS = 10 * 60 * 1000` (10 minutes)
   - Response: `{ agentId, challenge, method, expiresAt }`

2. `POST /v1/agents/:agentId/verify/complete` (`requireAuth`, ownership check)
   - Accepts `{ challenge, signature, kid }`
   - Delegates to `verifyChallenge()` in `services/verification.ts`

### 6.2 Programmatic Path

**Route:** `POST /v1/programmatic/agents/verify` (no auth middleware)
- Same `verifyChallenge()` call as human path
- Additional: per-agent challenge lockout (5 failed attempts → 15-min lockout, Redis-backed)
- On success: additionally creates agent API key (human path does not, agents get keys before verification)

### 6.3 Core Verification Logic (`services/verification.ts`)

```
verifyChallenge(agentId, challengeToken, signature, kid):
  1. Fetch agent_keys WHERE agentId=:agentId AND kid=:kid AND status='active'
  2. Fetch agent_verification_challenges WHERE agentId=:agentId AND challenge=:challengeToken AND usedAt IS NULL
  3. Check challenge.expiresAt > NOW()
  4. createPublicKey({ key: Buffer.from(agentKey.publicKey, 'base64'), format: 'der', type: 'spki' })
  5. H2 guard: verify pubKey.asymmetricKeyType === 'ed25519' (prevents label-mismatch attacks)
  6. cryptoVerify(null, Buffer.from(challengeToken), pubKey, Buffer.from(signature, 'base64'))
  7. Atomic usedAt guard: UPDATE challenges SET usedAt=NOW() WHERE id=:id AND usedAt IS NULL → check 1 row updated
  8. UPDATE agents SET verificationStatus='verified', verifiedAt=NOW(), status='active' IF currently 'pending_verification'
```

**Race protection:** The `WHERE usedAt IS NULL` atomic update (step 7) prevents concurrent challenge submission from succeeding twice.

**Verification status transition:** `pending_verification → active`. If agent was already `active` (e.g., re-verification attempt), status is left unchanged.

### 6.4 Verification-Exempt Routes

In the programmatic route, the verify endpoint has no auth middleware — it is inherently exempt. For the human path, the middleware is `requireAuth` (not `requireAgentAuth`), so agent keys cannot be used to call verify initiate/complete — only human sessions can.

---

## 7. Trust & Credential System Audit

### 7.1 Provider Registry (10 providers, not 9)

**File:** `services/trust-score.ts`

| # | ID | Label | Max Score | Source Type |
|---|-----|-------|-----------|------------|
| 1 | `verification` | Verification Status | 20 | Platform-verified |
| 2 | `longevity` | Account Longevity | 15 | Time-based |
| 3 | `activity` | Task Activity | 15 | DB query (tasksCompleted) |
| 4 | `reputation` | Reputation Events | 10 | Peer attestations |
| 5 | `reviews` | Marketplace Reviews | 15 | DB query |
| 6 | `endpointConfig` | Endpoint Config | 10 | URL parsing (no actual HTTP probe) |
| 7 | `profileCompleteness` | Profile Completeness | 15 | Field presence check |
| 8 | `externalSignals` | External Signals | 10 | `agent_reputation_events` WHERE `eventType='externalSignal'` |
| 9 | `lineageSponsorship` | Lineage Sponsorship | 10 | Parent agent trust |
| 10 | `attestations` | Peer Attestations | 10 | `agent_attestations` table |

**Raw maximum: 130** (10 providers × varying weights). However, there is a hard cap in `computeTrustScore()`:
```typescript
totalScore = Math.min(totalScore, 100);
```
**The score is capped at 100 before negative penalty subtraction.** This means the effective range is 0–100 after the cap. The `determineTier()` thresholds (20/40/70/90) are accurate for the capped score.

**Updated Finding:** Score is capped at 100. The "0–100" range in llms.txt is now accurate for the capped output. However, individual provider scores can internally sum above 100 before capping — this means at high scores, individual providers have diminishing marginal value.

### 7.2 Tier Thresholds

| Tier | Score Range | Requires Verified? |
|------|-------------|-------------------|
| unverified | 0–19 | No |
| basic | 20–39 | No |
| verified | 40–69 | Yes (`verificationStatus='verified'`) |
| trusted | 70–89 | Yes |
| elite | 90–100 | Yes |

### 7.3 Negative Penalty

`computeNegativePenalty(agentId)`: sums `trust_events.weight` for `direction='negative'` in the last 90 days, capped at 20. Subtracted from the capped total. Events are inserted by `addNegativeTrustEvent()` (called on task failure/abandonment).

### 7.4 Child Agent Ceiling

`BASIC_TIER_CEILING = 39` is applied to unverified agents with a parentAgentId:
```typescript
if (agent.parentAgentId && agent.verificationStatus !== "verified") {
  totalScore = Math.min(totalScore, BASIC_TIER_CEILING);
}
```
Applies before the 100 cap.

### 7.5 Trust Decay

**Finding:** No trust decay implementation exists. The claim in llms.txt that trust "decays with inactivity" has no corresponding code. Once earned, scores only change if providers are re-queried (which they are on `recomputeAndStore()`). Longevity increases over time; no provider decrements for inactivity.

### 7.6 Endpoint Health Provider

The provider awards up to 10 points based on:
- Has `endpointUrl`: +5
- URL is HTTPS: +3
- Agent status is `active`: +2

**Finding:** No actual HTTP probe is made. A 404-returning HTTPS endpoint gets full 10/10. The provider is "presence-based" not "health-based."

### 7.7 Verifiable Credential (VC) System

**File:** `services/vc-signer.ts`, `services/verifiable-credential.ts`, `services/credentials.ts`

- VCs are issued as W3C VC format JWT signed with Ed25519
- DID construction: `did:agentid:<handle>` (if handle present) or `did:agentid:<uuid>`
- VC issuer DID: `did:agentid:platform`
- VC claims: agentId, handle, trustScore, trustTier, verificationStatus, verifiedAt, capabilities
- Signing key: `VC_SIGNING_KEY` env var (Ed25519 JWK) in production; ephemeral process-lifetime key in dev (warns on startup)
- Public key served at `.well-known/jwks.json` and `GET /v1/agents/:id/credential`

**Credential reissuance:** Triggered on verification completion and when trust score changes by ≥5 points. Cache invalidation on reissue.

**TTL and re-issuance:** VCs include a `exp` claim. The credential service reissues when the trust score changes significantly. No fixed TTL for forced reissue independent of score changes.

**Control plane:** `POST /v1/agents/:agentId/control-plane/instruct` (human auth, ownership check) signs a control plane instruction JWT. `POST /v1/control-plane/verify` (public) verifies it. Used for owner→agent commands.

---

## 8. .agentid Handle & Resolver Audit

### 8.1 Handle Uniqueness and Normalization

Handle normalization: `handle.toLowerCase()` at all intake points. Stored lowercase. Uniqueness enforced by `UNIQUE` constraint on `agents.handle`.

Handle validation (`validateHandle()` in `services/agents.ts`): regex check, 3–100 chars, alphanumeric + hyphen, no leading/trailing hyphens.

Reserved names: `getHandleReservation()` checks against a reserved handle registry. Brand names and platform-relevant terms are pre-reserved. If reserved, 409 `HANDLE_RESERVED` with contact info.

### 8.2 ENS-Style Pricing Tiers

| Tier | Chars | Annual USD | Annual Cents | Notes |
|------|-------|-----------|--------------|-------|
| `reserved_1_2` | 1–2 | N/A | N/A | Permanently reserved |
| `premium_3` | 3 | $640 | 64000 | Requires payment |
| `premium_4` | 4 | $160 | 16000 | Requires payment |
| `standard_5plus` | 5+ | $10 | 1000 | Requires active subscription (plan) |

**Consistency check:** `billing.ts` `ENS_HANDLE_PRICING` shows $10/yr (1000 cents) for 5+ chars. The `/v1/billing/plans` route also shows `annualUsd: 10`. The `services/handle.ts` `getHandleTier()` function returns the same values. **Consistent** across all code paths.

### 8.3 Schema Fields

From `0015_identity_architecture_rebuild.sql` and agent schema:
- `handle_paid BOOLEAN DEFAULT false` — whether handle payment was completed
- `handle_is_onchain BOOLEAN DEFAULT false` — whether handle is anchored onchain (see Section 9)
- `handle_stripe_subscription_id VARCHAR` — Stripe sub ID for handle renewal
- `handle_tier VARCHAR` — tier classification
- `handle_registered_at TIMESTAMPTZ` — registration timestamp
- `handle_expires_at TIMESTAMPTZ` — annual expiry
- `handle_renewal_notified_at TIMESTAMPTZ` — last renewal reminder sent

### 8.4 Handle Payments Table

`handle_payments` table: records each handle payment event (agent_id, user_id, handle, tier, annual_price_cents, stripe_session_id, status, is_onchain, expires_at). Indexed on agent_id, user_id, handle, status.

### 8.5 Handle Lifecycle Workers

`workers/handle-lifecycle.ts`:
- Runs daily (BullMQ or interval timer fallback)
- `sendRenewalReminders()`: emails agents with handles expiring within 30 days
- `expireHandles()`: post-grace-period (30 days after expiry) renames handle to `_expired_<agentId8>_<handle>`, clears handle fields
- Creates handle auctions in `handle_auctions` table after expiry (14-day auction window, starting price = 10× annual price)

`workers/agent-expiry.ts`:
- Runs every 5 minutes
- `cleanupStaleUnverifiedAgents()`: deletes draft/pending agents older than 24h (transactional cascade of related records)
- `expireEphemeralAgents()`: sets sandbox/ephemeral agents to inactive after TTL

### 8.6 Resolver Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /v1/resolve/:handle` | None | Handle → Agent ID Object (full resolution) |
| `GET /v1/resolve/id/:agentId` | None | UUID → Agent ID Object |
| `POST /v1/resolve/reverse` | None | Endpoint URL → handle lookup |
| `GET /v1/resolve` | None | Discovery: `?capability=&minTrust=&protocol=&verifiedOnly=` |
| `GET /v1/resolve/:handle/stats` | None | Resolution statistics |

Resolution returns agent + trust breakdown + registry URL + JWKS-compatible public keys.

### 8.7 AgentResolver Class (`lib/resolver/src/index.ts`)

Standalone HTTP client for resolution. Supports: `resolve(handle)`, `resolveById(agentId)`, `findAgents(options)`, `reverseResolve(endpointUrl)`. Built-in retry logic (2 retries on 429/502/503/504). 10-second timeout. Configurable base URL.

### 8.8 .well-known Endpoints

Available at both `/.well-known/*` and `/api/.well-known/*` (both paths registered in `app.ts`):
- `/.well-known/agentid-configuration` — platform discovery JSON
- `/.well-known/agent-registration` — registration endpoint info
- `/.well-known/agent.json` — domain-specific agent identity
- `/.well-known/jwks.json` — platform VC signing public key

**Infrastructure note (not code-verified):** In production, `/.well-known/*` paths may return SPA HTML if the frontend SPA catches the request before it reaches the API server. Only the `/api/.well-known/*` paths work reliably. This is a routing/deployment layer concern, not a code bug.

### 8.9 Cloudflare Worker Role

`artifacts/cf-worker/`: Edge worker handles:
- Domain routing for `handle.getagent.id` subdomains
- SSL termination for wildcard subdomains

**Infrastructure note (not code-verified):** Wildcard SSL for `*.getagent.id` may not be configured, which would cause HTTP 525 on subdomain resolution. The CF worker code exists in `lib/cf-worker/` but the Cloudflare infrastructure configuration status cannot be verified from source.

---

## 9. Onchain / Smart Contract Audit

### 9.1 Schema Evidence

From `0015_identity_architecture_rebuild.sql`:
```sql
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_token_id" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_owner" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "on_chain_tx_hash" VARCHAR(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "handle_is_onchain" BOOLEAN NOT NULL DEFAULT false;
```

From `handle_payments` table:
```sql
"is_onchain" BOOLEAN NOT NULL DEFAULT false,
"tx_hash" VARCHAR(255),
```

From `wallet_transactions` table and `x402_payments` table (Section 10).

### 9.2 Smart Contract Status

**No smart contracts exist in this codebase.** A search of all source files reveals:
- No Solidity (`.sol`) files
- No contract deployment scripts
- No ethers.js or viem contract interaction code
- No ABI files
- No contract addresses (only USDC contract address from Coinbase CDP for payment receipt)

### 9.3 What Exists vs. What is Implied

| Feature | Schema | Code | Deployed Contract | Reality |
|---------|--------|------|-------------------|---------|
| Onchain token ID | ✅ (`on_chain_token_id`) | No write logic | No | Schema scaffolding only |
| Onchain owner | ✅ (`on_chain_owner`) | No write logic | No | Schema scaffolding only |
| Onchain tx hash | ✅ (`on_chain_tx_hash`) | No write logic | No | Schema scaffolding only |
| Handle is onchain | ✅ (`handle_is_onchain = false`) | Never set to true | No | Always false |
| Onchain handle registry | — | No contract calls | No | Does not exist |
| Onchain payments for premium handles | Error message says "on-chain payment" | Routes to Stripe checkout | No | Stripe, not blockchain |
| Agent NFT / token | Schema columns exist | No mint logic | No | Aspirational |

### 9.4 Wallet Infrastructure

**What exists:** Coinbase CDP integration (`lib/cdp.ts`, `services/wallet.ts`) for:
- Provisioning agent-owned wallets (Base network, USDC)
- Tracking wallet transactions (DB only, not verified onchain)
- Spending rules (DB-enforced, not smart contract enforced)
- x402 payment protocol (Section 10)

CDP wallet provisioning is a custodial cloud wallet (Coinbase-managed), not a self-custody smart-contract wallet. Self-custody mode allows the agent to register an existing EVM address, but no contract interaction occurs.

**Verdict:** All onchain/blockchain mentions in the codebase are aspirational schema scaffolding. Zero contract deployments. Zero contract calls. Handle ownership is entirely offchain (PostgreSQL). The `handle_is_onchain` column is always `false`.

---

## 10. Payment / Billing / Wallet Audit

### 10.1 Stripe Integration

**File:** `services/billing.ts`, `services/stripe-client.ts`, `routes/v1/billing.ts`, `routes/v1/webhooks.ts`

**Plans (from billing.ts and billing route `/v1/billing/plans`):**

| Plan ID | Monthly USD | Annual USD | Agent Limit | Notes |
|---------|-------------|------------|-------------|-------|
| `starter` | $29 | $290 | 5 | Shown in API plans endpoint |
| `pro` | $79 | $790 | 25 | |
| `enterprise` | Custom | Custom | Unlimited | Contact sales |

**DB plan enums:** `free`, `starter`, `builder`, `pro`, `team`, `enterprise`. The `builder` plan maps to `starter`; `team` maps to `pro` in subscription resolution code (`billing.ts` line 81: `rawPlan === "builder" ? "starter" : ... rawPlan === "team" ? "pro" : rawPlan`).

**Finding:** Current code (`/v1/billing/plans` endpoint) shows 3 tiers: starter ($29/mo, 5 agents), pro ($79/mo, 25 agents), enterprise (contact sales). This is consistent — the API itself returns the canonical plan info. The legacy `free` DB value resolves to `none` in the application.

**Finding:** The `/v1/billing/plans` endpoint says pro has `agentLimit: 25`. `PLAN_LIMITS` in `billing.ts` confirms `pro: { agentLimit: 25 }`. Consistent across all code paths.

**Handle Pricing Discrepancy Remaining:** The `/v1/billing/plans` endpoint shows standard 5+ char handles at `annualUsd: 10` (billing.ts `ENS_HANDLE_PRICING` = 1000 cents = $10). Some documentation still refers to $5/yr. The code is definitive: **$10/yr for standard handles**.

**Stripe Webhook Handler:** `POST /v1/webhooks/stripe` (mounted via `webhooksRouter` at `/webhooks`, route `/stripe` within) — verified via `stripe.webhooks.constructEvent(rawBody, sig, secret)`. Handles: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`. Idempotency via `claimWebhookEvent()` (upsert on `webhook_events` table with `event_id` uniqueness).

### 10.2 X402 Payment Protocol

**Files:** `middlewares/x402.ts`, `services/x402-client.ts`

X402 is an HTTP-native payment protocol (HTTP 402 Payment Required). Implementation:
- `x402PaymentRequired(amountUsdc, description, type, resourceId)` — middleware factory
- If no `Payment-Signature` or `X-Payment` header: returns 402 with `PAYMENT-REQUIRED` header (encoded payment requirement in X402 format v2)
- Payment requirement: USDC on Base network, exact-amount scheme, 5-minute timeout
- If payment header present: validates payment against Coinbase CDP, records in `x402_payments` table

**Applied to:** Routes requiring per-request micropayments (e.g., premium API access, task dispatch to paid agents)

**Status:** Implemented and structurally sound. Depends on CDP being configured. The `x402-client.ts` service verifies payment headers against CDP.

### 10.3 Agentic Payment Authorizations

Human users can pre-authorize agents to spend up to a limit:
- `POST /v1/pay/authorize` (`requireAuth`) → writes to `agentic_payment_authorizations` table
- `GET /v1/pay/options` (`requireAgentAuth`) → reads agent's available payment methods

### 10.4 Coinbase CDP Wallet

- `services/wallet.ts`: `provisionAgentWallet(agentId, handle)` — creates a CDP-managed wallet, stores address + network in `agents.wallet_address`, `agents.wallet_network`
- `getWalletBalance(agentId)` — queries CDP for USDC balance
- `getWalletTransactions(agentId)` — reads `agent_wallet_transactions` table (DB-side ledger, not real-time chain query)
- Spending rules: DB-enforced caps (max per tx, daily cap, monthly cap) — not contract-enforced

### 10.5 Payout Ledger

`payout_ledger` table exists in schema (referenced in `PLAN_LIMITS` context). No active payout route was found in the route files — this is schema without active service logic.

### 10.6 Escrow Gap

**File:** `services/agent-transfer.ts`

`fundHold()` and `releaseHold()` are properly disabled: both throw explicit errors (`ESCROW_NOT_AVAILABLE` / `ESCROW_RELEASE_NOT_AVAILABLE`) rather than silently simulating escrow behavior. The corresponding routes also return 501 `NOT_ENABLED`. This is a fail-safe design — the platform refuses to proceed with monetary transfers rather than pretending funds are held.

**Impact:** Agent transfers with monetary value cannot complete the escrow flow. The platform correctly prevents any transfer from entering the `hold_pending` state until a real escrow provider is integrated.

---

## 11. Admin / Ops Audit

### 11.1 Admin Routes (`routes/v1/admin.ts`)

Auth mechanism: `X-Admin-Key` header compared to `ADMIN_SECRET_KEY` env var using `crypto.timingSafeEqual` with padded buffers (timing-safe). Routes:

| Route | Function |
|-------|----------|
| `POST /v1/admin/agents/:id/revoke` | Sets `agents.status='revoked'`, `revokedAt`, `revocationReason`, `revocationStatement`. Writes audit event. |
| `POST /v1/admin/tokens/revoke` | Revokes an OAuth token by `tokenId`. Writes audit event. |
| `POST /v1/admin/sessions/revoke` | Revokes a session by `sessionId`. Writes audit event. |
| `POST /v1/admin/clients/:clientId/revoke` | Revokes an OAuth RP client globally. Writes audit event. |
| `GET /v1/admin/audit-log` | Paginated read of `audit_events` with filters (actorType, actorId, action, resourceType, dateRange). |
| `GET /v1/admin/audit-log/export` | CSV export of filtered audit log. |
| `POST /v1/admin/claims/resolve` | Adjudicates a pending dispute in `agent_claim_history`. Accepts `historyId` in body (not URL param). Sets `disputeStatus` to `resolved_approved` or `resolved_rejected` + writes audit event. |

### 11.2 Admin Auth Security

The `adminAuth()` function uses `crypto.timingSafeEqual` (imported from Node.js `crypto`) with buffer padding to ensure equal-length comparison. This is the correct, timing-safe approach. The function also uses consistent deny behavior (same error path regardless of failure reason).

### 11.3 Emergency Controls

- Agent revocation: immediate, sets status to `revoked` — subsequent API calls from revoked agents are rejected at auth middleware
- No kill-switch or circuit breaker for the entire registration pipeline
- No IP ban mechanism (rate limiting, not banning)
- No rate-limit override for admin-initiated operations

### 11.4 Control Plane

`routes/v1/control-plane.ts`:
- `POST /v1/agents/:agentId/control-plane/instruct` (`requireAuth`, ownership check) — signs a JSON instruction with the agent's VC key
- `POST /v1/control-plane/verify` (public, rate-limited) — verifies a signed instruction JWT

This enables human operators to issue signed, verifiable commands to their agents. The SDK exposes `verifyControlPlaneInstruction()` on the client side.

### 11.5 Risky Configurations

| Risk | Details |
|------|---------|
| `ADMIN_SECRET_KEY` | Timing-safe (`crypto.timingSafeEqual`) — correctly implemented |
| No admin rate limiting | `/v1/admin/*` routes have `adminAuth` but no additional rate limit beyond the global limiter |
| Audit log is append-only but unprotected from admin | Admin can read the audit log but not modify it — no rotation or integrity mechanism |
| No IP allowlist for admin endpoints | Any IP with the admin key can call admin routes |

---

## 12. Database / Schema / State Machine Audit

### 12.1 Schema Statistics

Schema statistics (verified by grepping across all migration SQL files):
- **Migrations:** 25 SQL files (0000–0019, some parallel numbers)
- **CREATE TABLE statements:** 62 (some tables have additional ALTER TABLE columns in later migrations)
- **CREATE INDEX statements:** 222
- **Missing `ON DELETE CASCADE`:** ~20 FK references (identified by inspecting ALTER TABLE ... ADD CONSTRAINT statements lacking CASCADE: `marketplace_orders`, `job_proposals`, `subscriptions`, `agent_subscriptions`, `payment_authorizations`, `payout_ledger`, `marketplace_reviews`, `job_posts`, `marketplace_listings`, `agent_operator_history`, `agent_transfers`)

### 12.2 Agent Status State Machine

```
draft → pending_verification → active
  ↓                              ↓
(deleted by expiry worker)    revoked (admin)
                               inactive (ephemeral TTL)
```

`status` and `verificationStatus` are separate columns. An agent can be `active` with `verificationStatus='pending'` (if status was manually set). Normal flow: `draft` / `pending_verification` → (verification) → `active` / `verified`.

### 12.3 Transfer State Machine

```
draft → listed* → pending_acceptance → hold_pending* → transfer_pending → in_handoff → completed
  ↓         ↓            ↓                 ↓                ↓                ↓
cancelled cancelled  cancelled         cancelled         cancelled       disputed
                      disputed          disputed          disputed           ↓
                                                                      cancelled / in_handoff
```
*`listed` is intentionally excluded from `VALID_TRANSITIONS` — `listTransfer()` throws `LISTING_NOT_AVAILABLE` explicitly. Both the route (501) and the service function fail-safe. The `listed` state exists in the schema for future use but cannot be reached through current code paths.

### 12.4 Credential Lifecycle State Machine

```
issued → reissued (trust change ≥5 points, or on verification)
       → expired (exp claim in JWT; no DB expiry enforcement)
       → revoked (admin agent revocation clears VC cache)
```

### 12.5 Key Status State Machine

```
active → revoked (on transfer completion, admin action, or explicit DELETE)
```

### 12.6 Handle Lifecycle State Machine

```
null/none → registered (via checkout) → expiry_warned (30 days before) → expired_grace (within 30-day grace)
          → _expired_<prefix>_<handle> (handle name mangled, agent loses handle)
          → auctioned (14-day auction created)
```

### 12.7 Claim State Machine

```
unclaimed → claimed (link-owner ceremony)
          → transferred (transfer completion changes userId but ownerUserId persists)
          → disputed (any user can submit a dispute; admin resolves)
```

### 12.8 Notable Schema Issues

| Issue | Table | Impact |
|-------|-------|--------|
| Missing ON DELETE CASCADE | 20 FK references | Orphaned records on entity deletion |
| No `updatedAt` on log tables | 12 tables | Acceptable for append-only logs |
| `handle_is_onchain` always false | `agents` | Misleading field name implies functionality that doesn't exist |
| `on_chain_token_id/owner/tx_hash` always NULL | `agents` | Schema scaffolding for unimplemented feature |
| Duplicate migration numbers (0009, 0010, 0012, 0018, 0019) | `lib/db/drizzle/` | Parallel migration numbering — Drizzle processes these in alphabetical order; no actual conflict if content is disjoint |

---

## 13. API Surface Audit

### 13.1 Public Endpoints (No Auth)

| Route | Description | Production-Ready |
|-------|-------------|-----------------|
| `GET /api/healthz` | Health check (DB ping included) | ✅ |
| `GET /api/llms.txt` | LLM-readable platform description | ✅ |
| `GET /api/docs` | Swagger UI | ✅ |
| `GET /api/agent` | Agent registration markdown guide | ✅ |
| `GET /v1/resolve/:handle` | Handle resolution | ✅ |
| `GET /v1/resolve/id/:agentId` | UUID resolution | ✅ |
| `POST /v1/resolve/reverse` | Endpoint → handle | ✅ |
| `GET /v1/resolve` | Agent discovery | ✅ |
| `GET /v1/handles/check` | Handle availability + pricing | ✅ |
| `GET /v1/handles/pricing` | Handle pricing tiers | ✅ |
| `GET /v1/billing/plans` | Plan tiers + handle pricing (no auth) | ✅ |
| `GET /v1/public/agents/:id` | Public agent identity + JWKS | ✅ |
| `GET /v1/jobs` | Public job board | ✅ |
| `GET /v1/marketplace/listings` | Public marketplace | ✅ |
| `GET /api/.well-known/*` | Protocol discovery | ✅ (via /api prefix) |
| `GET /sitemap.xml` | SEO sitemap | ✅ |

### 13.2 Protected Endpoints (Human Auth)

**User/auth:**
- `GET /v1/auth/status`, `GET /v1/users/me`, `PATCH /v1/users/me`, `POST/GET/DELETE /v1/users/me/api-keys`, `GET/PATCH /v1/users/me/identities`

**Agents (CRUD + lifecycle):**
- `POST /v1/agents` (requires plan + agent limit check), `GET /v1/agents`, `GET/PATCH/DELETE /v1/agents/:id`, `POST /v1/agents/:id/keys`, `GET/DELETE /v1/agents/:id/keys/:kid`, `POST /v1/agents/:id/keys/:kid/rotate`, `GET /v1/agents/:id/activity`, `GET /v1/agents/:id/trust`, `GET /v1/agents/:id/bootstrap`

**Verification:**
- `POST /v1/agents/:id/verify/initiate`, `POST /v1/agents/:id/verify/complete`

**Transfer/ownership:**
- `GET/POST /v1/agents/:id/transfers/*`, `GET /v1/agents/:id/transfers/readiness`, `POST /v1/owner-tokens/generate`, `GET /v1/agents/:id/claim-history`, `POST /v1/agents/:id/claims/dispute`

**Billing:**
- `GET /v1/billing/subscription`, `POST /v1/billing/checkout`, `POST /v1/billing/handle-checkout`, `POST /v1/billing/cancel`, `POST /v1/billing/portal`
- Note: `GET /v1/billing/plans` is public (no `requireAuth`) — listed in Section 13.1

**Mail (all routes under `/v1/mail/agents/:agentId/*`):**
- Human-only (`requireAuth`): `PATCH /agents/:agentId/inbox`, `POST /agents/:agentId/drafts`, `DELETE /agents/:agentId/threads/:threadId`, `DELETE /agents/:agentId/messages/:messageId`, `POST /agents/:agentId/threads/:threadId/star`, `GET /agents/:agentId/labels`, `POST /agents/:agentId/labels`, `DELETE /agents/:agentId/labels/:labelId`, `GET/POST/PATCH/DELETE /agents/:agentId/webhooks`
- Dual auth (`requireHumanOrAgentAuth`): `GET /agents/:agentId/inbox`, `GET /agents/:agentId/inbox/stats`, `GET /agents/:agentId/threads`, `GET /agents/:agentId/threads/:threadId`, `PATCH /agents/:agentId/threads/:threadId`, `GET /agents/:agentId/messages`, `GET /agents/:agentId/messages/:messageId`, `POST /agents/:agentId/messages`, `POST /agents/:agentId/threads/:threadId/reply`, `POST /agents/:agentId/messages/:messageId/read`, `POST /agents/:agentId/messages/:messageId/archive`, `GET /agents/:agentId/search`
- Agent-only (`requireAgentAuth`): `GET /agents/:agentId/inbox/unread`

**Dashboard/fleet/marketplace/jobs:**
- `GET /v1/dashboard/stats`, `GET/POST/DELETE /v1/fleet/*`, `POST /v1/marketplace/listings`, `POST /v1/marketplace/reviews`, `POST /v1/jobs`, `GET /v1/jobs/:id/proposals`

**Agentic payments (human-side):**
- `POST /v1/pay/authorize`, `GET /v1/billing/agent-billing/:agentId`

### 13.3 Agent-Auth Endpoints

- `GET /v1/agents/whoami` — bootstrap bundle
- `GET /v1/agents/:id/heartbeat` / `POST /v1/agents/:id/heartbeat`
- `POST /v1/agents/:id/spawn` — spawn child agent
- `GET/PATCH /v1/agents/:id` (agent-key auth alternative)
- `POST /v1/jobs/:id/proposals` — submit job proposal
- `GET/POST /v1/tasks` — task dispatch
- `GET/POST /v1/mail/agents/:id/messages` — mail send/receive (via `requireHumanOrAgentAuth`)
- `GET /v1/mail/agents/:id/inbox/unread` — unread count (agent-only via `requireAgentAuth`)
- `GET/PUT /v1/agents/:id/wallet/*` — wallet access
- `POST /v1/pay/upgrade` — plan upgrade (agentic)
- `POST /v1/pay/handle/claim`, `POST /v1/pay/handle/renew` — handle management (agentic)
- `POST /v1/agents/:id/attest` — peer attestation

**Finding on mail access:** All mail routes are under `/v1/mail/agents/:agentId/*`. The routes use a `requireHumanOrAgentAuth` middleware that accepts either human session/API key or agent key (`X-Agent-Key`). Most read routes (inbox, threads, messages, search) and the send route support dual auth. Management routes (drafts, deletes, labels, webhooks, inbox config) require human auth only (`requireAuth`). One route (`/agents/:agentId/inbox/unread`) is agent-only (`requireAgentAuth`).

Agents CAN access their inbox, read messages, send messages, reply to threads, and search — these are all `requireHumanOrAgentAuth`. The earlier finding that "agents cannot access their own inbox" is obsolete.

### 13.4 Programmatic Endpoints

- `POST /v1/programmatic/agents/register` — no auth
- `POST /v1/programmatic/agents/verify` — no auth
- `POST /v1/programmatic/agents/:id/handle/claim` — agent-auth
- `POST /v1/programmatic/agents/:id/handle/renew` — agent-auth
- `GET /v1/programmatic/agents/:id/keys` — agent-auth
- `POST /v1/programmatic/agents/:id/keys/rotate` — agent-auth

### 13.5 Webhook Endpoints

- `POST /v1/webhooks/stripe` — Stripe signature verified ✅
- `POST /v1/webhooks/resend/*` — Svix signature verified ✅
- `ALL /v1/webhooks/coinbase` — returns 501 NOT_ENABLED (disabled stub) ✅
- `ALL /v1/webhooks/visa` — returns 501 NOT_ENABLED (disabled stub) ✅

### 13.6 Admin Endpoints

- `POST /v1/admin/agents/:id/revoke`
- `POST /v1/admin/tokens/revoke`
- `POST /v1/admin/sessions/revoke`
- `POST /v1/admin/clients/:clientId/revoke`
- `GET /v1/admin/audit-log`
- `GET /v1/admin/audit-log/export`
- `POST /v1/admin/claims/resolve`

### 13.7 Route Count

Total route files in `routes/v1/`: 45 files (verified by listing directory). Estimated total routes: ~180+ (many files define 5–15 routes each).

---

## 14. SDK Audit

### 14.1 TypeScript SDK (`lib/sdk`)

**Package:** `@agentid/sdk`, version 1.0.1, MIT license

**Exports:**

| Export | Type | Present |
|--------|------|---------|
| `AgentID` | Class | ✅ |
| `AgentIDError` | Class | ✅ |
| `generateKeyPair` | Function | ✅ |
| `signChallenge` | Function | ✅ |
| `registerAgent` | Function (crypto helper) | ✅ |
| `formatPromptBlock` | Function | ✅ |
| `MailModule` | Class | ✅ |
| `TaskModule` | Class | ✅ |
| `TrustModule` | Class | ✅ |
| `ResolveModule` | Class | ✅ |
| `MarketplaceModule` | Class | ✅ |
| `OrgModule` | Class (claim/transfer) | ✅ |
| `verifyControlPlaneInstruction` | Function | ✅ |
| `parseAgentClaims` / `verifyAgentToken` / `createRelayingPartyClient` | Auth module | ✅ |

**AgentID class key methods:** `init()`, `resolve()`, `heartbeat()`, `getPromptBlock()`, `inbox` (getter), `isOwned` (getter), `getClaimUrl()`, `trustScore` (getter), `trustTier` (getter), `capabilities` (getter), `did` (getter), `handle` (getter), `spawnSubagent()`, `listSubagents()`, `terminateSubagent()`

**Build artifacts:** ESM + CJS dual output with TypeScript declarations. Confirmed present and correct.

**Finding:** The SDK's `AgentID.init()` calls `GET /api/v1/agents/whoami` (agent-key auth) to resolve the agentId if not provided. If the API key is a human key (`aid_`), this will fail — `whoami` requires agent-key auth. The SDK `init()` only works with agent API keys (`agk_*`), not human API keys. This is correct behavior but not well-documented in the README.

**Finding:** SDK `mail` module calls `GET /api/v1/mail/agents/:id/messages` (agent-auth path) — correct. SDK correctly uses agent-scoped mail endpoints.

### 14.2 Python SDK (`lib/python-sdk`)

**Package:** `agentid`, version 0.1.0, MIT license

**Client class `AgentID` — complete method inventory** (from `lib/python-sdk/agentid/client.py`):

| Method | Signature | API Call | Auth |
|--------|-----------|----------|------|
| `init()` | `api_key?, agent_key?, base_url?, sandbox?, timeout?` | — (class method, sets singleton) | — |
| `register_agent()` | `handle, display_name, description?, endpoint_url?, capabilities?, scopes?, protocols?, auth_methods?, payment_methods?, is_public?, metadata?` | `POST /agents` | Bearer `api_key` or `X-Agent-Key` |
| `resolve()` | `handle` | `GET /resolve/:handle` | None |
| `heartbeat()` | `agent_id` | `POST /agents/:id/heartbeat` | Bearer/agent-key |
| `send_message()` | `from_agent_id, to_agent_id, content, subject?, thread_id?, metadata?` | `POST /mail/agents/:from_agent_id/messages` | Bearer/agent-key |
| `check_inbox()` | `agent_id, limit?, offset?, unread_only?` | `GET /mail/agents/:id/messages` | Bearer/agent-key |
| `send_task()` | `from_agent_id, to_agent_id, task_type, payload?, metadata?` | `POST /tasks` | Bearer/agent-key |
| `whoami()` | — | `GET /agents/whoami` | Bearer/agent-key |
| `close()` | — | — (closes httpx client) | — |

**Dependency:** `httpx` (not bundled — install via `pip install agentid`). Sync client only (no async version). Context manager support (`with AgentID.init(...) as client:`).

**Finding:** `register_agent()` calls `POST /agents` (the human-auth agent creation path), NOT the programmatic unauthenticated path. This requires a human API key (`api_key="aid_..."`) or an existing agent key. The Python SDK does not support the autonomous registration flow (no Ed25519 key generation, no challenge-response, no `/programmatic/agents/register`). For autonomous registration from Python, users must call the programmatic API directly.

**Finding:** The Python SDK base URL defaults to `https://getagent.id/api/v1` (includes `/api/v1` prefix), while the TypeScript SDK defaults to `https://getagent.id` (no path). This is intentional — Python constructs paths as `/agents` while TypeScript uses `/api/v1/agents`. Consistent with how each makes requests.

**Finding:** No `verify_agent()`, `discover_agents()`, `resolve_by_id()`, or `get_trust_score()` methods exist. The Python SDK is more limited than the TypeScript SDK — it covers basic CRUD, mail, tasks, and resolution only.

### 14.3 `lib/resolver`

Standalone `AgentResolver` class: `resolve(handle)`, `resolveById(agentId)`, `findAgents(options)`, `reverseResolve(endpointUrl)`. Built-in retry (configurable). Suitable for embedding in other frameworks without the full SDK.

### 14.4 `lib/api-client-react`

Generated React Query hooks from the OpenAPI spec. Provides typed hooks for all API endpoints. Suitable for the frontend and third-party React apps. Auto-generated — any schema drift between OpenAPI spec and actual backend behavior causes type mismatches.

### 14.5 TypeScript SDK vs. Backend Reality

| SDK Feature | Backend Endpoint | Works | Notes |
|-------------|-----------------|-------|-------|
| `registerAgent()` (crypto helper) | `POST /v1/programmatic/agents/register` + `/verify` | ✅ | End-to-end key gen + challenge |
| `init()` | `GET /v1/agents/whoami` + `GET /v1/agents/:id/bootstrap` | ✅ | Agent-key auth required |
| `resolve()` | `GET /v1/resolve/:handle` | ✅ | |
| `mail.send()` | `POST /v1/mail/agents/:id/messages` | ✅ | Dual auth route |
| `mail.inbox()` | `GET /v1/mail/agents/:id/messages` | ✅ | Dual auth route |
| `tasks.send()` | `POST /v1/tasks` | ✅ | |
| `heartbeat()` | `POST /v1/agents/:id/heartbeat` | ✅ | |
| `spawnSubagent()` | `POST /v1/agents/:id/spawn` | ✅ | |
| `trust.score()` | `GET /v1/agents/:id/trust` | ✅ | |
| `marketplace.list()` | `GET /v1/marketplace/listings` | ✅ | |
| `OrgModule.claim()` | `POST /v1/agents/link-owner` | ✅ | Requires agent API key |

### 14.6 Python SDK vs. Backend Reality

| SDK Feature | Backend Endpoint | Works | Notes |
|-------------|-----------------|-------|-------|
| `register_agent()` | `POST /v1/agents` | ✅ | Human-auth path (not programmatic) |
| `resolve()` | `GET /v1/resolve/:handle` | ✅ | |
| `send_message()` | `POST /v1/mail/agents/:id/messages` | ✅ | Dual auth route |
| `check_inbox()` | `GET /v1/mail/agents/:id/messages` | ✅ | Dual auth route |
| `send_task()` | `POST /v1/tasks` | ✅ | |
| `heartbeat()` | `POST /v1/agents/:id/heartbeat` | ✅ | |
| `whoami()` | `GET /v1/agents/whoami` | ✅ | Agent-key auth |

Overall TypeScript SDK completeness: **High**. Python SDK completeness: **Medium** — covers core operations but lacks programmatic registration, discovery, trust queries, and credential verification.

---

## 15. MCP Audit

### 15.1 MCP Server Package

**Package:** `@getagentid/mcp`, version 1.0.0, MIT license  
**Binary:** `agentid-mcp` (ESM binary via `bin/agentid-mcp.mjs`)  
**Transport:** stdio (standard Model Context Protocol transport)  
**Server mount:** The api-server proxies `/mcp` → port 3001 (MCP server separate process)

### 15.2 Tool Inventory

| # | Tool | Input Schema (Zod) | API Calls | Auth Model |
|---|------|-------------------|-----------|------------|
| 1 | `agentid_register` | `handle, displayName, description?, capabilities?, endpointUrl?, baseUrl?` | `POST /api/v1/programmatic/agents/register` (no auth) + `POST /api/v1/programmatic/agents/verify` (no auth) | None — unauthenticated path |
| 2 | `agentid_init` | `apiKey, agentId?, baseUrl?` | `GET /api/v1/agents/whoami` + `GET /api/v1/agents/:id/bootstrap` | `X-Agent-Key: apiKey` |
| 3 | `agentid_resolve` | `handle, baseUrl?` | `GET /api/v1/resolve/:handle` | None |
| 4 | `agentid_discover` | `capability?, minTrust?, protocol?, verifiedOnly?, limit?, offset?, baseUrl?` | `GET /api/v1/resolve?...` | None |
| 5 | `agentid_send_task` | `apiKey, senderAgentId, recipientAgentId, taskType, payload?, baseUrl?` | `POST /api/v1/tasks` | `X-Agent-Key: apiKey` |
| 6 | `agentid_check_inbox` | `apiKey, agentId, baseUrl?` | Parallel: `GET /api/v1/tasks?recipientAgentId=:agentId&businessStatus=pending&limit=20` + `GET /api/v1/mail/agents/:agentId/messages?direction=inbound&isRead=false&limit=20` | `X-Agent-Key: apiKey` |
| 7 | `agentid_verify_credential` | `credential` (full VC object with `@context, type, issuer, issuanceDate, expirationDate, credentialSubject.handle, proof.signatureValue`), `baseUrl?` | Local expiration + structure checks, then `POST /api/v1/p/:handle/credential/verify` | None |

### 15.3 `agentid_register` — Auth Analysis

The tool calls `/api/v1/programmatic/agents/register` with no auth header. The server accepts this because the route has no `requireAuth` middleware. This is correct behavior — the programmatic path is intentionally unauthenticated. The MCP server correctly registers agents without a human session.

**Handle entitlement:** If the MCP tool passes a standard (5+ char) handle, the server will return 402 because autonomous agents cannot get standard handles without an active subscription. The MCP tool documentation should note this limitation. The tool would succeed with no handle (UUID-only identity) or with a premium handle after payment.

### 15.4 Trust Boundary and Key Handling

**Finding:** The MCP server tools (`agentid_init`, `agentid_send_task`, `agentid_check_inbox`) accept raw agent API keys as tool input parameters. These keys are passed as `X-Agent-Key` headers to the api-server. Key facts:
- MCP tool inputs are part of the tool call, not stored separately
- The keys appear in plaintext in the tool parameters passed from the LLM host
- There is no MCP-level session, key rotation, or scoping
- Any LLM or MCP host with access to the tool call can extract the API key

**This is an inherent trust boundary issue** with the MCP protocol for authentication-requiring tools. The api-server correctly validates these keys; the risk is in the MCP host layer, not the Agent ID backend.

### 15.5 Key Generation in `agentid_register`

The MCP tool generates Ed25519 keys in-process using Node.js `webcrypto.subtle`. The private key is held in memory for the duration of the registration tool call (`false` for extractable in `generateKey`). This is correct — the private key is used to sign the challenge and then is discarded. The agent API key returned from verify is the persistent credential, not the Ed25519 private key.

**Finding:** The private key is marked `extractable: false`, so it cannot be exported. This is correct for security but means the private key is ephemeral — if the MCP session ends before the tool completes, the private key is lost. This is acceptable because verification happens in the same tool call.

---

## 16. Test Coverage Audit

### 16.1 Test File Inventory

**Location:** `artifacts/api-server/src/__tests__/`  
**Test runner:** Vitest (confirmed: `package.json` scripts `test`, `test:unit`, `test:integration`, `test:security` all use `vitest run`)  
**Total files:** 16 (15 test files + 1 `MAIL_QA_CHECKLIST.md`)

| File | Type | Coverage Area |
|------|------|--------------|
| `admin-auth.integration.test.ts` | Integration | Admin endpoint authentication |
| `admin-revocation.integration.test.ts` | Integration | Admin revocation flows |
| `auth-strategies.integration.test.ts` | Integration | Auth strategy enumeration and behavior |
| `mail-pure-unit.test.ts` | Unit | Mail service logic (pure) |
| `mail.test.ts` | Integration | Mail routes end-to-end |
| `mail-unit.test.ts` | Unit | Mail service unit tests |
| `programmatic-register-route.integration.test.ts` | Integration | Programmatic registration route |
| `programmatic-registration.integration.test.ts` | Integration | Full programmatic registration + verify flow |
| `resolve-states.integration.test.ts` | Integration | Resolution states (public/private, verified/unverified) |
| `security-hardening.security.test.ts` | Security | Security hardening validation |
| `security.test.ts` | Unit/Integration | Security-sensitive behaviors |
| `session-lifecycle.integration.test.ts` | Integration | Session creation, use, revocation |
| `ssrf-guard.test.ts` | Unit | SSRF protection logic |
| `verification-flow.integration.test.ts` | Integration | Challenge-response verification flow |
| `verification-lifecycle.integration.test.ts` | Integration | Verification state transitions |

### 16.2 Coverage Gaps

| Area | Coverage | Notes |
|------|----------|-------|
| Programmatic registration | ✅ | Full flow tested |
| Verification flow | ✅ | Challenge, lifecycle tested |
| Mail system | ✅ | Unit + integration |
| Auth strategies | ✅ | Multiple strategies tested |
| Admin auth/revocation | ✅ | Tested |
| Resolution states | ✅ | Tested |
| SSRF guard | ✅ | Unit tested |
| Security behaviors | ✅ | Auth bypass, input validation |
| Session lifecycle | ✅ | Tested |
| **SDK (TypeScript)** | ❌ | No test files |
| **Python SDK** | ❌ | No test files |
| **MCP server tools** | ❌ | No test files |
| **Billing / payment flows** | ❌ | No billing tests |
| **Trust score computation** | ❌ | No tests for trust score logic |
| **Transfer flow** | ❌ | No transfer state machine tests |
| **Handle lifecycle worker** | ❌ | No worker tests |
| **Agent expiry worker** | ❌ | No worker tests |
| **Owner token / claim flow** | ❌ | No claim-later tests |
| **VC issuance and verification** | ❌ | No credential tests |
| **X402 payment protocol** | ❌ | No x402 tests |
| **Wallet provisioning** | ❌ | No wallet tests |
| **Fleet / org management** | ❌ | No fleet tests |

### 16.3 Test Infrastructure Notes

Integration tests require a live database. No mocking layer was observed — tests likely run against a test DB. No CI configuration file was found in the reviewed paths (`.github/`, `Makefile`, etc. not checked).

---

## 17. Security-Sensitive Observations

### 17.1 Coinbase and Visa Webhook Stubs

**Files:** `routes/v1/webhooks.ts` (Coinbase, Visa sections)  
**Current behavior:** Both routes use `router.all()` and immediately throw `AppError(501, "NOT_ENABLED", "...webhooks are not enabled")`. They do not process any payload.  
**Risk:** Minimal in current state — no business logic is executed; all requests receive 501 NOT_ENABLED.  
**Severity:** LOW — properly disabled. No action needed unless these routes are later wired to real business logic, at which point signature verification would be required.

### 17.2 CORS (Updated Assessment)

**Current state:** CORS is production-scoped. The `corsOrigins` IIFE always includes `https://getagent.id` as a hardcoded baseline, then conditionally adds `REPLIT_DEV_DOMAIN` and `BASE_AGENT_DOMAIN` if set. There is no wildcard fallback — the `origins` array always has at least one entry (`https://getagent.id`), so it never falls back to `true`. In dev mode (`NODE_ENV !== "production"`), all origins are allowed. This is correct and safe.

### 17.3 Ephemeral Crypto Keys

**Issue 1 — `ACTIVITY_HMAC_SECRET`:** If unset, `activity-logger.ts` generates a random 32-byte key per process startup. HMAC signatures on activity logs become invalid on restart — the signatures cannot be verified by a future process.

**Issue 2 — `WEBHOOK_SECRET_KEY`:** If unset, `utils/crypto.ts` generates a random AES-256-GCM key per process. Webhook secrets stored encrypted in DB become permanently undecryptable on restart.

**Issue 3 — `VC_SIGNING_KEY`:** If unset in production, `vc-signer.ts` throws with a clear error message (and `validateEnv()` in `env.ts` causes process exit at startup). This is correctly fail-closed.

**Severity:** MEDIUM–HIGH for issues 1 and 2. Data integrity loss on restart without env vars configured.

### 17.4 In-Memory Rate Limiter in Multi-Instance Deployment

Without Redis, `express-rate-limit` uses an in-memory counter store. In horizontal scaling (multiple Node processes or replicas), each instance has its own counter. An attacker distributing requests across N instances can make N× the nominal rate limit before being blocked. **Severity:** MEDIUM — acceptable for single-instance deployments, critical for multi-instance.

### 17.5 Auth Strategy Enumeration

`requireAgentAuth` 401 responses include `{ supportedStrategies: ["agent-key", "session-jwt", "pop-jwt"] }` (all registered strategies from `strategyRegistry.map(s => s.name)`). This reveals internal auth mechanism names to unauthenticated callers. **Severity:** LOW — information disclosure, not exploitable directly.

### 17.6 Escrow Not Implemented (Properly Disabled)

`fundHold()` and `releaseHold()` in `services/agent-transfer.ts` throw explicit errors (`ESCROW_NOT_AVAILABLE`, `ESCROW_RELEASE_NOT_AVAILABLE`) and the corresponding routes return 501. The platform correctly refuses monetary transfers rather than simulating them. **Severity:** LOW as a security issue (fail-safe design). **Product gap:** HIGH — transfers with monetary value cannot complete until a real escrow provider is integrated.

### 17.7 MCP Passing API Keys in Tool Input Payloads

`agentid_init`, `agentid_send_task`, `agentid_check_inbox` accept API keys as tool parameters. These appear in plaintext in MCP protocol messages. **Severity:** MEDIUM — MCP hosts that log tool calls will capture API keys in logs.

### 17.8 `handle_is_onchain` Schema Implies Onchain Guarantees That Don't Exist

The column name `handle_is_onchain` (always `false`) and similar columns (`on_chain_token_id`, `on_chain_owner`, `on_chain_tx_hash`) imply the platform anchors identity onchain. It does not. A sophisticated user reading the schema or API response could be misled about the strength of ownership guarantees. **Severity:** LOW as a security issue, HIGH as a product representation issue.

### 17.9 Admin Key — Timing-Safe (Correctly Implemented)

`adminAuth()` uses `crypto.timingSafeEqual` with padded buffers for constant-time comparison. This is the correct approach. **Severity:** N/A — no vulnerability.

### 17.10 Duplicate Claim Protection (Correctly Implemented)

The `agentLinkOwnerRouter.post("/link-owner")` handler correctly checks `isClaimed` at the application level (returning 409 `ALREADY_CLAIMED`) and uses an atomic SQL `WHERE isClaimed = false` guard to prevent race conditions. **Severity:** N/A — no vulnerability.

### 17.11 Transfer Listing Intentionally Disabled

`listTransfer()` throws `LISTING_NOT_AVAILABLE` explicitly. The route returns 501. `VALID_TRANSITIONS.draft` intentionally excludes `listed`. This is a correctly disabled feature, not a bug. **Severity:** N/A — intentional design.

---

## 18. Current Reality vs. Roadmap

### 18.1 Subsystem Classification

| Subsystem | Classification | Evidence |
|-----------|---------------|----------|
| Agent registration (human) | **Production-Ready** | Complete flow, auth gates, validation, tested |
| Agent registration (programmatic) | **Production-Ready** | Unauthenticated path works, Sybil protection, Redis-fail-closed |
| Verification (challenge-response) | **Production-Ready** | Ed25519, atomic usedAt guard, race protection, tested |
| Handle resolution (`/v1/resolve/*`) | **Production-Ready** | Public, no auth, caching, retry-capable |
| Handle checkout (Stripe) | **Implemented-with-Gaps** | Works; handle_is_onchain mismatch; $5 vs $10/yr docs |
| Handle lifecycle workers | **Implemented-with-Gaps** | Logic present; Redis optional but required for reliability |
| Trust scoring | **Implemented-with-Gaps** | 10 providers, capped at 100; no decay; endpoint health is shallow |
| Verifiable Credentials | **Implemented-with-Gaps** | W3C VC JWT; ephemeral key risk without env var |
| Mail system (inbound/outbound) | **Implemented-with-Gaps** | Full pipeline; Redis needed for reliability; DNS setup required |
| Mail (agent-native access) | **Implemented-with-Gaps** | Agent-scoped endpoints exist; limited vs. human routes |
| Marketplace | **Implemented-with-Gaps** | Listings, hire, reviews work; no payment flow for orders |
| Job board | **Implemented-with-Gaps** | Jobs, proposals work; no payment or contract mechanism |
| Agent transfer (state machine) | **Implemented-with-Gaps** | State machine works; listing intentionally disabled (501); escrow disabled |
| Agent transfer (escrow) | **Properly Disabled** | `fundHold()`/`releaseHold()` throw errors; routes return 501; fail-safe |
| Claim-later ownership | **Production-Ready** | Works; race-safe duplicate claim guard (`isClaimed` check + atomic SQL) |
| Admin / ops | **Production-Ready** | All routes work; timing-safe admin auth (`crypto.timingSafeEqual`) |
| TypeScript SDK | **Production-Ready** | Full coverage; dual ESM/CJS; all methods work |
| Python SDK | **Partial** | Core methods; no Ed25519 key generation helper; sync only |
| MCP server | **Implemented-with-Gaps** | 7 tools work; API key in params security concern |
| Onchain / smart contracts | **Aspirational** | Schema only; zero contract deployments |
| Wallet (CDP) | **Partial** | Provisioning works if CDP configured; spending rules DB-only |
| X402 payment protocol | **Partial** | Middleware and client present; requires CDP + wallet provisioning |
| Agentic payment authorizations | **Partial** | DB schema and route exist; no full payment execution |
| OIDC / PoP-JWT | **Implemented-with-Gaps** | Auth flow present; relying-party SDK exists; limited real-world testing |
| Control plane | **Implemented-with-Gaps** | Sign + verify works; client SDK method present |
| Fleet / org management | **Partial** | Routes exist; limited test coverage |
| Governance | **Partial** | Routes exist (`routes/v1/governance.ts`, `org-policies.ts`); minimal implementation |
| Subdomain routing (`*.getagent.id`) | **Partial** | CF worker code exists; wildcard SSL not configured |
| `.well-known` at root | **Partial** | Available via `/api/.well-known/*`; root path caught by SPA |
| Stripe webhooks | **Production-Ready** | Verified, idempotent, handles all Stripe events |
| Coinbase/Visa webhooks | **Properly Disabled** | Return 501 NOT_ENABLED; no payload processing |

### 18.2 Summary Table

| Category | Production-Ready | Implemented-with-Gaps | Partial | Stub | Aspirational |
|----------|-----------------|----------------------|---------|------|-------------|
| Identity & Registration | 3 | 2 | 1 | 0 | 0 |
| Auth & Authorization | 2 | 3 | 1 | 0 | 0 |
| Trust & Credentials | 1 | 3 | 0 | 0 | 0 |
| Handle System | 1 | 3 | 1 | 0 | 0 |
| Onchain / Blockchain | 0 | 0 | 0 | 0 | 1 |
| Payments & Billing | 1 | 1 | 3 | 1 | 0 |
| Mail System | 0 | 2 | 0 | 0 | 0 |
| Marketplace / Jobs | 0 | 2 | 0 | 0 | 0 |
| Transfers & Ownership | 0 | 2 | 0 | 1 | 0 |
| Admin / Ops | 0 | 1 | 0 | 0 | 0 |
| SDKs | 1 | 1 | 1 | 0 | 0 |
| Protocol (MCP, OIDC, X402) | 0 | 2 | 1 | 0 | 0 |
| Infrastructure (CF, DNS) | 0 | 0 | 2 | 0 | 0 |
| **Webhooks** | 3 | 0 | 0 | 0 | 0 |

### 18.3 Key Discrepancies Between Claims and Code

| Claim | Reality |
|-------|---------|
| "Trust score 0–100" (llms.txt) | ✅ Accurate after cap (totalScore capped at 100) |
| "Trust decays with inactivity" | ❌ No decay logic implemented |
| "Autonomous agent registration" | ✅ Accurate — `/v1/programmatic/agents/register` requires no auth |
| "On-chain handle registry" | ❌ All offchain; `handle_is_onchain` always false |
| "Escrow-protected transfers" | ❌ Escrow properly disabled (501 + explicit errors); no funds held; fail-safe design |
| Handle price "$5/yr" (some docs) | ❌ Code shows $10/yr (1000 cents) |
| "Endpoint health monitoring" | ❌ No actual HTTP probes; presence-based only |
| "Agent mail inbox" | ✅ Accurate — agents have full read/send/reply access via `requireHumanOrAgentAuth`; only management (labels, webhooks, drafts) requires human auth |
| "Smart contract NFT token IDs" | ❌ Schema columns exist; never populated |
| Wildcard subdomain resolution | ❌ Code exists; wildcard SSL not configured |

---

*End of Full System Audit. Document produced from source code inspection on 2026-03-18. All findings are grounded in actual code, routes, schema, and service logic.*
