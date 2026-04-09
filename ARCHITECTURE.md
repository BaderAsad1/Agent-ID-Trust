# Agent ID — Architecture & Source-of-Truth Propagation

This document describes the canonical data flows, state propagation paths, and security invariants for the Agent ID platform. It is the authoritative reference for understanding how changes to agent identity, trust, credentials, billing entitlements, and key material cascade through the system.

---

## 1. Core Domain Objects

| Object | Canonical Table | Primary Key | Notes |
|---|---|---|---|
| **User** | `users` | `id` (UUID) | Holds `plan`, `stripeCustomerId` |
| **Agent** | `agents` | `id` (UUID) | Holds `handle`, `trustScore`, `trustTier`, `status` |
| **Agent Key** | `agent_keys` | `id` (UUID) | Ed25519 public keys; `status: active | revoked` |
| **Agent Subscription** | `agent_subscriptions` | `id` (UUID) | Per-agent billing state |
| **Credential** | `agent_attestations` | `id` (UUID) | Internal HMAC-signed attestation records |
| **W3C VC JWT** | in-memory `vcCache` + DB fetch | agent_id | Short-lived EdDSA JWT; cached up to 1 hour |
| **Subscription** | `subscriptions` | `id` (UUID) | User-level billing state from Stripe |
| **Webhook Event** | `webhook_events` | `providerEventId` | Stripe event idempotency log |

---

## 2. Identity Verification Flow

```
Agent Registration
  └─ POST /api/v1/agents
       ├─ Create agents row (status: inactive)
       ├─ Generate Ed25519 keypair (in MCP: agentid_register tool)
       │    └─ POST /api/v1/agents/:id/challenge → sign → POST /api/v1/agents/:id/verify
       │         └─ Insert agent_keys row (status: active)
       └─ Issue initial attestation credential
            └─ credentials.ts → issueCredential() → insert agent_attestations row

Trust Score Computation (trust-score.ts)
  ├─ DomainVerificationProvider  (max 20pts) → agent_domains.verifiedAt
  ├─ KeyVerificationProvider     (max 25pts) → agent_keys.status = active
  ├─ PaymentVerificationProvider (max 10pts) → agent_subscriptions.status
  ├─ ActivityVerificationProvider(max 20pts) → signed activity HMAC
  └─ EndpointVerificationProvider(max 25pts) → live HTTP probe
  Total: capped at 100

Trust score → trustTier:
  0–19: unverified | 20–39: basic | 40–69: verified* | 70–89: trusted* | 90–100: elite*
  (* tiers verified/trusted/elite also require verificationStatus = "verified")
```

---

## 3. Key Revocation Propagation

When an agent key is revoked, changes must cascade in this order:

```
POST /api/v1/agents/:id/keys/:keyId/revoke
  └─ services/agent-keys.ts → revokeAgentKey()
       ├─ 1. DB: UPDATE agent_keys SET status='revoked', revokedAt=now()
       ├─ 2. Credential reissue: services/credentials.ts → reissueCredential(agentId)
       │       └─ UPDATE agent_attestations SET revokedAt=now() (old record)
       │       └─ INSERT new agent_attestations row with fresh HMAC signature
       ├─ 3. VC cache invalidation: services/verifiable-credential.ts → clearVcCache(agentId)
       │       └─ vcCache.delete(agentId) — next request forces fresh JWT signing
       └─ 4. Resolution cache eviction: lib/resolution-cache.ts → deleteResolutionCache(handle)
               └─ Redis DEL resolution:{handle} — next resolution reads from DB

Admin-level revocation (POST /api/v1/admin/agents/:id/revoke):
  └─ routes/v1/admin.ts
       ├─ UPDATE agents SET status='revoked', revokedAt=now()
       ├─ UPDATE agent_keys SET status='revoked', revokedAt=now() (all active keys)
       ├─ UPDATE agent_attestations SET revokedAt=now() (all active attestations)
       └─ writeAuditEvent('admin.agent.revoked')
```

**Security invariant:** After any key revocation, the agent's cached W3C VC JWT and DID document cache are always invalidated before returning success. A stale VC JWT referencing a revoked key must never be served.

---

## 4. Credential System

Two distinct credential types exist. They must never be confused:

### 4a. Internal Attestation Record (HMAC)

**File:** `artifacts/api-server/src/services/credentials.ts`

- **Format:** JSON object stored in `agent_attestations` table with a `proof.signatureValue` (HMAC-SHA256 hex)
- **Secret:** `CREDENTIAL_SIGNING_SECRET` env var (arbitrary string, not a PEM/JWK key)
- **Signing:** `createHmac("sha256", secret).update(payload).digest("hex")`
- **Purpose:** Internal platform trust signal — not intended for external verification
- **Not exposed** as a public API response

### 4b. W3C Verifiable Credential JWT

**File:** `artifacts/api-server/src/services/verifiable-credential.ts`

- **Format:** Compact JWT (3 base64url segments: `header.payload.signature`)
- **Algorithm:** EdDSA (Ed25519), using `jose.SignJWT`
- **Keys:** `VC_SIGNING_KEY` (JWK private key, production) / ephemeral key (dev)
- **Public key** exposed at `/.well-known/jwks.json` for external verification
- **Payload includes:** W3C context, `VerifiableCredential`, `AgentIdentityCredential` type, `did:web:getagent.id` issuer, `credentialSubject`, `exp` (1 hour TTL)
- **Cache:** In-memory `vcCache` (TTL: 1 hour) — invalidated on key revocation

---

## 5. Billing Entitlement Flow

```
Stripe Checkout Completed
  └─ POST /webhooks/stripe (with stripe-signature header)
       ├─ verifyStripeWebhook() — constructEvent() validates HMAC-SHA256 signature
       ├─ claimWebhookEvent() — idempotency check on event.id (providerEventId)
       │       └─ If already_processed → return 200 early (no mutation)
       └─ handleCheckoutCompleted(session)
            ├─ UPDATE users SET plan=<plan>, stripeCustomerId=<id>
            ├─ UPSERT subscriptions (providerSubscriptionId, billingInterval, periodDates)
            ├─ UPDATE agent_subscriptions SET plan=<plan>
            └─ enforceAgentLimitsForUser() — deactivates excess agents if plan downgrades

Plan limits (billing.ts PLAN_LIMITS):
  none/free: 0 public agents | starter: 1 | pro: 5 | enterprise: unlimited

Subscription state machine:
  active → past_due (invoice.payment_failed) → cancelled (subscription.deleted)
```

---

## 6. Discovery Endpoints

All `.well-known` routes are mounted at both `/` and `/api/` prefixes:

```
GET /.well-known/openid-configuration   → OAuth/OIDC provider metadata
GET /.well-known/agentid-configuration  → Agent ID resolver + registration endpoints
GET /.well-known/agent-registration     → Machine-readable registration guide
GET /.well-known/jwks.json              → Ed25519 public key (JWKS format) for VC verification
GET /.well-known/agent.json             → Per-agent identity document (handle via ?handle= or subdomain)
GET /.well-known/did.json               → did:web DID document (alias for agent.json per did:web spec)
```

`/.well-known/did.json` and `/.well-known/agent.json` share the same `agentIdentityDocumentHandler` in `routes/well-known.ts`. The `did:web` specification requires DID documents at `/.well-known/did.json` for path-less DIDs (e.g. `did:web:example.com`). Both endpoints serve the same identity document shape with `@context`, `id: did:web:…`, and `ownerKey`.

---

## 7. MCP Tool Security Model

Tools registered in `registerAllTools(server, apiKey, getSessionId)`:

- `apiKey` is a **server-level parameter** — injected by the MCP server process, never user-supplied
- No tool exposes `privateKey` or `secretKey` as a Zod input schema field
- `agentid_register` generates an Ed25519 keypair internally; only `publicKeySpkiBase64` is returned
- The private key DER material is used in `signChallenge()` and is local to that call's stack frame
- Hosted MCP server (`artifacts/mcp-server/`) and npm library (`lib/mcp-server/`) share the same security model

---

## 8. Production Security Controls

| Control | Implementation | Verified By |
|---|---|---|
| **Env fail-closed** | `validateEnv()` exits(1) in production for missing secrets | `launch-readiness.security.test.ts` LR-4 |
| **CORS fail-closed** | Empty list when `ALLOWED_ORIGINS` unset; no wildcard | LR-5 |
| **Webhook signature** | `stripe.webhooks.constructEvent()` before any DB mutation | LR-6 |
| **Webhook idempotency** | `claimWebhookEvent()` with `providerEventId` key | LR-7 |
| **Rate limit Redis fallback** | Hard-block on registration; ALERT log on degradation | LR-8 |
| **Key revocation cascade** | `revokeAgentKey()` → VC cache + resolution cache cleared | LR-9 |
| **VC JWT short-lived** | 1-hour TTL enforced via `.setExpirationTime()` | LR-3 |
| **Admin auth** | `ADMIN_SECRET_KEY` header required on all `/api/v1/admin/` routes | — |
| **Activity HMAC** | `ACTIVITY_HMAC_SECRET` signs per-agent activity records | — |
