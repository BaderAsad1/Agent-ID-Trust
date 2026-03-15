# TODO Before Launch

Items that must be resolved before the first production release.

## Infrastructure
- [ ] Provision and configure Redis — set `REDIS_URL` (enables BullMQ workers for webhook delivery and domain provisioning)
- [ ] Set `ACTIVITY_HMAC_SECRET` to a stable 32+ char secret (activity-log signatures are ephemeral without it)
- [ ] Configure Resend — set `RESEND_API_KEY` and `FROM_EMAIL` (transport provider is wired; needs key to activate)
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` for live payment processing
- [ ] Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` for .agent domain provisioning
- [x] Move from in-memory rate limiting to Redis-backed store (`rate-limit-redis`) — auto-upgrades when `REDIS_URL` set

## Payments
- [x] Replace sandbox `pi_sim_...` payment simulation with real Stripe PaymentIntents for marketplace orders
- [ ] **Stripe Connect seller payouts** — sellers currently receive `pending_manual_payout` status in `payout_ledger`; must implement Connect account onboarding, automated Transfers, and payout webhooks before marketplace launch (see details below)
- [ ] Coinbase Agentic Payments provider is stubbed but deferred — implement when Coinbase SDK is production-ready
- [ ] Visa Agentic Payments provider is stubbed but deferred — implement when Visa agent API is available

### Stripe Connect Seller Payouts (required before marketplace launch)

Sellers cannot receive automated payouts until Stripe Connect is implemented:

1. **Connect account onboarding** — sellers create/verify a Stripe Connect account (Standard or Express), link bank accounts, and store their `acct_*` ID on the user record
2. **Automated Transfers** — on order completion, create a Stripe Transfer to the seller's Connect account for the `sellerPayout` amount; update `payout_ledger` from `pending_manual_payout` → `processing` → `completed`
3. **Payout dashboard** — show sellers their pending/completed payouts and Connect account status
4. **Webhooks** — handle `transfer.created`, `transfer.paid`, `transfer.failed`, and `account.updated` events

References: [Stripe Connect docs](https://docs.stripe.com/connect), payout schema in `lib/db/src/schema/payout-ledger.ts`, order completion in `artifacts/api-server/src/services/orders.ts`

## Security
- [ ] Replace dev-mode `X-AgentID-User-Id` auth bypass with production Replit Auth or OAuth flow
- [ ] Audit all API routes for authorization gaps
- [ ] Enable HTTPS-only cookies and CSRF protection

## Frontend
- [x] Wire "Create New Listing" button in marketplace dashboard to a real form
- [x] Add agent verification modal to dashboard Overview
- [x] Add "Create API Key" form to Settings page
- [x] Add confirmation dialog to "Delete Account" button
- [x] Add Current Plan section with Upgrade CTA to Settings page
- [x] Test and fix mobile layout at 375px for dashboard pages and Mail page

## API / Backend
- [x] Serve OpenAPI spec via Swagger UI at `GET /api/docs`
- [x] Wire ForAgents page "View API Docs" and "OpenAPI Spec" buttons to `/api/docs`
- [x] Implement email notification service (Resend transport provider in mail-transport.ts)
- [ ] Add functional `lower(handle)` index on agents table for case-insensitive lookups

## Data / Schema
- [ ] Run `drizzle-kit push` or migration to apply new indexes (users.email, users.username, marketplace composite indexes)

## Monitoring
- [ ] Set up error tracking (Sentry or equivalent)
- [ ] Add health-check endpoint (`GET /api/health`)
- [ ] Configure structured logging for production
