# Agent ID — API Authentication Guide

This document describes every authentication method supported by the Agent ID API, with usage examples and lifecycle details.

## Table of Contents

1. [Overview](#overview)
2. [Bootstrap Flow](#bootstrap-flow)
3. [Agent Key (X-Agent-Key)](#agent-key-x-agent-key)
4. [Session JWT (Bearer Token)](#session-jwt-bearer-token)
5. [Proof-of-Possession JWT (PoP JWT)](#proof-of-possession-jwt-pop-jwt)
6. [OAuth 2.0 Flows](#oauth-20-flows)
7. [Token Expiry & Refresh](#token-expiry--refresh)
8. [Agent Status Gate](#agent-status-gate)
9. [Error Responses](#error-responses)

---

## Overview

The Agent ID API uses a **strategy-based** authentication system. Three strategies are evaluated in order for each request:

| Strategy | Header | Use Case |
|---|---|---|
| `agent-key` | `X-Agent-Key: agk_...` | Server-to-server, long-lived API key |
| `session-jwt` | `Authorization: Bearer <jwt>` | Session tokens issued by the platform |
| `pop-jwt` | `Authorization: Bearer <jwt>` | Self-signed proof-of-possession tokens |

The first strategy that matches wins. If none match, the request is rejected with `401 AGENT_UNAUTHORIZED`.

---

## Bootstrap Flow

The bootstrap flow provisions a new agent identity. It is a two-step process:

### Step 1: Claim

```
POST /api/v1/bootstrap/claim
Content-Type: application/json

{
  "token": "<claim_token>",
  "publicKey": "<base64-SPKI-Ed25519-public-key>",
  "keyType": "ed25519"
}
```

**Response:**
```json
{
  "identity": {
    "agentId": "uuid",
    "handle": "my-agent",
    "status": "pending_activation"
  },
  "challenge": "<random-hex-string>",
  "kid": "<key-id>",
  "expiresAt": "2025-01-01T00:00:00Z",
  "activateEndpoint": "https://getagent.id/api/v1/bootstrap/activate"
}
```

### Step 2: Activate

Sign the `challenge` with your Ed25519 private key and submit:

```
POST /api/v1/bootstrap/activate
Content-Type: application/json

{
  "agentId": "<uuid>",
  "kid": "<kid-from-claim>",
  "challenge": "<challenge-string>",
  "signature": "<base64-Ed25519-signature>",
  "claimToken": "<claim_token>"
}
```

**Response:**
```json
{
  "activated": true,
  "identity": { "agentId": "...", "status": "active" },
  "secrets": {
    "apiKey": "agk_...",
    "storageSafety": "sensitive — store in env vars only"
  },
  "bootstrap": { "...": "identity bundle" },
  "nextSteps": { "...": "endpoint URLs" }
}
```

> **Important:** Store `secrets.apiKey` securely. It is shown only once.

---

## Agent Key (X-Agent-Key)

The simplest authentication method. Use the API key received during bootstrap.

### Usage

```
GET /api/v1/agents/me
X-Agent-Key: agk_abc123...
```

### How It Works

1. The server SHA-256 hashes the key value.
2. Looks up the hash in `api_keys` where `ownerType = 'agent'` and `revokedAt IS NULL`.
3. If found, loads the associated agent and populates `req.authenticatedAgent`.

### Security Notes

- Keys are stored as SHA-256 hashes (the raw key is never stored).
- Revoked keys (`revokedAt` is set) are immediately rejected.
- Keys with `ownerType = 'user'` do NOT authenticate via this strategy.

---

## Session JWT (Bearer Token)

Session JWTs are platform-issued tokens tied to an `agentid_sessions` row.

### Usage

```
GET /api/v1/agents/me
Authorization: Bearer eyJhbGciOiJFZERTQSIs...
```

### How It Works

1. The JWT is verified against the platform's Ed25519 signing key.
2. The `jti` claim is matched to `agentid_sessions.sessionId`.
3. Session must not be expired (`expiresAt > now`) or revoked (`revoked = false`).
4. If the session has an `audience`, the JWT's `aud` claim must include it.

### Token Format

```json
{
  "alg": "EdDSA",
  "typ": "JWT"
}
{
  "agent_id": "<uuid>",
  "jti": "<session-id>",
  "aud": "https://getagent.id",
  "iat": 1700000000,
  "exp": 1700000900
}
```

---

## Proof-of-Possession JWT (PoP JWT)

PoP JWTs are **self-signed** by the agent using its registered Ed25519 key. They include a server-issued nonce for replay prevention.

### Step 1: Obtain a Nonce

```
POST /api/v1/auth/challenge
Content-Type: application/json

{ "agentId": "<uuid>" }
```

**Response:**
```json
{
  "nonce": "<random-hex>",
  "expiresAt": "2025-01-01T00:05:00Z"
}
```

### Step 2: Build and Sign the JWT

Construct a JWT with these claims:

```json
{
  "alg": "EdDSA",
  "kid": "<your-registered-kid>"
}
{
  "agent_id": "<uuid>",
  "jti": "<nonce-from-step-1>",
  "aud": "agentid",
  "iat": 1700000000,
  "exp": 1700000300
}
```

Sign with your Ed25519 private key (the one whose public key you registered during bootstrap).

### Step 3: Use the Token

```
GET /api/v1/agents/me
Authorization: Bearer eyJhbGciOiJFZERTQSIsImtpZCI6...
```

### How It Works

1. The JWT header must have `alg: "EdDSA"` (or `"Ed25519"`) and a `kid`.
2. The `kid` is looked up in `agent_keys` for the specified `agent_id`.
3. The signature is verified against the registered public key.
4. The `jti` nonce is atomically consumed (`WHERE consumedAt IS NULL AND expiresAt > now`).
5. If the nonce has an `audience`, the JWT's `aud` must match.

### Replay Protection

- Each nonce can only be used **once** (atomic `UPDATE ... SET consumedAt = now`).
- Expired nonces are rejected.
- Already-consumed nonces are rejected.

---

## OAuth 2.0 Flows

### Authorization Code Flow (with PKCE)

```
GET /oauth/authorize?client_id=...&response_type=code&scope=agents:read&code_challenge=...&code_challenge_method=S256&redirect_uri=https://example.com/callback
```

Exchange the code:

```
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<auth-code>",
  "client_id": "<client-id>",
  "code_verifier": "<pkce-verifier>",
  "redirect_uri": "https://example.com/callback"
}
```

### Signed Assertion Grant

For agent-to-agent authentication without user interaction:

```
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "urn:agentid:grant-type:signed-assertion",
  "client_id": "<client-id>",
  "agent_id": "<agent-uuid>",
  "scope": "agents:read",
  "assertion": "<signed-assertion-jwt>"
}
```

### Scope Enforcement

- Clients have an `allowedScopes` list. Only scopes in that list are granted.
- Clients with `allowedScopes = []` (empty) cannot obtain any scopes via the token endpoint.
- PKCE (`S256` only) is **mandatory** for public clients. Plain PKCE is rejected.

---

## Token Expiry & Refresh

| Token Type | Default TTL | Refresh |
|---|---|---|
| Agent API Key | No expiry | Revoke and reissue via dashboard |
| Session JWT | 15 minutes | Re-authenticate to obtain a new session |
| PoP JWT | 5 minutes | Obtain a new nonce and self-sign a fresh JWT |
| OAuth Access Token | 1 hour | Use refresh_token grant (if issued) |

### Nonce Expiry

- Auth challenge nonces expire after **5 minutes**.
- Each nonce is single-use (consumed atomically on first presentation).

---

## Agent Status Gate

Authentication is universally gated on agent status. These statuses are **always rejected**, regardless of auth strategy:

| Status | Result |
|---|---|
| `revoked` | 403 AGENT_INELIGIBLE |
| `draft` | 403 AGENT_INELIGIBLE |
| `inactive` | 403 AGENT_INELIGIBLE |
| `suspended` | 403 AGENT_INELIGIBLE |
| `pending_verification` | 403 AGENT_NOT_VERIFIED (except at verification endpoints) |

Only `active` agents with `verificationStatus = "verified"` can access protected routes.

---

## Error Responses

### 401 AGENT_UNAUTHORIZED

No valid credentials provided.

```json
{
  "error": "Agent authentication required",
  "code": "AGENT_UNAUTHORIZED",
  "supportedStrategies": ["agent-key", "session-jwt", "pop-jwt"],
  "hint": "Provide X-Agent-Key header, Authorization: Bearer <session-jwt>, or Authorization: Bearer <pop-jwt>",
  "docsUrl": "https://getagent.id/api/llms.txt"
}
```

### 403 AGENT_INELIGIBLE

Agent exists but is not allowed to authenticate.

```json
{
  "error": "Agent is not eligible for authentication",
  "code": "AGENT_INELIGIBLE",
  "reason": "Agent status 'revoked' is not eligible for authentication",
  "status": "revoked"
}
```

### 403 AGENT_NOT_VERIFIED

Agent has not completed verification.

```json
{
  "error": "Agent must complete verification before it can be used",
  "code": "AGENT_NOT_VERIFIED",
  "verificationStatus": "pending"
}
```

### 403 INSUFFICIENT_SCOPE

Authenticated but missing required scopes.

```json
{
  "error": "Insufficient scopes",
  "code": "INSUFFICIENT_SCOPE",
  "required": ["agents:write"],
  "granted": ["agents:read"]
}
```
