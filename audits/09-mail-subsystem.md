# Audit 09 — Mail Subsystem (Inbound + Outbound + Attachments)

**Scope:** End-to-end review of the Agent ID mail pipeline — DNS posture, inbound webhook ingest, parsing, recipient routing, persistence, attachment storage and scanning, outbound delivery, replies, bounces, NDRs, plan gating, quota enforcement, and abuse vectors.

**Out of scope:** Implementing fixes, hosting an SMTP daemon ourselves, deep static analysis of upstream Resend/ClamAV.

**Status legend:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low / informational

---

## 1. End-to-end flow

```
                 ┌────────────────────────────────────────────────────────────┐
                 │                  EXTERNAL INTERNET                         │
                 │                                                            │
   Sender MTA ──►│  DNS lookup MX getagent.id                                 │
   (foo@bar.com) │     → 10 inbound-smtp.resend.com                           │
                 │     → 20 feedback-smtp.resend.com                          │
                 │                                                            │
                 │  SMTP delivery to Resend (SPF / DKIM / DMARC enforced      │
                 │  by Resend per its policy; we publish SPF "include:        │
                 │  resend.com ~all" and DMARC p=quarantine).                 │
                 └─────────────────────────┬──────────────────────────────────┘
                                           │
                                           ▼
                 ┌────────────────────────────────────────────────────────────┐
                 │                       RESEND                               │
                 │  Parses RFC822 → JSON, base64-encodes attachments (or      │
                 │  presigns content_url), POSTs to:                          │
                 │  https://getagent.id/api/v1/webhooks/resend/inbound        │
                 │  (Svix-signed: svix-id / svix-timestamp / svix-signature)  │
                 └─────────────────────────┬──────────────────────────────────┘
                                           │ HTTPS POST (raw body required)
                                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  artifacts/api-server  (Express)                                             │
 │                                                                              │
 │  POST /api/v1/webhooks/resend/inbound  →  routes/v1/resend-webhooks.ts       │
 │    1. Read req.rawBody (preserved by middleware for signature check).        │
 │    2. verifyResendWebhookSignature(rawBody, svixHeaders, secret)             │
 │       — HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`           │
 │       — 5-min replay window                                                  │
 │       — fail-closed if RESEND_WEBHOOK_SECRET unset (but returns 200)         │
 │    3. parseInboundEmail(payload)        services/mail-inbound.ts             │
 │       — extract from / to[]                                                  │
 │       — sanitize HTML (sanitize-html w/ rel=noopener target=_blank)          │
 │       — detect priority (Importance / X-Priority / subject [URGENT])         │
 │       — collect attachments (base64 inline OR content_url)                   │
 │    4. routeInboundEmail(parsed)                                              │
 │         a. Dedup by externalMessageId (Message-ID header)                    │
 │         b. lookupSenderTrust() if @getagent.id sender                        │
 │         c. for each recipient address:                                       │
 │              ─ Match agentInboxesTable.address                               │
 │              ─ else fallback: agentsTable.handle == localpart                │
 │              ─ Plan gate:  PLANS_WITH_MAIL = starter|pro|enterprise          │
 │              ─ Status gate: inbox.status === "active"                        │
 │            On reject: insert undeliverable_messages (30d TTL)                │
 │                       + sendInboundBounceNdr (NDR via Resend)                │
 │            On accept: mailService.sendMessage(direction=inbound)             │
 │                       └► persists agent_message + thread + provenance        │
 │                       └► emits message.received webhook + event              │
 │            For attachments: persistInboundAttachments()                      │
 │                       └► uploadAttachment (R2 or inline ≤500KB)              │
 │                       └► scanAttachment (ClamAV INSTREAM, 25MB cap)          │
 │                          ─ infected: delete object, keep tombstone row       │
 │                          ─ unscanned: keep, flagged                          │
 │                          ─ clean: keep, marked clean                         │
 │            Notification: queueMessageNotification(owner.email) — 5-min       │
 │                          batch window via mail-templates.ts                  │
 │            Webhook event: deliverWebhookEvent("mail.received")               │
 └─────────────────────────┬────────────────────────────────────────────────────┘
                           │
              ┌────────────┴───────────┐
              ▼                        ▼
 ┌─────────────────────────┐  ┌──────────────────────────────────────────────┐
 │ Postgres (Drizzle)      │  │ Cloudflare R2 (S3-compatible)                │
 │  agent_inboxes          │  │   key: attachments/{agentId}/{messageId}/    │
 │  agent_threads          │  │        {checksum8}/{safeFilename}            │
 │  agent_messages         │  │   presigned GET URL TTL = 1h                 │
 │  message_attachments    │  └──────────────────────────────────────────────┘
 │  message_events         │
 │  inbound_transport_evts │  ┌──────────────────────────────────────────────┐
 │  undeliverable_messages │  │ ClamAV daemon (TCP zINSTREAM, 25 MB cap)     │
 │  inbox_webhooks         │  │   Optional — if CLAMAV_HOST unset → all      │
 │  outbound_msg_deliveries│  │   files marked "unscanned" (fail-OPEN)       │
 └─────────────────────────┘  └──────────────────────────────────────────────┘

OUTBOUND (agent → external) — services/mail-transport.ts
   sendMessage(direction=outbound) ──► deliverOutbound(envelope)
       resolveTransportProvider(to):
         InternalTransportProvider  if to ends in @getagent.id  (no-op success)
         ResendTransportProvider    otherwise  (requires RESEND_API_KEY)
         WebhookTransportProvider   final fallback (no-op success)
       BullMQ queue "outbound-mail" with jobId=`outbound-${messageId}`
         attempts=3, exponential backoff (or 1 if noRetry)
       Worker: workers/outbound-mail.ts → ResendTransportProvider.send
         Adds X-AgentID-Platform / X-Agent-ID / X-Agent-Handle /
              X-Agent-Trust-Score headers (provenance)
   recordOutboundDeliveryResult → outbound_message_deliveries

REPLY  — replyToThread(agentId, threadId, body)
   Looks up last inbound message in thread → sets inReplyToId
   sendMessage(outbound) → deliverOutbound (Resend)
   ⚠ External In-Reply-To / References RFC-822 headers are NOT set on the
     outbound envelope — see Finding O-3.

LOCAL LOOP  — outbound to *@getagent.id
   sendMessage(outbound) → deliverOutbound returns success (Internal provider)
   Then a SECOND sendMessage(direction=inbound) is invoked for the recipient
   inbox (mail.ts:921-948).  See Finding L-1 (recursion / loop risk).

BOUNCE / DELIVERY EVENTS — POST /api/v1/webhooks/resend/bounce
   Same Svix verification.  Updates outbound_message_deliveries +
   agent_messages.deliveryStatus.  On bounce/complaint: trustScore -= 1
   (clamped ≥ 0) for the originating agent.  Records message.bounced event.

NDR (inbound undeliverable)
   sendInboundBounceNdr() → deliverOutbound with noRetry=true
   Skipped when sender is @getagent.id, mailer-daemon@*, or postmaster@*
   ⚠ Does NOT inspect List-Id / Auto-Submitted / Precedence headers — see
     Finding I-2 (mailing-list NDR loop).
```

---

## 2. DNS posture (`DNS_SETUP.md`)

| Record  | Configured                                                                | Assessment                                                                                                                                                |
| ------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MX      | `inbound-smtp.resend.com` (10), `feedback-smtp.resend.com` (20)           | ✅ Correct for Resend Inbound. Wildcard A `*.getagent.id` doesn't shadow MX (apex MX takes precedence).                                                   |
| SPF     | `v=spf1 include:resend.com ~all`                                          | 🟡 `~all` (softfail) lets receivers still accept spoofed mail. Industry hardening is `-all` once we are confident no other sender path exists. |
| DKIM    | `resend._domainkey.getagent.id` — **placeholder** ("Provided by Resend after verification") | 🔴 If still a placeholder in production, signing is unverifiable and DMARC alignment fails. Must be populated and verified before traffic ramps. |
| DMARC   | `v=DMARC1; p=quarantine; rua=mailto:dmarc@getagent.id; pct=100; adkim=s; aspf=s` | 🟡 `p=quarantine` is a reasonable launch state; should graduate to `p=reject` after 30 d clean RUA reports. `dmarc@getagent.id` mailbox must exist and be monitored — currently no inbox is provisioned for it (treated as "unknown_recipient" by router). |
| MTA-STS / DANE | Not published                                                       | 🟡 Optional but encouraged for an identity-platform domain — makes downgrade attacks impossible against compliant senders.                       |
| TLS-RPT  | Not published                                                            | 🟢 Nice-to-have; surfaces TLS handshake failures from senders.                                                                                            |
| BIMI     | Not published                                                            | 🟢 Brand reinforcement; requires `p=quarantine`+ and a VMC. Defer.                                                                                        |
| Wildcard A `*.getagent.id` | Proxied through Cloudflare                                  | 🟢 Fine. Note the wildcard creates `dmarc.getagent.id`, `mailer-daemon.getagent.id`, etc., but Cloudflare returns the proxy IP — no information leak.    |

**Action items (DNS):**
1. Confirm DKIM TXT/CNAME is actually set — `DNS_SETUP.md` shows the value as "(Provided by Resend after domain verification)" which is suggestive that it may not be live. Block on this.
2. Provision a real mailbox for `dmarc@getagent.id` (or forward to a parsed RUA processor) — otherwise aggregate reports bounce silently.
3. Schedule SPF tightening to `-all` and DMARC to `p=reject` after a monitored ramp.

---

## 3. Inbound webhook ingest

### Findings

**I-1 🟡 — Webhook returns HTTP 200 even on signature failure** (`routes/v1/resend-webhooks.ts:42, 97`).
The handler responds `200 { ok:true, error:"invalid_signature" }` when Svix verification fails. This is a deliberate "don't tell the attacker we rejected" choice, but it also means:
- A misconfigured `RESEND_WEBHOOK_SECRET` produces silent dropping with no visible 4xx/5xx alarm — only a `logger.warn`.
- Resend treats 2xx as "delivered, do not retry," so on legitimate transient secret rotation we *permanently lose* messages.
- Recommended: return `401`/`403` for signature failures (spec-compliant for webhook receivers and what Resend retries against), and `503` when the secret is unset so the webhook backs off rather than silently dropping. Keep verbose payload echoing out of the body either way.

**I-2 🟠 — NDR loop hardening is incomplete** (`mail-inbound.ts:355-409`).
`sendInboundBounceNdr` skips senders ending `@getagent.id`, `mailer-daemon@`, and `postmaster@`. It does **not** inspect:
- `List-Id`, `List-Unsubscribe`, `List-Post` (mailing-list traffic)
- `Auto-Submitted: auto-replied|auto-generated|auto-notified` (RFC 3834)
- `Precedence: bulk|list|junk`
- `Return-Path: <>` (null sender — RFC 5321)
Consequence: a single misaddressed mailing-list post can trigger an NDR that the list reflects to all subscribers, who in turn… nothing happens, but our NDR generator looks like a backscatter source and harms our sender reputation. Add header checks before generating NDRs.

**I-3 🟡 — No payload size cap on the webhook body.**
We rely on whatever default body limit `express.json()` is configured with at the app level (not visible in this file). A malicious actor that compromises a Resend integration token could POST gigabyte payloads. Recommend an explicit `express.json({ limit: "10mb" })` for the webhook router and a 413 short-circuit before signature verification.

**I-4 🟡 — No per-source rate limit on `/webhooks/resend/inbound`.**
Signature verification is the only gate. If the secret leaks once, an attacker can replay-forge inbound messages at unbounded RPS. Add Redis-backed sliding-window rate limit (e.g. 50 RPS) with bypass on a list of Resend egress CIDRs or mTLS pinning where supported.

**I-5 🟢 — Replay window is sane.** 5-minute timestamp tolerance with timing-safe HMAC comparison and constant-time signature parse. Good.

**I-6 🟢 — Dedup by `Message-ID` works.** `agent_messages.externalMessageId` is checked before insert. Note: the dedup check is global, not per-recipient — a single Message-ID delivered to multiple recipients on our side will only be persisted once. That matches RFC 5322 expectations but worth documenting.

**I-7 🟡 — Recipient enumeration via NDR.**
NDRs are sent for `unknown_recipient`. An attacker can send mail to `a@`, `b@`, … and infer which handles exist by which addresses NDR vs which are silently accepted. The NDR text itself even names the address ("The address X does not exist"). This is the classic "valid recipient discovery." Mitigations:
- Same NDR copy for `unknown_recipient` and `plan_not_eligible`, OR
- Rate-limit NDRs per sender (e.g. 1/min per envelope sender), OR
- Greylist new sender↔recipient pairs.

---

## 4. Routing logic (`mail-inbound.ts:routeInboundEmail`)

**I-8 🟢 — Order: inbox → handle fallback → plan gate → status gate.** Reasonable. Plan gate uses a hard-coded allowlist (`["starter","pro","enterprise"]`) which **duplicates** the source-of-truth in `services/billing.ts:getPlanLimits().canReceiveMail`. Recommendation: import `getPlanLimits(plan).canReceiveMail` and let the launch-mode `LAUNCH_MODE=true` override flow from one place. Otherwise launch mode silently lets agents create inboxes but inbound mail is still rejected.

**I-9 🟡 — `getOrCreateInbox` is called inside the recipient loop with no error rollback.**
If `getOrCreateInbox` throws after the undeliverable row has already been inserted for a sibling recipient, the loop keeps going (`continue`), but the second `findFirst` (`mail-inbound.ts:518`) silently produces `targetInbox=undefined` for the just-created agent because it's racing against a transaction that may not have committed in some pool configurations. Recommend wrapping the per-recipient block in a transaction or fetching by `agent.id` rather than re-querying by address.

**I-10 🟢 — In-reply-to threading.** Uses `externalInReplyTo` to look up parent message scoped by recipient `agentId`, preventing cross-agent thread bleed.

**I-11 🟢 — HTML sanitization on inbound is comprehensive.** sanitize-html with allowedTags / allowedSchemes (incl. `cid:` for inline images), all anchors rewritten with `rel="noopener noreferrer" target="_blank"`. ✅ No CSS-injection or `javascript:` href escape on inspection.

---

## 5. Outbound delivery

**O-1 🟠 — Outbound HTML body is NOT sanitized.** `sendMessage` accepts `body` and `bodyFormat:"html"` and forwards it to Resend verbatim (`mail-transport.ts:115`). The agent owner authoring the message is in control, but routing rules can also auto-reply with attacker-controlled body content from inbound mail (`mail.ts:executeAction` → `auto_reply`). If an inbound email carries malicious markup that gets quoted/echoed by an agent rule, we'd relay live JS/CSS-injection to the next recipient. Add the same `sanitizeHtml()` from `mail-inbound.ts` on outbound HTML before handing to Resend.

**O-2 🟠 — Outbound rate limit is 1-hour rolling window only.** `mail-transport.ts:174-192`:
- starter = 100/h
- pro = 1000/h
- enterprise = unlimited
There is no per-day cap (so `pro` = 24,000/day = bulk-marketer territory) and **no per-thread / per-recipient** burst control. Recommend layered limits: per-hour, per-day, per-recipient-per-hour. Crucially, `sendMessage` does **not consult `checkOutboundRateLimit` itself** — the function exists and is exported but never invoked in `sendMessage`. Search confirms zero call sites in the production path; it appears only to be referenced by routes/middleware. **This is the headline finding: hourly limit is essentially unenforced from the core send path.** Action: insert the check inside `sendMessage` for `direction === "outbound" && isExternalAddress(recipientAddress)`.

**O-3 🟡 — Missing RFC 5322 `In-Reply-To` and `References` headers on outbound replies.** `replyToThread` populates our internal `inReplyToId` but `ResendTransportProvider.send` never emits the RFC headers. Result: replies break threading in receiver MUAs (Gmail / Outlook show them as new threads). The required header is the original `Message-Id`, not our internal UUID. Add a join from `agent_messages.externalMessageId` of the parent to the headers map in `mail-transport.ts:110-116`.

**O-4 🟡 — `Message-Id` / `Date` headers are produced by Resend, not by us.** OK in practice but means we cannot self-stamp messages for dedup before send. Worth knowing during incident analysis.

**O-5 🟢 — Job-level dedup.** BullMQ `jobId = "outbound-${messageId}"` makes the queue reject double-insertions. Good defense against double-delivery on retry storms.

**O-6 🟡 — `WebhookTransportProvider` is a silent success.** `mail-transport.ts:133-147` returns success with a fake `webhook-${messageId}` provider id. If RESEND_API_KEY is unset, external-bound mail falls through to this, but `deliverOutbound` does have an explicit guard at line 215-224 that returns failure for that path. Still, the existence of a "always-success no-op" provider as the last-resort fallback is a foot-gun if the order in `providers[]` is ever reshuffled. Recommend deleting `WebhookTransportProvider` or making it explicitly fail-closed.

**O-7 🟡 — `enrichEnvelopeWithAgentInfo` defaults `trustScore` to `0`** (`mail-transport.ts:275`) when the agent lookup fails. Trust score `0` then gets stamped into the `X-Agent-Trust-Score` header. Receiving systems would interpret a real trust-zero score as "untrusted" — ambiguity between "lookup failed" and "score actually zero." Either omit the header on lookup failure or use a sentinel like `unknown`.

---

## 6. Local @getagent.id loop

**L-1 🟠 — Recursive `sendMessage` invocation for local addresses** (`mail.ts:921-949`).
When an agent sends outbound mail to another `@getagent.id` address, we call `sendMessage` again with `direction:"inbound"`. If the recipient inbox's routing rules trigger an `auto_reply` back to the sender, and the sender is also a local inbox with auto-reply rules… we infinite-loop. The per-call `sendMessage` does no loop-counter / `Auto-Submitted` injection.
- Mitigation: stamp `metadata.autoSubmittedFrom = senderAgentId` on the cascading inbound message and refuse to apply `auto_reply` rules when present, OR maintain a per-thread auto-reply throttle (e.g. ≤ 1 auto-reply per agent per thread per hour).

**L-2 🟢 — Internal mail does not consume Resend quota.** `InternalTransportProvider.canDeliver` matches local domain and returns success without hitting Resend. ✅

---

## 7. Attachments

**A-1 🟠 — ClamAV scanner is fail-OPEN.** `attachment-scanner.ts:64-74`:
- No `CLAMAV_HOST` → `unscanned`
- Buffer > 25 MB → `unscanned`
- Scanner timeout / TCP error → `unscanned`
The attachment is still stored and downloadable in all three cases. This is documented in the file header but it means an attacker can:
- Defeat scanning entirely by uploading 26 MB files.
- Defeat scanning during ClamAV outages by simply timing the upload right.
There is **no retro-scan job** that re-processes `scanStatus = "unscanned"` rows once the scanner returns. Recommend:
1. A nightly worker that re-queues `unscanned` attachments for scanning while CLAMAV_HOST is set.
2. For `payload_too_large`, decompose ZIP/archive entries (or just refuse uploads > 25 MB on the inbound path — currently inbound limit is 100 MB so the gap is 25-100 MB which silently bypasses scanning).

**A-2 🟡 — Per-message limit only; no per-agent / per-day total.** `ATTACHMENT_LIMITS.maxFilesPerMessage = 10` and `maxFileSizeBytes = 100 MB` (R2) caps a single message at 1 GB. Nothing prevents an attacker who controls a sending domain from delivering 10 messages × 1 GB = 10 GB / minute against a single inbox. Plan-tier storage quotas should be added.

**A-3 🟡 — MIME allowlist is content-type-trusted.** `persistInboundAttachments` accepts the `content_type` Resend reports and either keeps it or replaces with `application/octet-stream`. We never sniff the actual file magic. An attacker can label a `.exe` as `text/plain` and we'll store and serve it (with the wrong MIME). Add a magic-byte check (`file-type` package) before deciding the allowlist outcome.

**A-4 🟡 — SVG is allowed.** `image/svg+xml` is on the allowlist. SVG can carry `<script>` and `<foreignObject>` payloads. If we ever embed attachments inline (e.g. inbox preview), this becomes XSS. Either drop SVG from the allowlist or hard-strip it through `DOMPurify` server-side before serving.

**A-5 🟡 — `archive/zip` and `gzip` are allowed without extraction or scanning.** ClamAV will inspect ZIP contents, but only up to its `ArchiveMaxScanSize` / `MaxFileSize` (default 100 MB / 25 MB). Compressed bombs (zip-of-zips) won't trigger malware sigs and we don't enforce a recursion / decompression-ratio limit. Either drop zip from the allowlist or front-end with a decompression budget check.

**A-6 🟠 — Presigned URL TTL = 1 hour, but no signed-URL revocation.** `attachment-storage.ts:18`. If a presigned URL leaks (e.g. logged, shared in chat), it's valid for an hour with no revocation path. Combined with `R2_PUBLIC_URL` mode where the URL is permanent, an attacker who learns one attachment URL can read it forever. Recommend:
- Documenting that `R2_PUBLIC_URL` means "no per-object access control."
- Or routing all reads through an authenticated `GET /v1/messages/:id/attachments/:id` endpoint that proxies the bytes after auth check.

**A-7 🟡 — Filename sanitization is regex-based.** `[^a-zA-Z0-9._-]` → `_`. Length capped at 500 chars. Does not strip leading dots (hidden files), path traversal would already be neutered by R2 key construction, and Windows-reserved names (`CON`, `PRN`, `NUL.txt`) are not blocked. Low risk because we serve via presigned URL, not filesystem, but worth noting if attachments are ever exported to disk.

**A-8 🟡 — No orphan-object reaper.** If an `agent_messages` row is deleted (user delete, GDPR erasure, etc.) the `message_attachments` rows and R2 objects are not necessarily cleaned up — there is no visible cascade or background sweeper. The only attachment-related background worker is `undeliverable-cleanup` which deletes rows from `undeliverable_messages` after expiry but does **not** purge stored attachment bytes from R2. (Undeliverable messages don't currently store R2 attachments anyway, but the symmetry gap is concerning for hard-delete / GDPR responses.)

**A-9 🟢 — SSRF guard on `content_url` fetch is correct.** `mail-inbound.ts:188-219` uses `resolveAndValidateHostname`, 15 s timeout, size limit, scheme allowlist. Good.

**A-10 🟢 — Checksum + dedup-friendly key path.** R2 key embeds first 8 chars of SHA-256, allowing future content-addressed dedup. (Not used today — every store writes a fresh object — but the schema supports it.)

---

## 8. Quotas, gating, and abuse vectors

| Vector | Current control | Verdict |
|---|---|---|
| Spoofed sender (forged `From:`) | SPF softfail + DMARC quarantine. Receivers will still accept but flag. | 🟡 Tighten DMARC to reject after monitoring. |
| Rapid recipient enumeration via NDR | None — NDR text reveals address existence. | 🟠 See I-7. |
| Inbound DDoS on webhook | None (no rate limit, no body size limit). | 🟡 See I-3, I-4. |
| Bulk outbound spam from a paid agent | `RATE_LIMITS` defined but **never invoked** by `sendMessage`. | 🔴 See O-2 — flagship abuse hole. |
| Loop via auto-reply | `noRetry` + sender skiplist on NDR; no Auto-Submitted check; no per-thread cap. | 🟠 See I-2, L-1. |
| Malware delivery | ClamAV INSTREAM if configured; fail-OPEN otherwise; no retroscan; archives uninspected for bombs. | 🟠 See A-1, A-5. |
| MIME-spoofed payload | None — content-type is trusted. | 🟡 See A-3. |
| Inline XSS via attachment | SVG allowed; outbound HTML unsanitized. | 🟡/🟠 See A-4, O-1. |
| Storage bomb (large/many attachments) | Per-message 10×100MB; no per-agent / per-day. | 🟡 See A-2. |
| Presigned-URL leak | TTL=1h or permanent (if R2_PUBLIC_URL). No revocation. | 🟠 See A-6. |
| GDPR erasure of mail | No cascade sweep on attachments. | 🟡 See A-8. |
| Webhook secret leak | Re-validation via timestamp window only; no rate limit. | 🟡 See I-4. |
| Bounce → reputation feedback | -1 trust on bounce/complaint, clamped ≥0. | 🟢 Reasonable, but no positive reinforcement on successful delivery. |

---

## 9. Notifications & UI

- `mail-templates.ts:queueMessageNotification` batches owner notifications in a 5-minute in-process map. **State is lost on restart** and **not shared across replicas**. With multiple API server instances each instance batches independently, so the user can receive N parallel batched emails (one per replica). 🟡 — recommend Redis-backed batching.
- `Mail.tsx` uses DOMPurify on the client for any HTML rendering — defense in depth, good. (Did not deeply audit; outside of mail-pipeline scope.)

---

## 10. Test coverage observed

Search for `mail-` and `attachment-` test files:
- `__tests__/mail-gating.unit.test.ts` — plan gating (good).
- `__tests__/ssrf-guard.test.ts` — SSRF utility (good).
- No unit tests located for: webhook signature verification, NDR loop suppression, attachment scanner fail-open paths, outbound rate limiter, sanitize-html allowed-tag policy, or the `@getagent.id` local-loop recursion path.

Recommendation: add at minimum
1. `mail-inbound.signature.test.ts` — secret rotation, replay, malformed headers.
2. `mail-inbound.ndr.test.ts` — `Auto-Submitted`, `List-Id`, mailer-daemon@.
3. `mail-transport.rate-limit.test.ts` — once `checkOutboundRateLimit` is wired into `sendMessage`.
4. `attachment-scanner.fail-open.test.ts` — unconfigured / oversized / timeout paths.

---

## 11. Prioritized findings summary

| # | Severity | Area | Title |
|---|----------|------|-------|
| O-2 | 🔴 | Outbound | `checkOutboundRateLimit` is exported but never invoked from `sendMessage`. Outbound caps unenforced. |
| DKIM | 🔴 | DNS | DKIM CNAME/TXT documented as "(Provided by Resend after verification)" — verify it is live in production. |
| I-7 | 🟠 | Inbound | NDR text reveals which addresses exist → enumeration. |
| I-2 | 🟠 | Inbound | NDR generation does not honor `Auto-Submitted`/`List-Id`/null Return-Path. |
| L-1 | 🟠 | Local loop | Recursive `sendMessage` for local addresses with no loop-counter / Auto-Submitted header. |
| O-1 | 🟠 | Outbound | Outbound HTML body is forwarded to Resend without sanitization. |
| A-1 | 🟠 | Attachments | ClamAV scanner is fail-open with no retro-scan worker. |
| A-6 | 🟠 | Attachments | Presigned URLs cannot be revoked; `R2_PUBLIC_URL` mode is permanent. |
| I-1 | 🟡 | Inbound | Webhook signature failures return 200 — silent loss on misconfig. |
| I-3 | 🟡 | Inbound | No explicit body-size cap on the webhook. |
| I-4 | 🟡 | Inbound | No rate limit on the webhook beyond signature check. |
| I-8 | 🟡 | Inbound | Plan allowlist duplicated; should call `getPlanLimits().canReceiveMail`. |
| I-9 | 🟡 | Inbound | Recipient loop racy when `getOrCreateInbox` throws. |
| O-3 | 🟡 | Outbound | RFC 5322 `In-Reply-To`/`References` not set — breaks MUA threading. |
| O-6 | 🟡 | Outbound | `WebhookTransportProvider` is a no-op success fallback (foot-gun). |
| O-7 | 🟡 | Outbound | Trust score defaults to `0` on lookup failure — ambiguous. |
| A-2 | 🟡 | Attachments | No per-agent / per-day attachment quota. |
| A-3 | 🟡 | Attachments | MIME is trusted from sender, no magic-byte check. |
| A-4 | 🟡 | Attachments | SVG allowed without sanitization. |
| A-5 | 🟡 | Attachments | ZIP/GZIP allowed without decompression-ratio limit (zip-bomb). |
| A-7 | 🟡 | Attachments | Filename sanitization permits hidden / Windows-reserved names. |
| A-8 | 🟡 | Attachments | No orphan-object reaper; GDPR cascade gap. |
| Notif | 🟡 | Notifications | In-process notification batching breaks across replicas / restarts. |
| SPF | 🟡 | DNS | `~all` should tighten to `-all`. |
| DMARC mailbox | 🟡 | DNS | `dmarc@getagent.id` RUA mailbox not provisioned. |
| DMARC policy | 🟡 | DNS | `p=quarantine` should graduate to `p=reject` after monitoring. |
| MTA-STS / TLS-RPT | 🟡 | DNS | Not published. |
| I-5 | 🟢 | Inbound | Replay window + timing-safe HMAC — good. |
| I-6 | 🟢 | Inbound | Message-ID dedup — good (document scope). |
| I-10 | 🟢 | Inbound | In-reply-to scoped per agent — good. |
| I-11 | 🟢 | Inbound | sanitize-html policy is comprehensive. |
| O-5 | 🟢 | Outbound | BullMQ `jobId` dedup — good. |
| L-2 | 🟢 | Local loop | Internal delivery doesn't burn Resend quota. |
| A-9 | 🟢 | Attachments | SSRF guard on `content_url` fetch is correct. |
| A-10 | 🟢 | Attachments | Checksum-prefixed R2 keys enable future dedup. |

---

## 12. Recommended remediation order

1. **Now (pre-ramp blockers):** Verify DKIM live in production. Wire `checkOutboundRateLimit` into `sendMessage`. Fix webhook-200-on-failure to a proper 4xx/5xx (with documented Resend retry semantics). Add NDR header checks (`Auto-Submitted`, `List-Id`, Return-Path:<>). Sanitize outbound HTML.
2. **Within first sprint:** Per-agent / per-day outbound quota, per-recipient burst cap. Loop-counter on `@getagent.id` cascading sends. ClamAV retro-scan worker. Webhook body-size limit + rate limit. Presigned-URL revocation strategy (or auth-proxied attachment downloads).
3. **Later hygiene:** SPF `-all`, DMARC `p=reject`, MTA-STS / TLS-RPT, Redis-backed notification batching, magic-byte MIME check, drop SVG/zip from allowlist (or sanitize/decompress with budget), filename hardening, attachment GDPR cascade, DMARC RUA processing pipeline, test coverage above.
