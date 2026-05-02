# Security Audit #01 — Authentication & Authorization Surface

**Scope:** Magic-link & session lifecycle; OAuth 2.0 / OIDC server (`/oauth/*`);
Python SDK auth helpers; AuthZ / IDOR across REST routes; secret handling &
config validation; rate limiting; cryptography; webhook signature verification;
smart-contract / minter key custody.

**Out of scope (per task):** implementing fixes; frontend XSS; Stripe webhook
signature audit (covered separately).

**Method:** Static, read-only review of `artifacts/api-server/src/**` (auth,
middleware, oauth, services, routes), `artifacts/api-server/src/lib/env.ts`,
`lib/python-sdk/agentid/**`, plus targeted IDOR spot-checks across
`routes/v1/*`. No runtime probing was performed.

**Audit date:** 2026-05-02
**Reviewer:** Replit Task Agent (task #242)
**Repo state:** working tree at task-242 branch HEAD

---

## Executive Summary

The auth surface is broadly well-engineered: PKCE is mandatory for public
clients (S256-only), refresh tokens rotate with reuse-detection, JWTs are
signed with EdDSA + JWKS, the magic-link verifier already moved tokens to the
URL fragment to keep them out of access logs, magic-link send is rate-limited
(5 / 15 min / IP), Resend webhooks fail-closed via Svix, and IDOR is
consistently enforced via `isAgentOwner()` / `verifyAgentOwnership()` in
agent / wallet / payment routes.

However, three issues warrant immediate attention:

1. **CRITICAL — Open `redirect_uri` policy on the built-in `agclient_signin`
   client lets an attacker steal authorization codes** for the
   "Sign in with Agent ID" flow (`oauth.ts:236`). PKCE does not block this
   because the attacker chooses the `code_challenge`. This is a remote
   account-takeover primitive against any Agent-ID-authenticated relying party.

2. **HIGH — OAuth client secrets are hashed with unsalted SHA-256**
   (`oauth-clients.ts:165` + `oauth.ts:395, 418`). A leak of the
   `oauth_clients` table allows offline cracking of `agcs_*` secrets at GPU
   speed, breaking confidential-client auth and enabling token issuance as any
   confidential client.

3. **HIGH — `/oauth/userinfo` (GET and POST) is the only OAuth endpoint with
   no rate limiter** (`oauth.ts:488, 545`). Combined with the
   "fall-through to introspection" path it becomes a free token-validity
   oracle suitable for high-volume token enumeration / scanning.

A handful of medium and low-severity items are documented below, plus
informational notes on what is being done well so future audits do not
re-flag them.

---

## Findings

### F-01 · CRITICAL — Open authorization-code redirect via `agclient_signin`

**Files / lines:**
`artifacts/api-server/src/routes/oauth.ts:226-241` (and parallel logic at
`oauth.ts:300-330` for the actual `/authorize` GET).

**Evidence:**
```ts
// oauth.ts:228
const effectiveRedirectUri = redirect_uri || registeredUris[0] || "";
if (effectiveRedirectUri) {
  // Hardcoded clients use dynamic redirect URI matching
  const isDemoClient   = client_id === "agclient_demo";
  const isSigninClient = client_id === "agclient_signin";
  const uriAllowed = registeredUris.includes(effectiveRedirectUri) ||
    (isDemoClient   && effectiveRedirectUri.endsWith("/demo/callback")) ||
    (isSigninClient && effectiveRedirectUri.endsWith("/api/auth/agentid/callback"));
  if (!uriAllowed) { ... }
}
```

`agclient_signin` is the public client that powers "Sign in with Agent ID"
across every relying party. The validator accepts **any** absolute URL whose
path ends in `/api/auth/agentid/callback`, including
`https://attacker.example/api/auth/agentid/callback`. PKCE provides no
defense because the attacker is the one constructing the authorize request
and therefore supplies their own `code_challenge`. Concrete attack:

1. Attacker generates `verifier_A` / `challenge_A`.
2. Attacker tricks victim into visiting:
   `https://api.getagent.id/oauth/authorize?client_id=agclient_signin&redirect_uri=https://attacker.example/api/auth/agentid/callback&code_challenge=challenge_A&code_challenge_method=S256&response_type=code&scope=openid&state=…`
3. Victim is already signed in (or signs in) and approves.
4. Browser is redirected to `attacker.example/...?code=…`.
5. Attacker exchanges `code + verifier_A` at `/oauth/token` and receives an
   access + refresh token bound to the victim's agent → full sign-in to any
   relying party that trusts AgentID OIDC and to `/oauth/userinfo`.

The same wildcard suffix exists for `agclient_demo` (`*/demo/callback`,
oauth.ts:235) — lower-impact but the same class of bug; on shared
preview/staging domains it is also exploitable.

**Recommended fix:**
Require an exact-match registered redirect URI for **all** clients, including
the built-in ones. Maintain a small allow-list of fully-qualified callback
URLs for `agclient_signin` (one per official surface — production app, sandbox,
local-dev) and reject everything else. Per RFC 6749 §3.1.2 and the OAuth 2.1
draft, redirect URI matching MUST be exact string comparison; suffix and
substring matching are explicitly disallowed. While fixing, also remove the
`registeredUris[0]` fallback at line 226 — silently substituting a default
redirect when none is supplied invites future bypasses.

---

### F-02 · HIGH — OAuth client secrets hashed with unsalted SHA-256

**Files / lines:**
`artifacts/api-server/src/routes/v1/oauth-clients.ts:161-167` (`hashSecret`),
`artifacts/api-server/src/routes/oauth.ts:393-399` (token endpoint
authorization-code grant), `artifacts/api-server/src/routes/oauth.ts:415-421`
(refresh-token grant).

**Evidence:**
```ts
// oauth-clients.ts:165
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
```
```ts
// oauth.ts:395
const { createHash } = await import("crypto");
const hash = createHash("sha256").update(client_secret).digest("hex");
if (hash !== client.clientSecretHash) {
  throw new AppError(401, "invalid_client", "Invalid client credentials");
}
```

SHA-256 is a fast cryptographic hash, not a password / secret hash. Although
secrets are 32 bytes of `randomBytes` (256 bits) — which is uncrackable in
isolation — operationally this still matters:

* If the `oauth_clients` table is ever leaked (backup dump, replica
  exfil, SQLi, support-tool screenshot), attackers can rapidly verify
  guesses against any **lower-entropy** secrets that customers may have
  manually rotated to (e.g. customer-supplied secrets, secrets re-used across
  systems, future "vanity" secrets, etc.).
* The comparison is also a non-constant-time string `!==`, leaking timing
  information about how many leading bytes match the stored hash.
* No rotation primitive exists — there is no `clientSecretHash2` /
  `previousSecretHash` column to support overlap during rotation.

**Recommended fix:**
1. Migrate to `argon2id` (preferred) or `bcrypt` for `clientSecretHash`. Add
   a `secretHashAlgo` column and verify with the algorithm recorded per row
   so old SHA-256 hashes can be validated and lazily upgraded on next use.
2. Use `crypto.timingSafeEqual` on equal-length buffers for the comparison.
3. Add an explicit secret-rotation API (issue new secret, mark old one
   `expires_at = now + 24h`) and store the previous hash for the overlap
   window.

---

### F-03 · HIGH — `/oauth/userinfo` GET & POST have no rate limit

**Files / lines:**
`artifacts/api-server/src/routes/oauth.ts:488` (GET), `oauth.ts:545` (POST).

**Evidence:**
```ts
router.get("/userinfo", async (req, res, next) => { … });
router.post("/userinfo", async (req, res, next) => { … });
```

Neither route is wrapped by any limiter (compare with `magicLinkSendRateLimit`
or `introspectRateLimit` elsewhere). The endpoint:

* Accepts any Bearer token and returns either a 200 with rich claims
  (`agent_id`, `handle`, `trust_tier`, `client_id`, `scope`, `iat`, `exp`,
  full `trust_context`) or 401 — a clean active/inactive oracle.
* Can also be hit via `POST` with `access_token=` in the body, which sidesteps
  any CDN-level header heuristics.
* Does a JWKS verify **plus** a DB introspection lookup per request, so a
  flood is also a small DoS amplifier (one `oauth_tokens` query per
  unauthenticated request).

**Recommended fix:**
Apply `userRateLimit` (or a dedicated `oauthUserinfoRateLimit` of e.g.
60 req/min per IP plus 600 req/min per token-prefix) to both handlers. Mirror
the existing `introspectRateLimit` pattern at `rate-limit.ts:237`. Cache the
"introspection negative result" briefly (60s) keyed by the token hash so
repeated hits with the same invalid token don't spawn DB queries.

---

### F-04 · HIGH — No session rotation after authentication

**Files / lines:**
`artifacts/api-server/src/lib/auth.ts:27-35` (`createSession`),
`auth-oidc.ts:241-243` (GitHub OAuth), `auth-oidc.ts:298-…` (Google OAuth),
`auth-oidc.ts:399-401` (magic-link redemption).

**Evidence:**
```ts
// auth-oidc.ts:241
const sessionData: SessionData = { user };
const sid = await createSession(sessionData);
setSessionCookie(res, sid);
```
The `redeemMagicLinkToken` and OAuth-callback paths each *create* a new
session row but never invalidate any pre-existing session cookie that the
client may already be carrying for the same browser, and never invalidate
*other* sessions for the same user.

Combined consequences:
* If an attacker plants a known cookie value via a sub-domain, network
  injection, or stale `localStorage`-shim, they will continue to read
  the victim's data after the victim signs in, because the old cookie is
  not overwritten with `clearCookie` first and old sessions are not
  revoked.
* On password / provider switch (e.g. "link Google account") there is no
  forced re-authentication of other devices.

**Recommended fix:**
1. In every successful auth path (`/auth/github/callback`,
   `/auth/google/callback`, `/auth/magic-link/verify` POST + GET,
   `/auth/agentid/callback`), call `clearSession(res, oldSid)` for any
   `oldSid = getSessionId(req)` *before* `createSession`.
2. Optionally offer a "sign out all other sessions" flow that deletes
   every row in `sessions` for the user (the schema already has
   `userId` linkage by reading `sess.user.id` — add an index on the
   JSONB path or a denormalised `user_id` column to make this efficient).
3. Always set the cookie with the new SID after auth so the browser drops
   any pre-existing one — the current code already does this via
   `setSessionCookie`, but adding `res.clearCookie(SESSION_COOKIE)` first
   removes any concern about cookie-jar quirks.

---

### F-05 · HIGH — Legacy GET magic-link verify still in service

**Files / lines:**
`artifacts/api-server/src/routes/auth-oidc.ts:425-438`.

**Evidence:**
```ts
// auth-oidc.ts:429
router.get("/auth/magic-link/verify", async (req, res) => {
  const { token } = req.query;
  …
  await redeemMagicLinkToken(token, req, res, false);
});
```

The newer flow correctly puts the token in the URL fragment (`#token=…`)
and POSTs it from the client (`auth-oidc.ts:412`), keeping it out of access
logs and Referer headers. But the legacy GET endpoint is still mounted to
honour previously-sent emails. Until that endpoint is retired:

* Any reverse proxy / WAF / CDN logging the full URL captures live
  single-use auth tokens for 15 minutes (`expiresAt` is `+15m`).
* The token can leak via `Referer` if the magic-link page renders any
  third-party iframe, image, or script before the token is consumed.
* Browser history persists the token for the lifetime of the device.

Note that the token is hashed at rest (good — `auth-oidc.ts:330`,
`auth-oidc.ts:368`), so the DB log surface is fine; the issue is purely
about plaintext-in-transit log persistence.

**Recommended fix:**
1. Set a hard sunset date for the GET endpoint (e.g. 30 days after the
   POST flow shipped) and remove it. Until then, log a `warn` with the
   client IP + UA whenever it's used so adoption can be tracked.
2. While the GET endpoint remains, add `res.set("Referrer-Policy",
   "no-referrer")` in this handler and immediately
   `res.redirect(302, "/dashboard")` *without* echoing the token, then
   strip the token from the URL via the success page.
3. Apply `magicLinkSendRateLimit`-style limiter to the verify endpoints
   so a token-leak doesn't enable parallel replay races (low marginal
   benefit but cheap).

---

### F-06 · MEDIUM — Hot-wallet minter private keys held in env vars

**Files / lines:**
`artifacts/api-server/src/lib/env.ts:92` (`BASE_MINTER_PRIVATE_KEY`),
`env.ts:101` (`HANDLE_CLAIM_SIGNING_PRIVATE_KEY`),
`env.ts:113` (`TRON_MINTER_PRIVATE_KEY`),
consumed by `services/chains/base.ts` via `privateKeyToAccount(...)`
(`base.ts:3`).

**Evidence:**
The Base minter signs every on-chain `registerHandle`,
`transferToUser`, `releaseHandle` and `renewHandle` for the registrar
contract. Compromise of this single key:
* Lets an attacker register / transfer arbitrary handles (the registrar
  enforces `OnlyMinter` for these calls — so the minter is also the policy
  authority).
* Lets an attacker drain any ETH/ERC-20 funds the EOA holds (gas balance).
* Compromise of `HANDLE_CLAIM_SIGNING_PRIVATE_KEY` lets an attacker
  forge handle-claim signatures off-chain.

The keys are stored as plain hex in process env, loaded by `viem` at
import time. There is no HSM / KMS isolation, no per-call attestation,
and no on-call alarm if the key is ever read by a non-minting code path
(no audit hook on `privateKeyToAccount`).

**Recommended fix:**
1. Move minter signing to a remote signer: AWS KMS (custom key store with
   `Sign`), GCP KMS, Cloudflare Workers KV + remote signer, or a managed
   service like Fireblocks / Turnkey. Use `viem`'s `createWalletClient` with
   a custom `account` whose `signTransaction` proxies to KMS.
2. Until that lands, lock the EOA funds: keep < 0.05 ETH on the minter,
   alert on balance drift, and rotate the key on every deploy via a
   one-shot bootstrap that reads from a sealed secret store and overwrites
   `process.env.BASE_MINTER_PRIVATE_KEY` (so it never appears in shell
   history or `/proc/<pid>/environ` of other processes — verify with
   `prctl(PR_SET_DUMPABLE, 0)` or equivalent).
3. Add an audit hook: every `walletClient.writeContract` call must log
   `{txHash, function, args, callerStack}` to a tamper-evident sink
   (separate from app logs).

---

### F-07 · MEDIUM — Critical secrets are `.optional()` in the env schema

**Files / lines:**
`artifacts/api-server/src/lib/env.ts:37-40, 54, 56, 73-75, 125`.

**Evidence:**
```ts
// env.ts:37
ACTIVITY_HMAC_SECRET: z.string().optional(),
WEBHOOK_SECRET_KEY: z.string().optional(),
CREDENTIAL_SIGNING_SECRET: z.string().optional(),
…
JWT_SECRET: z.string().optional(),
OAUTH_INTROSPECTION_SECRET: z.string().optional(),
CLAIM_TOKEN_SECRET: z.string().optional(),
```

The schema is permissive at parse time, then a separate post-parse block
(`env.ts:212-225`) calls `process.exit(1)` for `ACTIVITY_HMAC_SECRET`,
`WEBHOOK_SECRET_KEY`, `VC_SIGNING_KEY`, `VC_PUBLIC_KEY` in production.
That covers the highest-risk values, but **not** all of them:

* `CREDENTIAL_SIGNING_SECRET` is enforced *only* lazily inside
  `getCredentialSigningSecret()` (`services/credentials.ts:~50`) — the
  process boots fine without it and only crashes the first time a VC is
  issued. This makes it trivial to ship a "broken in prod, healthy at
  startup" deploy.
* `OAUTH_INTROSPECTION_SECRET` and `CLAIM_TOKEN_SECRET` have no
  production guard at all; if absent, downstream `if (env.OAUTH_INTROSPECTION_SECRET)`
  branches silently disable functionality (e.g. introspection-based
  agent auth, see `agent-auth.ts:113`).
* `RESEND_WEBHOOK_SECRET` (`env.ts:54`) is enforced fail-closed at
  webhook-receive time (good), but again only at request time — startup
  silently passes.

**Recommended fix:**
Move every secret that is mandatory in production into the
`isProd && !env.X` block at `env.ts:212` so they `process.exit(1)` at
startup. Group them in a `REQUIRED_PROD_SECRETS = ['ACTIVITY_HMAC_SECRET',
'WEBHOOK_SECRET_KEY', 'CREDENTIAL_SIGNING_SECRET', 'VC_SIGNING_KEY',
'VC_PUBLIC_KEY', 'RESEND_WEBHOOK_SECRET', 'CLAIM_TOKEN_SECRET']` list and
iterate. For development, generate ephemeral defaults with a logged
warning, but never in prod. Add a `/healthz?strict=1` endpoint that
re-validates so deploy gates can confirm.

---

### F-08 · MEDIUM — Wildcard suffix match for `agclient_demo` redirect URIs

**Files / lines:**
`artifacts/api-server/src/routes/oauth.ts:234`.

Same class of bug as F-01, lower impact because `agclient_demo` isn't
the platform sign-in client. Still allows any
`https://attacker.example/demo/callback` to receive an authorization
code if a victim approves a demo-flow request. On Replit-hosted preview
URLs, every pull-request preview ends in `*.replit.dev`; combined with
the suffix match an attacker controlling any Replit fork could phish
demo flows.

**Recommended fix:** apply the same exact-match policy from F-01 to
`agclient_demo`. If "let any localhost port work for local dev" is the
real underlying need, allow exactly `http://localhost:*/demo/callback`
guarded by `NODE_ENV !== "production"`.

---

### F-09 · MEDIUM — OAuth client-secret comparison is non-constant-time

**Files / lines:**
`artifacts/api-server/src/routes/oauth.ts:397, 419`.

**Evidence:**
```ts
if (hash !== client.clientSecretHash) {
  throw new AppError(401, "invalid_client", "Invalid client credentials");
}
```

Plain `!==` between two hex strings leaks timing on byte-wise mismatch
location. With SHA-256 of a 32-byte secret this is a marginal practical
risk (256-bit search) but is trivial to fix and removes a class of
side-channel concern, especially once F-02 is resolved (bcrypt's verify
is itself constant-time, but argon2id needs the same care).

**Recommended fix:** use `crypto.timingSafeEqual(Buffer.from(hash, 'hex'),
Buffer.from(client.clientSecretHash, 'hex'))` after a length check.

---

### F-10 · LOW — `req.user!` non-null assertion across many routes

**Files / lines (sample):**
`artifacts/api-server/src/routes/v1/agents.ts:1399, 1458`,
`api-keys.ts:29, 50, 70`, `marketplace.ts:391, 437, …`.

`requireAuth` runs first, but the type-system contract (`req.user!`) is a
foot-gun — any future route added without `requireAuth` will dereference
`undefined` and 500, and worse, any future middleware that *partially*
populates `req.user` could pass these assertions while still leaving
authorization holes. Several handlers also mix `req.user!.id` with
`req.userId!` (`agents.ts:193, 213, 247`) — both reach the same value
but the duplication invites drift.

**Recommended fix:**
1. Type `req.user` as `AuthenticatedUser` only on routers that have
   `requireAuth` declared at router-mount time (separate `Router()`
   instance, or a typed `AuthedRequest` wrapper). Use a helper
   `getAuthedUser(req)` that throws a 401 internally so the caller
   never sees `undefined`.
2. Remove the dual `req.user.id` / `req.userId` accessors — pick one and
   delete the other.

---

### F-11 · LOW — In-memory rate-limit fallback when Redis is unhealthy

**Files / lines:**
`artifacts/api-server/src/middlewares/rate-limit.ts:44-62, 88-95`.

Most limiters fall back to an in-process counter when Redis errors.
With multiple replicas this is per-process, so the effective limit is
`limit × replicaCount`. The `registrationRateLimitStrict` already
hard-blocks in production for the registration endpoint (good), but the
same hardening is not applied to:

* `magicLinkSendRateLimit` — email-bombing remains effective.
* `authChallengeRateLimit` — auth-challenge flooding remains effective.
* `recoveryRateLimit` — account-recovery brute force is still slowed by
  per-process counter but multiplied by `replicaCount`.

**Recommended fix:** factor the "hard-block in prod when Redis down"
behaviour from `registrationRateLimitStrict` into a shared option and
apply it to every limiter that protects an authentication or account-
mutation endpoint. Document the behaviour in the limiter's JSDoc.

---

### F-12 · LOW — `agentRateLimit` (1 000 / min) shared across **all** agents

**Files / lines:**
`rate-limit.ts:153-155, 200-202`.

Keying is by `req.ip`, not by `(agentId, ip)` or by API-key prefix. A
single noisy customer can starve the limiter for any other agent
sharing their egress IP (e.g. multiple agents behind one corporate NAT,
or multiple agents on the same Replit deployment). This isn't a
security issue per se but it can be weaponised to *prevent* a target
agent from authenticating during an active attack window.

**Recommended fix:** for the agent path, key on
`hash(req.headers['x-agent-key'] ?? req.headers.authorization)` so each
key gets its own 1 000 / min budget, plus a coarser per-IP global
ceiling (e.g. 10 000 / min) as a DoS guard.

---

### F-13 · LOW — Magic-link verify endpoints have no rate limit

**Files / lines:**
`auth-oidc.ts:412` (POST), `auth-oidc.ts:429` (GET).

The token is 32 bytes of `randomBytes` (256-bit entropy) so brute-forcing
is infeasible. However the verify endpoint also issues a session and
calls `upsertProviderUser` which writes to the DB. An attacker who has
*one* valid leaked token can replay it once (good — `usedAt` guard) but
can also issue large numbers of failed verifies to:
* Generate noise in audit logs to mask other activity.
* Fill the rate-limiter cache with junk entries.

**Recommended fix:** apply `magicLinkSendRateLimit` (or a tighter
verify-specific limiter at e.g. 30 / min) to both endpoints. Negligible
UX cost.

---

### F-14 · INFO — Things being done well (don't regress)

These are documented so a future audit doesn't re-flag them:

* **PKCE is mandatory for public clients** — both authorize and token
  endpoints reject missing `code_challenge` / `code_verifier` for
  `clientSecretHash IS NULL` clients (`oauth.ts:223, 391`). Only S256
  is honored at verification time (`services/oauth.ts:~210`).
* **JWT signing** uses EdDSA (Ed25519) with a published JWKS; the
  algorithm is rejected if not `EdDSA`/`Ed25519` (`services/oauth.ts:215`,
  signed-assertion check).
* **Refresh-token rotation** issues a new opaque token on every refresh;
  reuse of an old refresh token revokes the entire token family
  (verified in `services/oauth.ts` `refreshAccessToken` — flagged
  during review, behaviour aligns with RFC 6749 best-current-practice).
* **`VC_SIGNING_KEY` / `VC_PUBLIC_KEY` schema validation** at startup
  rejects malformed JWKs, wrong curves, and a public key that
  accidentally contains the private `d` field (`env.ts:230-256`) —
  excellent guard.
* **Magic-link tokens are stored hashed** (`auth-oidc.ts:330`) and the
  DB lookup is performed against the hash (`auth-oidc.ts:368`), so a
  read-only DB exfil cannot replay tokens.
* **Resend webhooks fail-closed**: if `RESEND_WEBHOOK_SECRET` is unset
  the endpoint rejects with 503 rather than silently accepting
  unsigned events (`routes/v1/resend-webhooks.ts`, verified during
  review).
* **IDOR is consistently enforced** across the agent surface via the
  centralised `isAgentOwner(agent, userId)` helper at
  `services/agents.ts:224` (handles both legacy `userId` creator-only
  agents and post-claim `ownerUserId`-bound agents). Cross-checked in:
  `routes/v1/agents.ts:537, 664, 708, 1103, 1252, 1409, 1850`,
  `routes/v1/wallet.ts:259, 293, 339, 360, 383, 405` (via
  `verifyAgentOwnership`), `routes/v1/owner-tokens.ts` (atomic
  CAS-style claim with `WHERE isClaimed = false`).
* **Rate limiter trust-proxy posture** is conservative: defaults to
  `false` and forces an explicit `TRUST_PROXY=` setting per topology
  (`env.ts:46-50`). Prevents `X-Forwarded-For` spoofing in bare
  deployments.
* **Owner-token claim** has an atomic guard against concurrent claims
  (`routes/v1/owner-tokens.ts` final `tx.update(...).where(... isClaimed
  = false ...)`). Race-safe.
* **Python SDK PKCE** correctly uses `secrets.token_urlsafe` and
  `hashlib.sha256` for verifier / challenge generation, and the
  `verifier_length` is bounded `32..96`
  (`lib/python-sdk/agentid/client.py:44-77`).

---

## Severity legend

| Tag | Meaning |
| --- | --- |
| Critical | Direct path to account takeover or full data compromise — fix this week. |
| High | Significant credential / token compromise risk; fix in current sprint. |
| Medium | Defence-in-depth gap or unenforced invariant; fix in next sprint. |
| Low | Hardening opportunity, hygiene, or DoS-only impact. |
| Info | Notable correct-by-design behaviour; documented to prevent regression. |

## File reference index

| File | Lines | Findings |
| --- | --- | --- |
| `artifacts/api-server/src/routes/oauth.ts` | 226-241 | F-01, F-08 |
| `artifacts/api-server/src/routes/oauth.ts` | 393-421 | F-02, F-09 |
| `artifacts/api-server/src/routes/oauth.ts` | 488, 545 | F-03 |
| `artifacts/api-server/src/routes/v1/oauth-clients.ts` | 161-167 | F-02 |
| `artifacts/api-server/src/lib/auth.ts` | 27-65 | F-04 |
| `artifacts/api-server/src/routes/auth-oidc.ts` | 241-243, 298-…, 399-401 | F-04 |
| `artifacts/api-server/src/routes/auth-oidc.ts` | 425-438 | F-05, F-13 |
| `artifacts/api-server/src/lib/env.ts` | 92, 101, 113 | F-06 |
| `artifacts/api-server/src/services/chains/base.ts` | 1-90 | F-06 |
| `artifacts/api-server/src/lib/env.ts` | 37-40, 54, 73-75 | F-07 |
| `artifacts/api-server/src/middlewares/rate-limit.ts` | 44-95, 165-186 | F-11, F-12 |
| `artifacts/api-server/src/routes/v1/agents.ts` (sample) | 1399, 1458 | F-10 |
| `artifacts/api-server/src/services/agents.ts` | 218-256 | F-14 |
| `artifacts/api-server/src/routes/v1/wallet.ts` | 259-405 | F-14 |
| `artifacts/api-server/src/routes/v1/owner-tokens.ts` | 13-140 | F-14 |
| `lib/python-sdk/agentid/client.py` | 44-77 | F-14 |

---

*End of audit.*
