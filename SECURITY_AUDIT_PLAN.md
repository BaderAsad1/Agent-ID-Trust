# Agent ID — Security Audit Plan
**Date:** 2026-03-25
**Branch:** claude/codebase-security-audit-rwekL
**Scope:** Authentication, authorization, session management, OAuth/OIDC, bootstrap flow, API key storage, input validation, plan enforcement, protocol surface.

---

## Findings Summary

| ID | Severity | Title | File(s) |
|----|----------|-------|---------|
| C1 | CRITICAL | Magic-link tokens stored plaintext in DB | `routes/auth-oidc.ts` |
| C2 | CRITICAL | OAuth `allowedScopes=[]` passes all requested scopes | `routes/oauth.ts` |
| H1 | HIGH | No rate limit on `POST /auth/magic-link/send` | `routes/auth-oidc.ts`, `middlewares/rate-limit.ts` |
| H2 | HIGH | Magic-link token exposed in GET URL query param | `routes/auth-oidc.ts` |
| H3 | HIGH | OAuth allows `plain` PKCE — security downgrade | `routes/oauth.ts` |
| H4 | HIGH | Programmatic registration/verify bypass plan limits | `routes/v1/programmatic.ts` |
| H5 | HIGH | Bootstrap `/activate` and programmatic `/verify` not atomic | `routes/v1/bootstrap.ts`, `routes/v1/programmatic.ts` |
| H6 | HIGH | `/mcp` proxy endpoint has no authentication | `app.ts` |
| H7 | HIGH | ERC-8004 `type` field value incorrect (spec mismatch) | `services/credentials.ts` |
| M1 | MEDIUM | Handle max length 100 in code vs 32 in spec | `routes/v1/agents.ts`, `routes/v1/programmatic.ts`, `services/agents.ts` |
| M2 | MEDIUM | `TRUST_PROXY=false` default — rate limits bypassable via XFF spoofing | `app.ts` |
| M3 | MEDIUM | No rate limit on `GET /bootstrap/status/:agentId` | `routes/v1/bootstrap.ts` |
| M4 | MEDIUM | `LAUNCH_MODE` bypasses `checkAgentLimit` but not `requirePlan` | `middlewares/feature-gate.ts` |
| M5 | MEDIUM | Admin agent revocation uses separate writes without a transaction | `routes/v1/admin.ts` |
| L1 | LOW | Dead `validateClient` alias in `oauth.ts` | `routes/oauth.ts` |
| L2 | LOW | Session cookie has no `domain` attribute | `routes/auth-oidc.ts` |
| L3 | LOW | Activity log `offset` computed but not passed to `findMany` | `routes/v1/agents.ts` |

---

## Detailed Findings

---

### C1 — CRITICAL: Magic-link tokens stored plaintext in DB

**File:** `artifacts/api-server/src/routes/auth-oidc.ts`

**Description:**
Magic-link tokens are generated with `randomBytes` and inserted into the `magic_links` table without hashing. If the database is compromised (e.g., via a read-only SQL injection in another endpoint, a DB backup leak, or insider access), an attacker can enumerate all unexpired tokens and use them to take over any account that has a pending magic link — no brute-force required.

**Root Cause:**
The token value is inserted directly:
```typescript
await db.insert(magicLinksTable).values({ token: rawToken, email, expiresAt });
```
And looked up by the raw value:
```typescript
WHERE token = providedToken AND usedAt IS NULL AND expiresAt > now
```

**Fix:**
Hash the token with SHA-256 before storing. Only store `hashedToken`. On verification, hash the token from the URL before the DB lookup. The raw token is returned to the user in the email link only — never persisted.

---

### C2 — CRITICAL: OAuth `allowedScopes=[]` passes all requested scopes

**File:** `artifacts/api-server/src/routes/oauth.ts`

**Description:**
The scope filtering logic has a backwards default:

```typescript
const grantedScopes = scopes.filter(s => allowedScopes.includes(s) || allowedScopes.length === 0);
```

When a newly-created (or misconfigured) OAuth client has `allowedScopes = []`, the condition `allowedScopes.length === 0` is `true`, so **every** requested scope is granted — including `admin`, `wallet:write`, `keys:manage`, etc.

This means:
- Any party that can register an OAuth client with no scopes configured can request any scope.
- The scope restriction mechanism is completely bypassed for misconfigured clients.
- All three scope-issuing paths are affected: authorization code approval, token endpoint, and assertion grant.

**Fix:**
Remove the `|| allowedScopes.length === 0` condition. An empty `allowedScopes` array should mean "no scopes allowed", not "all scopes allowed". This is the correct deny-by-default posture for a security boundary.

---

### H1 — HIGH: No rate limit on `POST /auth/magic-link/send`

**File:** `artifacts/api-server/src/routes/auth-oidc.ts`

**Description:**
The `/auth/magic-link/send` endpoint has no rate limiting. Any unauthenticated caller can submit arbitrary email addresses in a tight loop, causing:
1. **Email bombing:** Flooding a victim's inbox with magic-link emails, potentially bypassing spam filters because they come from the legitimate sending domain.
2. **Cost amplification:** Each request triggers a transactional email send (Resend/SendGrid), which has per-message cost.
3. **Token DB pollution:** Each request inserts a row into `magic_links` even if the email doesn't exist in the system.

**Fix:**
Apply `magicLinkRateLimit` (e.g., 5 requests per 15 minutes per IP, plus 3 per hour per email address) using the existing Redis-backed rate-limit infrastructure.

---

### H2 — HIGH: Magic-link token exposed in GET URL query parameter

**File:** `artifacts/api-server/src/routes/auth-oidc.ts`

**Description:**
The magic-link verification endpoint is `GET /auth/magic-link/verify?token=<TOKEN>`. Placing a bearer credential in a GET query parameter has well-known risks:

1. **Server access logs:** Express/nginx/CDN logs record the full URL including query string. The token appears in plaintext in every layer's logs.
2. **Browser history:** The token URL is saved in the user's browser history.
3. **Referrer header leakage:** If the verification page loads any third-party resource (analytics, fonts, etc.), the `Referer` header will contain the full URL including token.
4. **Proxies and load balancers:** Request logs at any intermediate hop capture the URL.

**Fix:**
Exchange the GET endpoint for a POST endpoint that accepts the token in the request body. The email link can land on a static HTML page that immediately extracts the token from the URL fragment (using `#token=…` instead of `?token=…` — fragments are never sent to servers) and submits it via `fetch('POST /auth/magic-link/verify', { body: { token } })`. Alternatively, use a short-lived redirect code that is redeemed server-side.

---

### H3 — HIGH: OAuth allows `plain` PKCE — security downgrade attack

**File:** `artifacts/api-server/src/routes/oauth.ts`

**Description:**
The authorization schema allows `code_challenge_method: "plain"`:
```typescript
code_challenge_method: z.enum(["S256", "plain"]).optional(),
```

With `plain`, the `code_challenge` equals the `code_verifier`. This means:
- An attacker who intercepts the authorization response (which contains `code_challenge` in the `state`/redirect) already has the `code_verifier`.
- PKCE with `plain` provides **no additional security** compared to not using PKCE at all.
- Per RFC 7636 §4.2: "If the client is capable of using `S256`, it MUST use `S256`, as `S256` is Mandatory To Implement (MTI) for the server."

**Fix:**
Remove `"plain"` from the allowed enum. Only accept `"S256"`. Existing clients using `plain` should be migrated; the server should return a 400 for `plain` requests.

---

### H4 — HIGH: Programmatic registration/verify bypass plan limits

**File:** `artifacts/api-server/src/routes/v1/programmatic.ts`

**Description:**
The `POST /api/v1/programmatic/agents/register` and `POST /api/v1/programmatic/agents/verify` endpoints do not enforce plan-based agent count limits. An authenticated user with a free/"none" plan can:

1. Call `/programmatic/agents/register` (no `requirePlan` or `checkAgentLimit` middleware).
2. Call `/programmatic/agents/verify` to activate the agent (sets `status="active"`, no plan check).
3. Repeat — accumulating unlimited active agents without a subscription.

The Sybil quota (`5 per IP per day`) only applies to **unauthenticated** (autonomous) registrations. For authenticated users, only the unverified-agent daily cap (20/IP/day) applies — and that resets every 24 hours, so 20 × 365 = 7,300 active agents per year per IP.

**Fix:**
For authenticated users in `/programmatic/agents/register`, call `checkAgentLimit()` (or equivalent inline check) before creating the agent. In `/programmatic/agents/verify`, re-check the agent count before activating. For unauthenticated autonomous registrations, the existing Sybil quota is sufficient.

---

### H5 — HIGH: Bootstrap `/activate` and programmatic `/verify` not atomic

**Files:** `artifacts/api-server/src/routes/v1/bootstrap.ts` (line 176), `artifacts/api-server/src/routes/v1/programmatic.ts` (line 522)

**Description:**
Both activation flows use `Promise.all([ db.insert(...), db.update(...), ... ])`. If any operation fails mid-flight (e.g., `apiKeysTable` insert succeeds but `agentsTable` update fails due to a constraint), the database is left in a partially-activated state:
- Agent has an API key but status still `pending_verification`
- Or agent is marked `active` / `verified` but no API key exists

This can result in:
- Agent locked out of the system (has key but can't authenticate because status gate blocks it, or vice versa)
- Repeat activation attempts using the same claim token, causing duplicate key inserts

**Fix:**
Wrap the entire activation block in `db.transaction(async (tx) => { ... })`. Drizzle ORM supports `db.transaction()`. This ensures all writes commit atomically or all roll back.

---

### H6 — HIGH: `/mcp` proxy endpoint has no authentication

**File:** `artifacts/api-server/src/app.ts`

**Description:**
The `/mcp` endpoint proxies requests to an internal MCP service (`MCP_SERVER_URL`). It is mounted without any authentication middleware:
```typescript
app.all("/mcp", ...)  // no auth middleware
```

Any unauthenticated request to `POST /mcp` reaches the internal MCP server. Depending on what the MCP server exposes (tool execution, file system access, shell commands), this could represent a critical exposure surface.

**Fix:**
Apply `requireAuth` (or at minimum `tryAuth` + require a valid session/API key) before proxying to the MCP server. The authenticated user/agent identity should be forwarded as a header for the MCP server to use in authorization decisions.

---

### H7 — HIGH: ERC-8004 `type` field value incorrect

**File:** `artifacts/api-server/src/services/credentials.ts`

**Description:**
The ERC-8004 credential object sets `type: "AgentRegistration"`. Per the ERC-8004 draft specification, the `type` field must be the full URI identifying the credential schema:
```
"type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
```
Using a short name like `"AgentRegistration"` means any verifier implementing the spec will reject the credential as malformed, breaking cross-platform agent identity interoperability.

**Fix:**
Use the canonical URI value specified in ERC-8004 §3.1. Similarly audit `DomainVerification` credential type used in `agent-card.ts`.

---

### M1 — MEDIUM: Handle max length 100 vs spec-required 32 characters

**Files:** `routes/v1/agents.ts`, `routes/v1/programmatic.ts`, `services/agents.ts`

**Description:**
Handle validation accepts up to 100 characters (`z.string().max(100)`), but the Agent ID specification states handles must be ≤ 32 characters (matching DNS label conventions and aligning with ENS handle limits). Handles exceeding 32 characters will fail DNS label validation at the `.agentid.io` subdomain level (DNS labels max 63 chars, but handles > 32 chars exceed spec guarantees). Inconsistency could cause silent truncation in DNS provisioning.

**Fix:**
Change all `z.string().max(100)` handle validators to `z.string().max(32)`.

---

### M2 — MEDIUM: `TRUST_PROXY` defaults to `false` — rate limits bypassable

**File:** `artifacts/api-server/src/app.ts`

**Description:**
The server logs a warning if `TRUST_PROXY` is not set, but defaults to `false` (disabled). In all production deployments where the API sits behind a reverse proxy (Replit, Cloudflare, AWS ALB, etc.), `req.ip` will be the proxy's IP rather than the real client IP. This means:

1. All rate limits (auth challenges, bootstrap, registration) share a single bucket for all users — **a single legitimate request exhausts the global IP bucket** or **rate limits are trivially bypassed by any proxy**.
2. IP-based Sybil quotas in programmatic registration are meaningless.

The warning approach is insufficient: production environments WILL have a proxy, and this WILL be misconfigured on first deploy if not enforced.

**Fix:**
In production (`NODE_ENV === "production"`), if `TRUST_PROXY` is not set, hard-fail startup (throw an error) rather than just warn. This forces explicit configuration.

---

### M3 — MEDIUM: No rate limit on `GET /bootstrap/status/:agentId`

**File:** `artifacts/api-server/src/routes/v1/bootstrap.ts`

**Description:**
`GET /bootstrap/status/:agentId` returns the agent's `isClaimed`, `status`, and `verificationStatus` with no authentication and no rate limiting. This allows:
1. **Enumeration:** Checking whether any UUID corresponds to an agent (oracle for agent existence).
2. **Polling abuse:** Tight-loop polling consumes server resources and DB connections.

**Fix:**
Apply `resolutionRateLimit` (already used on similar public-read endpoints) to this route.

---

### M4 — MEDIUM: `LAUNCH_MODE` bypasses `checkAgentLimit` but not `requirePlan`

**File:** `artifacts/api-server/src/middlewares/feature-gate.ts`

**Description:**
`LAUNCH_MODE=true` sets `agentLimit = 999` in `getPlanLimits()`, which `checkAgentLimit()` uses. However, `requirePlan("starter")` — applied before `checkAgentLimit` on `POST /agents` — does NOT check `LAUNCH_MODE`. A user with plan `"none"` is still blocked by `requirePlan("starter")` even when `LAUNCH_MODE=true`.

This means "LAUNCH_MODE" only helps existing paid subscribers exceed their count limits — it does **not** open agent creation to free users as the design intent ("bypasses plan limits") implies.

**Fix:**
In `requirePlan()`, short-circuit when `LAUNCH_MODE` is `true` (same way `getPlanLimits` does):
```typescript
const LAUNCH_MODE = process.env.LAUNCH_MODE === "true";
if (LAUNCH_MODE) { next(); return; }
```

---

### M5 — MEDIUM: Admin agent revocation not wrapped in a transaction

**File:** `artifacts/api-server/src/routes/v1/admin.ts`

**Description:**
The admin agent revocation handler performs multiple separate database writes (update agent status, revoke API keys, log activity, etc.) without a transaction. A failure between writes leaves the agent in an inconsistent state — e.g., API keys revoked but `agent.status` still `"active"`, allowing continued authentication despite an attempted revocation.

**Fix:**
Wrap all revocation-related writes in `db.transaction(async (tx) => { ... })`.

---

### L1 — LOW: Dead `validateClient` alias in `oauth.ts`

**File:** `artifacts/api-server/src/routes/oauth.ts`

**Description:**
A `validateClient` function (or import alias) is defined/imported around line 95 but never called. Dead code in the authorization path creates maintenance confusion about whether client validation is actually happening.

**Fix:**
Remove the unused reference.

---

### L2 — LOW: Session cookie missing `domain` attribute

**File:** `artifacts/api-server/src/routes/auth-oidc.ts`

**Description:**
The session cookie is set without an explicit `domain` attribute:
```typescript
res.cookie(SESSION_COOKIE, sid, { httpOnly: true, secure: true, sameSite: "lax", ... });
```
Without `domain`, browsers default to the exact hostname of the response. On multi-subdomain deployments (`api.getagent.id`, `getagent.id`), the session cookie will not be shared between subdomains as expected.

**Fix:**
Set `domain: process.env.COOKIE_DOMAIN || undefined` and document the `COOKIE_DOMAIN` env var.

---

### L3 — LOW: Activity log `offset` computed but not passed to `findMany`

**File:** `artifacts/api-server/src/routes/v1/agents.ts`

**Description:**
The activity log endpoint parses an `offset` query parameter and computes a value, but the `findMany` call does not include an `offset` clause. Pagination requests always return results from page 1 regardless of the requested offset.

**Fix:**
Pass the computed `offset` to `findMany({ offset })`.

---

## Fix Implementation Order

1. **C1** — Hash magic-link tokens (DB change: add `hashedToken` column, migrate)
2. **C2** — Fix OAuth scope filter (1-line logic change)
3. **H1** — Add magic-link rate limit (rate-limit.ts + auth-oidc.ts)
4. **H2** — POST-based magic-link verification (auth-oidc.ts)
5. **H3** — Remove `plain` PKCE (oauth.ts)
6. **H4** — Add plan check to programmatic route (programmatic.ts)
7. **H5** — Wrap activation in DB transactions (bootstrap.ts, programmatic.ts)
8. **H6** — Add auth to MCP endpoint (app.ts)
9. **H7** — Fix ERC-8004 type field (credentials.ts)
10. **M1** — Clamp handle max to 32 (agents.ts, programmatic.ts)
11. **M2** — Hard-fail on missing TRUST_PROXY in production (app.ts)
12. **M3** — Rate-limit bootstrap status endpoint (bootstrap.ts)
13. **M4** — LAUNCH_MODE short-circuit in requirePlan (feature-gate.ts)
14. **M5** — Transaction for admin revocation (admin.ts)
15. **L1** — Remove dead validateClient (oauth.ts)
16. **L2** — Add domain to session cookie (auth-oidc.ts)
17. **L3** — Fix activity log offset (agents.ts)
