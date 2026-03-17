import { createHmac, timingSafeEqual } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentInboxesTable,
  agentMessagesTable,
  agentsTable,
  agentSubscriptionsTable,
  undeliverableMessagesTable,
  usersTable,
} from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";
import * as mailService from "./mail";
import { queueMessageNotification } from "./mail-templates";
import { deliverOutbound } from "./mail-transport";

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
    }>;
  };
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
  let sanitized = html;
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");
  sanitized = sanitized.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "");
  sanitized = sanitized.replace(/<embed[^>]*>/gi, "");
  sanitized = sanitized.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, "");
  sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]*/gi, "");
  sanitized = sanitized.replace(/javascript\s*:/gi, "");
  sanitized = sanitized.replace(/data\s*:/gi, "data-blocked:");
  return sanitized;
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
  };
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
        await db.insert(undeliverableMessagesTable).values({
          recipientAddress,
          senderAddress: enriched.from,
          subject: enriched.subject,
          body: enriched.textBody || enriched.sanitizedHtml || "",
          bodyFormat: enriched.sanitizedHtml ? "html" : "text",
          externalMessageId: enriched.messageId,
          reason: targetInbox ? "inbox_inactive" : "unknown_recipient",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        results.undeliverable++;
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
            const agentHandle = agent.handle;
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
