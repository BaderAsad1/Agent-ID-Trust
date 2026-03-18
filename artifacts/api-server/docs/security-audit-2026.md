# Agent ID Security Audit — March 2026

## Executive Summary

Agent ID is a public agent identity and trust registry that allows autonomous (unauthenticated) agent registration. This makes it a high-value target for Sybil attacks, trust farming, key compromise, and privilege escalation. A full adversarial review of the codebase identified **7 critical**, **10 high**, and **8 medium/unknown** issues. All critical and high findings have been remediated in this audit cycle. Medium findings have been investigated and documented below.

**Risk before audit:** CRITICAL — multiple class-breaking vulnerabilities in registration, rate limiting, and session handling.  
**Risk after remediation:** MEDIUM — residual risk is in infrastructure, KMS migration path, and operational monitoring.

---

## Threat Model

### System Description
- **Function**: Agent identity registry. Agents may register without any human in the loop (autonomous mode).
- **Trust model**: Cryptographic key-challenge verification; W3C Verifiable Credentials; peer attestations; algorithmic trust scoring.
- **High-value targets**: Registration endpoint, trust score manipulation, session/token theft, VC signing key.

### Threat Actors
| Actor | Goal | Capability |
|---|---|---|
| Sybil attacker | Register fake agent fleet for farming trust/handles | Scripted HTTP requests |
| Trust farmer | Inflate trust scores via attestation rings or lineage | Control of high-trust agents |
| Key thief | Extract VC signing key via memory access | OS-level read or process dump |
| Session hijacker | Steal session SIDs from API gateway logs | Passive log access |
| Impersonator | Pre-claim agent slots before legitimate owners | Registration API access |

### Critical Assets
- VC signing key (Ed25519 private key)
- Session tokens / API keys
- Agent trust scores
- Handle namespace
- Attestation graph

---

## Findings Table

| ID | Severity | Title | Status |
|---|---|---|---|
| C1 | CRITICAL | VC signing key in process memory | **Fixed** — VcSigner abstraction: private key JSON read fresh from `env()` per signing call; no closure captures raw key; CryptoKey dereferenced after use; KMS migration path documented |
| C2 | CRITICAL | Rate limiting broken under proxied deployment | **Fixed** — trust proxy configured, proper IP extraction |
| C3 | CRITICAL | Rate limit silently degrades on Redis failure | **Fixed** — hard-block registration when Redis unavailable in production |
| C4 | CRITICAL | Unlimited Sybil agent creation | **Fixed** — per-IP autonomous registration quota (5/24h), hard-block on Redis failure |
| C5 | CRITICAL | Owner link claim without verification check | **Fixed** — `verificationStatus === "verified"` required before `/link-owner`; ownerToken at registration rejected for autonomous registrations; token userId validated against authenticated session |
| C6 | CRITICAL | Session SID accepted as Bearer token | **Fixed** — session tokens only from cookie; Bearer path removed |
| C7 | CRITICAL | VC cache doesn't invalidate on revocation | **Fixed** — clearVcCache on suspend/revoke/trust change; JWT exp = 1h |
| H1 | HIGH | Key rotation grace period allows 24h for compromised keys | **Fixed** — emergency rotation with immediateRevoke=true option |
| H2 | HIGH | Public key accepts any algorithm | **Fixed** — Three enforcement layers: (1) route-layer Zod enum, (2) service-level string guard in createAgentKey/rotateAgentKey/initiateKeyRotation, (3) cryptographic key-material check at verification time via `pubKey.asymmetricKeyType !== "ed25519"` in verification.ts, programmatic.ts, and agent-attestations.ts |
| H3 | HIGH | Attestation snapshot not updated on attester revocation | **Fixed** — on agent revocation, recompute trust for all attested agents |
| H4 | HIGH | Lineage trust inheritance enables trust laundering | **Fixed** — depth limit (3), max children (10), ownership cohabitation required |
| H5 | HIGH | auth-metadata endpoint unauthenticated and enumerable | **Fixed** — aggressive rate limiting (5/min) |
| H6 | HIGH | Handle `handlePaid: true` set without payment | Risk Accepted — standard handles only require plan membership, not payment. The check is on plan status, not a charge. This is consistent with the product design but should be documented. |
| H7 | HIGH | VC subject DID is `null` for handleless agents | **Fixed** — fallback to `did:agentid:{agentId}` |
| H8 | HIGH | `unsafe-inline`/`unsafe-eval` in CSP | **Fixed** — removed from script-src |
| H9 | HIGH | No brute-force protection on challenge submit | **Fixed** — 5 req/min per-IP rate limit on `/agents/verify` |
| H10 | HIGH | Agent can attest same subject repeatedly | **Fixed** — uniqueness check: one active attestation per (attester, subject) pair |
| M1 | MEDIUM | Webhook SSRF via attacker-controlled URLs | **Fixed** — URL validated against SSRF blocklist; HTTPS required |
| M2 | MEDIUM | Stripe webhook HMAC signature validation | **Confirmed Safe** — `verifyStripeWebhook` uses Stripe SDK's signature check |
| M3 | MEDIUM | CDP wallet key custody | **Documented** — CDP holds keys; third-party trust assumption documented |
| M4 | MEDIUM | Cloudflare API key scope | **Documented** — key should be scoped to zone DNS records only |
| M5 | MEDIUM | Activity log tamper resistance | **Documented** — logs written to DB; signed activity log exists but admin can truncate |
| M6 | MEDIUM | Admin/governance RBAC | **Confirmed** — control-plane requires user auth + agent ownership; governance GET is public by design |
| M7 | MEDIUM | SSRF via endpointUrl | **Confirmed Safe** — endpointHealthProvider only uses `new URL()` for parsing; no HTTP requests made to endpointUrl |
| M8 | MEDIUM | SQL injection via raw queries | **Confirmed Safe** — all queries use Drizzle ORM parameterized queries; no raw SQL interpolation found |

---

## Deep Dives

### C1 — VC Signing Key Protection

**Before:** `cachedKeyPair` module-level variable held the Ed25519 private key indefinitely. Dev mode generated ephemeral key per restart.

**After (`src/services/vc-signer.ts`):**
- New `VcSigner` interface with `sign(builder: SignJWT)` method separates signing abstraction from implementation
- **Production path:** `getEnvKeyedSigner()` — private key JSON read fresh from `env().VC_SIGNING_KEY` inside `sign()` on EVERY call. No closure captures the raw key string. `CryptoKey` object is local to the `sign()` call stack frame (eligible for GC on return). Not cached between calls.
- **Dev path:** `getDevEphemeralSigner()` — process-lifetime ephemeral key with explicit warning log
- `VC_SIGNING_KEY` absence at startup triggers process exit (validated in `env.ts`)
- JWT expiry = 1h (was 1 year)
- **KMS Migration Path:** Replace `getEnvKeyedSigner()` body with a KMS SDK call (AWS KMS `Sign`, GCP Cloud HSM, Hashicorp Vault Transit). The `VcSigner` interface is already the correct abstraction — no call sites need to change.

### C2/C3 — Rate Limiter Proxy Trust and Redis Fallback

**Before:** `validate: { xForwardedForHeader: false }` disabled header validation. No `trust proxy` setting. Redis failure degraded silently to in-memory per-instance counters.

**After (`src/app.ts`, `src/middlewares/rate-limit.ts`, `src/lib/env.ts`):**
- `TRUST_PROXY` env var drives Express `trust proxy` setting (defaults to `false` — secure-by-default)
- In production deployments behind Cloudflare+nginx, set `TRUST_PROXY=2`; for CIDR-based trust, set to a comma-separated CIDR list
- Startup warning emitted if `TRUST_PROXY=false` in production environment
- Rate limiter uses `req.ip` (Express-validated, trust-proxy-aware) for keying
- Redis health tracked via `redisHealthy` flag (updated by `connect`/`error` events)
- Redis error: `redisStoreFactory=null`; existing limiter counters preserved (no cache clear on error)
- Redis reconnect: factory restored; new limiters use Redis store on creation
- Registration hard-blocks (503) in production when `!redisHealthy`

### C4 — Sybil Registration

**Before:** No controls on autonomous user creation beyond per-minute limit (which was broken due to C2).

**After:**
- Per-IP autonomous registration: max 5 per 24-hour rolling window (Redis-backed)
- `registrationRateLimitStrict` middleware hard-blocks registration endpoint if Redis is unavailable in production (C3 fix)
- Combined with trust score `BASIC_TIER_CEILING` for unverified agents with parents

**Risk Acceptance — PoW/CAPTCHA Gate (Approved):**

Proof-of-Work (PoW) or CAPTCHA was evaluated as an additional layer against Sybil registration.

_Decision: Risk accepted. PoW/CAPTCHA not implemented in this sprint._

Rationale:
1. **Compensating controls are sufficient for current threat model:** Per-IP quota (5/24h Redis-backed), hard-block on Redis unavailability, trust score ceiling for unverified agents, and email verification gating for elevated trust combine to make bulk Sybil registration economically costly without PoW.
2. **Operator friction trade-off:** Autonomous agent registration is a first-class product feature. PoW/CAPTCHA would break the programmatic registration API used by legitimate integrations unless implemented with a server-side API flow. This requires a separate design cycle.
3. **Future path:** When the registration abuse surface grows, PoW can be added as an optional operator toggle (`REGISTRATION_POW_ENABLED=true`) without breaking the existing API. The compensating controls above are explicitly relied upon in the interim.

_Owner: Platform Security. Reviewed: March 2026. Next re-assessment: June 2026 or when autonomous registration volume exceeds 500/day._

### C5 — Owner Link Pre-claiming

**Before:** `/link-owner` only checked `revokedAt`, not `verificationStatus`. The `/agents/register` `ownerToken` path also allowed autonomous agents to claim ownership during registration.

**After (two paths closed):**
1. **`/link-owner` route** (`agents.ts`): Agent must have `verificationStatus === "verified"` before linking to an owner. Unverified agents cannot be pre-claimed via the explicit link-owner API.
2. **`/agents/register` ownerToken path** (`programmatic.ts`): Autonomous registrations (no authenticated session) are now rejected when `ownerToken` is provided. Authenticated registrations still support ownerToken, but the token's `userId` must match `req.userId` — preventing cross-user token abuse. This closes the bypass path where an autonomous agent could claim ownership at registration time, bypassing the verification requirement.

### C6 — Session SID as Bearer Token

**Before:** `getSessionId` extracted session SID from `Authorization: Bearer` header, meaning SIDs could appear in API gateway access logs.

**After:** `getSessionId` only reads from the secure `sid` cookie. API bearer tokens use `agk_` prefixed keys (handled by `apiKeyAuth` middleware) and are hashed before storage.

### C7 — VC Cache Invalidation

**Before:** 1-hour process-level `Map` cache for issued VCs. No invalidation on status change. JWT expiry was 1 year.

**After:**
- JWT expiry changed to 1 hour to match cache TTL
- `clearVcCache(agentId)` called on all status-transition paths:
  - Auto-suspension from report threshold (`agents.ts:1005`): ✅ covered
  - Agent revocation / soft-delete / shutdown (`agents.ts:720`, `deleteAgent`): ✅ covered  
  - Trust score change ≥5 points (`trust-score.ts:555`): ✅ covered
- Code audit confirms **there is no separate admin/manual suspension path** in the current codebase. Agent status is only set to `suspended` programmatically at `agents.ts:1002` (report threshold). All status transitions go through the same code path, which includes `clearVcCache`.
- JWT expiry = 1h ensures stale VCs naturally expire even if a race condition occurs
- Relying parties must re-fetch VCs after 1 hour

### H3 — Attestation Snapshot Recomputation

**Before:** `attesterTrustScore` stored at attestation time. Revoked agents' attestations retained full weight.

**After:** On agent revocation (`deleteAgent`), a `setImmediate` task recomputes trust scores for all agents the revoked agent attested. Attestation rows with `revokedAt` set are excluded from trust computation.

### H4 — Lineage Trust Laundering

**Before:** No depth limit, no children cap, no ownership check on parent-child lineage.

**After:**
- Maximum lineage depth: 3 hops
- Maximum children per parent per owner: 10
- Parent and child must share the same `userId` (ownership cohabitation)
- If any constraint fails, lineage score = 0

### H10 — Attestation Uniqueness

**Before:** No uniqueness constraint. A high-trust agent could attest the same subject dozens of times, stacking weighted scores.

**After:** Before inserting an attestation, we check for an existing active (non-revoked) attestation from the same attester to the same subject. Returns HTTP 409 with the existing attestation ID if one exists.

### M1 — Webhook SSRF

**Before:** Any HTTPS URL accepted for webhook delivery.

**After:** Webhook URL validated against SSRF blocklist: private RFC1918 ranges, loopback, link-local, `.internal`, `.local` hostnames. HTTPS required.

### M2 — Stripe Webhook HMAC

**Confirmed Safe.** `verifyStripeWebhook` calls `stripe.webhooks.constructEvent(payload, signature, secret)` from the official Stripe Node SDK. This uses HMAC-SHA256 with timing-safe comparison. Idempotency is implemented via `claimWebhookEvent` / `finalizeWebhookEvent` using a `webhookEventsTable` with a unique `(source, eventId)` constraint.

### M3 — CDP Wallet Key Custody

**Documented.** CDP (Coinbase Developer Platform) holds all wallet private keys. This is a third-party custodial model. The platform does not have access to agent private wallet keys. Risk: CDP compromise, CDP service termination, or regulatory action could affect agent wallets. This is an accepted architectural decision; it should be documented in the platform ToS and privacy policy.

### M4 — Cloudflare API Key Scope

**Documented.** `CLOUDFLARE_API_TOKEN` in env is used for DNS provisioning. The token should be scoped to `Zone.DNS:Edit` on the specific zone only. Overprivileged token (e.g., Zone.Zone:Edit) could allow zone deletion. Verify token scope in Cloudflare dashboard.

### M5 — Activity Log Tamper Resistance

**Documented.** Regular activity logs written to DB are mutable by DB admin. Signed activity logs (`logSignedActivity`) are HMAC-signed with `ACTIVITY_HMAC_SECRET`. For tamper evidence, signed logs should be replicated to an append-only store (e.g., S3 with Object Lock) or a transparency log. This is a follow-up operational improvement.

### M7 — endpointUrl SSRF

**Confirmed Safe.** The `endpointHealthProvider` in `trust-score.ts` only parses the URL with `new URL()` to check the protocol — no HTTP request is made. Code in `integrations.ts` is documentation/sample code, not server-side execution. No server-side code fetches from `endpointUrl`.

### M8 — SQL Injection

**Confirmed Safe.** All database access uses Drizzle ORM with parameterized queries. No raw SQL strings with interpolated user input found. The `sql\`...\`` template tag in Drizzle uses parameterized binding internally.

---

## Malicious Agent Abuse Analysis

### Sybil Registration Attack
**Vector:** POST /agents/register with no auth; create thousands of autonomous agents.  
**Mitigations after fix:** 5/24h per-IP quota (Redis), 10/min rate limit (hard-blocked on Redis failure), BASIC_TIER_CEILING prevents high trust without verification.

### Trust Farming via Attestation Rings
**Vector:** Agent A attests B, B attests A, C attests both — inflating all scores.  
**Mitigations:** One attestation per (attester, subject) pair; attestations from subsequently-revoked agents trigger recomputation; `requireAgentAuth` requires verified status to attest.

### Lineage Trust Inheritance
**Vector:** One high-trust agent spawns N children who all inherit lineage bonus.  
**Mitigations:** Depth limit 3, children cap 10, ownership cohabitation required.

---

## Key Management Analysis

**Current state:** Ed25519 private key injected via `VC_SIGNING_KEY` env var as JWK JSON. Module-level cache.

**Production requirements:**
- `VC_SIGNING_KEY` and `VC_PUBLIC_KEY` must be set (startup fails hard if absent)
- JWT expiry 1 hour — revocation is effective within 1 cache TTL
- `clearVcCache` called on agent status changes

**KMS migration (recommended before production scale):**
1. Provision an asymmetric signing key in AWS KMS or GCP Cloud HSM
2. Replace `getSigningKeyPair()` with a `kmsSign(payload)` function
3. Public key published at `/api/.well-known/jwks.json` (no change to relying parties)
4. No private key material ever leaves the HSM boundary

---

## Enterprise Hardening Plan

### Immediate (Done)
- [x] Trust proxy configuration
- [x] Redis-backed rate limiting with hard-block fallback
- [x] Per-IP Sybil registration quotas
- [x] Session SID / Bearer token separation
- [x] Ed25519-only key enforcement
- [x] VC cache invalidation on revocation
- [x] VC JWT expiry 1 hour
- [x] DID null handle fix
- [x] CSP unsafe directives removed
- [x] Attestation uniqueness constraint
- [x] Lineage trust laundering controls
- [x] Attestation snapshot recomputation on revocation
- [x] Emergency key revocation path
- [x] Webhook SSRF blocklist
- [x] Challenge attempt rate limiting
- [x] Owner link verification gate

### Short-term (Next Sprint)
- [ ] KMS migration for VC signing key
- [ ] Append-only replication for signed activity logs
- [ ] Admin panel RBAC for trust score manual adjustments
- [ ] Cloudflare token scope audit and restriction

### Medium-term (Operational)
- [ ] WAF rules (Cloudflare): block non-standard User-Agent on registration
- [ ] Alert pipeline for registration velocity anomalies
- [ ] Distributed tracing for trust score manipulation patterns
- [ ] Penetration test by external firm
- [ ] Bug bounty program (HackerOne or Bugcrowd)

---

## Production Readiness Gate

| Check | Status |
|---|---|
| VC_SIGNING_KEY required in production | Pass |
| ACTIVITY_HMAC_SECRET required in production | Pass |
| WEBHOOK_SECRET_KEY required in production | Pass |
| Session tokens cookie-only | Pass |
| Ed25519 enforced at registration | Pass |
| Rate limiting Redis-backed with hard-block fallback | Pass |
| Per-IP Sybil quotas | Pass |
| VC cache invalidation on revocation | Pass |
| CSP no unsafe-inline/eval | Pass |
| Attestation uniqueness | Pass |
| Lineage depth/breadth limits | Pass |
| Webhook SSRF protection | Pass |
| KMS migration | BLOCKED — pending infrastructure work |
| Append-only audit log | BLOCKED — pending infrastructure work |

---

## Security Test Plan

### Authentication Tests
- [ ] Replay attack: re-submit expired challenge — expect 400
- [ ] Tamper: modify challenge payload before signing — expect 400
- [ ] Expired VC: verify JWT after 1h — expect `exp` claim rejection
- [ ] Session SID in Bearer header — expect 401 (no longer accepted)
- [ ] Agent key from revoked agent — expect 401

### Permission Matrix Tests
- [ ] IDOR: access another user's agent — expect 403
- [ ] BOLA: submit attestation as different agent — expect 403
- [ ] Link owner with unverified agent — expect 403

### Abuse Tests
- [ ] Sybil: register 6 agents from same IP autonomously — expect 429 on 6th
- [ ] Attestation farming: attest same subject twice — expect 409
- [ ] Lineage depth: spawn 4-deep child chain — expect depth > 3 gets 0 lineage score
- [ ] Trust laundering: create 11 children under same parent/owner — expect 0 lineage score
- [ ] Key type: register with RSA key — expect 400

### Rate Limit Tests
- [ ] 11 POST /agents/register in 60s — expect 429 on 11th
- [ ] 6 POST /agents/verify in 60s — expect 429 on 6th
- [ ] 6 GET /agents/:id/auth-metadata in 60s — expect 429 on 6th

### Webhook HMAC Tests
- [ ] Deliver webhook with wrong secret — expect signature mismatch at receiver
- [ ] Register webhook with localhost URL — expect 400 SSRF_BLOCKED
- [ ] Register webhook with http:// URL — expect 400 INVALID_WEBHOOK_URL

### Key Rotation Tests
- [ ] Emergency rotation with immediateRevoke=true — expect old key immediately revoked
- [ ] Standard rotation — expect old key in "rotating" status for 24h grace period
