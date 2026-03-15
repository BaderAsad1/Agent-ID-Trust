# Agent ID — Technical Audit Report

**Date:** 2026-03-15
**Scope:** Full-stack diligence-grade audit of the Agent ID platform — backend API server, frontend SPA, authentication, trust system, inbox/mail, billing, transfer/sale, protocol surface, and infrastructure.

---

## Table of Contents

1. [System Map](#1-system-map)
2. [Feature Audit Matrix](#2-feature-audit-matrix)
3. [Persona Flow Audit](#3-persona-flow-audit)
4. [Handle Economy Truth](#4-handle-economy-truth)
5. [Auth & Security Findings](#5-auth--security-findings)
6. [Trust System Reality](#6-trust-system-reality)
7. [Inbox Verdict](#7-inbox-verdict)
8. [Protocol Surface Assessment](#8-protocol-surface-assessment)
9. [Transfer / Sale Verdict](#9-transfer--sale-verdict)
10. [Infra & Environment Checklist](#10-infra--environment-checklist)
11. [Launch Blockers](#11-launch-blockers)
12. [Post-Launch Debt](#12-post-launch-debt)

---

## 1. System Map

### 1.1 Runtime Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js (TypeScript), Node.js |
| Frontend | React + Vite SPA |
| Database | PostgreSQL via Drizzle ORM (`@workspace/db`) |
| Queue / Workers | BullMQ (Redis-backed, optional) |
| Payments | Stripe (lazy-initialized, throws without key) |
| Email | Resend SDK |
| DNS | Cloudflare API |
| Auth | Replit Auth headers (primary), API key bearer tokens (secondary), Agent key-based auth (agent-to-platform) |
| Validation | Zod schemas (`@workspace/api-zod`) |
| API Docs | OpenAPI YAML + Swagger UI |

### 1.2 Route Topology

```
/api
├── /healthz                    Health check
├── /llms.txt                   Machine-readable platform description
├── /docs                       Swagger UI (OpenAPI)
└── /v1
    ├── /auth                   Replit OAuth flow
    ├── /users                  User profile management
    ├── /users/me/api-keys      Human API key CRUD
    ├── /users/me/identities    Identity management
    ├── /agents                 Agent CRUD + verification + domains + spawn + transfers + registry
    ├── /handles                Handle availability / pricing
    ├── /fleet                  Sub-handle management (Pro/Enterprise)
    ├── /p                      Public profile pages
    ├── /public/agents          Machine-readable public agent identity
    ├── /programmatic           Autonomous agent registration
    ├── /tasks                  Task dispatch and management
    ├── /dashboard              Dashboard aggregation
    ├── /billing                Plan subscriptions, handle checkout, Stripe webhooks
    ├── /webhooks               Coinbase + Visa payment webhooks (stubs)
    ├── /domains                Domain resolution
    ├── /marketplace            Listings, search, hire, reviews
    ├── /payments               Stripe payment session management
    ├── /jobs                   Job board + proposals
    ├── /mail                   Agent inbox (messages, threads, labels, routing rules, webhooks)
    └── /resolve                .agent handle resolution + reverse lookup + discovery
```

### 1.3 Middleware Stack (order applied in app.ts)

1. `securityHeaders` — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
2. `express.json({ limit: "5mb" })`
3. `cors()` — wide-open, no origin restriction
4. `replitAuth` — extracts Replit user headers, upserts user record
5. `apiKeyAuth` — fallback: validates `Bearer aid_*` tokens
6. `apiRateLimiter` — 500 req/min authenticated, 100 req/min anonymous (in-memory, optionally Redis)
7. Per-route: `requireAuth`, `requireAgentAuth`, `requirePlan`
8. `errorHandler` — catch-all error handler (AppError + generic 500)

### 1.4 Background Workers

| Worker | Queue Name | Redis Required | Concurrency | Retry Policy |
|--------|-----------|---------------|-------------|-------------|
| Domain Provisioning | `domain-provisioning` | Yes | 3 | 5 attempts, exponential backoff (5s base) |
| Webhook Delivery | `webhook-delivery` | Yes | 5 | 3 attempts, exponential backoff (2s base) |

Both workers silently degrade to no-op when Redis is not configured.

---

## 2. Feature Audit Matrix

| Feature | Route(s) | Service(s) | Auth Required | Status |
|---------|----------|-----------|---------------|--------|
| Agent Registration (Human) | `POST /v1/agents/register` | — (inline) | `requireAuth` | **Implemented** |
| Agent Registration (Programmatic) | `POST /v1/programmatic/register` | — (inline) | `requireAuth` ⚠️ | **Implemented, mis-gated** |
| Agent Verification | `POST /v1/agents/:id/verify/*` | `verification.ts` | `requireAgentAuth` (exempted) | **Implemented** |
| Handle Check / Pricing | `GET /v1/handles/check`, `/pricing` | `billing.ts` | None | **Implemented** |
| Handle Checkout | `POST /v1/billing/handle-checkout` | `billing.ts` (Stripe) | `requireAuth` | **Implemented** |
| Agent CRUD | `GET/PATCH/DELETE /v1/agents/:id` | — | `requireAuth` | **Implemented** |
| Agent Keys (Public Keys) | `POST/GET/DELETE /v1/agents/:id/keys` | `agent-keys.ts` | `requireAuth` | **Implemented** |
| Trust Score | `GET /v1/agents/:id/trust` | `trust-score.ts` | `requireAuth` | **Implemented** |
| Marketplace Listings | `POST/GET /v1/marketplace/listings` | — (inline) | `requireAuth` + `requirePlan("canListOnMarketplace")` | **Implemented** |
| Marketplace Hire | `POST /v1/marketplace/listings/:id/hire` | — | `requireAuth` | **Implemented** |
| Marketplace Reviews | `POST /v1/marketplace/reviews` | — | `requireAuth` | **Implemented** |
| Job Board | `POST/GET /v1/jobs` | — | `requireAuth` | **Implemented** |
| Job Proposals | `POST /v1/jobs/:id/proposals` | — | `requireAgentAuth` | **Implemented** |
| Agent Inbox (Mail) | `/v1/mail/*` | `mail.ts`, `mail-transport.ts` | `requireAuth` ⚠️ | **Implemented, human-only** |
| Agent Transfer / Sale | `/v1/agents/:id/transfers` | `agent-transfer.ts`, `transfer-readiness.ts`, `trust-recalibration.ts`, `operator-history.ts` | `requireAuth` | **Implemented (escrow stub)** |
| Fleet / Sub-handles | `POST/GET/DELETE /v1/fleet/*` | — | `requireAuth` | **Implemented** |
| Agent Spawn (Parent→Child) | `POST /v1/agents/:id/spawn` | — | `requireAgentAuth` | **Implemented** |
| Domain Provisioning | `POST /v1/agents/:id/domains` | `domain-provisioning.ts` worker | `requireAuth` | **Implemented (requires Redis)** |
| .agent Resolution | `GET /v1/resolve/:handle` | — | None (public) | **Implemented** |
| Agent Discovery | `GET /v1/agents?capability=...` | — | None (public) | **Implemented** |
| Dashboard | `GET /v1/dashboard/*` | — | `requireAuth` | **Implemented** |
| Billing / Subscriptions | `POST /v1/billing/*` | `billing.ts` (Stripe) | `requireAuth` | **Implemented** |
| Stripe Webhooks | `POST /v1/billing/webhooks/stripe` | `billing.ts` | Stripe signature | **Implemented** |
| Coinbase Webhooks | `POST /v1/webhooks/coinbase` | — | None ⚠️ | **Stub only** |
| Visa Webhooks | `POST /v1/webhooks/visa` | — | None ⚠️ | **Stub only** |
| API Key Management | `POST/GET/DELETE /v1/users/me/api-keys` | `api-keys.ts` | `requireAuth` | **Implemented** |
| Activity Log | `GET /v1/agents/:id/activity` | `activity-logger.ts` | `requireAuth` | **Implemented** |
| Health Check | `GET /api/healthz` | — | None | **Implemented** |
| LLMs.txt | `GET /api/llms.txt` | — | None | **Implemented** |
| OpenAPI / Swagger | `GET /api/docs` | — | None | **Implemented** |

---

## 3. Persona Flow Audit

### Persona A — Human Operator Registering an Agent via Dashboard

| Step | Endpoint | Works? | Notes |
|------|---------|--------|-------|
| 1. Login via Replit | `GET /v1/auth/status` | ✅ | Replit header-based auth; user upserted on first request |
| 2. Check handle availability | `GET /v1/handles/check?handle=foo` | ✅ | Returns availability + price |
| 3. Pay for handle | `POST /v1/billing/handle-checkout` | ✅ | Creates Stripe checkout session; redirects to Stripe |
| 4. Register agent | `POST /v1/agents/register` | ✅ | Links handle, provisions .agent domain (if Cloudflare+Redis configured) |
| 5. Add public key | `POST /v1/agents/:id/keys` | ✅ | Stores Ed25519/RSA public key with kid |
| 6. Verify ownership | `POST /v1/agents/:id/verify/initiate` → `POST /v1/agents/:id/verify/complete` | ✅ | Challenge-response: signs random nonce with private key |
| 7. Create marketplace listing | `POST /v1/marketplace/listings` | ✅ | Requires non-free plan (`canListOnMarketplace`) |
| 8. View trust score | `GET /v1/agents/:id/trust` | ✅ | Composite score computed from 9 providers |

**Verdict: Functional end-to-end for human operators.**

### Persona B — External Agent Interacting via API Key

| Step | Endpoint | Works? | Notes |
|------|---------|--------|-------|
| 1. Authenticate | Header: `X-Agent-Key: <key>` | ✅ | SHA-256 hashed lookup; verification status enforced |
| 2. Submit job proposal | `POST /v1/jobs/:id/proposals` | ✅ | `requireAgentAuth` gate |
| 3. Spawn child agent | `POST /v1/agents/:id/spawn` | ✅ | Parent must be verified; child inherits lineage |
| 4. Access own inbox | `GET /v1/mail/inboxes/:id/messages` | ❌ | **Blocked**: mail routes use `requireAuth` (human auth), not `requireAgentAuth` |
| 5. Receive tasks | `POST /v1/tasks` (dispatch) | ✅ | Tasks are dispatched to agent's endpoint URL |

**Verdict: Mostly functional. Inbox access for agents is a gap — agents cannot read their own mail programmatically.**

### Persona C — Fully Autonomous Agent Self-Registering

| Step | Endpoint | Works? | Notes |
|------|---------|--------|-------|
| 1. Register autonomously | `POST /v1/programmatic/register` | ⚠️ | **Requires `requireAuth`** — a human must be authenticated. Not truly autonomous. |
| 2. Verify | Agent key-based verify flow | ✅ | Works once agent has a key |
| 3. Operate | All `requireAgentAuth` routes | ✅ | |

**Verdict: Programmatic registration is human-auth-gated. An agent cannot register itself without a human session. This contradicts the "autonomous registration" branding in llms.txt.**

### Persona D — Discovery Client (LLM Framework / Resolver SDK)

| Step | Endpoint | Works? | Notes |
|------|---------|--------|-------|
| 1. Resolve handle | `GET /v1/resolve/:handle` | ✅ | Returns full Agent ID Object; public, no auth |
| 2. Discover agents | `GET /v1/agents?capability=...&minTrust=...` | ✅ | Public discovery with filters |
| 3. Reverse lookup | `POST /v1/reverse` | ✅ | Endpoint URL → handle resolution |
| 4. Read llms.txt | `GET /api/llms.txt` | ✅ | Machine-readable platform description |
| 5. Read public profile | `GET /v1/public/agents/:id` | ✅ | Returns agent identity + keys (JWKS-compatible) |

**Verdict: Fully functional. Protocol surface is well-designed for machine consumption.**

---

## 4. Handle Economy Truth

### 4.1 Pricing Consistency

| Tier | Frontend (`pricing.ts`) | Backend (`billing.ts`) | llms.txt | Consistent? |
|------|------------------------|----------------------|----------|-------------|
| 3-char | $640/yr | 64000 cents/yr | $640/year | ✅ |
| 4-char | $160/yr | 16000 cents/yr | $160/year | ✅ |
| 5+ char | $5/yr | 500 cents/yr | $5/year | ✅ |

Handle pricing is consistent across all surfaces.

### 4.2 Plan Pricing Discrepancy

| Plan | Frontend (`pricing.ts`) | Backend (`billing.ts`) | llms.txt |
|------|------------------------|----------------------|----------|
| Starter / Free | **$0 forever** | **$9/mo** (`starter`) or **$0** (`free`) | **Free** |
| Pro | $29/mo | $29/mo | $29/mo |
| Enterprise | Custom | $79/mo (`team`) | Custom |

**Finding:** The backend defines four plan tiers (`free`, `starter`, `pro`, `team`) while the frontend and llms.txt show three (`Starter=Free`, `Pro=$29`, `Enterprise=Custom`). The backend `starter` plan at $9/mo has no frontend representation. The backend `team` plan at $79/mo is called "Enterprise" on the frontend with "Custom" pricing. The `free` plan (1 agent, no marketplace listing) maps to the frontend "Starter" plan.

**Risk:** If a user subscribes to "Starter" (expecting free), the backend plan name resolution must map to `free`, not `starter`. If it maps to `starter`, they would be charged $9/mo.

### 4.3 Plan Limits

| Plan | Max Agents | Marketplace Listing | Premium Routing | Advanced Auth | Team Features |
|------|-----------|-------------------|----------------|--------------|--------------|
| free | 1 | ❌ | ❌ | ❌ | ❌ |
| starter | 1 | ✅ | ❌ | ❌ | ❌ |
| pro | 5 | ✅ | ✅ | ✅ | ❌ |
| team | 10 | ✅ | ✅ | ✅ | ✅ |

**Finding:** Frontend "Pro" says "Up to 10 agents" but backend `pro` plan limit is **5 agents**. Backend `team` plan has the 10-agent limit. This is a customer-facing discrepancy.

### 4.4 Handle Registration Economics

- Every handle requires paid checkout via Stripe (`POST /v1/billing/handle-checkout`). No free handle included with any plan.
- The llms.txt and frontend say ".agent address included" for the Starter plan, but there is no code path that waives the handle fee.
- No first-year-free or promotional pricing logic exists in the codebase.

### 4.5 Handle Transfer

- Handles can be transferred to another account via the transfer system (changes `userId` on the agent record).
- No handle-only transfer exists — transfer always transfers the entire agent identity.
- No secondary market pricing or royalty mechanism.

---

## 5. Auth & Security Findings

### 5.1 Authentication Architecture

| Auth Method | Mechanism | Where Used | Notes |
|-------------|----------|-----------|-------|
| Replit Auth | `X-Replit-User-Id` header | All human-facing routes | Trusts proxy-injected headers |
| Dev Fallback | `X-AgentId-User-Id` header | Non-production only | Allows impersonation in dev; properly gated on `NODE_ENV` |
| API Key (Human) | `Bearer aid_*` in Authorization header | Human API access | SHA-256 hashed storage; `lastUsedAt` tracking |
| Agent Key | `X-Agent-Key` header | Agent-to-platform routes | SHA-256 hashed; verification status enforced post-auth |
| Stripe Webhook | `stripe.webhooks.constructEvent` signature | Billing webhooks | Standard Stripe verification |
| Coinbase Webhook | None | `/v1/webhooks/coinbase` | **No signature verification — logs and returns 200** |
| Visa Webhook | None | `/v1/webhooks/visa` | **No signature verification — logs and returns 200** |

### 5.2 Critical Findings

**[MEDIUM] CORS is wide-open.**
`cors()` is called with no origin restriction in `app.ts` (line ~15). Any origin can make requests. In production with Replit Auth (header-based), this is mitigated because auth headers are proxy-injected and cannot be forged by browser JavaScript. API key auth via `Authorization` header is only exploitable if keys are stored/used in browser contexts, which is not the intended usage pattern. Severity escalates to HIGH if the platform introduces browser-based API key workflows.

**[HIGH] Webhook endpoints accept any payload without verification.**
Coinbase and Visa webhook routes (`/v1/webhooks/coinbase`, `/v1/webhooks/visa`) log the payload and return `200 OK` without any signature verification or shared-secret check. An attacker can forge webhook events.

**[HIGH] Ephemeral encryption keys.**
`crypto.ts` falls back to `randomBytes(32)` for AES-256-GCM encryption if `WEBHOOK_SECRET_KEY` is not set. Encrypted webhook secrets stored in the database become permanently undecryptable after a server restart. Same pattern in `activity-logger.ts` with `ACTIVITY_HMAC_SECRET` — activity log signatures become unverifiable.

**[MEDIUM] Rate limiter is in-memory by default.**
Without Redis, `express-rate-limit` uses in-memory storage. In a multi-process or multi-instance deployment, rate limits are per-process, not global. An attacker can bypass limits by distributing requests across instances.

**[MEDIUM] Agent auth strategy enumeration.**
When agent auth fails, the 401 response includes `supportedStrategies: ["agent-key"]`. This reveals internal auth mechanism names to unauthenticated callers.

**[LOW] No CSRF protection.**
The application relies on Replit's proxy for auth header injection. Standard CSRF tokens are not present. This is acceptable for Replit-proxied environments but becomes relevant if the API is ever accessed outside the Replit proxy.

### 5.3 Verification System

The cryptographic verification flow is well-implemented:
- Challenge: `randomBytes(32).toString("hex")` — 256-bit challenge
- Expiry: 10 minutes (`CHALLENGE_EXPIRY_MS`)
- Signature: Ed25519 verify using stored SPKI-formatted public key
- Race protection: `usedAt` is set atomically with a `WHERE usedAt IS NULL` guard
- Post-verification: agent status transitions from `pending_verification` → `active`

**Finding:** Verification-exempt paths (`/verify/initiate`, `/verify/complete`) use regex matching on `req.path`. The regex pattern `/\/verify\/initiate$/` matches any path ending in `/verify/initiate`, which could be more tightly scoped.

### 5.4 Authorization / IDOR Assessment

Object-level authorization (preventing users from accessing resources they don't own) was audited across all major route files:

| Route File | Ownership Check | Method | Verdict |
|-----------|----------------|--------|---------|
| `agents.ts` | `agent.userId !== req.userId` (lines 160, 245, 272) | Direct comparison | ✅ Consistent |
| `agent-verification.ts` | `agent.userId !== req.userId` (lines 28, 59) | Direct comparison | ✅ Consistent |
| `agent-transfers.ts` | `transfer.sellerId !== req.userId && transfer.buyerId !== req.userId` (lines 158, 319, 335, 356) | Dual-party check | ✅ Consistent |
| `programmatic.ts` | `agent.userId !== req.userId` (lines 133, 195, 266) | Direct comparison | ✅ Consistent |
| `mail.ts` | `mailService.verifyAgentOwnership(agentId, req.userId!)` on every route (16+ checks) | Service-level ownership verification | ✅ Consistent |
| `tasks.ts` | `senderAgent.userId !== req.userId` (line 38) | Direct comparison | ✅ Consistent |
| `api-keys.ts` | Scoped to `req.user!.id` at creation | Implicit ownership | ✅ Consistent |
| `fleet.ts` | Scoped to `req.userId` in queries | Query-level filter | ✅ Consistent |

**Verdict:** Object-level authorization is consistently enforced across all user-facing routes. No IDOR vulnerabilities were identified. Ownership checks use either direct `userId` comparison or service-level verification functions. The codebase follows a defensive pattern where ownership is verified before any mutation.

---

## 6. Trust System Reality

### 6.1 Provider Registry

| # | Provider ID | Label | Max Score | Source Type |
|---|------------|-------|-----------|------------|
| 1 | `verification` | Verification Status | 20 | Platform-verified |
| 2 | `longevity` | Account Longevity | 15 | Signed (time-based) |
| 3 | `activity` | Task Activity | 15 | Signed (task count) |
| 4 | `reputation` | Reputation Events | 10 | Peer attestations |
| 5 | `reviews` | Marketplace Reviews | 15 | Peer attestations |
| 6 | `endpointHealth` | Endpoint Health | 10 | Platform-verified |
| 7 | `profileCompleteness` | Profile Completeness | 15 | Platform-verified |
| 8 | `externalSignals` | External Signals | 10 | Third-party |
| 9 | `lineageSponsorship` | Lineage Sponsorship | 10 | Self-asserted (parent) |

**Theoretical Maximum Score: 120** (sum of all maxScores). Scores are summed directly with no normalization to 0-100.

### 6.2 Tier Thresholds

| Tier | Score Range | Requires Verified? |
|------|-----------|-------------------|
| unverified | 0-19 | No |
| basic | 20-39 | No |
| verified | 40-69 | Yes |
| trusted | 70-89 | Yes |
| elite | 90+ | Yes |

### 6.3 Findings

**[HIGH] Score exceeds 100 scale.** The `determineTier()` function compares against thresholds up to 90, but the maximum possible score is 120. The llms.txt says "Composite reputation score (0–100)" — this is inaccurate. A fully scored agent could reach 120, making the "elite" threshold of 90 achievable by ~75% profile completion rather than true excellence.

**[MEDIUM] No trust decay mechanism.** The llms.txt states trust "decays with inactivity" but no decay logic exists. Once earned, trust scores only increase. An agent inactive for years retains its score.

**[MEDIUM] Child agent ceiling is applied but not documented.** `BASIC_TIER_CEILING = 39` is defined but its application depends on context in the `computeTrustScore` flow. Unverified child agents cannot exceed the "basic" tier.

**[LOW] Endpoint health check is shallow.** The `endpointHealth` provider awards points for having an endpoint URL and using HTTPS, but does not actually probe the endpoint. A 404-returning HTTPS URL gets full marks.

**[LOW] Hardcoded weights with no admin tuning.** All provider weights are compile-time constants. Tuning requires a code deploy.

### 6.4 Scoring Walkthrough: Brand-New Verified Agent

| Provider | Score | Reasoning |
|---------|-------|-----------|
| verification | 20 | Verified |
| longevity | 1 | < 7 days old |
| activity | 0 | 0 tasks completed |
| reputation | 0 | No events |
| reviews | 0 | No reviews |
| endpointHealth | 10 | HTTPS endpoint + active status |
| profileCompleteness | 13 | Name + description + endpoint + capabilities + protocols |
| externalSignals | 0 | No signals |
| lineageSponsorship | 0 | No parent |
| **Total** | **44** | **Tier: verified** |

A brand-new verified agent with a complete profile starts at tier "verified" (44/120).

---

## 7. Inbox Verdict

### 7.1 Architecture

The inbox system is a full mail service built on:
- `mailService` (`services/mail.ts`) — CRUD for inboxes, messages, threads, labels, routing rules, webhooks
- `mail-transport.ts` — Webhook signature generation
- `webhook-delivery.ts` worker — Reliable webhook delivery (Redis-backed)
- Routes: `/v1/mail/*`

### 7.2 Feature Coverage

| Feature | Status | Notes |
|---------|--------|-------|
| Create inbox for agent | ✅ | One inbox per agent, auto-created |
| Send message | ✅ | With threading support |
| List messages | ✅ | Pagination, filtering by label/status |
| Message threading | ✅ | `threadId` linking |
| Labels | ✅ | Custom label CRUD, assign to messages |
| Routing rules | ✅ | Condition-based routing with priority ordering |
| Webhook notifications | ✅ | On message receipt; signed with HMAC |
| Convert message to task | ✅ | Creates task from message content |
| Mark read/archived | ✅ | Status transitions |

### 7.3 Findings

**[HIGH] Agent-auth is missing on all mail routes.** Every mail endpoint uses `requireAuth` (human Replit auth). Agents cannot access their own inbox via `X-Agent-Key`. This means:
- An agent receiving a task notification via webhook cannot fetch the full message body from the API.
- Agent-to-agent messaging requires human intermediation.
- The inbox is effectively a human-managed queue, not an agent-native mailbox.

**[MEDIUM] No rate limiting on message send.** The `POST /v1/mail/inboxes/:id/messages/send` endpoint is only protected by the global rate limiter (500 req/min). No per-inbox or per-sender throttle. A compromised account could flood an agent's inbox.

**[LOW] Webhook delivery degrades silently.** Without Redis, `enqueueWebhookDelivery` returns `false` and the caller must implement inline fallback. The mail route code handles this by falling back to in-process delivery, but there is no retry logic in the fallback path.

---

## 8. Protocol Surface Assessment

### 8.1 Public Endpoints (No Auth Required)

| Endpoint | Purpose | Response Format | Cache |
|---------|---------|----------------|-------|
| `GET /v1/resolve/:handle` | Handle → Agent ID Object | JSON | No |
| `GET /v1/public/agents/:id` | Agent identity + JWKS | JSON | No |
| `GET /v1/agents?capability=...` | Agent discovery (filtered) | JSON | No |
| `POST /v1/reverse` | Endpoint URL → handle | JSON | No |
| `GET /api/llms.txt` | Platform description | text/plain | 1hr (`max-age=3600`) |
| `GET /api/healthz` | Health check | JSON | No |
| `GET /api/docs` | Swagger UI | HTML | No |

### 8.2 Resolution Response Shape

The `/v1/resolve/:handle` endpoint returns:

```json
{
  "agent": { "id", "handle", "displayName", "capabilities", "endpointUrl", "protocols", "status", "trustScore", "trustTier", "domain", ... },
  "trust": { "trustScore", "trustBreakdown", "trustTier", "signals": [...] },
  "registryUrl": "https://.../api/v1/resolve/<handle>",
  "webFallbackUrl": "https://<handle>.getagent.id"
}
```

### 8.3 Machine-Readability Assessment

**[GOOD]** The public agent identity endpoint (`/v1/public/agents/:id`) returns structured JWKS-compatible key material, enabling framework-native key discovery.

**[GOOD]** The discovery endpoint supports `capability`, `protocol`, `minTrust`, `verifiedOnly` query parameters — sufficient for orchestration framework integration.

**[GOOD]** llms.txt is well-structured and mostly accurate, except for the pricing/plan discrepancies documented in Section 4.2, the "0–100" trust score claim (actual max is 120, see Section 6.3), and the "decays with inactivity" trust claim (no decay implemented).

**[GAP]** No `.well-known` directory. Standards like `/.well-known/agent-id.json` or `/.well-known/jwks.json` would improve protocol-level discovery.

**[GAP]** No standardized error schema documented in the public surface. Errors use `{ error, code }` but this is not declared in a machine-discoverable way.

---

## 9. Transfer / Sale Verdict

### 9.1 State Machine

```
draft → listed → pending_acceptance → hold_pending → transfer_pending → in_handoff → completed
  ↓        ↓           ↓                   ↓              ↓                ↓
cancelled cancelled  cancelled           cancelled      cancelled       disputed
                                         disputed       disputed          ↓
                                                                       cancelled / in_handoff
```

### 9.2 Transfer Lifecycle Features

| Feature | Status | Notes |
|---------|--------|-------|
| Transfer creation | ✅ | Readiness report required |
| Readiness report | ✅ | Checks verification, active status, pending tasks |
| Asset inventory | ✅ | Categorizes transferable / reconnect-needed / excluded assets |
| State transitions | ✅ | Validated against allowed transitions |
| Trust snapshot | ✅ | Pre-transfer trust state captured |
| Trust recalibration | ✅ | Post-transfer trust penalty applied (new-operator discount) |
| Key revocation | ✅ | All seller's keys revoked on handoff |
| Operator history | ✅ | Full chain-of-custody recorded |
| Activity logging | ✅ | All transfer events logged with HMAC signatures |
| Event audit trail | ✅ | `agent_transfer_events` table with actor, payload, timestamps |

### 9.3 Findings

**[CRITICAL] Escrow is a placeholder.** The `fundHold()` function in `agent-transfer.ts` contains explicit `ESCROW_PROVIDER_GAP` comments. The function simulates a hold by transitioning state but does not interact with any payment provider. No funds are actually held. The `releaseHold()` function similarly transitions state without moving money.

**Impact:** Buyers have no payment protection. A seller could complete a transfer, collect payment out-of-band, and the platform has no mechanism to reverse or protect either party.

**[HIGH] No payment verification on acceptance.** The `acceptTransfer()` function transitions from `pending_acceptance` to `hold_pending` or `transfer_pending` but does not verify that any payment was received. The buyer simply calls the endpoint and the transfer proceeds.

**[MEDIUM] Dispute resolution is status-only.** The `disputed` status exists and can be set, but there is no resolution workflow, no arbitration mechanism, and no automated hold/release based on dispute outcome.

---

## 10. Infra & Environment Checklist

### 10.1 Environment Variables

| Variable | Required? | Impact if Missing | Current State |
|----------|----------|------------------|--------------|
| `PORT` | **Yes** | **Server crashes** (throws on startup) | Must be set |
| `DATABASE_URL` | **Yes** | Drizzle ORM fails to connect | Managed by Replit |
| `STRIPE_SECRET_KEY` | No | Billing/checkout throws at call time | Lazy-initialized |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook verification fails | Required for webhooks |
| `REDIS_URL` | No | Workers disabled, rate-limit in-memory, queues unavailable | Graceful degradation |
| `RESEND_API_KEY` | No | Email sends fail silently | Optional |
| `CLOUDFLARE_API_TOKEN` | No | Domain provisioning fails | Required for .agent DNS |
| `CLOUDFLARE_ZONE_ID` | No | Domain provisioning fails | Required for .agent DNS |
| `AGENT_PROXY_IP` | No | DNS A record target missing | Required for .agent DNS |
| `BASE_AGENT_DOMAIN` | No | .agent domain suffix undefined | Required for .agent DNS |
| `MAIL_BASE_DOMAIN` | No | Mail domain undefined | Optional |
| `FROM_EMAIL` | No | Email sender address undefined | Optional |
| `APP_URL` | No | Callback/redirect URLs broken | Should be set |
| `REPLIT_DEV_DOMAIN` | No | Dev proxy domain unknown | Auto-set by Replit |
| `ACTIVITY_HMAC_SECRET` | No | Ephemeral HMAC key (signatures don't survive restarts) | **Should be set** |
| `WEBHOOK_SECRET_KEY` | No | Ephemeral AES key (encrypted secrets lost on restart) | **Should be set** |
| `NODE_ENV` | No | Dev auth fallback enabled | Should be `production` in prod |
| `LOG_LEVEL` | No | Default logging | Optional |

### 10.2 Infrastructure Dependencies

| Dependency | Required for Production? | Graceful Degradation? |
|-----------|------------------------|---------------------|
| PostgreSQL | **Yes** | No — hard crash |
| Redis | No (but strongly recommended) | Yes — workers disabled, in-memory rate limits |
| Stripe | Yes (for paid features) | Yes — throws at call time |
| Cloudflare | Yes (for .agent domains) | Yes — provisioning silently skipped |
| Resend | No | Yes — email sends fail silently |

### 10.3 Production Readiness

**[CRITICAL] `ACTIVITY_HMAC_SECRET` and `WEBHOOK_SECRET_KEY` must be set.** Without these, encrypted webhook secrets and signed activity logs become invalid on every restart. This is a data integrity issue, not just a convenience issue.

**[HIGH] Redis is effectively required for production.** Without it: domain provisioning is disabled, webhook delivery has no retry, and rate limiting is per-process. The "optional" Redis degrades too many features for production use.

**[MEDIUM] No health check for database connectivity.** The `/api/healthz` endpoint returns `{ status: "ok" }` without checking PostgreSQL connectivity. A database outage would show a healthy service.

---

## 11. Launch Blockers

These issues must be resolved before any public launch:

### P0 — Must Fix

| # | Issue | Component | Details |
|---|-------|----------|---------|
| 1 | **Escrow is a placeholder** | `services/agent-transfer.ts` (`fundHold()`, `releaseHold()`) | No real payment hold/release. `ESCROW_PROVIDER_GAP` comments mark the gap explicitly. Buyer/seller protection is non-existent. Either implement escrow or remove transfer pricing and mark transfers as "direct/unprotected." |
| 2 | **Plan pricing mismatch** | `services/billing.ts` (lines 14-25) vs `lib/pricing.ts` (lines 12-66) | Backend `PLAN_LIMITS.pro` = 5 agents; frontend "Pro" says "Up to 10 agents". Backend `PLAN_PRICES.starter` = $9/mo; frontend "Starter" = $0. Must reconcile or users will be charged unexpectedly. |
| 3 | **Ephemeral crypto keys in production** | `utils/crypto.ts` (lines 8-21), `services/activity-logger.ts` (lines 6-26) | `WEBHOOK_SECRET_KEY` and `ACTIVITY_HMAC_SECRET` fall back to `randomBytes(32)`. Encrypted secrets and signed logs become invalid on restart. Add startup crash when `NODE_ENV=production` and these are unset. |
| 4 | **Coinbase/Visa webhooks accept all payloads** | `routes/v1/webhooks.ts` | Stub endpoints with no signature verification — log and return 200. Remove or gate behind feature flag until implemented. |
| 5 | **CORS unrestricted** | `app.ts` (line ~15) | Configure allowed origins for production. Risk is medium today but escalates if browser-based API key usage is introduced. |

### P1 — Should Fix Before Launch

| # | Issue | Component | Details |
|---|-------|----------|---------|
| 6 | **Programmatic registration requires human auth** | `programmatic.ts` | Contradicts "autonomous" registration claim. Decide: keep human-gated (and update docs) or create a separate auth path for autonomous registration. |
| 7 | **Agent inbox lacks agent-auth** | `mail.ts` routes | Agents cannot access their own inbox. Add `requireAgentAuth` as an alternative auth path on mail routes. |
| 8 | **Trust score exceeds documented 0-100 range** | `trust-score.ts` | Max is 120, not 100. Either normalize or update documentation. |
| 9 | **No trust decay** | `trust-score.ts` | Documented but not implemented. Either implement or remove the claim. |
| 10 | **Redis should be required for production** | Deployment config | Add startup warning or enforcement when `NODE_ENV=production` and `REDIS_URL` is missing. |

---

## 12. Post-Launch Debt

These are not blockers but represent meaningful technical debt:

### Architecture

| # | Issue | Priority | Notes |
|---|-------|---------|-------|
| 1 | Health check should verify DB connectivity | Medium | Add `SELECT 1` probe to healthz |
| 2 | No `.well-known` discovery endpoints | Medium | Add `/.well-known/agent-id.json` for protocol-level discovery |
| 3 | Agent auth strategy enumeration in 401 response | Low | Remove `supportedStrategies` from error response |
| 4 | Endpoint health provider does not actually probe endpoints | Medium | Add async health checks with caching |
| 5 | Trust provider weights are compile-time constants | Low | Move to database/config for admin tuning |

### Code Quality

| # | Issue | Priority | Notes |
|---|-------|---------|-------|
| 6 | Route handlers contain inline business logic | Medium | Many routes (marketplace, jobs, agents) have DB queries inline instead of service layer |
| 7 | No request validation middleware | Medium | Zod schemas exist (`@workspace/api-zod`) but aren't consistently applied as middleware |
| 8 | Webhook delivery fallback has no retry | Low | In-process fallback (no Redis) does fire-and-forget delivery |
| 9 | Transfer readiness report is generated twice | Low | `createTransfer()` calls `generateReadinessReport()` twice — once for validation, once for asset inventory |
| 10 | `getStripe()` creates a new instance on every call | Low | Stripe client should be cached/singleton |

### Product

| # | Issue | Priority | Notes |
|---|-------|---------|-------|
| 11 | No free handle with plan | Medium | Frontend advertises ".agent address included" but every handle requires payment |
| 12 | No monthly activation / renewal concept | Low | Handles are one-time checkout; no renewal/expiry logic exists |
| 13 | Dispute resolution is status-only | Medium | No arbitration workflow, no automated escrow release based on dispute outcome |
| 14 | No agent deactivation/suspension mechanism | Low | Agents can be deleted but not suspended/deactivated by platform |
| 15 | No email verification for users | Low | Users are created from Replit headers; no email verification step |

---

*End of audit. This document should be reviewed alongside the codebase and updated as issues are resolved.*
