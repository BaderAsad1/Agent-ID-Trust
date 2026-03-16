# TODO Before Launch

Items that must be resolved before the first production release.

---

## 1. Stripe Connect Seller Payouts

Implement Stripe Connect account onboarding, automated Transfers, and payout webhooks so marketplace sellers receive real payouts instead of the current `pending_manual_payout` ledger status.

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
