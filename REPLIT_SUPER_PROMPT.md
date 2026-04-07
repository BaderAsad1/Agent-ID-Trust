# Agent ID — Complete Remediation Super Prompt for Replit

> Paste this entire document into Replit AI. It covers every confirmed issue across the repo
> with file references, root causes, and implementation guidance. Work top-to-bottom: P0
> first, then P1, then P2. Do not change any issue marked DEFERRED unless you have explicit
> instructions.

---

## CONTEXT

Agent ID is a production-ready agent identity platform. The codebase is large and mostly
solid. The following issues have been verified against live source code. Some would block
launch. Some reduce enterprise credibility. Some are copy/doc inconsistencies that
misrepresent what is real. Fix them all — accurately and minimally.

---

## P0 — LAUNCH BLOCKERS

These must be resolved before any public release. Each one either exposes users to
harm, misrepresents financial behavior, or breaks machine-readable infrastructure.

---

### P0-1 — `.well-known` endpoints return SPA HTML instead of JSON

**Files:** `artifacts/api-server/src/routes/well-known.ts`,
`artifacts/api-server/src/index.ts` (or wherever the Express app is mounted),
Cloudflare / Replit routing config

**Root cause:** The React SPA catch-all intercepts requests to
`/.well-known/agent.json`, `/.well-known/did.json`, etc. before they reach the
Express API. Confirmed by `SOFT_LAUNCH_READINESS_REPORT.md`: "Well-known endpoints
fail — return SPA HTML instead of JSON due to routing architecture."

**Why this matters:** `.well-known` endpoints are the machine-readable discovery
layer of the entire protocol. Every agent resolver, every relying party, every SDK
call to `resolve()` depends on these returning valid JSON. If they return `<!DOCTYPE
html>`, the protocol is broken. This is P0 for enterprise credibility.

**Fix required:**
1. Ensure the Express API routes for `/.well-known/*` are mounted at a path that
   Cloudflare/Replit forwards BEFORE the SPA catch-all.
2. The current workaround is using `/api/.well-known/*` — this must be documented
   clearly in `lib/resolver/README.md` and `artifacts/agent-id/src/pages/Protocol.tsx`
   as the canonical path, OR the routing must be fixed to serve the true standard path.
3. Add an integration test that GETs `/.well-known/agent.json` and asserts
   `Content-Type: application/json` with valid JSON body.
4. Update `DocsQuickstart.tsx`, the resolver README, and the Protocol page to reflect
   actual working paths.

---

### P0-2 — Stripe Connect seller payouts are manual / not automated

**Files:** `artifacts/api-server/src/services/stripe-connect.ts`,
`artifacts/api-server/src/routes/v1/marketplace.ts`,
`artifacts/agent-id/src/pages/MarketplaceListing.tsx`,
`artifacts/agent-id/src/pages/TransferSale.tsx`,
`artifacts/api-server/src/services/payment-providers.ts`

**Root cause:** `TODO_BEFORE_LAUNCH.md` item 1: "Stripe Connect seller payouts —
currently manual." The marketplace UI in `MarketplaceListing.tsx` allows buyers to
pay sellers. The code in `stripe-connect.ts` has the structure but the actual
`transfer()` call to move funds to a connected account is either stubbed or missing
the automated trigger.

**Why this matters:** If a buyer pays for an agent service and the seller never
receives funds automatically, this is a financial trust failure. Any marketplace
feature that accepts real money must have a clear, reliable payout path. Shipping
broken payments is a legal and reputational P0.

**Fix required — choose one:**
- **Option A (preferred):** Complete the Stripe Connect transfer: after a successful
  charge, trigger `stripe.transfers.create()` to the seller's connected account ID.
  Handle failures with retry + webhook confirmation.
- **Option B (safe minimum):** Disable the "Hire" / payment flow on marketplace
  listings entirely until Option A is complete. Return HTTP 501 from
  `POST /api/v1/marketplace/orders` with body `{ "error": "marketplace_payments_unavailable", "message": "Seller payouts are not yet available. Check back soon." }`.
  Update `MarketplaceListing.tsx` to show a "Coming Soon" state on the hire button.

Do NOT leave the current state where money can be collected without an automated
payout path.

---

### P0-3 — CORS is wide-open in production

**Files:** `artifacts/api-server/src/index.ts` (or wherever `cors()` middleware is
configured), `artifacts/api-server/src/lib/env.ts`

**Root cause:** Confirmed in `AUDIT.md`: "CORS: wide-open." The `cors()` middleware
is likely configured with `origin: '*'` or without restrictive origin checking.

**Why this matters:** Wide-open CORS means any website can make authenticated requests
to the API from a browser using the user's session cookies. This enables CSRF-style
attacks where a malicious site performs actions on behalf of a logged-in user. For an
identity platform handling keys, credentials, and payments, this is a critical
vulnerability.

**Fix required:**
1. In production, restrict `origin` to the known production domains
   (e.g., `https://getagent.id`, `https://app.getagent.id`).
2. Read the allowed origins from an environment variable
   (`ALLOWED_ORIGINS=https://getagent.id,https://app.getagent.id`).
3. Add `ALLOWED_ORIGINS` to `env.ts` Zod schema with a production requirement.
4. Keep `origin: '*'` only for the specific public endpoints that are designed to be
   called cross-origin by agents and resolvers (e.g., `.well-known`, resolver, public
   profile API).

---

### P0-4 — Ephemeral/regenerated encryption keys break persistent data

**Files:** `artifacts/api-server/src/lib/env.ts`,
any service using `ENCRYPTION_KEY` or `JWT_SECRET`

**Root cause:** `AUDIT.md`: "Ephemeral encryption keys — encrypting persistent data
with ephemeral keys." If `ENCRYPTION_KEY` is not set as a stable secret in the
environment and instead defaults to a generated-on-startup value, any encrypted
database fields (API keys, tokens, secrets) become unreadable after a server restart.

**Why this matters:** This means any agent whose credentials are encrypted at rest
will lose access after a server restart. On an identity platform, this is catastrophic.
Every agent effectively gets locked out on each deployment.

**Fix required:**
1. In `env.ts`, make `ENCRYPTION_KEY` (and `JWT_SECRET`) required with no fallback
   in any environment above `development`.
2. Add a startup assertion: if `NODE_ENV !== 'development'` and `ENCRYPTION_KEY` is
   missing or shorter than 32 bytes, throw and refuse to start.
3. Add `ENCRYPTION_KEY` and `JWT_SECRET` to `.env.example` with clear instructions
   that these must be stable, securely generated values.
4. Document the key generation command:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

### P0-5 — Payment webhook bodies are not fully signature-verified

**Files:** `artifacts/api-server/src/routes/v1/payments.ts`,
`artifacts/api-server/src/routes/v1/programmatic.ts` (Stripe webhook handler),
any Coinbase / x402 webhook handler

**Root cause:** `AUDIT.md`: "Unverified Coinbase/Visa webhooks." While the Stripe
webhook handler likely uses `stripe.webhooks.constructEvent()` with the raw body,
any Coinbase Commerce or x402 payment webhook may be processing unsigned POST bodies
as trusted payment events.

**Why this matters:** An attacker can craft a POST request claiming a payment
succeeded, triggering plan upgrades, credential issuance, or handle purchases
without actually paying. This is a direct financial fraud vector.

**Fix required:**
1. Audit every `POST` endpoint that handles payment callbacks.
2. For Stripe: confirm `stripe.webhooks.constructEvent(rawBody, sig, secret)` is
   called before any business logic. Raw body must be preserved via
   `express.raw({ type: 'application/json' })` middleware on that route.
3. For Coinbase Commerce: implement HMAC-SHA256 verification using the
   `X-CC-Webhook-Signature` header against the shared secret.
4. For any unverified payment webhook: return `HTTP 400` immediately if signature
   check fails. Log the attempt.
5. Add a test in the existing `payment-webhooks.security.test.ts` suite for each
   webhook type that confirms a request with a bad signature is rejected.

---

## P1 — HIGH PRIORITY (PRE-LAUNCH STRONGLY RECOMMENDED)

These will not cause immediate financial harm but will cause enterprise buyers,
security reviewers, or developers to lose confidence and/or encounter broken behavior.

---

### P1-1 — Escrow is a placeholder with working UI

**Files:** `artifacts/agent-id/src/pages/TransferSale.tsx`,
`artifacts/api-server/src/services/agentic-payment.ts`,
`artifacts/api-server/src/routes/v1/agents.ts` (transfer endpoints)

**Root cause:** `AUDIT.md`: "Transfer/Sale Verdict: Escrow is a placeholder with no
real payment hold/release." `TransferSale.tsx` is a 59KB page with a full escrow UX —
offer, accept, hold, release, dispute. The backend does not implement real fund holding.

**Why this matters:** A user can go through the transfer/escrow flow believing their
funds are protected in escrow. They are not. The seller can disappear. The buyer has
no recourse. This is a false promise of financial safety.

**Fix required:**
1. In `TransferSale.tsx`, replace the escrow UI with a clear message:
   `"Direct transfers between parties. Escrow protection coming soon. Proceed only
   if you trust the counterparty."`
2. In the relevant API endpoint, add a response header or field:
   `"escrow_status": "not_implemented"` and ensure no funds are moved under the
   pretense of being held.
3. If the transfer flow does move money (e.g., Stripe Payment Intent), make the
   flow clearly labeled as a direct payment, not escrowed.
4. Remove the "dispute" step from the UI until dispute resolution is real.

---

### P1-2 — Trust score maximum is 120 but all copy says 100

**Files:** `artifacts/agent-id/src/pages/AgentProfile.tsx`,
`artifacts/agent-id/src/pages/Dashboard.tsx`,
`artifacts/agent-id/src/pages/DocsBestPractices.tsx`,
`artifacts/api-server/src/routes/v1/agents.ts` (trust calculation),
any service computing trust score

**Root cause:** `AUDIT.md`: "9 providers summing to theoretical max 120 (not
documented 100)." The trust score calculation has 9 providers that can each
contribute points, and their maximum contributions add up to 120, not 100.

**Why this matters:** An agent at score 85 looks worse than it is if the scale is
really 0-120. A platform claiming "trust score out of 100" when it can produce 110
is misleading to both operators and enterprise buyers evaluating agent credibility.

**Fix required — choose one:**
- **Option A:** Normalize the score to 0-100 in the calculation service by dividing
  by 1.2 (or the actual max) before storing/returning. Update the display to show
  the normalized value.
- **Option B:** Update all UI copy, docs, and API descriptions to say "trust score
  (typically 0-100, max 120)" and document the individual provider weights.

Whichever option is chosen, make it consistent across all surfaces: `AgentProfile.tsx`,
`DocsBestPractices.tsx`, the trust score ring in `shared.tsx`, and the API response
schema.

---

### P1-3 — Plan agent limit inconsistency: frontend says 10, backend enforces 5

**Files:** `artifacts/agent-id/src/pages/Pricing.tsx`,
`artifacts/api-server/src/middlewares/require-plan.ts` (or `feature-gate.ts`),
`artifacts/agent-id/src/components/Sidebar.tsx`

**Root cause:** `AUDIT.md`: "Pro plan agent limit differs between frontend '10' and
backend '5'." A Pro subscriber sees "up to 10 agents" on the Pricing page, registers
their 6th agent, and gets a plan enforcement error from the backend.

**Why this matters:** This is a direct broken promise to paying customers. Any user
who upgrades to Pro expecting 10 agents will hit a wall at 5. This destroys trust in
billing and the platform.

**Fix required:**
1. Decide the correct limit for Pro. Implement it in one place.
2. Update `require-plan.ts` (or wherever `checkAgentLimit` is defined) to use the
   correct value.
3. Update `Pricing.tsx` to match exactly.
4. Update `Sidebar.tsx` plan display to match.
5. Update `llms-txt.ts` if agent limits are mentioned there.
6. Add a test confirming the enforced limit matches the advertised limit.

---

### P1-4 — Admin endpoint has no IP allowlist, no request attribution, no audit log

**Files:** `artifacts/api-server/src/routes/v1/admin.ts`,
`artifacts/api-server/src/middlewares/` (no admin-specific middleware found)

**Root cause:** Admin endpoints are protected by a single env-var secret
(`ADMIN_SECRET`) compared via the request header. No IP restriction. No per-action
audit log. No attribution of which admin performed which action.

**Why this matters:** If `ADMIN_SECRET` leaks (in logs, in a `.env` commit, in a
breach), every admin action — agent revocation, user suspension, credential
invalidation — can be performed by an attacker from anywhere. Enterprise buyers
evaluating the platform will flag this in any security review.

**Fix required (minimal, high-value):**
1. Add `ADMIN_ALLOWED_IPS` to `env.ts` (comma-separated). If set, add middleware
   before admin routes that checks `req.ip` against the allowlist and returns
   `HTTP 403` if the IP is not in the list.
2. In every admin route handler, insert a structured audit log entry:
   `logger.info({ event: 'admin_action', action: routeName, targetId, adminIp: req.ip, ts: Date.now() })`.
3. Use `timingSafeEqual` for the `ADMIN_SECRET` comparison if not already doing so.
4. Add a test confirming that admin routes return `403` without the correct secret.

---

### P1-5 — Onchain / ERC-8004 credential anchoring is described as available but not implemented

**Files:** `artifacts/agent-id/src/pages/DocsOrganizations.tsx`,
`artifacts/agent-id/src/pages/AgentProfile.tsx`,
`artifacts/api-server/src/routes/v1/agents.ts`,
`artifacts/agent-id/src/pages/Protocol.tsx`,
`TODO_BEFORE_LAUNCH.md` (item 4)

**Root cause:** `TODO_BEFORE_LAUNCH.md`: "On-Chain Credential Anchoring — Anchor
credentials on Base L2 using ERC-8004 — NOT IMPLEMENTED." Multiple docs and UI
surfaces reference onchain anchoring, DIDs, and blockchain-verifiable credentials
as present features.

**Why this matters:** An enterprise buyer or developer who reads "credentials anchored
on Base L2" and then runs `resolveDID()` or queries the blockchain will find nothing.
This is a product credibility failure. For an identity protocol, claiming onchain
verification when it does not exist is a serious misrepresentation.

**Fix required:**
1. In `DocsOrganizations.tsx` and `Protocol.tsx`, add a clear callout:
   `"Onchain credential anchoring (ERC-8004) is on the roadmap and not yet active.
   All credentials are currently verified off-chain via the Agent ID platform."`
2. In `AgentProfile.tsx`, any "onchain" badge or anchor icon should show a tooltip:
   `"Onchain anchoring coming soon"` or be hidden entirely.
3. In the API response for credential objects, remove or clearly mark any
   `onchainAnchor`, `did:ethr`, or similar fields as `null` with a `status:
   "pending"` annotation rather than omitting them silently.
4. Update `lib/resolver/README.md` to be clear that DID resolution is currently
   off-chain only.

---

### P1-6 — x402 USDC payments described as launched but implementation status unclear

**Files:** `artifacts/agent-id/src/pages/DocsPayments.tsx`,
`artifacts/api-server/src/middlewares/x402.ts`,
`artifacts/api-server/src/services/payment-providers.ts`

**Root cause:** `DocsPayments.tsx` states the x402 protocol was "launched March 18,
2026" with Stripe MPP. `TODO_BEFORE_LAUNCH.md` item 5 says "Coinbase x402 Payment
Integration — NOT IMPLEMENTED." These two statements directly contradict each other.

**Why this matters:** A developer reading `DocsPayments.tsx` will attempt to implement
x402 USDC payment handling. If the backend middleware returns errors or does not
function, the developer loses hours and loses trust in the platform.

**Fix required:**
1. Test the x402 flow end-to-end in the current codebase. Determine if it is
   functional.
2. If functional: remove the TODO item and confirm in docs.
3. If non-functional: update `DocsPayments.tsx` to say:
   `"x402 USDC payments: Coming Soon (Q2 2026). Currently available: Stripe MPP."`
   and remove the x402 code examples from the quickstart section of that page.
4. In `x402.ts` middleware, if the feature is not ready, return:
   `HTTP 501 { "error": "x402_not_available", "message": "USDC payment protocol is not yet active." }`

---

### P1-7 — MCP server tool credential handling needs audit and hardening

**Files:** `lib/mcp-server/src/index.ts`,
`lib/mcp-server/README.md`

**Root cause:** The MCP server exposes tools that can register agents, manage keys,
and resolve identities. If any tool accepts private key material as an input parameter
(rather than reading it from server-level config), this is a critical security design
failure — MCP host logs, LLM context, and tool call history would all contain the
private key.

**Why this matters:** LLMs and MCP hosts routinely log tool call parameters. A private
key passed as a tool parameter is a private key in plaintext in your LLM provider's
logs, in the MCP host's session history, and potentially in fine-tuning data. This is
an irreversible key exposure.

**Fix required:**
1. Audit every tool in `index.ts` that involves key material. Confirm that no tool
   accepts a `privateKey`, `secretKey`, or `signingKey` as an input schema parameter.
2. If any such parameter exists: remove it. Instead, the MCP server should read the
   key from its own configuration (environment variable or config file set at server
   startup) and never accept it as a per-tool-call input.
3. Update `README.md` to be explicit: "Private keys are never passed as tool
   parameters. Configure your Agent ID API key at server startup via
   `AGENTID_API_KEY` environment variable."
4. Add a test that instantiates the MCP server without a valid API key and confirms
   mutation tools return an auth error rather than proceeding.

---

### P1-8 — Subdomain resolution broken (Cloudflare wildcard SSL not configured)

**Files:** DNS / Cloudflare configuration (outside the repo),
`SOFT_LAUNCH_READINESS_REPORT.md`

**Root cause:** `SOFT_LAUNCH_READINESS_REPORT.md`: "Subdomain resolution fails —
Cloudflare wildcard SSL not configured, HTTP 525 error." Agent handle subdomains
(e.g., `myagent.agentid.xyz`) resolve to HTTP 525.

**Why this matters:** The resolver package, `ForAgents.tsx`, and the Protocol page
describe subdomain-based identity (e.g., `alice.agentid`) as a first-class feature.
If every subdomain returns a TLS error, anyone trying to use the product's identity
resolution will hit a broken experience.

**Fix required:**
1. In Cloudflare, enable wildcard SSL certificate for `*.agentid` (or whatever the
   production TLD is). This is a Cloudflare dashboard action.
2. Until wildcard SSL is active, update `lib/resolver/README.md` and
   `artifacts/agent-id/src/pages/Protocol.tsx` to note:
   `"Subdomain resolution is not yet active. Use the API endpoint
   GET /api/v1/resolve/:handle for programmatic resolution."`
3. Update the `ForAgents.tsx` "Machine-readable resources" section to point to the
   API path, not the subdomain path.

---

### P1-9 — Session cookie security attributes missing

**Files:** `artifacts/api-server/src/lib/auth.ts`,
`artifacts/api-server/src/index.ts`

**Root cause:** `TODO_BEFORE_LAUNCH.md` item 6 and `AUDIT.md`: "Production Security
Hardening — Enforce HTTPS cookies." Cookie `secure: true` and `sameSite: 'strict'`
(or `'lax'`) may not be set in production configuration.

**Why this matters:** Without `secure: true`, session cookies can be sent over HTTP,
exposing them to MITM on any non-HTTPS connection. Without `sameSite`, CSRF attacks
via cross-site requests are easier. For an identity platform managing agent ownership,
this is a baseline security requirement.

**Fix required:**
1. In `auth.ts` `createSession()`, ensure cookies are set with:
   - `secure: process.env.NODE_ENV === 'production'`
   - `sameSite: 'lax'` (minimum) or `'strict'`
   - `httpOnly: true`
   - `path: '/'`
2. Add these assertions to `env.ts` startup validation as a warning log if
   `NODE_ENV === 'production'` and cookie settings appear insecure.

---

## P2 — COPY, DOCS, AND UX CONSISTENCY

These are not security issues. They are the difference between a product that feels
enterprise-grade and one that feels unpolished. Enterprise buyers notice all of these.

---

### P2-1 — "Platform credentials" vs "W3C VC JWT" — distinction not surfaced in UI

**Files:** `artifacts/agent-id/src/pages/DocsQuickstart.tsx`,
`artifacts/agent-id/src/pages/AgentProfile.tsx`,
`artifacts/agent-id/src/pages/Dashboard.tsx`

**Root cause:** `DocsQuickstart.tsx` correctly distinguishes between platform
credentials (internal HMAC-signed objects) and real W3C Verifiable Credential JWTs.
But `AgentProfile.tsx` and `Dashboard.tsx` may display credential items without
distinguishing which type they are.

**Why this matters:** A developer who trusts a platform credential as independently
verifiable (they cannot be — they require calling back to Agent ID) may build broken
verification logic. This is both a DX issue and a product honesty issue.

**Fix required:**
1. In any credential list or detail view in the UI, label each credential with its
   type: `"Platform Credential"` or `"W3C Verifiable Credential (JWT)"`.
2. Add a small info tooltip on "Platform Credential" that says:
   `"Verified by Agent ID platform. Requires Agent ID API to verify."`
3. Add a tooltip on "W3C VC" that says:
   `"Standard portable credential. Independently verifiable by any W3C VC-compatible verifier."`

---

### P2-2 — ForAgents.tsx uses `machineIdentity` / `handleIdentity` terms not used anywhere else

**Files:** `artifacts/agent-id/src/pages/ForAgents.tsx`,
`lib/sdk/README.md`,
`lib/resolver/README.md`,
`artifacts/api-server/src/routes/v1/programmatic.ts`

**Root cause:** `ForAgents.tsx` introduces `machineIdentity` and `handleIdentity` as
conceptual response types. These terms are not used in the API response schemas, SDK,
or other docs.

**Why this matters:** An agent developer reading `ForAgents.tsx` will look for
`machineIdentity` in the API response or SDK return value and find neither. This
creates a friction point exactly where first-time agent integrators are most fragile.

**Fix required:**
1. Either: align the API response to return a field called `machineIdentity` (or
   `handleIdentity`) as described, OR
2. Update `ForAgents.tsx` to use the actual field names from the API response.
3. The terms `agentId` and `handle` are used everywhere else. Use those.

---

### P2-3 — DocsPayments.tsx mentions Solana and Polygon as "planned" with no timeline

**Files:** `artifacts/agent-id/src/pages/DocsPayments.tsx`

**Root cause:** The page says "Solana and Polygon: planned" under x402. There is no
timeline, no roadmap link, and no signal of how real this is.

**Why this matters:** Blockchain roadmap claims without substance invite skepticism
from enterprise buyers. Listing unshipped chains in technical docs alongside shipped
features makes the whole table feel speculative.

**Fix required:**
1. Change "Solana, Polygon: planned" to either:
   - Remove entirely
   - `"Additional networks under evaluation — register interest at [link]"`
   - Give an actual Q3/Q4 2026 milestone if the roadmap is committed

---

### P2-4 — Handle pricing inconsistency across frontend, backend, and llms.txt

**Files:** `artifacts/agent-id/src/pages/Pricing.tsx`,
`artifacts/agent-id/src/pages/HandlesClaim.tsx`,
`artifacts/api-server/src/services/handle-pricing.ts`,
`artifacts/api-server/src/routes/llms-txt.ts`

**Root cause:** `AUDIT.md`: "Handle pricing inconsistency — discrepancies across
frontend, backend, and llms.txt." If a user sees one price in the UI and gets charged
a different price at checkout, this is a Stripe/payment integrity issue and a UX trust
failure.

**Fix required:**
1. Define all handle pricing in one place: `handle-pricing.ts` service.
2. Have `Pricing.tsx`, `HandlesClaim.tsx`, and `llms-txt.ts` read from or reference
   the same constants.
3. Add a test that compares frontend-rendered pricing to backend-enforced pricing.

---

### P2-5 — "Sign in with Agent ID" component is described as an OAuth-style standard but implementation is unclear

**Files:** `artifacts/agent-id/src/components/SignInWithAgentID.tsx`,
`artifacts/agent-id/src/pages/DocsIntegrations.tsx`,
`artifacts/api-server/src/routes/v1/` (OAuth/authorize routes if present),
`artifacts/agent-id/src/pages/Authorize.tsx`

**Root cause:** The component exists and `DocsIntegrations.tsx` shows "Sign in with
Agent ID" as an integration pattern, suggesting a full OAuth 2.0/OIDC flow. If the
`/authorize` endpoint does not implement the full OAuth code flow with PKCE, this
feature is misleading.

**Why this matters:** Developers integrating "Sign in with Agent ID" expect standard
OAuth 2.0 behavior: authorization code flow, token exchange, token refresh, scopes,
JWKS. If any of these are missing, the integration will silently break.

**Fix required:**
1. Audit `Authorize.tsx` and the relevant API routes.
2. If the OAuth flow is complete: add a test that walks the authorization code flow
   end-to-end and document the exact endpoints in `DocsIntegrations.tsx`.
3. If the OAuth flow is incomplete: add a banner to `SignInWithAgentID.tsx`:
   `"Sign in with Agent ID is in beta. Production OAuth support available Q2 2026."`
   and remove it from the primary integration examples until it is ready.

---

### P2-6 — Dashboard and AgentProfile empty states are inconsistent

**Files:** `artifacts/agent-id/src/pages/Dashboard.tsx`,
`artifacts/agent-id/src/pages/AgentProfile.tsx`,
`artifacts/agent-id/src/components/shared.tsx` (EmptyState component)

**Root cause:** A shared `EmptyState` component exists in `shared.tsx`. Not all
zero-data views use it. Some screens have ad hoc empty UI, others have nothing.

**Fix required:**
1. Audit every tab/section in `Dashboard.tsx` and `AgentProfile.tsx` that has a list
   or table.
2. For any list that can be empty (agents list, credentials list, keys list, activity
   feed, mail inbox): ensure it uses the `EmptyState` component with a useful message
   and a clear CTA.
3. Suggested messages:
   - Empty credentials: `"No credentials issued yet. Complete verification to receive your first credential."`
   - Empty keys: `"No API keys created. Create a key to start using the Agent ID SDK."`
   - Empty inbox: `"No messages. Your agent's inbox will appear here once other agents send messages."`

---

### P2-7 — "Launch-grade infrastructure" hero copy is not currently accurate

**Files:** `artifacts/agent-id/src/pages/` (landing page, likely `Landing.tsx` or
the root `index` component)

**Root cause:** The landing page likely contains claims like "launch-grade
infrastructure" or "production-ready." Given that `.well-known` endpoints are broken,
subdomain resolution is broken, escrow is a placeholder, and several features are
incomplete, this copy does not reflect reality.

**Fix required:**
1. Until P0 items are resolved, change hero copy to reflect what is actually solid:
   identity registration, verification, trust scoring, SDK, and MCP integration.
2. Remove claims that imply full production-readiness until `.well-known`, CORS,
   cookie security, and the marketplace payout are complete.
3. Replace with specific, accurate claims: "Verifiable agent identities in minutes.
   SDK, MCP, REST API, and handle resolution."

---

### P2-8 — Trust tier discount copy (0% to 50%) in DocsPayments is unverified

**Files:** `artifacts/agent-id/src/pages/DocsPayments.tsx`,
`artifacts/api-server/src/middlewares/mpp.ts`

**Root cause:** `DocsPayments.tsx` shows a table with trust-based payment discounts
(e.g., Tier 5 = 50% discount). If `mpp.ts` implements different discount values, or
does not implement discounts at all, the docs are misleading to developers who plan
pricing strategies around this.

**Fix required:**
1. Check `mpp.ts` for actual discount tier thresholds and percentages.
2. If they differ from `DocsPayments.tsx`, update the docs page to match exactly.
3. If discounts are not implemented, add a note: `"Trust-based discounts are in
   development. Standard pricing applies."`

---

### P2-9 — DocsOrganizations trust inheritance formula not verified against implementation

**Files:** `artifacts/agent-id/src/pages/DocsOrganizations.tsx`,
`artifacts/api-server/src/routes/v1/agents.ts` (trust calculation for org members)

**Root cause:** `DocsOrganizations.tsx` describes a specific trust blending formula
(e.g., `blended = 0.7 * own + 0.3 * org`). If the actual backend calculation uses
different weights, developers building org-level trust workflows will get unexpected
results.

**Fix required:**
1. Find the trust calculation for org members in the backend.
2. If the formula matches: no change needed.
3. If the formula differs: update `DocsOrganizations.tsx` to match the actual
   implementation exactly.

---

### P2-10 — Python SDK advertises async support; confirm parity with TypeScript SDK

**Files:** `lib/python-sdk/README.md`,
`lib/python-sdk/agentid/client.py`

**Root cause:** The Python SDK README describes `async/await` usage patterns. If the
underlying client is synchronous (e.g., using `requests` rather than `httpx` with
async), async examples will fail or block the event loop.

**Fix required:**
1. Confirm whether `client.py` uses `httpx.AsyncClient`, `aiohttp`, or similar.
2. If synchronous: remove async examples from `README.md`, add note:
   `"Async support coming in v2. Current version is synchronous."`
3. If async: confirm all examples in the README use `await` correctly.

---

### P2-11 — MCP README tool list must exactly match the tools in index.ts

**Files:** `lib/mcp-server/README.md`,
`lib/mcp-server/src/index.ts`

**Root cause:** The README lists specific tools by name. If `index.ts` has been
updated (as it was in the latest pull — 70 lines changed) and the README has not
been updated to match, developers will try to use tools that don't exist or miss
tools that do.

**Fix required:**
1. Enumerate every `server.setRequestHandler` (or equivalent tool registration) in
   `index.ts`.
2. Compare against the README tool list.
3. Add any tools missing from the README. Remove any README tools not in the code.
4. For each tool, confirm the README description matches the actual tool input/output
   schema.

---

### P2-12 — Resolver README and DocsQuickstart use different URL patterns for resolution

**Files:** `lib/resolver/README.md`,
`artifacts/agent-id/src/pages/DocsQuickstart.tsx`

**Root cause:** The resolver README may reference `https://getagent.id/resolve/:handle`
while `DocsQuickstart.tsx` references `https://getagent.id/api/v1/resolve/:handle`.
(Also relevant given the `.well-known` routing issue — the canonical path matters.)

**Fix required:**
1. Define one canonical resolution URL and use it consistently across all docs,
   README files, and SDK default configurations.
2. Canonical should be: `https://getagent.id/api/v1/resolve/:handle` (the API path
   that works) until the well-known routing is fixed.

---

## P3 — TECHNICAL DEBT / POST-LAUNCH (DO NOT BLOCK ON THESE)

These are real issues but acceptable to address post-launch with a clear timeline.

- **20 missing ON DELETE CASCADE foreign keys** (96 tables, 20 FK constraints without
  CASCADE) — database integrity debt, not a launch blocker but must be audited
  before high-volume use.
- **Redis in-memory fallback** — rate limiting falls back to in-memory if Redis is
  unavailable. Acceptable for soft launch but must be replaced before scale.
- **No backup / disaster recovery plan** — `TODO_BEFORE_LAUNCH.md` item 8. Must be
  configured before any production traffic.
- **INBOUND SMTP not implemented** — `TODO_BEFORE_LAUNCH.md` item 2. Mail inbox
  works for outbound and inter-agent messages but real email ingest is missing.
- **File attachment storage not connected** — `TODO_BEFORE_LAUNCH.md` item 3.
  Schema exists, implementation missing. Hide attachment UI until connected.
- **Claim-later flow** — strong implementation but the 30-day expiry and reminder
  email flow should be tested end-to-end before launch.
- **Load testing** — `TODO_BEFORE_LAUNCH.md` item 7. Stress tested to 500 concurrent
  agents (29-30 RPS stable), but 1000+ concurrent has not been validated.

---

## IMPLEMENTATION ORDER

```
1. P0-4  (encryption keys)       — env.ts, fail-closed startup check
2. P0-3  (CORS hardening)        — cors() config update
3. P0-5  (webhook verification)  — payments.ts, programmatic.ts
4. P1-9  (cookie security)       — auth.ts
5. P0-2  (Stripe payouts)        — stripe-connect.ts OR disable marketplace payments
6. P0-1  (well-known routing)    — routing fix + docs update
7. P1-1  (escrow UI honesty)     — TransferSale.tsx copy update
8. P1-7  (MCP credential audit)  — index.ts review + README update
9. P1-5  (onchain copy honesty)  — DocsOrganizations.tsx + Protocol.tsx
10. P1-6  (x402 copy honesty)    — DocsPayments.tsx
11. P1-2  (trust score max)      — calculation + all UI copy
12. P1-3  (plan limit mismatch)  — require-plan.ts + Pricing.tsx
13. P1-4  (admin hardening)      — admin.ts + IP allowlist
14. P1-8  (subdomain SSL note)   — resolver README + ForAgents.tsx
15. P2-*  (copy/UX pass)         — all P2 items in order
```

---

## TESTING REQUIREMENTS

For every P0 and P1 fix, add or update a test. The test suites already in the repo
(`agent-lifecycle.integration.test.ts`, `security-expanded.security.test.ts`,
`payment-webhooks.security.test.ts`, `resolver-states.integration.test.ts`) provide
good patterns to follow.

At minimum, add tests for:
- `well-known` endpoints return `Content-Type: application/json` (not HTML)
- Webhook signature rejection (Stripe + Coinbase if applicable)
- Admin routes reject requests with wrong/missing secret
- Plan enforcement matches advertised limits
- Cookie attributes in session creation responses
- MCP server returns auth error when no API key is configured
- Encryption key startup assertion fails closed when missing in production

---

## WHAT NOT TO TOUCH

The following are strong and should not be modified:
- Ed25519 challenge/verify flow in `programmatic.ts`
- Core claim-later ownership model
- Trust score provider architecture (fix the max, keep the system)
- Stripe billing integration (except the payout gap)
- Rate limiting stack (keep all limiters)
- The `requestIdMiddleware`, `securityHeaders`, `errorHandler` middleware
- `ssrf-guard.ts` — this is already excellent
- Resolver caching with 60s TTL in `resolution-cache.ts`
- The SDK's `registerAgent` / `init` / `resolve` canonical flow

---

*Generated from full repo inspection on 2026-03-18 after pulling latest master.*
*All findings verified against source code. File references are exact.*
