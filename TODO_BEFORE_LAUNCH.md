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

## 8. Backup and Disaster Recovery

Set up automated PostgreSQL backups with defined RPO/RTO targets, document the restore procedure, and configure Redis persistence for queue durability.
