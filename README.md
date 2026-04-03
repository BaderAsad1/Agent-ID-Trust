# Agent ID

Agent ID (`getagent.id`) is an open identity registry for AI agents — a global namespace for machine identities, verification, messaging, and payment infrastructure for the agentic web.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Environment Variables

Copy `.env.example` (or set the following variables) before starting the API server.

### Required (Production)

| Variable | Description |
|---|---|
| `PORT` | Port the API server listens on |
| `DATABASE_URL` | PostgreSQL connection string |
| `WEBHOOK_SECRET_KEY` | 32-byte hex key for AES-256-GCM encryption of webhook secrets at rest |
| `ACTIVITY_HMAC_SECRET` | HMAC key for signing activity log entries |
| `CLAIM_TOKEN_SECRET` | Secret for HMAC-signed programmatic claim tokens |
| `JWT_SECRET` | Secret for JWT signing |
| `OAUTH_INTROSPECTION_SECRET` | Shared secret for server-to-server token introspection |
| `CREDENTIAL_SIGNING_SECRET` | Secret for verifiable credential signatures |

### Authentication Providers

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |

### Payments (Stripe)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_STARTER_MONTHLY` | Stripe Price ID for Starter monthly plan ($29/mo) |
| `STRIPE_PRICE_STARTER_YEARLY` | Stripe Price ID for Starter yearly plan ($290/yr) |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro monthly plan ($79/mo) |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe Price ID for Pro yearly plan ($790/yr) |
| `STRIPE_PRICE_HANDLE_3CHAR_YEARLY` | Stripe Price ID for 3-char handle annual renewal ($99/yr) |
| `STRIPE_PRICE_HANDLE_4CHAR_YEARLY` | Stripe Price ID for 4-char handle annual renewal ($29/yr) |

**Plans:**
- **Free** ($0): 1 agent, UUID identity only (`did:web:getagent.id:agents:<uuid>`), no handle, no mail/inbox
- **Starter** ($29/mo): 5 agents, 1 included standard handle (5+ chars), inbox and mail enabled
- **Pro** ($79/mo): 25 agents, 1 included standard handle, all Starter features + advanced routing
- **Enterprise** (custom): unlimited agents, all Pro features + SLA support

**Handle pricing:** 1-2 chars reserved · 3 chars $99/yr · 4 chars $29/yr · 5+ chars included with Starter/Pro/Enterprise

**Handle registrar:** Base chain (`BASE_AGENTID_REGISTRAR`) is the sole active registrar. `BASE_HANDLE_CONTRACT` is kept for env reference only (deprecated from runtime write paths). Registrar availability checks run on read config (`BASE_RPC_URL` + `BASE_AGENTID_REGISTRAR`) and do not require write keys.

**Canonical DID:** `did:web:getagent.id:agents:<uuid>` (UUID-rooted, permanent). Handle alias (if claimed): `did:agentid:<handle>` (secondary, revocable).

### Email

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_WEBHOOK_SECRET` | Webhook secret for Resend delivery events |
| `FROM_EMAIL` | Sender address (default: `notifications@getagent.id`) |

### Blockchain / On-Chain (Optional)

Set `ONCHAIN_MINTING_ENABLED=true` to enable on-chain handle registration.

| Variable | Description |
|---|---|
| `ONCHAIN_MINTING_ENABLED` | `true` to enable on-chain registration (default: disabled) |
| `BASE_RPC_URL` | Base chain RPC endpoint |
| `BASE_MINTER_PRIVATE_KEY` | Private key for the minter account (hex, `0x`-prefixed) |
| `BASE_HANDLE_CONTRACT` | **Deprecated (migration-only).** Legacy AgentIDHandle contract address. Not used in any active read/write path. `BASE_AGENTID_REGISTRAR` is the only callable contract for current registrar flows. |
| `BASE_PLATFORM_WALLET` | Platform treasury wallet address on Base |
| `BASE_AGENTID_REGISTRAR` | Deployed AgentIDRegistrar contract address on Base |

### Infrastructure

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection string (optional; used for rate-limiting and caching) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for DNS automation |
| `CLOUDFLARE_ZONE_ID` | Cloudflare zone ID for `getagent.id` |
| `TRUST_PROXY` | Express trust-proxy setting. Set `"1"` behind a single reverse proxy, `"false"` for bare deployments |
| `APP_URL` | Canonical public URL (default: `https://getagent.id`) |
| `AUTH_BASE_URL` | Base URL for OAuth redirect URIs |
| `LOG_LEVEL` | Pino log level: `fatal\|error\|warn\|info\|debug\|trace` |

### Verifiable Credentials

| Variable | Description |
|---|---|
| `VC_SIGNING_KEY` | Ed25519 private key for VC signing (base64) |
| `VC_PUBLIC_KEY` | Ed25519 public key for VC verification (base64) |
| `VC_KEY_ID` | Key ID label (default: `agentid-vc-key-1`) |

## Monorepo Structure

```
artifacts/
  agent-id/       # React + Vite frontend
  api-server/     # Express API server
  pitch-deck/     # Pitch deck (slides)
  video/          # Launch video
  mockup-sandbox/ # Component preview server
lib/
  db/             # Drizzle ORM schema + migrations (PostgreSQL)
  sdk/            # TypeScript SDK (@workspace/sdk)
  python-sdk/     # Python SDK (agentid)
  mcp-server/     # Model Context Protocol server
  shared-pricing/ # Shared pricing constants
```

## Security

- Webhook secrets: AES-256-GCM encrypted at rest using `WEBHOOK_SECRET_KEY`
- Claim tokens: SHA-256 hashed before storage (raw token returned to caller only)
- Magic-link tokens: SHA-256 hashed before storage
- API keys: SHA-256 hashed (prefix stored for display)
- All on-chain transactions enforce a 120-second receipt timeout

## License

Proprietary — All rights reserved.
