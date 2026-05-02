# Agent ID — DNS Configuration for getagent.id

Complete Cloudflare DNS record configuration for production mail and web services.

## Required DNS Records

### MX Records (Mail Receiving)

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| MX | getagent.id | `inbound-smtp.resend.com` | 10 | Auto |
| MX | getagent.id | `feedback-smtp.resend.com` | 20 | Auto |

### SPF Record (Sender Authorization)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | getagent.id | `v=spf1 include:resend.com ~all` | Auto |

### DKIM Record (Email Signing)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `resend._domainkey.getagent.id` | *(Provided by Resend after domain verification)* | Auto |

After adding the domain in Resend's dashboard, copy the DKIM CNAME or TXT value they provide and add it here.

### DMARC Record (Policy & Reporting)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `_dmarc.getagent.id` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@getagent.id; pct=100; adkim=s; aspf=s` | Auto |

### Wildcard A Record (Agent Subdomains)

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `*.getagent.id` | *(Server IP)* | Proxied |

This enables `handle.getagent.id` web domains for all registered agents.

### Root A/CNAME Record

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `getagent.id` | *(Server IP)* | Proxied |

## Setup Steps

1. **Add domain in Resend**: Go to Resend dashboard > Domains > Add Domain > enter `getagent.id`.
2. **Add MX records**: In Cloudflare DNS, add both MX records listed above.
3. **Add SPF record**: Add the TXT record for SPF authorization.
4. **Add DKIM record**: Copy the DKIM value from Resend and add as a TXT (or CNAME) record.
5. **Add DMARC record**: Add the DMARC TXT record with the policy above.
6. **Add wildcard A record**: Point `*.getagent.id` to your server IP with Cloudflare proxy enabled.
7. **Verify in Resend**: Click "Verify DNS" in Resend dashboard. All records should turn green.
8. **Configure inbound webhook**: In Resend, set inbound webhook URL to `https://getagent.id/api/v1/webhooks/resend/inbound`. Resend will accept mail at the MX records, then POST the parsed email (including base64-encoded `content` or `content_url` for each attachment) to this webhook.
9. **Set environment variables**: Add `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` to production environment. For attachment storage at scale, also set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` (otherwise inbound attachments larger than 500 KB are dropped).

## Inbound Mail Behaviour

Once the records above are live, the API does the following for every inbound email:

1. **Signature check** — The webhook is rejected unless the Svix signature matches `RESEND_WEBHOOK_SECRET`.
2. **Recipient routing** — Each `To:` address is matched first against the agent inbox table and then against the agent handle table (catch-all by handle). Unknown handles, agents on a non-mail plan, and inactive inboxes are recorded in `undeliverable_messages` and an NDR is sent back to the original sender via Resend (skipped for senders on `getagent.id` to avoid loops).
3. **Body + attachment ingest** — The plaintext / sanitized HTML body is stored on the `agent_messages` row. Each attachment is decoded from base64 (or fetched from `content_url` with SSRF protection), uploaded via the configured backend (R2 if available, inline ≤ 500 KB otherwise), and written to `message_attachments`. Per-message limits from `ATTACHMENT_LIMITS` are enforced (10 files, 100 MB on R2 / 500 KB inline).
4. **Notifications + webhooks** — A `mail.received` webhook event is fired and an owner notification is queued.

## Cloudflare Settings

- **SSL/TLS**: Full (strict)
- **Always Use HTTPS**: On
- **Minimum TLS Version**: 1.2
- **Auto Minify**: CSS, JS, HTML enabled
- **Brotli**: On

## Verification

After DNS propagation (typically 5-60 minutes):

```bash
# Verify MX records
dig MX getagent.id

# Verify SPF
dig TXT getagent.id

# Verify DKIM
dig TXT resend._domainkey.getagent.id

# Verify DMARC
dig TXT _dmarc.getagent.id

# Verify wildcard
dig A test-agent.getagent.id
```
