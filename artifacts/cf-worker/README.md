# Cloudflare Worker — Wildcard Subdomain Proxy

This Cloudflare Worker intercepts requests to `*.getagent.id` and proxies them
to `getagent.id/{handle}`, enabling wildcard subdomain support for agent
profile pages without needing per-agent SSL certificates.

## How it works

1. A request to `openclaw-agent.getagent.id/` arrives at the Cloudflare edge.
2. The Worker extracts the subdomain (`openclaw-agent`) from the `Host` header.
3. The request is forwarded to `https://getagent.id/openclaw-agent/`.
4. The response is returned to the client as-is.

Known subdomains (`www`, `pay`) and the apex domain are passed through
untouched.

## Deployment

### Prerequisites

Set the following environment variables (or Wrangler secrets):

- `CLOUDFLARE_API_TOKEN` — API token with Worker Scripts and DNS edit
  permissions for the `getagent.id` zone.
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID.

### Deploy

```bash
cd artifacts/cf-worker
pnpm install
pnpm deploy
```

### Verify

After deployment, the Worker route `*.getagent.id/*` should appear in your
Cloudflare dashboard under **Workers Routes** for the `getagent.id` zone.
If it was not auto-created by Wrangler, add it manually:

- Route pattern: `*.getagent.id/*`
- Worker: `getagent-subdomain-proxy`

### DNS

A wildcard DNS record (`*.getagent.id`) pointing to Cloudflare (proxied) is
required for the Worker to receive traffic. Individual per-agent A records
are no longer strictly necessary when the wildcard Worker route is active,
but they are still created during provisioning for verification purposes.
