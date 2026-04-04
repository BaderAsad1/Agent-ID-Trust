# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] — 2025-03-25

### Breaking Changes

#### OAuth Scope Deny-by-Default
- Clients with `allowedScopes = []` (empty array) can no longer obtain any scopes via `POST /oauth/token` or `GET /oauth/authorize`.
- Previously, an empty `allowedScopes` was permissive (allowed all requested scopes through).
- **Migration:** Explicitly list the scopes your client needs in the `allowedScopes` array when registering or updating OAuth clients.

#### Magic-Link URL Fragment Format
- Magic-link verification URLs now use query-parameter format (`?token=...`) instead of hash-fragment format (`#token=...`).
- The verification endpoint is `GET /api/auth/magic-link/verify?token=<token>`.
- **Migration:** No action required for end users. If you parse magic-link URLs programmatically, update your parser to read the `token` query parameter.

#### Handle Max Length Reduced to 32 Characters
- Agent handles are now limited to a maximum of 32 characters.
- Previously created handles exceeding this length remain valid but new registrations enforce the limit.
- **Migration:** Ensure any programmatic handle generation produces handles of 32 characters or fewer.

#### TRUST_PROXY Required in Production
- The `TRUST_PROXY` environment variable must be explicitly configured for production deployments behind a reverse proxy (Cloudflare, nginx, etc.).
- Defaults to `"false"` (no proxy trust) to prevent XFF spoofing in bare deployments.
- If left as `"false"` behind a proxy, `req.ip` will show the proxy's IP address, causing rate limiting and IP-based security features to malfunction.
- **Migration:** Set `TRUST_PROXY="1"` for single-proxy, `"2"` for Cloudflare+nginx, or a CIDR list for Cloudflare IP-based trust. See `.env.example` for details.

#### Plain PKCE Rejected
- `code_challenge_method: "plain"` is no longer accepted for OAuth authorization requests from public clients.
- Only `S256` is supported for PKCE, in accordance with OAuth 2.1 security best practices.
- **Migration:** Update your OAuth client to use `S256` for the `code_challenge_method`. Generate the challenge as `BASE64URL(SHA256(code_verifier))`.

### Security Hardening

- **CORS fail-closed:** If `ALLOWED_ORIGINS` is unset in production, all cross-origin requests are denied (empty origin list).
- **Stripe webhook signature verification:** All webhook payloads are verified via `stripe.webhooks.constructEvent` before any state mutation.
- **Webhook idempotency:** `claimWebhookEvent` prevents duplicate event processing with atomic DB claims.
- **Rate limiting:** Redis-backed distributed rate limiting with in-memory fallback. Registration endpoints hard-block when Redis is unavailable in production.
- **Environment fail-closed:** Missing production secrets (`JWT_SECRET`, `VC_SIGNING_KEY`, `VC_PUBLIC_KEY`, `ACTIVITY_HMAC_SECRET`, `WEBHOOK_SECRET_KEY`) cause immediate `process.exit(1)` at startup.
- **Agent status gate:** Revoked, draft, inactive, and suspended agents are universally rejected at every auth path.
- **PoP JWT replay prevention:** Nonces are atomically consumed with `WHERE consumedAt IS NULL AND expiresAt > now()`.
- **Key revocation cascades:** Revoking an agent key cascades to VC cache and resolution cache invalidation.
- **MCP tool schema hardening:** No private key or secret key fields are exposed as Zod input fields in MCP tool definitions.

### Added

- Strategy-based agent authentication middleware (`agent-key`, `session-jwt`, `pop-jwt`).
- Scope enforcement middleware (`requireScope`).
- Trust context populated on every authenticated request (`req.agentTrustContext`).
- `.well-known/openid-configuration`, `.well-known/agentid-configuration`, `.well-known/agent-registration`, `.well-known/jwks.json` discovery endpoints.
- W3C Verifiable Credential issuance with Ed25519 JWT signing.
- Bootstrap flow: claim → sign challenge → activate → receive API key.
- OAuth 2.0 authorization code flow with mandatory S256 PKCE for public clients.
- OAuth signed-assertion grant type for agent-to-agent auth.
- OIDC UserInfo endpoint (`GET/POST /oauth/userinfo`).
- Comprehensive test suites: auth middleware, bootstrap flow, OAuth scope regression, rate limiting, webhook security, launch readiness.
- `.env.example` with all environment variables documented.
- `docs/API_AUTH.md` authentication guide.
