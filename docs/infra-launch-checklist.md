# Infra Launch Checklist — Agent ID

This document lists every Cloudflare and deployment-level action required for a fully working production launch. Each item includes the exact setting or rule to apply so an operator can action them without guesswork.

---

## 1. Cloudflare SSL/TLS — Fix 525 on `mcp.getagent.id`

**Symptom:** `GET https://mcp.getagent.id/.well-known/mcp.json` returns a **525 SSL Handshake Failed** error.

**Root cause:** Cloudflare is set to **Full (strict)** SSL mode but the origin server (Replit/deployment) does not have a valid certificate trusted by Cloudflare's authority — or the origin is not presenting TLS at all, causing the SSL handshake to fail at the Cloudflare ↔ origin leg.

**Fix (choose one):**

**Option A — Use Cloudflare Origin Certificate (recommended):**
1. In the Cloudflare dashboard → **SSL/TLS** → **Origin Server** → **Create Certificate**.
2. Generate a certificate for `*.getagent.id` and `getagent.id`.
3. Install this certificate on the origin server (Replit deployment or custom origin).
4. Set SSL/TLS mode to **Full (strict)**.

**Option B — Downgrade to Full (not strict) temporarily:**
1. Cloudflare dashboard → **SSL/TLS** → **Overview**.
2. Change encryption mode from **Full (strict)** → **Full**.
3. This allows self-signed or unverified origin certs. Acceptable short-term; migrate to Option A for production.

**Option C — Flexible (NOT recommended for production):**
- Only if the origin does not support HTTPS at all. Traffic from Cloudflare to origin will be unencrypted.

---

## 2. Cloudflare Routing — Root Domain `/.well-known/` Returning SPA HTML

**Symptom:** `GET https://getagent.id/.well-known/openid-configuration` and `GET https://getagent.id/.well-known/agent-registration` return HTML (the SPA) instead of JSON.

**Root cause:** Cloudflare is routing root domain (`getagent.id`) traffic to a CDN/Pages deployment (the SPA), which intercepts all requests including `/.well-known/*` paths — before the Express API is reached.

**Fix:**

### 2a. Add a Cloudflare Cache Rule to bypass cache for well-known paths

In Cloudflare dashboard → **Caching** → **Cache Rules** → **Create rule**:

- **Rule name:** Bypass cache for well-known discovery endpoints
- **When incoming requests match:** URI Path starts with `/.well-known/`
- **Cache eligibility:** Bypass cache (Do not cache)

This alone does not fix the routing issue but prevents stale HTML from being served from CDN cache.

### 2b. Add a Cloudflare Page Rule or Route to send `/.well-known/` to the API origin

**Option A — Page Rules (legacy):**

In Cloudflare dashboard → **Rules** → **Page Rules** → **Create Page Rule**:

- **URL pattern:** `getagent.id/.well-known/*`
- **Setting:** Forwarding URL (301) → `https://getagent.id/api/.well-known/$1`  
  *OR* if the Express origin handles well-known at root, set **Origin** override to point to the Express API.

**Option B — Transform Rules (recommended, modern):**

In Cloudflare dashboard → **Rules** → **Transform Rules** → **URL Rewrite**:

- **Rule name:** Route well-known to API origin
- **Incoming URI path starts with:** `/.well-known/`
- **Rewrite to:** Leave path as-is, but change **Origin** to the Express API server host.

**Option C — Workers Route (if using CF Worker):**

If the CF Worker at `getagent.id` is already deployed, ensure it does **not** return early for `/.well-known/` paths and instead forwards to the Express origin. The worker currently passes through `getagent.id` requests without modification — this means if Cloudflare Routes sends `getagent.id` traffic to Pages (SPA) before the Worker, the Worker never runs.

Check **Workers & Pages** → **Triggers** → ensure the Worker route `getagent.id/*` has higher priority than the Pages deployment binding.

---

## 3. MCP Subdomain Routing — `mcp.getagent.id` → Express API

**Symptom:** `GET https://mcp.getagent.id/.well-known/mcp.json` returns 525 (see item 1) or routes incorrectly.

**Expected flow:**
```
mcp.getagent.id/.well-known/mcp.json
  → CF Worker rewrites to → getagent.id/mcp/.well-known/mcp.json
  → Express app.ts routes → proxy to MCP server localhost:MCP_PORT/.well-known/mcp.json
  → Returns JSON
```

**Required CF Worker behavior:** The worker at `mcp.getagent.id` must rewrite the request to `https://getagent.id/mcp{pathname}`. This is already implemented in `artifacts/cf-worker/src/worker.ts` — it uses the subdomain as a path prefix.

**Verify the Worker is deployed and handling `mcp.getagent.id`:**
1. Cloudflare dashboard → **Workers & Pages** → confirm the `agentid-worker` (or equivalent) is deployed.
2. **Workers Routes**: ensure `mcp.getagent.id/*` is routed to the worker.
3. Verify the worker is **not** in the `PASSTHROUGH_SUBDOMAINS` set (it currently is not — `mcp` is not in that set).

---

## 4. Deployment Environment Variables

The following env vars **must** be set in the production deployment before the server starts. The server calls `process.exit(1)` at startup if any of these are missing when `NODE_ENV=production`:

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `VC_SIGNING_KEY` | Ed25519 private JWK for VC signing | See `.env.example` generation instructions |
| `VC_PUBLIC_KEY` | Ed25519 public JWK for JWKS endpoint | See `.env.example` generation instructions |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -base64 48` |
| `ACTIVITY_HMAC_SECRET` | Activity log HMAC secret | `openssl rand -base64 32` |
| `WEBHOOK_SECRET_KEY` | Webhook payload encryption key | `openssl rand -base64 32` |
| `ADMIN_SECRET_KEY` | Admin API secret (min 32 chars) | `openssl rand -base64 48` |
| `CREDENTIAL_SIGNING_SECRET` | Internal credential HMAC secret | `openssl rand -base64 32` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://getagent.id,https://app.getagent.id` |
| `DATABASE_URL` | PostgreSQL connection string | From hosting provider |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe dashboard |

**Missing `VC_SIGNING_KEY`/`VC_PUBLIC_KEY` causes `/api/.well-known/jwks.json` to return 500 in production.**  
In dev/test, the server generates an ephemeral key automatically — this is intentional and not a bug.

---

## 5. MCP Server Deployment

The MCP server (`artifacts/mcp-server`) must be running as a **separate process** on the same host as the API server, on `localhost:MCP_PORT` (default `3001`).

The Express API server proxies `/mcp`, `/mcp/.well-known/mcp.json`, and `/mcp/health` to this process.

**If MCP is not running:**
- `/mcp` → 502 MCP_UNAVAILABLE (expected)
- `/mcp/.well-known/mcp.json` → 502 MCP_UNAVAILABLE (expected)

**Action:** Ensure both `api-server` and `mcp-server` workflows are running in the deployment environment.

---

## 6. OIDC Metadata Endpoint Consistency Check

After deploying, verify OIDC metadata is internally consistent:

```bash
curl -s https://getagent.id/.well-known/openid-configuration | jq '{
  issuer,
  jwks_uri,
  authorization_endpoint,
  token_endpoint,
  registration_endpoint
}'
```

Expected values (all must return non-404):
| Field | Expected URL |
|-------|-------------|
| `issuer` | `https://getagent.id` |
| `jwks_uri` | `https://getagent.id/api/.well-known/jwks.json` |
| `authorization_endpoint` | `https://getagent.id/oauth/authorize` |
| `token_endpoint` | `https://getagent.id/oauth/token` |
| `registration_endpoint` | `https://getagent.id/api/v1/clients` |

The `issuer` value must exactly match the `iss` claim in all issued JWTs. It is currently set to `APP_URL` (default: `https://getagent.id`).

---

## Summary Table

| # | Action | Owner | Blocking? |
|---|--------|-------|-----------|
| 1 | Fix SSL mode on `mcp.getagent.id` (525 error) | Infra/Cloudflare | YES — MCP host is dead |
| 2 | Fix root domain `/.well-known/` routing to bypass SPA/CDN | Infra/Cloudflare | YES — discovery broken in prod |
| 3 | Verify CF Worker routes `mcp.getagent.id` correctly | Infra/Cloudflare | YES — depends on fix 1 |
| 4 | Set all required env vars in deployment | DevOps | YES — server exits without them |
| 5 | Ensure MCP server process is running | DevOps | NO — graceful 502 if missing |
| 6 | Verify OIDC metadata consistency post-deploy | DevOps | NO — but required for OIDC clients |
