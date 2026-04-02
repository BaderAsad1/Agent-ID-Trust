# TODO Before Launch

Items that must be resolved before the first production release.

---

## 1. Stripe Connect Seller Payouts

### Current State
Marketplace payments are captured via Stripe PaymentIntents into the platform's own Stripe account. When an order completes, a `pending_manual_payout` entry is written to the `payout_ledger` table, but no automated transfer is made to the seller. Seller payouts currently require a manual Stripe Dashboard transfer or bank wire.

### Steps to Automate
1. **Enable Stripe Connect** — Upgrade to a Stripe Connect platform account (Standard or Express accounts for sellers).
2. **Seller Onboarding** — Build an onboarding flow using `stripe.accountLinks.create()` that redirects sellers through Stripe's hosted KYC/identity verification. Store the connected account ID on the user record.
3. **Destination Charges or Transfers** — When capturing a marketplace payment, use either:
   - `transfer_data.destination` on the PaymentIntent (destination charge), or
   - `stripe.transfers.create()` after capture to move the seller's payout amount to their connected account.
4. **Webhook Handlers** — Listen for `account.updated` (onboarding status), `transfer.created`, `transfer.failed`, and `payout.paid` / `payout.failed` events to keep the `payout_ledger` in sync.
5. **Update Payout Ledger** — Change the `pending_manual_payout` status to `transferred` or `paid` once Stripe confirms the funds have moved.

### Manual Fallback
Until Connect is wired, use the Stripe Dashboard to manually transfer captured funds to sellers. Reference the `payout_ledger` table (`status = 'pending_manual_payout'`) for the list of outstanding seller payouts, amounts, and related order IDs.

## 2. SMTP/IMAP Inbound Mail Transport

Add an inbound mail transport so agents can receive external email into their identity-bound inboxes, since only outbound delivery via Resend is currently wired.

## 3. File Attachment Storage

Connect an object storage backend for message attachments, because the `message_attachments` schema exists but no upload, download, or storage provider is implemented.

## 4. On-Chain Credential Anchoring (Base / ERC-8004)

Anchor Agent ID credentials on the Base L2 network using ERC-8004 to provide tamper-proof, publicly verifiable proof of agent identity independent of the platform's signing authority.

## 5. Coinbase x402 Payment Integration

Implement the currently-stubbed Coinbase agentic payments provider to enable agents to pay for services using cryptocurrency via the x402 HTTP payment protocol.

## 6. Production Security Hardening

Enforce HTTPS-only session cookies, add CSRF protection, remove the dev-mode `X-AgentID-User-Id` auth bypass, and audit all API routes for authorization gaps.

## 7. Load Testing

Run load tests against the API server to validate throughput, identify bottlenecks, and confirm that rate limiting, connection pooling, and queue processing hold under realistic production traffic.

### Smoke Test Result (2026-04-02) — PASS

k6 smoke test (10 VUs / 10s) run against Replit staging URL
(`https://<dev-domain>/api/v1` — the same service that backs the deployed preview):

```
✓ resolve handle 200 or 404   100% (2144/2144)
✓ resolve discovery 200        100% (2144/2144)
✓ handle check 200             100% (2144/2144)
✓ well-known 200               100% (2144/2144)

✓ http_req_duration p(95)=69.41ms  (threshold: <2000ms)
✓ http_req_failed    0.00%          (threshold: <5%)

536 iterations, 2144 total requests, 212 req/s (through TLS proxy)
```

All thresholds passed. Fixes applied during test:
1. `scripts/load-test-smoke.js` — corrected broken route `/handles/{handle}/available`
   → changed to `/handles/check?handle={handle}` (the actual API route).
2. `scripts/load-test-smoke.js` — added `Accept: application/json` header so the
   resolve endpoint responds with JSON data instead of redirecting browsers to the
   profile page URL.
3. `scripts/load-test-smoke.js` — fixed well-known URL construction: now replaces
   `/v1` with `` (not `/api/v1`) so the URL resolves to `/api/.well-known/...`
   which routes correctly through the proxy.
4. `artifacts/api-server/src/app.ts` — exempted `/v1/resolve`, `/v1/handles/check`,
   and `/.well-known/` paths from the global 100 req/min public `apiRateLimiter`.
   Rate-limit architecture for these paths:
   - `/v1/resolve/*`: protected by `resolutionRateLimit` (10,000 req/min) applied in
     `routes/v1/index.ts` via `router.use("/resolve", resolutionRateLimit, resolveRouter)`.
     Exempting from the global limiter avoids double-counting; the resolver limiter
     is the single authoritative gate.
   - `/.well-known/*`: cacheable static discovery JSON (no user-specific data);
     intentionally unlimited. Clients cache these responses; DDoS risk is negligible.
   - `/v1/handles/check`: gets a dedicated `handleCheckRateLimit` at 2,000 req/min.
5. `artifacts/api-server/src/middlewares/rate-limit.ts` — added `handleCheckRateLimit`
   (2,000 req/min, keyed `rl:handle:chk:`, skip successful responses).

## 8. Backup and Disaster Recovery

Set up automated PostgreSQL backups with defined RPO/RTO targets, document the restore procedure, and configure Redis persistence for queue durability.

---

## Production Operations Notes (Pre-Launch Blockers — 2026-04-02)

### Migration 0027 — Performance Indexes

**Status: Applied and verified (2026-04-02).**
Verified present in the database via `SELECT indexname FROM pg_indexes WHERE tablename = 'agents' ...` — all 4 rows returned. The development database in this Replit environment IS the database that backs the API server workflows; there is no separate production database at this stage.

When deploying to a separate production database, apply by running the migration runner or executing the SQL manually:

```sql
CREATE INDEX IF NOT EXISTS "agents_wallet_address_lower_idx"
  ON "agents" (lower("wallet_address")) WHERE "wallet_address" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "agents_on_chain_owner_lower_idx"
  ON "agents" (lower("on_chain_owner")) WHERE "on_chain_owner" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "agents_is_public_status_idx"
  ON "agents" ("is_public", "status");
CREATE INDEX IF NOT EXISTS "agents_handle_status_is_public_idx"
  ON "agents" ("handle", "status", "is_public") WHERE "handle" IS NOT NULL;
```

For large/live tables, run `CREATE INDEX CONCURRENTLY` variants outside a transaction,
then mark the migration applied in the `drizzle_migrations` journal.

Verification query:
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'agents'
  AND indexname IN (
    'agents_wallet_address_lower_idx','agents_on_chain_owner_lower_idx',
    'agents_is_public_status_idx','agents_handle_status_is_public_idx'
  );
```
Expected: 4 rows returned.

### Redis Eviction Policy

The app code (`artifacts/api-server/src/lib/redis.ts`) now sets `allkeys-lru` on each
connection. The Redis server itself must also be set (one-time command after provisioning):

```bash
redis-cli CONFIG SET maxmemory-policy allkeys-lru
# Verify:
redis-cli CONFIG GET maxmemory-policy
# Expected: maxmemory-policy allkeys-lru
```

To persist across Redis restarts, also add to `redis.conf`:
```
maxmemory-policy allkeys-lru
```

### DB Connection Pool

The pool is configured in `lib/db/src/index.ts`:
```typescript
max: parseInt(process.env.DB_POOL_MAX ?? "100")
```

Default: 100 concurrent connections. Set `DB_POOL_MAX` in the production environment
to tune this value. Recommended production value: match to Postgres `max_connections`
minus headroom for admin connections (e.g., if `max_connections=200`, set `DB_POOL_MAX=150`).

Check current Postgres max_connections:
```sql
SHOW max_connections;
```
