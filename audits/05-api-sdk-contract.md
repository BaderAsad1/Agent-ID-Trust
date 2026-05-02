# Audit 05 — API Contract, OpenAPI, and SDK Parity

**Scope.** Public REST surface mounted at `/api/v1`, the OpenAPI spec at
`lib/api-spec/openapi.yaml`, the Python SDK
(`lib/python-sdk/agentid/client.py` sync,
`lib/python-sdk/agentid/async_client.py` async) and the JavaScript SDK
(`lib/sdk/`). The internal frontend client
(`artifacts/agent-id/src/lib/api.ts`) is included as a contract witness,
not as a deliverable.

**Out of scope.** Auth correctness (handled by the security audit) except
where it leaks into SDK ergonomics; DB / performance (handled by the DB
audit).

**Reproducibility.** Every headline metric in this report is produced by
`audits/scripts/05-api-sdk-metrics.sh`. Re-run it after touching any of:
`artifacts/api-server/src/routes/v1/*.ts`, `lib/api-spec/openapi.yaml`,
`lib/python-sdk/agentid/{client,async_client}.py`, `lib/sdk/`. All
counts in §1, §2, §8–§10, §11 below come from that script's output.

---

## 0. TL;DR — top issues

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Critical** | OpenAPI spec covers ~42% of the API. **119** documented paths in `paths:` vs **280** unique `(verb, literal-path)` pairs actually mounted across **54** router files. New surfaces (a2a, mpp, agent-stream, agent-runtime, control-plane, governance, integrations, attestations, agentic-pay, claim-history, owner-tokens, nft, agent-card, oauth-clients, reputation-feedback, humans, transfers, fleet sub-handles) are largely undocumented. |
| 2 | **Critical** | Three error envelope shapes ship in the same product. The spec promises a fourth. SDKs cope only because they fall back through several aliases. (§2) |
| 3 | **Critical** | Python async SDK has **23 class methods** versus **87 sync class methods** (≈26% parity). README correctly only claims OAuth-method parity, but the gap leaves async users without tasks/wallet/billing/marketplace/jobs/orgs/fleet/oauth-clients/api-keys/domains/verification. (§9) |
| 4 | **High** | **577 `throw new AppError(...)` calls** are the canonical path, but **127 direct `res.status(...).json(...)`** sites bypass it. `tasks.ts` uses a third envelope (`{ code, message, errors }` instead of `{ error, message, details, requestId }`). (§2.1) |
| 5 | **High** | No SDK has retry logic. Frontend client retries GET/HEAD twice on 408/429/5xx; SDKs have zero. Timeout defaults disagree: Python 30 s, JS 15 s, frontend 30 s. (§8–§10) |
| 6 | **High** | No deprecation policy, no `Deprecation`/`Sunset` headers, no `/v2` plan. OpenAPI `info.version` is still `0.1.0`. Python SDK ships **two competing version strings** (`pyproject.toml = 0.3.3`, `__init__.py:__version__ = "0.3.0"`). |
| 7 | **Medium** | No ETag / `If-None-Match` on any cacheable endpoint. Public profiles cached at 60 s but cannot be cheaply revalidated. (§11) |
| 8 | **Medium** | Pagination is uniformly `limit`/`offset` but **no documented per-resource max** and no canonical "page" envelope (`{ items, total, limit, offset }` is inconsistent — many list endpoints return the items only, with no `total`). (§4) |
| 9 | **Medium** | Outbound webhook contract (`X-AgentID-Signature: t=...,v1=<hex>`) is implemented but **not in OpenAPI, not in either SDK README**. Partners have to read source to verify signatures. The mail subsystem signs with a competing scheme (`X-Webhook-Signature: sha256=<hex>`). (§12) |
| 10 | **Medium** | Both SDKs hard-code `User-Agent` strings (`agentid-python/0.1.0`, `AgentID-Client/1.0 AgentID-SDK/1.0`) that no longer match the package version they ship under. |

---

## 1. Endpoint inventory

### 1.1 Methodology

Counts produced by `audits/scripts/05-api-sdk-metrics.sh`:

| Metric | Count | Source |
|--------|-------|--------|
| Router files in `routes/v1/` | **54** | `ls artifacts/api-server/src/routes/v1/*.ts \| wc -l` |
| Total `router.<verb>(` calls | **322** | `grep -hcE 'router\.(get\|post\|put\|patch\|delete)\('` |
| Calls with literal path argument | **307** | regex captures `"..."` and `` `...` `` |
| Unique `(verb, literal-path)` pairs | **280** | `sort -u` over the literal calls |
| Paths in OpenAPI `paths:` section | **119** | awk-extracted from `lib/api-spec/openapi.yaml` |
| Tag entries in OpenAPI | **29** | awk-extracted |
| OpenAPI `info.version` | **0.1.0** | unchanged since first commit |

The 322−307 = 15-call delta consists of registrations whose path comes
from a constant (`router.get(BOOTSTRAP_PATH, …)`); they are still real
endpoints but require manual mapping. The 280-unique figure is a
floor — the true number of routes is closer to 295.

The frontend's internal `api.ts` exposes ~150 methods, mostly aligning
with the server, but including several routes that are not in the spec
(transfers, attestations, reputation-feedback, owner-tokens, etc.).

**Coverage rate.** OpenAPI paths / unique server routes = 119 / 280 ≈
**42.5%**. (Even higher if you count documented operations against
documented paths, but the floor of 42.5% is what partners see when they
generate clients from the spec.)

### 1.2 Top-level mount table

Mounted in `artifacts/api-server/src/routes/v1/index.ts`. Route counts
below are spot-counts via
`grep -cE "router\\.(get|post|put|patch|delete)\\(" <file>`; "in spec"
is by manual cross-check against
`/tmp/spec_paths_v2.txt` (paths section only).

| Mount | Router file | Routes | Auth model | In OpenAPI? |
|-------|-------------|--------|------------|-------------|
| `/auth` | `auth.ts`, `agent-auth.ts` | 4 | session / agent key | partial |
| `/users`, `/users/me/*` | `users.ts`, `api-keys.ts`, `identities.ts` | ~15 | session | yes |
| `/agents` | `agents.ts` (24) + 13 sibling routers (verification, domains, spawn, runtime, transfers, registry, payments, attestations, webhooks, wallet, governance, control-plane, oauth-tokens, claim-history, reputation-feedback, stream) | ~150 | session + agent key + scopes | partial — only ~30 documented |
| `/handles` | `handles.ts` | 7 | session | yes |
| `/fleet` | `fleet.ts` (Pro+ gated) | 3 | session | yes |
| `/p` | `public-profiles.ts` | 6 | none | yes |
| `/public/agents` | `agent-identity.ts` | 4 | none | partial |
| `/programmatic` | `programmatic.ts` | 10 | bootstrap key | yes |
| `/tasks` | `tasks.ts` (gated) | 12 | agent key | yes |
| `/dashboard`, `/analytics` | `dashboard.ts` (Pro) | 4 | session | yes |
| `/billing` | `billing.ts` | 14 | session | yes |
| `/webhooks`, `/webhooks/resend/*` | `webhooks.ts`, `resend-webhooks.ts` | 11 | secret/signature | partial |
| `/domains` | `domain-resolve.ts`, `domains.ts` | 5 | session | yes |
| `/marketplace` | `marketplace.ts` | 32 | session + agent key | yes |
| `/payments` | `payments.ts` | 4 | session | yes |
| `/jobs` | `jobs.ts` | 9 | session | yes |
| `/mail` | `mail.ts` | 32 | session + agent key | yes |
| `/integrations` | `integrations.ts` | 12 | session | **no** |
| `/orgs`, `/org` | `organizations.ts`, `org-policies.ts` | 14 | session (Pro) | yes |
| `/pay` | `agentic-pay.ts` | 9 | mixed | **no** |
| `/humans` | `humans.ts` | 4 | session | **no** |
| `/meta` | `meta.ts` | 6 | none | partial |
| `/owner-tokens`, `/agents/.../link-owner` | `owner-tokens.ts` | 3 | mixed | **no** |
| `/clients` | `oauth-clients.ts` | 7 | session | yes |
| `/admin` | `admin.ts` | ~25 | admin only | **no** |
| `/bootstrap` | `bootstrap.ts` | ~10 | bootstrap key | partial |
| `/mpp` | `mpp.ts` | 5 | agent key | **no** |
| `/waitlist` | `waitlist.ts` | 2 | none | **no** |
| `/agent-card` | `agent-card.ts` | 1 | none | **no** |
| `/a2a` | `a2a.ts` | ~25 | agent key | **no** |
| `/resolve`, `/reverse` | `resolve.ts` | 8 | optional | yes |
| (root) NFT, governance | `nft.ts`, `governance.ts` | ~15 | mixed | **no** |

### 1.3 Surfaces with **zero** OpenAPI coverage

The 29 tags in `openapi.yaml` are: `health, auth, users, agents,
programmatic, identity, profiles, well-known, registry, runtime, spawn,
verification, transfers, fleet, mail, tasks, marketplace, payments,
jobs, proposals, reviews, billing, domains, dashboard, organizations,
handles, resolve, webhooks, wallet`. Tags **missing entirely**:

- **A2A registry / execution** (`/a2a/*`, ~958 LoC) — agent-to-agent
  service discovery and synchronous invocation. The frontend uses
  `marketplace.a2aRegistry.*`; **no server spec, no SDK module**.
- **MPP (Machine Payments Protocol)** (`/mpp/*`, 178 LoC) — both SDKs
  ship `MppModule` calling endpoints the spec does not describe.
- **Outbound webhook delivery** — partners receive
  `X-AgentID-Signature: t=...,v1=<hex>`, payload
  `{ event, agentId, data, timestamp }`, retry schedule
  `[1m, 5m, 30m, 2h, 8h]`, max 50 consecutive failures, 10 s
  per-attempt timeout (`services/webhook-delivery.ts:14–98`). None of
  this is documented anywhere outside source.
- **Agent stream** (`/agents/:id/events` SSE), **agent runtime**,
  **agent-card**, **agent-attestations**, **claim-history**,
  **owner-tokens**, **NFT mint flow**, **reputation-feedback**,
  **agent-spawn**, **agent-webhooks**, **integrations**, **humans**,
  **org-policies**, **admin**, **agentic-pay**, **control-plane**.

### 1.4 Spec entries that drift from the implementation

A spot-check of the first 30 documented paths against the server found
**4 verb / path drifts**:

- Spec: `/v1/agents/{agentId}/keys/{keyId}/revoke` POST. Server:
  implemented in `agents.ts` as `DELETE /:agentId/keys/:keyId`. Verb
  and path both differ.
- Spec: `/v1/agents/{agentId}/transfers/{transferId}/list` GET. Server:
  no such route — list lives at `GET /:agentId/transfers`.
- Spec: `/v1/billing/subscriptions`. Server: `GET /billing/subscription`
  (singular) — both frontend and Python SDK call the singular form.
- Spec: `/v1/auth/challenge`. Server: agent challenge actually lives
  under `/v1/auth/agent/challenge` in `agent-auth.ts`.

A full bi-directional diff is out of scope for this audit but a
`spec-vs-routes` script (similar to `audits/scripts/05-api-sdk-metrics.sh`)
should be added — see follow-ups.

---

## 2. Error envelope consistency

### 2.1 The four envelopes that exist today

**Envelope A — `AppError` (canonical, 577 throws across `routes/v1/*.ts`).**
`middlewares/error-handler.ts` emits:
```json
{ "error": "<UPPER_SNAKE_CODE>", "message": "...", "details": {...}, "requestId": "..." }
```
The `error` field is the machine-readable code. There is no separate
`code` field. (Source: `middlewares/error-handler.ts:1–60` —
`AppError` constructor stores `code` in the `code` property but the
serialised key is `error`.)

**Envelope B — Direct `res.status(...).json(...)` with `error`
(127 sites in `routes/v1/`).**
e.g. `public-profiles.ts`, `wallet.ts`:
```json
{ "error": "AGENT_NOT_FOUND", "message": "...", "requestId": "..." }
```
Same shape as A but emitted from the route handler. No `details`.

**Envelope C — `tasks.ts` style (33 sites in `tasks.ts`, plus a
handful in `mpp.ts`).**
```json
{ "code": "VALIDATION_ERROR", "errors": [zodIssue, ...] }
```
Uses `code` instead of `error`, uses `errors` instead of `details`,
omits `requestId`, sometimes omits `message`. This is the **only**
envelope that satisfies the OpenAPI spec.

**Envelope D — what the OpenAPI spec actually documents.**
`lib/api-spec/openapi.yaml` lines 3574–3599 declare two competing
schemas:
```yaml
ApiError:        # used by Unauthorized/Forbidden/NotFound responses
  properties: { error: string, code: string, details: object }
  required: [error, code]
ErrorResponse:   # never $ref'd anywhere
  properties: { error: string, message: string }
  required: [error, message]
```
`ApiError` requires both `error` and `code` fields. The server emits
exactly one of them, never both. Strict validators consuming the spec
would reject every error response the canonical `AppError` path
sends.

### 2.2 How the SDKs cope

Every SDK uses the same defensive parse to mask the inconsistency:

- **Python sync** (`client.py:281`, exact line): reads
  `data.get("code", "UNKNOWN")` — only ever sees a code on
  `tasks.ts`-style errors; for canonical `AppError` responses the
  surfaced code is `"UNKNOWN"` while the actual code lives in the
  `error` field that this parser ignores.
- **Python async** (`async_client.py:159`, exact line): same.
- **JS SDK** (`utils/http.ts:67`, exact line): falls through
  `(parsed.code as string) || (parsed.error as string) || "API_ERROR"`
  — works because it falls back to `error`.
- **Frontend** (`src/lib/api.ts:71`, exact line):
  `body.code || "UNKNOWN"` — so for the dominant `AppError` path the
  surfaced code is `"UNKNOWN"`. UI code that branches on
  `err.code === "AGENT_NOT_VERIFIED"` will never match.

### 2.3 Recommendation

Pick one canonical envelope and migrate. Recommended:
```json
{ "error": "<UPPER_SNAKE_CODE>", "message": "human-readable", "details": {...optional...}, "requestId": "..." }
```
Then:
1. Update OpenAPI `ApiError` to match (`{ error, message, details?, requestId }`, required: `[error, message]`) and delete the unused `ErrorResponse`.
2. Migrate `tasks.ts` and `mpp.ts` to throw `AppError(400, "VALIDATION_ERROR", "Invalid request body", err.issues)` like the rest of the API does. Use `validateBody()` from `middlewares/validation.ts` — it already produces the canonical shape.
3. Fix SDK error parsers to read `error` first, `code` second:
   `data.get("error") or data.get("code") or "UNKNOWN"`. Today they
   read `code` first, which only matches the bypass envelope.
4. Publish a documented enum of error codes (the inventory in §2.4 is a starting point — 95 distinct codes ship today).

### 2.4 Error code inventory (codes used inside `throw new AppError(<status>, "CODE", ...)`)

`ACTIVATION_FAILED`, `AGENT_LIMIT_REACHED`, `AGENT_NOT_FOUND`,
`AGENT_NOT_PUBLIC`, `AGENT_NOT_VERIFIED`, `AGENT_REVOKED`,
`ALREADY_ADDED`, `ALREADY_CLAIMED`, `ALREADY_MINTED`, `ALREADY_REVOKED`,
`ALREADY_TERMINATED`, `ALREADY_VERIFIED`, `APPEAL_PENDING`,
`ATTESTATION_EXISTS`, `AUCTION_ENDED`, `AUDIT_WRITE_FAILED`,
`BAD_CONTENT_TYPE`, `BODY_TOO_LARGE`, `CANNOT_DELETE`,
`CDP_NOT_CONFIGURED`, `CHALLENGE_EXPIRED`, `CHALLENGE_LOCKED`,
`CLAIM_TICKET_REQUIRED`, `CONFLICT`, `CONVERSION_FAILED`,
`DAILY_AGENT_LIMIT_EXCEEDED`, `FORBIDDEN`, `HANDLE_NOT_FOUND`,
`HANDLE_PAYMENT_REQUIRED`, `HANDLE_RESERVED`, `HANDLE_TAKEN`,
`INBOX_NOT_FOUND`, `INVALID_*` (×17), `KEY_NOT_FOUND`,
`MAX_SUBAGENTS_REACHED`, `MILESTONE_NOT_FOUND`, `MINT_PENDING`,
`MISSING_SIGNATURE`, `NO_*` (×6), `NOT_*` (×8),
`ONCHAIN_MINTING_DISABLED`, `ONCHAIN_REQUIRED`, `ORDER_*` (×3),
`OWNER_AUTH_REQUIRED`, `OWNER_TOKEN_USER_MISMATCH`, `PAYLOAD_TOO_LARGE`,
`PAYMENT_FAILED`, `PAYMENT_REQUIRED`, `PLAN_REQUIRED`,
`PROVIDER_TIMEOUT`, `RATE_LIMIT_EXCEEDED`, `REGISTER_FAILED`,
`REVOKE_DENIED`, `ROOT_NOT_FOUND`, `ROOT_NOT_VERIFIED`,
`SANDBOX_ISOLATION`, `SELF_ATTESTATION`, `SERVICE_UNAVAILABLE`,
`SIGNATURE_INVALID`, `SLUG_TAKEN`, `SPENDING_CAP_EXCEEDED`,
`SSRF_BLOCKED`, `SYBIL_LIMIT_EXCEEDED`, `TOKEN_EXPIRED`,
`TOKEN_NOT_FOUND`, `TOO_MANY_ATTACHMENTS`, plus codes thrown only via
the bypass envelopes (e.g. `INTERNAL_ERROR`, `UNKNOWN`,
`VALIDATION_ERROR`, `INVALID_TRANSITION`).

(Inventory script:
`grep -rhoE 'throw new AppError\([0-9]+, *"[A-Z_]+"' artifacts/api-server/src/ | grep -oE '"[A-Z_]+"' | sort -u`.)

---

## 3. Status code correctness

| Code | Distinct usages | Notes |
|------|-----------------|-------|
| 400 | 8 explicit + most `validateBody` failures | Used both for malformed input and for semantic refusals. |
| 401 | 5 explicit (most come from middleware) | Consistent — auth-required endpoints. |
| 403 | 24 | Used for ownership, scope, sandbox isolation, revoked/inactive — semantically correct. |
| 404 | 3 explicit + many `AppError(404, "NOT_FOUND")` | Consistent. |
| 409 | 8 (mostly `INVALID_TRANSITION` in `tasks.ts`) | Correct for state-machine conflicts. |
| 410 | 1 (well-known agent-revoked) | Correct — revoked identities should 410, not 404. Should be applied uniformly to `/p/:handle` and `/resolve/:handle` (currently 404). |
| 422 | 8 (mostly business-validation in `tasks.ts`) | Inconsistent — most validation uses 400. Recommend: 400 = malformed payload (Zod), 422 = semantically invalid (e.g. transition not allowed). |
| 429 | 1 explicit + middleware | Rate-limit middleware uses `draft-7` standard headers (good). |
| 500 | 2 explicit + `errorHandler` fallback | Acceptable — never leaks stack traces. |

**Specific issues:**
- `tasks.ts` mixes 400 and 422 for what looks like the same class of error.
- Revoked agents return 404 from `/resolve/:handle` and `/p/:handle` but 410 from `/.well-known/agentid.json`. Should always be 410 with the revocation envelope.
- 401 vs 403: `requireAgentAuth` correctly returns 401 when the header is missing and 403 when the agent is revoked/suspended.

---

## 4. Pagination, filtering, sorting

### 4.1 Parameter conventions

| Param | Routes using it |
|-------|-----------------|
| `limit` / `offset` | marketplace, jobs, wallet, mail, tasks, public-profiles, payments, mpp, agents, agent-runtime, admin (10+ routers) |
| `cursor` | 3 references — none of them are actually wired through |
| `since` | 5 references in mail (timestamp filter, not paging) |
| `page` | 1 reference (admin) — inconsistent |
| `before` / `after` | mail timestamp filters |

`limit`/`offset` is the de facto standard. **No router enforces a max
limit at the validation layer.** Spot-checks:
- `marketplace.listings`: no upper bound on the request — service
  clamps to 100.
- `mail.getMessages`: clamps to 100 in the service, no client-facing
  doc.
- `tasks`: clamps to 50, undocumented.

### 4.2 Response envelope inconsistency

Three list-response shapes coexist:

| Shape | Example endpoints |
|-------|-------------------|
| `{ items: [...], total }` | marketplace, jobs |
| `{ items: [...], limit, offset }` | wallet/transactions |
| `{ items: [...] }` (no total, no paging echo) | mail/messages, tasks, organizations, fleet |

Total absence is the most common — clients can't render
"showing 1–20 of 87" UI without an extra count call.

### 4.3 Recommendation

- One canonical pagination envelope:
  `{ items: [...], total: number, limit: number, offset: number, hasMore: boolean }`.
- A helper in `lib/` that wraps query parsing (`limit` clamped to a
  documented `MAX_PAGE_SIZE` per resource) and builds the response
  envelope.
- Document the cap per resource in OpenAPI (`maximum: 100` on the
  `limit` parameter).
- Add cursor pagination for high-volume endpoints (mail messages,
  tasks, marketplace listings) where deep `offset` is expensive.

---

## 5. Response shape stability

### 5.1 Date format

Server relies on Drizzle's default JSON serialisation of `Date` columns,
which produces ISO-8601 with `Z`. Where the server constructs dates
manually:
- `webhook-delivery.ts`: `timestamp: new Date().toISOString()` ✅
- `well-known.ts` agent identity doc: `verifiedAt`, `createdAt`,
  `updatedAt` — passed as raw `Date`, JSON-serialised to ISO ✅
- `agents.ts`: `updatedAt: new Date()` set on update ✅

**No issue found.** All dates are ISO-8601 with TZ.

### 5.2 Nullable vs absent

Frequent inconsistency: the spec declares fields as `nullable: true`
but the server omits them entirely when null. Examples in
`well-known.ts`:
- `revocation: agent.status === "revoked" ? {...} : null` — always
  present, null when not revoked. ✅
- `ownerKey: ownerKey ? {...} : null` — always present. ✅

But in `agents.ts` `whoami`, `bundle.handle` is omitted entirely if
the agent has no handle, while the SDK type marks it as
`string | null`. Drift.

Pick one rule (recommend: explicit `null`, never omit) and lint for it.

### 5.3 Fields that come and go

`marketplace.orders` returns `clientSecret` only on the first response
of `POST /orders`; subsequent fetches drop it. Intentional but not
documented in the spec — clients have to remember to capture it.

`agents.create` returns a `bootstrapBundle` field that is undocumented
in the OpenAPI `Agent` schema.

---

## 6. Versioning

| Aspect | Status |
|--------|--------|
| URL prefix strategy | `/api/v1` everywhere ✅ |
| Header-based version negotiation | None |
| `Deprecation` / `Sunset` headers | Not used anywhere in `routes/v1/*.ts` (rg returned zero matches) |
| `/v2` plan | None — no scaffold, no namespacing in services |
| OpenAPI `info.version` | `0.1.0` (since first commit) |
| Breaking-change policy | Undocumented |
| Python SDK versions | `__init__.py:__version__ = "0.3.0"` and `pyproject.toml: version = "0.3.3"` — drift inside the SDK itself. `User-Agent` is hardcoded `agentid-python/0.1.0` and matches **neither**. |
| JS SDK version | `package.json: 1.2.2`. `User-Agent: AgentID-Client/1.0 AgentID-SDK/1.0` — also static. |

**Recommendation.** Before v1.0:
1. Bump OpenAPI to `1.0.0` once §2 (envelope) is fixed.
2. Add a `Deprecation` header helper in `lib/` and start tagging
   spec-drift endpoints (e.g. `/v1/billing/subscriptions` plural alias)
   with `Deprecation: true` + `Sunset: <date>`.
3. Wire SDK `User-Agent` to the package version (Python: read from
   `__version__`; JS: read from `package.json` at build) and
   reconcile the Python SDK's two version strings.
4. Document a SemVer policy for the public API: additive changes are
   minor, breaking changes require `/v2`.

---

## 7. Coverage matrix — endpoint × SDK

Symbols: ✅ supported, ◐ partial, ✗ missing, — N/A. Rows whose status
is uncertain are marked with **(?)** and resolved by checking the
referenced source line.

| Surface | Server | Frontend `api.ts` | Python sync | Python async | JS SDK |
|---------|--------|-------------------|-------------|--------------|--------|
| `auth.me` / session | ✅ | ✅ | ✗ | ✗ | ✗ |
| `whoami` | ✅ | — | ✅ | ✅ | ◐ (via init bootstrap) |
| `register_agent` | ✅ | ◐ (createAgent) | ✅ | ✅ | ✅ (`AgentID.registerAgent`) |
| `verify_agent` (challenge sign) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `resolve` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `discover` | ✅ | ✅ | ✗ | ✗ | ✅ |
| `heartbeat` | ✅ | — | ✅ | ✅ | ✅ |
| `get_trust` | ✅ | — | ✅ | ✅ | ✅ |
| `send_message` (mail) | ✅ | — | ✅ | ✅ | ✅ |
| `mail.threads` / `mail.messages` (full) | ✅ | — | ◐ check_inbox only | ◐ check_inbox only | ✅ |
| `mail.labels` / drafts / bulk / convert-task | ✅ | ✅ (via UI) | ✗ | ✗ | ✗ |
| `mail.webhooks` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `send_task` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tasks.list/ack/complete/fail/start/accept/reject` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `wallet.balance/transactions/spending-rules` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `wallet.provision/custody-transfer` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `billing.checkout/portal/cancel/activate` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `billing.handle-checkout/status` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `apiKeys.create/list/revoke` (user) | ✅ | ✅ | ✅ | **✗** | ✅ |
| `oauthClients.*` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `oauth.authorize` + PKCE token exchange | ✅ | — | ✅ | ✅ | ✗ |
| `organizations.*` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `fleet.list/create/delete sub-handle` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `jobs.*` (list/get/create/proposals) | ✅ | ✅ | ✅ | **✗** | ✅ |
| `domains.*` (provision/status/reprovision) | ✅ | ✅ | ✅ | **✗** | ✅ |
| `verification.initiate/complete` | ✅ | ✅ | ✅ | **✗** | ✅ |
| `marketplace.listings.*` | ✅ | ✅ | ✗ | ✗ | ✅ |
| `marketplace.orders.*` | ✅ | ✅ | ✗ | ✗ | ✅ |
| `marketplace.engagements`, `a2a.services.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `mpp.intent/pay/history` | ✅ | — | ✗ | ✗ | ✅ |
| `transfers.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `agent-attestations.*` | ✅ | — | ✗ | ✗ | ✗ |
| `agent-runtime.bootstrap/config/heartbeat` | ✅ | ◐ | ◐ (via from_env) | ✗ | ◐ (via init) |
| `agent-stream` (SSE) | ✅ | — | ◐ stream_events only | ✗ | ✗ |
| `agent-card` (well-known JSON for an agent) | ✅ | — | ✗ | ✗ | ✗ |
| `nft.mint/transfer/claim` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `claim-history` | ✅ | — | ✗ | ✗ | ◐ (`OrgModule.getClaimHistory`) |
| `owner-tokens.generate` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `agentic-pay.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `governance.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `integrations.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `humans.*` | ✅ | ✅ | ✗ | ✗ | ✗ |
| `reputation-feedback.*` | ✅ | — | ✗ | ✗ | ✗ |
| `admin.*` | ✅ | ✅ | — | — | — (not for SDK consumers) |
| `bootstrap.*` (claim flow) | ✅ | ✅ | ✗ | ✗ | ✗ |
| `waitlist.*` | ✅ | ✅ | — | — | — |
| `agent-spawn.create/list/terminate` | ✅ | — | ✗ | ✗ | ✅ |
| Public profile `GET /p/:handle` | ✅ | ✅ | ✗ | ✗ | ✗ (only via resolve) |
| Well-known `agentid.json`, JWKS, configuration | ✅ | — | ✗ | ✗ | ✗ |

### Coverage rollup

| Stack | Methods exposed | Coverage of unique server routes |
|-------|----------------|----------------------------------|
| Frontend `api.ts` | ~150 | ~54% — covers UI-driven surface |
| Python sync | **87** class methods | ~31% — covers identity/inbox/tasks/billing/jobs |
| **Python async** | **23** class methods | ~8% — *huge* gap |
| JS SDK | **19** modules, ~110 methods | ~39% — broadest SDK |

(Method counts from `audits/scripts/05-api-sdk-metrics.sh`. The
"coverage of unique server routes" column is approximate and treats one
SDK method as covering one route; for SDK methods that internally call
multiple routes the real coverage is slightly higher, but no SDK method
covers more than 2 routes.)

---

## 8. Python SDK — sync

`lib/python-sdk/agentid/client.py`, 2253 LoC, **87** class methods
(plus internal helpers). Class is `AgentID` at line 80.

**Strengths.**
- Clean two-credential model (`api_key` vs `agent_key`) with the
  correct header per type.
- OAuth 2.0 + PKCE (post-#208) is correctly implemented with S256
  challenge derivation (`generate_pkce_pair`) and a one-shot
  `complete_oauth_flow()`.
- Sandbox handling matches server (`agk_sandbox_` prefix or
  `sandbox=True` adds `X-Sandbox: true`).
- `from_env()` + `cold_start()` provide a one-call bootstrap that
  matches the JS SDK developer experience.
- Context-manager support (`__enter__`/`__exit__`).

**Gaps.**
1. **No retry policy.** Single `httpx` call per operation. The server
   has retryable conditions (502/503/504/429); SDK callers will fail
   on transient blips. Frontend has 2 retries with exponential backoff;
   SDKs should match.
2. **Flat error hierarchy.** `AgentIDError` is the only exception
   class. Callers cannot do `except AuthError:` vs `except
   RateLimitError:`. Recommend:
   ```
   AgentIDError
   ├── AuthenticationError    # 401
   ├── PermissionError        # 403 (incl. SANDBOX_ISOLATION)
   ├── NotFoundError          # 404
   ├── GoneError              # 410
   ├── ConflictError          # 409
   ├── RateLimitError         # 429 (carries Retry-After)
   ├── PaymentRequiredError   # 402 (carries MPP requirement)
   ├── ValidationError        # 400/422 (carries issues[])
   └── ServerError            # 5xx
   ```
3. **Loose return types.** Many methods return `Dict[str, Any]` or
   `List[Dict[str, Any]]` instead of pydantic models from `types.py`.
   Inconsistent — `whoami`/`resolve`/`get_trust` return models; `wallet`,
   `billing`, `jobs`, `oauth_clients`, `org`, `fleet`, `domains`,
   `verification` return raw dicts.
4. **`_request` does not parse `details`** for validation errors, so
   even when a 400 carries `issues[]`, callers see an `AgentIDError`
   with no field-level info on the exception. (It's stored in
   `details` but undocumented.)
5. **`User-Agent` is hardcoded `agentid-python/0.1.0`** while the
   package ships as 0.3.x.
6. **Error code parser inverted.** `data.get("code", "UNKNOWN")` —
   should fall back to `data.get("error")` first because that is what
   the canonical `AppError` envelope carries (see §2.2).
7. **OAuth/PKCE post-#208 correctness:** verifier length is validated
   to be `32 ≤ n ≤ 96` bytes (43–128-character verifier; RFC 7636
   compliant). S256 challenge correctly base64-url with trailing `=`
   stripped. Matches server expectations in `routes/v1/oauth-clients.ts`.

## 9. Python SDK — async (post-#215)

`lib/python-sdk/agentid/async_client.py`, 870 LoC, **23** class
methods (19 `async def`, 4 `def` helpers).

**Strengths.**
- Correct context-manager (`__aenter__`/`__aexit__`/`aclose`).
- All public request methods are `async def` and use
  `httpx.AsyncClient` — no hidden blocking I/O on the request path.
- `_oauth_root` is sync (pure URL string) — appropriate.
- OAuth/PKCE parity with sync (`authorize_oauth_client`,
  `complete_oauth_flow`).

**Gaps.**
1. **MAJOR PARITY GAP — 23 of 87 methods (~26%).** README does not
   overstate this — line 212–214 carefully scopes the parity claim to
   OAuth:

   > *"`AsyncAgentID` exposes the same OAuth surface as the sync
   > client. Both `authorize_oauth_client()` and `complete_oauth_flow()`
   > mirror the sync signatures and reuse `generate_pkce_pair()`
   > internally."*

   …and lines 318–339 ("Limitations → Synchronous only") explicitly
   tell async users to use a thread executor or the TypeScript SDK.
   So the spec/SDK contract is **honestly documented** even though the
   parity gap is large. The risk is that users skim past and assume
   the rest of the surface is mirrored.

   Methods missing in async (all present in sync): all of `tasks.*`,
   `wallet.*`, `billing.*`, `marketplace.*`, `jobs.*`, `organizations.*`,
   `fleet.*`, `oauth_clients.*` (admin side), `api_keys.*`, `domains.*`,
   `verification.*`, `from_env`, `cold_start`,
   `start_heartbeat_scheduler`, `call_service`,
   `get_marketplace_context`, `get_next_marketplace_actions`,
   `get_prompt_block`, `get_bootstrap_bundle`, `get_domain*`.

2. **No retry policy** (same as sync — fix in tandem).
3. **Flat error hierarchy** (same as sync).
4. **Class-level `_instance` singleton is not async-safe.** Concurrent
   `AsyncAgentID.init()` calls from different tasks can race.
5. The `_request` helper has correct exception flow:
   `AgentIDError` does **not** inherit from `(ValueError, KeyError)`,
   so the `except (ValueError, KeyError)` clause cannot swallow a
   raised `AgentIDError`. ✅ Verified by reading `client.py:33`
   (`class AgentIDError(Exception)`).
6. **README example** (lines 220–235) shows `async with
   AsyncAgentID.init(...) as client` — but `init()` is *not* a
   coroutine, just a class-method constructor. This works because
   `__aenter__` is what triggers the context, but it reads as if
   `init()` should be awaited — could trip up first-time users.

## 10. JS SDK

`lib/sdk/`, **19** modules under `lib/sdk/src/modules/`, ~110 methods
exported via the `AgentID` instance (`client.ts`).

**Strengths.**
- Full TypeScript types exported for every module's options and
  results. `index.ts` re-exports schema-shaped types.
- Browser + Node compatible — uses global `fetch` and `AbortController`.
- Heartbeat lifecycle (`startHeartbeat` / `stopHeartbeat`),
  `onMessage`, `onTask` long-pollers with `onError` callbacks (post the
  "no silent failures" fix).
- State persistence: `exportState`/`writeStateFile`/`fromState`/
  `readStateFile` — production-grade restore story.
- MPP module for the 402 retry flow.
- Module surface is broad (mail, tasks, trust, marketplace, mpp,
  handles, wallet, billing, apiKeys, oauthClients, organizations, org,
  fleet, jobs, domains, verification, control-plane, auth, resolve).

**Gaps.**
1. **No retry policy.** Same as Python SDKs.
2. **Timeout is 15 s** vs Python's 30 s vs frontend's 30 s — pick one.
3. **Single error class** (`AgentIDError`). Same hierarchy
   recommendation as Python.
4. **Sandbox header is not exposed.** The HTTP client has no
   `sandbox` flag — clients can only enter sandbox by passing an
   `agk_sandbox_*` API key. The server still honours `X-Sandbox: true`
   for non-prefixed keys, but the SDK does not send it. Python parity
   issue.
5. **A2A registry** — JS SDK lacks `a2a.services` operations entirely
   (the frontend wraps them under `marketplace.a2aRegistry`). Should
   be a first-class `AgentID.a2a` module.
6. **Public profile / well-known fetch helpers** missing — partner
   integrations have to hand-roll
   `fetch(\`https://${handle}.getagent.id/.well-known/agent.json\`)`.
7. **No `User-Agent` from package version** — hardcoded
   `AgentID-Client/1.0 AgentID-SDK/1.0` while package ships as 1.2.2.

---

## 11. Public profile, resolve, well-known — cacheability

| Endpoint | Cache-Control | ETag | Last-Modified | Schema match |
|----------|--------------|------|---------------|--------------|
| `GET /api/v1/p/:handle` | `public, max-age=60` (300 for human profiles) | **none** | none | matches OpenAPI `PublicProfile` ✅ |
| `GET /api/v1/p/:handle/credential` | (uses default) | **none** | none | matches `AgentIDCredential` ✅ |
| `GET /api/v1/p/:handle/erc8004` | (uses default) | **none** | none | matches `ERC8004Registration` ✅ |
| `GET /api/v1/resolve/:handle` | `public, max-age=60` | **none** | none | mostly matches `ResolutionResult` ◐ |
| `GET /api/v1/resolve/id/:agentId` | `public, max-age=60` | **none** | none | undocumented |
| `GET /api/v1/resolve/address/:address` | (rate limited) | **none** | none | undocumented |
| `GET /.well-known/agent.json` | `public, max-age=300` | **none** | none | undocumented schema (but matches `WellKnownAgentIdentity`) |
| `GET /.well-known/agentid-configuration` | `public, max-age=3600` | **none** | none | matches `AgentIDConfiguration` ✅ |
| `GET /.well-known/jwks.json` | `public, max-age=3600` | **none** | none | undocumented |

(All `Cache-Control` values verified by the script; see "Cache headers
on public-ish endpoints" output.)

### Issues

- **No ETag anywhere.** Most-cached endpoints (`/p/:handle`,
  `/.well-known/agent.json`) would benefit from ETag because their
  underlying agent rows have a stable `updatedAt` column. Implement
  `ETag: W/"<sha1(handle:updatedAt:status)>"` and honour
  `If-None-Match` → 304.
- **DID format is consistent.** All emit
  `did:web:getagent.id:agents:<uuid>` as the canonical DID and
  `did:agentid:<handle>` as the alias. Matches W3C DID Web spec.
- **ERC-8004 mapping** (`buildErc8004` in `services/credentials.ts`)
  produces `@context`, `id`, `controller`, `verificationMethod`,
  `authentication`, `service`, `metadata` — schema-conformant per the
  draft.
- **Revoked agents:** `well-known.ts` returns 410 Gone with full
  revocation envelope. `/p/:handle` and `/resolve/:handle` still
  return 404 — they should return 410 with the same envelope so DID
  resolvers can correctly mark the identity as revoked instead of
  "transient miss."

---

## 12. Webhook delivery contract

`services/webhook-delivery.ts`. Outbound events to partner-registered
URLs.

| Aspect | Implementation |
|--------|----------------|
| Signature header | `X-AgentID-Signature: t=<unix>,v1=<sha256-hex>` |
| Signed body | `${timestamp}.${rawBody}` |
| Algorithm | HMAC-SHA256 with per-webhook secret (decrypted from DB) |
| Other headers | `X-AgentID-Event`, `X-AgentID-Delivery` (UUID) |
| Payload schema | `{ event, agentId, data, timestamp }` (timestamp ISO-8601) |
| Per-attempt timeout | 10 s |
| Retry schedule | `[1m, 5m, 30m, 2h, 8h]` (5 attempts after initial) |
| Disable threshold | 50 consecutive failures |
| SSRF-safe fetch | yes (`ssrf-guard.ts`) |

(Source for every row: `services/webhook-delivery.ts:14–98` + script
output "Outbound webhook signature scheme".)

### Issues

- **Not in OpenAPI.** Partners cannot generate webhook handlers from
  the spec. Add `components.webhooks` (OpenAPI 3.1 supports this) or
  a `lib/api-spec/webhooks.yaml` doc.
- **Not in either SDK README.** No verification helper is provided.
  Add:
  - `from agentid.webhooks import verify_signature(body, header, secret, tolerance_seconds=300)`
  - `import { verifyWebhookSignature } from '@getagentid/sdk/webhooks'`
- **Mail sub-system** signs with a *different* scheme:
  `X-Webhook-Signature: sha256=<hex>` + `X-Webhook-Timestamp` (see
  `services/mail.ts:1728`). Two webhook signing schemes ship in the
  same product. Pick one (the `t=,v1=` form is Stripe-shaped and more
  robust against replay).

---

## 13. Other findings

- **`userAgent` middleware** (`agent-ua.ts`) attaches
  `req.agentUserAgent`. SDKs do not advertise themselves in a way the
  server can rate-limit per-SDK-version (because the `User-Agent`
  strings are static — see §6).
- **Frontend client (`api.ts:1`)** constructs `BASE` from
  `import.meta.env.BASE_URL` then adds `api/v1`. The `replace(/\/\//g, '/')`
  is a workaround for the path becoming `//api/v1`. Fix the join
  properly.
- **Frontend retries** are only on `GET`/`HEAD` for 408/429/502/503/504
  (delays 500 ms, 1500 ms). Reasonable. SDKs should match.
- **CSRF** — frontend reads `csrf` cookie and sends `X-CSRF-Token`.
  Server enforces. SDKs do not need to handle this (they use API keys,
  not session cookies). ✅
- **JS SDK persistence test** (`persistence.test.ts`) is the only test
  in the SDK. No tests for: HTTP error parsing, retry/timeout, OAuth
  flow, sandbox flag.
- **Python SDK has no tests at all** (`lib/python-sdk/tests/` does not
  exist).

---

## 14. Recommended follow-up tasks (high level)

1. **Pick one error envelope** and migrate `tasks.ts`/`mpp.ts` to it; update the OpenAPI `ApiError` schema; update SDK parsers to read `error` first.
2. **Async Python parity** — port the missing 64 methods from `client.py` to `async_client.py`. Mechanical: same routes, same params, swap `httpx.Client` for `httpx.AsyncClient`. README needs an explicit method-parity matrix once done.
3. **OpenAPI coverage** — write a `pnpm --filter api-server run spec:check` script that walks `routes/v1/*.ts`, extracts `(method, path)` pairs, and diffs against the spec. Fail CI on drift. (Use `audits/scripts/05-api-sdk-metrics.sh` as a starting point.)
4. **Document webhook contract** in OpenAPI 3.1 `components.webhooks` and add `verifyWebhookSignature` helpers in both SDKs. Unify the mail webhook signing scheme onto the `t=,v1=` form.
5. **Standardise pagination** — single helper for query parsing with documented `MAX_PAGE_SIZE` per resource; single response envelope.
6. **Add ETag** to `/p/:handle`, `/p/:handle/credential`, `/p/:handle/erc8004`, `/.well-known/agent.json`. Stale-while-revalidate on the resolver caches the DB.
7. **Define error class hierarchy** in both SDKs; map status codes to typed errors so callers can branch.
8. **Wire SDK `User-Agent` to package version** — Python reads `__version__`; JS reads `package.json`. Fix the Python-internal `pyproject.toml` (0.3.3) vs `__init__.py` (0.3.0) drift in the same change.
9. **Add SDK retry policy** — 2 retries on idempotent verbs for 408/429/502/503/504, exponential backoff with jitter. Honour `Retry-After` on 429.
10. **Return 410 (not 404) from `/p/:handle` and `/resolve/:handle`** when the agent is revoked, with the revocation envelope already used in `well-known.ts`.

---

## Appendix — running the metrics

```bash
bash audits/scripts/05-api-sdk-metrics.sh
```

The script is intentionally simple — just `grep`/`awk`/`wc` — so it
can be invoked from any environment without dependencies. Re-run it
after touching:

- `artifacts/api-server/src/routes/v1/*.ts`
- `lib/api-spec/openapi.yaml`
- `lib/python-sdk/agentid/{client,async_client}.py` and
  `lib/python-sdk/{pyproject.toml,agentid/__init__.py}`
- `lib/sdk/src/**` and `lib/sdk/package.json`

If any number in this report changes by more than ~5%, update the
report from the script's output rather than re-counting by hand.
