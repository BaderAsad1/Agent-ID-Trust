import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import sanitizeHtmlLib from "sanitize-html";
import { db } from "@workspace/db";
import {
  agentInboxesTable,
  agentMessagesTable,
  agentsTable,
  agentSubscriptionsTable,
  messageAttachmentsTable,
  undeliverableMessagesTable,
  usersTable,
} from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";
import * as mailService from "./mail";
import { queueMessageNotification } from "./mail-templates";
import { deliverOutbound } from "./mail-transport";
import { uploadAttachment, deleteAttachment, ATTACHMENT_LIMITS } from "../lib/attachment-storage";
import { scanAttachment } from "../lib/attachment-scanner";
import { resolveAndValidateHostname } from "../lib/ssrf-guard";

export interface ResendInboundPayload {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Array<{ name: string; value: string }>;
    message_id?: string;
    in_reply_to?: string;
    cc?: string;
    bcc?: string;
    reply_to?: string;
    attachments?: Array<{
      filename: string;
      content_type: string;
      size: number;
      content?: string;
      content_url?: string;
    }>;
  };
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  contentUrl?: string;
}

export interface ParsedInboundEmail {
  from: string;
  to: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  sanitizedHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  priority: string;
  isAgentIdSender: boolean;
  senderTrustScore: number | null;
  senderAgentId: string | null;
  headers: Record<string, string>;
  attachments: ParsedAttachment[];
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw.trim();
}

function detectPriority(headers: Record<string, string>, subject: string | null): string {
  const importance = headers["importance"]?.toLowerCase();
  const xPriority = headers["x-priority"];
  const priority = headers["priority"]?.toLowerCase();

  if (importance === "high" || priority === "urgent" || xPriority === "1") return "urgent";
  if (xPriority === "2") return "high";
  if (importance === "low" || xPriority === "5") return "low";

  if (subject) {
    const lower = subject.toLowerCase();
    if (lower.includes("[urgent]") || lower.includes("urgent:")) return "urgent";
    if (lower.includes("[important]")) return "high";
  }

  return "normal";
}

function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "a", "b", "blockquote", "br", "caption", "cite", "code", "col",
      "colgroup", "dd", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4",
      "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "q", "small",
      "span", "strike", "strong", "sub", "sup", "table", "tbody", "td",
      "tfoot", "th", "thead", "tr", "u", "ul",
    ],
    allowedAttributes: {
      "a": ["href", "name", "target", "rel"],
      "img": ["src", "alt", "title", "width", "height"],
      "*": ["style", "class"],
    },
    allowedStyles: {
      "*": {
        "color": [/.*/],
        "background-color": [/.*/],
        "font-size": [/.*/],
        "font-weight": [/.*/],
        "text-align": [/.*/],
        "margin": [/.*/],
        "padding": [/.*/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { "img": ["http", "https", "cid"] },
    transformTags: {
      "a": (_tagName: string, attribs: Record<string, string>) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
      }),
    },
  });
}

export function parseInboundEmail(payload: ResendInboundPayload): ParsedInboundEmail {
  const data = payload.data;
  const from = extractEmailAddress(data.from);
  const toRaw = Array.isArray(data.to) ? data.to : [data.to];
  const to = toRaw.map(extractEmailAddress);

  const headersMap: Record<string, string> = {};
  if (data.headers) {
    for (const h of data.headers) {
      headersMap[h.name.toLowerCase()] = h.value;
    }
  }

  const subject = data.subject || null;
  const textBody = data.text || null;
  const htmlBody = data.html || null;
  const sanitizedHtml = htmlBody ? sanitizeHtml(htmlBody) : null;
  const messageId = data.message_id || headersMap["message-id"] || null;
  const inReplyTo = data.in_reply_to || headersMap["in-reply-to"] || null;
  const priority = detectPriority(headersMap, subject);

  const config = env();
  const mailDomain = config.MAIL_BASE_DOMAIN;
  const isAgentIdSender = from.endsWith(`@${mailDomain}`);

  const attachments: ParsedAttachment[] = (data.attachments || [])
    .filter((a) => a && a.filename)
    .map((a) => ({
      filename: a.filename,
      contentType: a.content_type || "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
      content: a.content,
      contentUrl: a.content_url,
    }));

  return {
    from,
    to,
    subject,
    textBody,
    htmlBody,
    sanitizedHtml,
    messageId,
    inReplyTo,
    priority,
    isAgentIdSender,
    senderTrustScore: null,
    senderAgentId: null,
    headers: headersMap,
    attachments,
  };
}

const MAX_INBOUND_ATTACHMENT_BYTES = ATTACHMENT_LIMITS.maxFileSizeBytes;
const MAX_ATTACHMENTS_PER_INBOUND = ATTACHMENT_LIMITS.maxFilesPerMessage;

async function fetchAttachmentFromUrl(url: string): Promise<Buffer | null> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    await resolveAndValidateHostname(parsed.hostname);

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        logger.warn({ url, status: res.status }, "[mail-inbound] Attachment fetch failed");
        return null;
      }
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      if (buf.length > MAX_INBOUND_ATTACHMENT_BYTES) {
        logger.warn({ url, size: buf.length, limit: MAX_INBOUND_ATTACHMENT_BYTES }, "[mail-inbound] Attachment exceeds size limit");
        return null;
      }
      return buf;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, "[mail-inbound] Attachment fetch error");
    return null;
  }
}

function decodeBase64Attachment(content: string): Buffer | null {
  try {
    const cleaned = content.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
    const buf = Buffer.from(cleaned, "base64");
    if (buf.length === 0) return null;
    if (buf.length > MAX_INBOUND_ATTACHMENT_BYTES) {
      logger.warn({ size: buf.length, limit: MAX_INBOUND_ATTACHMENT_BYTES }, "[mail-inbound] Inline attachment exceeds size limit");
      return null;
    }
    return buf;
  } catch {
    return null;
  }
}

export async function persistInboundAttachments(
  agentId: string,
  messageId: string,
  attachments: ParsedAttachment[],
): Promise<{ stored: number; skipped: number }> {
  const result = { stored: 0, skipped: 0 };
  if (!attachments.length) return result;

  const limited = attachments.slice(0, MAX_ATTACHMENTS_PER_INBOUND);
  if (attachments.length > MAX_ATTACHMENTS_PER_INBOUND) {
    result.skipped += attachments.length - MAX_ATTACHMENTS_PER_INBOUND;
    logger.warn(
      { agentId, messageId, total: attachments.length, kept: MAX_ATTACHMENTS_PER_INBOUND },
      "[mail-inbound] Truncated inbound attachments to per-message limit",
    );
  }

  for (const att of limited) {
    try {
      let buffer: Buffer | null = null;
      if (att.content) {
        buffer = decodeBase64Attachment(att.content);
      } else if (att.contentUrl) {
        buffer = await fetchAttachmentFromUrl(att.contentUrl);
      }

      if (!buffer || buffer.length === 0) {
        result.skipped++;
        logger.warn({ agentId, messageId, filename: att.filename }, "[mail-inbound] Attachment had no retrievable content");
        continue;
      }

      const safeMime = ATTACHMENT_LIMITS.allowedMimeTypes.has(att.contentType)
        ? att.contentType
        : "application/octet-stream";

      const safeFilename = (att.filename || `attachment-${randomUUID().slice(0, 8)}`).slice(0, 500);

      const stored = await uploadAttachment({
        agentId,
        messageId,
        fileName: safeFilename,
        mimeType: safeMime,
        buffer,
      });

      // Scan the file *after* upload so the scanner failure path still leaves
      // us with a normal stored attachment (just flagged unscanned).
      const scan = await scanAttachment(buffer, {
        agentId,
        messageId,
        filename: safeFilename,
      });

      if (scan.status === "infected") {
        // Purge the bytes from object storage immediately. We still persist a
        // row so the UI can render an "Attachment removed by malware scan"
        // tombstone in place of the download chip.
        if (stored.storageKey) {
          try {
            await deleteAttachment(stored.storageKey);
          } catch (delErr) {
            logger.warn(
              {
                agentId,
                messageId,
                filename: safeFilename,
                err: delErr instanceof Error ? delErr.message : String(delErr),
              },
              "[mail-inbound] Failed to delete infected attachment from storage",
            );
          }
        }

        await db.insert(messageAttachmentsTable).values({
          messageId,
          fileName: safeFilename,
          mimeType: safeMime,
          sizeBytes: buffer.length,
          storageKey: null,
          storageUrl: null,
          storageBackend: stored.backend,
          checksum: stored.checksum,
          scanStatus: "blocked",
          scanResult: scan.detail ?? null,
          scannedAt: scan.scannedAt,
        });

        result.skipped++;
        continue;
      }

      await db.insert(messageAttachmentsTable).values({
        messageId,
        fileName: safeFilename,
        mimeType: safeMime,
        sizeBytes: buffer.length,
        storageKey: stored.storageKey || null,
        storageUrl: stored.storageUrl,
        storageBackend: stored.backend,
        checksum: stored.checksum,
        scanStatus: scan.status === "clean" ? "clean" : "unscanned",
        scanResult: scan.detail ?? null,
        scannedAt: scan.status === "clean" ? scan.scannedAt : null,
      });

      result.stored++;
    } catch (err) {
      result.skipped++;
      logger.warn(
        { agentId, messageId, filename: att.filename, err: err instanceof Error ? err.message : String(err) },
        "[mail-inbound] Failed to persist inbound attachment",
      );
    }
  }

  return result;
}

async function sendInboundBounceNdr(
  parsed: ParsedInboundEmail,
  recipientAddress: string,
  reason: string,
): Promise<void> {
  if (parsed.isAgentIdSender) return;
  if (!parsed.from || parsed.from.toLowerCase().startsWith("mailer-daemon@")) return;
  if (parsed.from.toLowerCase().startsWith("postmaster@")) return;

  const config = env();
  if (!config.RESEND_API_KEY) {
    logger.info({ recipientAddress, sender: parsed.from }, "[mail-inbound] Skipping NDR (RESEND_API_KEY not configured)");
    return;
  }

  const reasonText: Record<string, string> = {
    unknown_recipient: `The address ${recipientAddress} does not exist on getagent.id.`,
    plan_not_eligible: `The address ${recipientAddress} is not currently accepting email (no active mail plan).`,
    inbox_inactive: `The mailbox at ${recipientAddress} is currently disabled.`,
  };
  const human = reasonText[reason] || `Your message to ${recipientAddress} could not be delivered.`;

  const subjectPrefix = parsed.subject ? `Undelivered: ${parsed.subject}` : "Undelivered Mail Returned to Sender";
  const body = [
    `Hi,`,
    ``,
    `Your message could not be delivered to one or more recipients.`,
    ``,
    `  Recipient: ${recipientAddress}`,
    `  Reason:    ${human}`,
    parsed.messageId ? `  Message-ID: ${parsed.messageId}` : "",
    ``,
    `No further action is required from us. If you believe this is an error, please verify the recipient address and try again.`,
    ``,
    `— getagent.id mail system`,
  ].filter(Boolean).join("\n");

  try {
    await deliverOutbound({
      messageId: `ndr-${parsed.messageId || randomUUID()}-${Date.now()}`,
      from: config.FROM_EMAIL || `mailer-daemon@${config.MAIL_BASE_DOMAIN}`,
      to: parsed.from,
      subject: subjectPrefix,
      body,
      bodyFormat: "text",
      isSystemNotification: true,
      noRetry: true,
    });
  } catch (err) {
    logger.warn(
      { recipientAddress, sender: parsed.from, err: err instanceof Error ? err.message : String(err) },
      "[mail-inbound] Failed to send NDR bounce",
    );
  }
}

export async function lookupSenderTrust(parsed: ParsedInboundEmail): Promise<ParsedInboundEmail> {
  if (!parsed.isAgentIdSender) return parsed;

  const localPart = parsed.from.split("@")[0];
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handle, localPart),
    columns: { id: true, trustScore: true },
  });

  if (agent) {
    parsed.senderAgentId = agent.id;
    parsed.senderTrustScore = agent.trustScore;
  }

  return parsed;
}

export async function checkMessageDedup(messageId: string | null): Promise<boolean> {
  if (!messageId) return false;

  const existing = await db.query.agentMessagesTable.findFirst({
    where: eq(agentMessagesTable.externalMessageId, messageId),
    columns: { id: true },
  });

  return !!existing;
}

export async function routeInboundEmail(parsed: ParsedInboundEmail): Promise<{
  delivered: number;
  undeliverable: number;
  errors: string[];
}> {
  const results = { delivered: 0, undeliverable: 0, errors: [] as string[] };

  if (parsed.messageId) {
    const isDuplicate = await checkMessageDedup(parsed.messageId);
    if (isDuplicate) {
      logger.info({ messageId: parsed.messageId }, "[mail-inbound] Duplicate message detected, skipping");
      return results;
    }
  }

  const enriched = await lookupSenderTrust(parsed);

  for (const recipientAddress of enriched.to) {
    try {
      const inbox = await db.query.agentInboxesTable.findFirst({
        where: eq(agentInboxesTable.address, recipientAddress),
      });

      if (!inbox) {
        const localPart = recipientAddress.split("@")[0];
        const agent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.handle, localPart),
          columns: { id: true },
        });

        if (!agent) {
          await db.insert(undeliverableMessagesTable).values({
            recipientAddress,
            senderAddress: enriched.from,
            subject: enriched.subject,
            body: enriched.textBody || enriched.sanitizedHtml || "",
            bodyFormat: enriched.sanitizedHtml ? "html" : "text",
            externalMessageId: enriched.messageId,
            reason: "unknown_recipient",
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
          results.undeliverable++;
          await sendInboundBounceNdr(enriched, recipientAddress, "unknown_recipient");
          continue;
        }

        const subscription = await db.query.agentSubscriptionsTable.findFirst({
          where: and(
            eq(agentSubscriptionsTable.agentId, agent.id),
            eq(agentSubscriptionsTable.status, "active"),
          ),
          columns: { plan: true },
        });

        const plan = subscription?.plan || "none";
        const PLANS_WITH_MAIL = ["starter", "pro", "enterprise"];
        if (!PLANS_WITH_MAIL.includes(plan)) {
          await db.insert(undeliverableMessagesTable).values({
            recipientAddress,
            senderAddress: enriched.from,
            subject: enriched.subject,
            body: enriched.textBody || enriched.sanitizedHtml || "",
            bodyFormat: enriched.sanitizedHtml ? "html" : "text",
            externalMessageId: enriched.messageId,
            reason: "plan_not_eligible",
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
          results.undeliverable++;
          await sendInboundBounceNdr(enriched, recipientAddress, "plan_not_eligible");
          continue;
        }

        const newInbox = await mailService.getOrCreateInbox(agent.id);
        if (!newInbox) {
          results.undeliverable++;
          continue;
        }
      }

      const targetInbox = inbox || await db.query.agentInboxesTable.findFirst({
        where: eq(agentInboxesTable.address, recipientAddress),
      });

      if (!targetInbox || targetInbox.status !== "active") {
        const reason = targetInbox ? "inbox_inactive" : "unknown_recipient";
        await db.insert(undeliverableMessagesTable).values({
          recipientAddress,
          senderAddress: enriched.from,
          subject: enriched.subject,
          body: enriched.textBody || enriched.sanitizedHtml || "",
          bodyFormat: enriched.sanitizedHtml ? "html" : "text",
          externalMessageId: enriched.messageId,
          reason,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        results.undeliverable++;
        await sendInboundBounceNdr(enriched, recipientAddress, reason);
        continue;
      }

      const body = enriched.textBody || enriched.sanitizedHtml || "";
      const bodyFormat = enriched.sanitizedHtml && !enriched.textBody ? "html" : "text";

      let inReplyToId: string | undefined;
      if (enriched.inReplyTo) {
        const parentMsg = await db.query.agentMessagesTable.findFirst({
          where: and(
            eq(agentMessagesTable.externalMessageId, enriched.inReplyTo),
            eq(agentMessagesTable.agentId, targetInbox.agentId),
          ),
          columns: { id: true },
        });
        if (parentMsg) {
          inReplyToId = parentMsg.id;
        }
      }

      const message = await mailService.sendMessage({
        agentId: targetInbox.agentId,
        direction: "inbound",
        senderType: enriched.isAgentIdSender ? "agent" : "external",
        senderAgentId: enriched.senderAgentId || undefined,
        senderAddress: enriched.from,
        recipientAddress,
        subject: enriched.subject || undefined,
        body,
        bodyFormat,
        senderTrustScore: enriched.senderTrustScore ?? undefined,
        senderVerified: enriched.isAgentIdSender && !!enriched.senderAgentId,
        priority: enriched.priority,
        inReplyToId,
        externalInReplyTo: enriched.inReplyTo || undefined,
        metadata: {
          source: "resend_inbound",
          externalMessageId: enriched.messageId,
        },
      });

      if (enriched.messageId) {
        await db
          .update(agentMessagesTable)
          .set({ externalMessageId: enriched.messageId })
          .where(eq(agentMessagesTable.id, message.id));
      }

      await mailService.recordInboundTransport(
        targetInbox.id,
        "resend",
        { from: enriched.from, messageId: enriched.messageId },
        message.id,
      );

      if (enriched.attachments.length > 0) {
        try {
          const att = await persistInboundAttachments(
            targetInbox.agentId,
            message.id,
            enriched.attachments,
          );
          logger.info(
            { messageId: message.id, stored: att.stored, skipped: att.skipped },
            "[mail-inbound] Inbound attachments processed",
          );
        } catch (attErr) {
          logger.warn(
            { messageId: message.id, err: attErr instanceof Error ? attErr.message : String(attErr) },
            "[mail-inbound] Inbound attachment processing failed",
          );
        }
      }

      results.delivered++;

      try {
        const { deliverWebhookEvent } = await import("./webhook-delivery");
        await deliverWebhookEvent(targetInbox.agentId, "mail.received", {
          messageId: message.id,
          from: enriched.from,
          subject: enriched.subject,
        });
      } catch {}

      try {
        const agent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.id, targetInbox.agentId),
          columns: { handle: true, userId: true, trustScore: true },
        });
        if (agent) {
          const owner = await db.query.usersTable.findFirst({
            where: eq(usersTable.id, agent.userId),
            columns: { email: true },
          });
          if (owner?.email) {
            const config = env();
            const agentId = targetInbox.agentId;
            const agentHandle = agent.handle ?? undefined;
            const agentTrustScore = agent.trustScore;
            queueMessageNotification(
              agentId,
              agentHandle,
              owner.email,
              enriched.from,
              enriched.subject || "(no subject)",
              async (email, subj, html) => {
                await deliverOutbound({
                  messageId: `notification-${Date.now()}`,
                  from: config.FROM_EMAIL || `notifications@${config.MAIL_BASE_DOMAIN}`,
                  to: email,
                  subject: subj,
                  body: html,
                  bodyFormat: "html",
                  agentId,
                  agentHandle,
                  agentTrustScore,
                  isSystemNotification: true,
                });
              },
            );
          }
        }
      } catch (notifErr) {
        logger.warn({ error: notifErr instanceof Error ? notifErr.message : String(notifErr) }, "[mail-inbound] Failed to queue message notification");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ recipientAddress, error: errMsg }, "[mail-inbound] Failed to route inbound email");
      results.errors.push(`${recipientAddress}: ${errMsg}`);
    }
  }

  return results;
}

export function verifyResendWebhookSignature(
  payload: string,
  headers: {
    svixId?: string;
    svixTimestamp?: string;
    svixSignature?: string;
  },
  secret: string,
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  try {
    const ts = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 300) return false;

    const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    const toSign = `${svixId}.${svixTimestamp}.${payload}`;
    const expected = createHmac("sha256", secretBytes).update(toSign).digest("base64");

    const signatures = svixSignature.split(" ");
    for (const sig of signatures) {
      const sigValue = sig.startsWith("v1,") ? sig.slice(3) : sig;
      const sigBuffer = Buffer.from(sigValue, "base64");
      const expectedBuffer = Buffer.from(expected, "base64");

      if (sigBuffer.length !== expectedBuffer.length) continue;
      if (timingSafeEqual(sigBuffer, expectedBuffer)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
