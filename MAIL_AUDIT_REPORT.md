# Agent Mail Infrastructure Audit Report

**Date:** 2026-03-16
**Scope:** Complete audit and production implementation of Agent Mail subsystem

---

## 1. Domain Migration Status

| Area | Old Value | New Value | Status |
|------|-----------|-----------|--------|
| `MAIL_BASE_DOMAIN` env default | `agents.local` | `getagent.id` | DONE |
| `.env.example` | missing mail vars | `RESEND_WEBHOOK_SECRET`, `MAIL_BASE_DOMAIN` added | DONE |
| Seed data (seed.ts) | `@agents.local` addresses | `@getagent.id` addresses | DONE |
| Test fixtures | `@agents.local` | `@getagent.id` | DONE |
| Mockup components | `@agents.local` | `@getagent.id` | DONE |
| Verification scripts | `@agents.local` | `@getagent.id` | DONE |
| DB migration | N/A | `0005_mail_infrastructure.sql` migrates existing rows | DONE |

**Remaining `agents.local` references in source:** 0

---

## 2. Inbound Pipeline

| Component | File | Status |
|-----------|------|--------|
| Resend webhook receiver | `routes/v1/resend-webhooks.ts` | DONE |
| Signature verification (enforced) | `services/mail-inbound.ts` | DONE |
| Email parsing & enrichment | `services/mail-inbound.ts` `parseInboundEmail()` | DONE |
| Sender trust lookup | `services/mail-inbound.ts` `lookupSenderTrust()` | DONE |
| Message deduplication | `services/mail-inbound.ts` `checkMessageDedup()` | DONE |
| Recipient routing | `services/mail-inbound.ts` `routeInboundEmail()` | DONE |
| HTML sanitization | Strips scripts, iframes, event handlers, javascript: URLs | DONE |
| Priority detection | From `X-Priority`/`Importance` headers and subject keywords | DONE |

**Security:** Webhook signature verification uses Svix-compatible verification (Resend's webhook provider):
- Requires `svix-id`, `svix-timestamp`, `svix-signature` headers
- Secret decoded from base64 (supports `whsec_` prefix format)
- Signed content: `${svix-id}.${svix-timestamp}.${body}`
- Timestamp tolerance: 5 minutes to prevent replay attacks
- Timing-safe comparison of HMAC-SHA256 signatures
- Invalid signatures are rejected (returns 200 with `invalid_signature` per Resend requirements)
- Fail-closed: if `RESEND_WEBHOOK_SECRET` is not configured, webhooks are rejected (returns 200 but no processing occurs)

---

## 3. Outbound Pipeline

| Component | File | Status |
|-----------|------|--------|
| BullMQ queue (Redis) | `services/mail-transport.ts` | DONE |
| Sync fallback (no Redis) | `services/mail-transport.ts` | DONE |
| Queue worker | `workers/outbound-mail.ts` | DONE |
| Rate limiting (per-agent) | `services/mail-transport.ts` `checkOutboundRateLimit()` | DONE |
| Rate limit enforcement in routes | `routes/v1/mail.ts` POST messages & thread reply | DONE |

**Rate Limits (per hour):**
| Plan | Limit |
|------|-------|
| free | 10 |
| starter | 100 |
| pro | 1,000 |
| team | unlimited |

**Queue Semantics:** When BullMQ is available, messages are marked `queued` (not `delivered`) until the worker confirms provider delivery. Delivery rows are only recorded after actual provider send, preventing double-counting.

**Rate Limit Enforcement:** Counts outbound messages created in the last hour (via `agent_messages` table, `direction = 'outbound'`), not delivery rows. This ensures queued messages are counted toward limits before they are actually sent, preventing burst enqueueing beyond plan limits.

---

## 4. Auth Headers

All outbound Resend sends include:
- `X-Agent-ID` — agent UUID
- `X-Agent-Handle` — agent handle (e.g., `myagent`)
- `X-Agent-Trust-Score` — current trust score
- `X-AgentID-Platform` — always `getagent.id`

---

## 5. Bounce Handling

| Component | File | Status |
|-----------|------|--------|
| Bounce webhook | `routes/v1/resend-webhooks.ts` POST `/resend/bounce` | DONE |
| Delivery status updates | Updates `outbound_message_deliveries.status` | DONE |
| Message status updates | Updates `agent_messages.delivery_status` | DONE |
| Trust score adjustment | Decrements sending agent trust on explicit bounces only (email.bounced/email.complained) | DONE |

---

## 6. Email Templates

| Template | Description | Status |
|----------|-------------|--------|
| `registration-confirmed` | Account registration confirmation | DONE |
| `verification-complete` | Identity verification completion | DONE |
| `new-message-received` | New message notification (5-min batching) | DONE |
| `order-placed` | Marketplace order placed | DONE |
| `order-completed` | Marketplace order completed | DONE |
| `plan-upgrade-confirmed` | Subscription plan upgrade | DONE |

All templates use minimal dark HTML design, no exclamation marks, no marketing language.

---

## 7. Undeliverable Messages

| Component | File | Status |
|-----------|------|--------|
| Schema table | `lib/db/src/schema/agent-mail.ts` `undeliverable_messages` | DONE |
| DB migration | `lib/db/drizzle/0005_mail_infrastructure.sql` (table + domain migration) | DONE |
| Migration row count | 2 address rows migrated, 2 domain rows migrated, 0 stale rows remaining | VERIFIED |
| Cleanup worker | `workers/undeliverable-cleanup.ts` (every 6 hours) | DONE |
| 30-day TTL | `expires_at` column with cleanup query | DONE |
| Indexed for queries | `recipient_idx`, `expires_at_idx`, `created_at_idx` | DONE |

---

## 8. Thread Matching

| Method | Priority | Status |
|--------|----------|--------|
| `In-Reply-To` → `external_message_id` lookup | 1st (highest) | DONE |
| `inReplyToId` → internal message ID | 2nd | DONE |
| Subject normalization match | 3rd (fallback) | DONE |
| New thread creation | 4th (last resort) | DONE |

`externalInReplyTo` is now wired through `SendMessageInput` → `findOrCreateThread()` → centralized thread resolution.

---

## 9. DNS Configuration

Complete documentation in `DNS_SETUP.md`:
- MX record for `getagent.id` → Resend inbound
- SPF record (`v=spf1 include:resend.com ~all`)
- DKIM record (TXT entry provided by Resend after domain verification)
- DMARC policy (`v=DMARC1; p=quarantine; rua=mailto:dmarc@getagent.id; pct=100; adkim=s; aspf=s`)
- Wildcard A record for subdomain routing
- Verification commands included

**Action required:** DNS records and Resend domain verification must be configured manually by the operator.

---

## 10. Worker Lifecycle

All workers are integrated into `index.ts` shutdown lifecycle:
- `undeliverable-cleanup` — starts on boot, stops on SIGTERM
- `outbound-mail` — starts when Redis available, graceful shutdown
- Existing workers: `webhook-delivery`, `domain-provisioning`

---

## 11. Files Modified/Created

### New Files
- `artifacts/api-server/src/services/mail-inbound.ts`
- `artifacts/api-server/src/services/mail-templates.ts`
- `artifacts/api-server/src/routes/v1/resend-webhooks.ts`
- `artifacts/api-server/src/workers/undeliverable-cleanup.ts`
- `artifacts/api-server/src/workers/outbound-mail.ts`
- `lib/db/drizzle/0005_mail_infrastructure.sql`
- `DNS_SETUP.md`
- `MAIL_AUDIT_REPORT.md`

### Modified Files
- `artifacts/api-server/src/lib/env.ts` — added `RESEND_WEBHOOK_SECRET`, `MAIL_BASE_DOMAIN` default
- `artifacts/api-server/src/services/mail-transport.ts` — BullMQ queue, rate limiting, auth headers, queued state
- `artifacts/api-server/src/services/mail.ts` — `externalInReplyTo` field, queued delivery semantics
- `artifacts/api-server/src/routes/v1/index.ts` — webhook route registration
- `artifacts/api-server/src/routes/v1/mail.ts` — rate limit enforcement
- `artifacts/api-server/src/index.ts` — worker lifecycle integration
- `lib/db/src/schema/agent-mail.ts` — `undeliverable_messages` table
- `lib/db/drizzle/meta/_journal.json` — migration journal entry
- `.env.example` — new env vars
- `scripts/seed.ts` — domain migration
- `replit.md` — mail infrastructure documentation

---

## 12. Migration Verification Results

Migration executed and verified against development database:

| Query | Result |
|-------|--------|
| `undeliverable_messages` table exists | YES (1) |
| Stale `@agents.local` address rows | 0 (2 migrated) |
| Stale `agents.local` domain rows | 0 (2 migrated) |
| Total inboxes | 2 |
| Inboxes with `@getagent.id` | 2 (100%) |

Verification queries for production deployment:
```sql
SELECT count(*) FROM information_schema.tables WHERE table_name = 'undeliverable_messages';
SELECT count(*) AS stale_address_rows FROM agent_inboxes WHERE address LIKE '%@agents.local';
SELECT count(*) AS stale_domain_rows FROM agent_inboxes WHERE address_domain = 'agents.local';
SELECT count(*) AS total_inboxes, count(*) FILTER (WHERE address LIKE '%@getagent.id') AS getagent_inboxes FROM agent_inboxes;
```

## 13. Outstanding Items (Operator Action Required)

1. Configure `RESEND_API_KEY` secret for production email delivery
2. Configure `RESEND_WEBHOOK_SECRET` for webhook signature verification (fail-closed — required for webhooks to process)
3. Configure `REDIS_URL` for BullMQ queue and Redis-backed rate limiting
4. Apply DNS records per `DNS_SETUP.md`
5. Verify domain in Resend dashboard
6. Run `drizzle-kit push` or apply migration `0005_mail_infrastructure.sql`
7. Run migration verification queries above and confirm expected results
