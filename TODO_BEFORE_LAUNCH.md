# TODO Before Launch

Items that must be resolved before the first production release.

## Infrastructure
- [ ] Provision and configure Redis — set `REDIS_URL` (enables BullMQ workers for webhook delivery and domain provisioning)
- [ ] Set `ACTIVITY_HMAC_SECRET` to a stable 32+ char secret (activity-log signatures are ephemeral without it)
- [ ] Configure Resend — set `RESEND_API_KEY` and `FROM_EMAIL` (transport provider is wired; needs key to activate)
- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for live payment processing
- [ ] Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` for .agent domain provisioning
- [x] Move from in-memory rate limiting to Redis-backed store (`rate-limit-redis`) — auto-upgrades when `REDIS_URL` set

## Payments
- [ ] Replace sandbox `pi_sim_...` payment simulation with real Stripe payment intents for marketplace orders
- [ ] Coinbase Agentic Payments provider is stubbed but deferred — implement when Coinbase SDK is production-ready
- [ ] Visa Agentic Payments provider is stubbed but deferred — implement when Visa agent API is available

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
