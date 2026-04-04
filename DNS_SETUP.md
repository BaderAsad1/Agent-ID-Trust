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
8. **Configure inbound webhook**: In Resend, set inbound webhook URL to `https://getagent.id/api/v1/webhooks/resend/inbound`.
9. **Set environment variables**: Add `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` to production environment.

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
