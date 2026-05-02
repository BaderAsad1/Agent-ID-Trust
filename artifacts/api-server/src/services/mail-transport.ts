import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { outboundMessageDeliveriesTable, agentsTable } from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";
import { Queue } from "bullmq";
import { createBullMQConnection, isRedisConfigured } from "../lib/redis";
import {
  assertOutboundRateLimit,
  checkOutboundRateLimit as checkOutboundRateLimitImpl,
  RateLimitError,
} from "./mail-rate-limit";

export { RateLimitError } from "./mail-rate-limit";

export interface TransportEnvelope {
  messageId: string;
  from: string;
  to: string;
  subject?: string;
  body: string;
  bodyFormat: string;
  metadata?: Record<string, unknown>;
  agentId?: string;
  agentHandle?: string;
  agentTrustScore?: number;
  isSystemNotification?: boolean;
  noRetry?: boolean;
}

export interface TransportResult {
  success: boolean;
  providerMessageId?: string;
  providerName?: string;
  error?: string;
  queued?: boolean;
}

export interface TransportProvider {
  name: string;
  send(envelope: TransportEnvelope): Promise<TransportResult>;
  canDeliver(address: string): boolean;
}

export class InternalTransportProvider implements TransportProvider {
  name = "internal";

  async send(envelope: TransportEnvelope): Promise<TransportResult> {
    return {
      success: true,
      providerName: this.name,
      providerMessageId: `internal-${envelope.messageId}`,
    };
  }

  canDeliver(address: string): boolean {
    return address.endsWith(`@${env().MAIL_BASE_DOMAIN}`);
  }
}

interface ResendEmailsClient {
  send(params: {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
}

interface ResendClient {
  emails: ResendEmailsClient;
}

function buildAgentHeaders(envelope: TransportEnvelope): Record<string, string> {
  const headers: Record<string, string> = {
    "X-AgentID-Platform": "getagent.id",
  };
  if (envelope.agentId) {
    headers["X-Agent-ID"] = envelope.agentId;
  }
  if (envelope.agentHandle) {
    headers["X-Agent-Handle"] = envelope.agentHandle;
  }
  if (envelope.agentTrustScore !== undefined && envelope.agentTrustScore !== null) {
    headers["X-Agent-Trust-Score"] = String(envelope.agentTrustScore);
  }
  return headers;
}

export class ResendTransportProvider implements TransportProvider {
  name = "resend";
  private client: ResendClient | null = null;

  private async getClient(): Promise<ResendClient> {
    if (!this.client) {
      const { Resend } = await import("resend");
      this.client = new Resend(env().RESEND_API_KEY) as unknown as ResendClient;
    }
    return this.client;
  }

  async send(envelope: TransportEnvelope): Promise<TransportResult> {
    const config = env();
    if (!config.RESEND_API_KEY) {
      return {
        success: false,
        providerName: this.name,
        error: "RESEND_API_KEY not configured",
      };
    }
    const fromEmail = config.FROM_EMAIL;
    const resend = await this.getClient();
    const agentHeaders = buildAgentHeaders(envelope);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [envelope.to],
      subject: envelope.subject || "(no subject)",
      headers: agentHeaders,
      ...(envelope.bodyFormat === "html" ? { html: envelope.body } : { text: envelope.body }),
    });
    if (error) {
      return { success: false, providerName: this.name, error: error.message };
    }
    return {
      success: true,
      providerName: this.name,
      providerMessageId: data?.id || undefined,
    };
  }

  canDeliver(address: string): boolean {
    const config = env();
    return !!config.RESEND_API_KEY && !address.endsWith(`@${config.MAIL_BASE_DOMAIN}`);
  }
}

export class WebhookTransportProvider implements TransportProvider {
  name = "webhook";

  async send(envelope: TransportEnvelope): Promise<TransportResult> {
    return {
      success: true,
      providerName: this.name,
      providerMessageId: `webhook-${envelope.messageId}`,
    };
  }

  canDeliver(_address: string): boolean {
    return true;
  }
}

const providers: TransportProvider[] = [
  new InternalTransportProvider(),
  new ResendTransportProvider(),
  new WebhookTransportProvider(),
];

export function resolveTransportProvider(address: string): TransportProvider {
  for (const provider of providers) {
    if (provider.canDeliver(address)) return provider;
  }
  return providers[providers.length - 1];
}

function isExternalAddress(address: string): boolean {
  const config = env();
  return !address.endsWith(`@${config.MAIL_BASE_DOMAIN}`);
}

/**
 * Backwards-compatible wrapper around the canonical rate-limit module.
 * Pre-existing call sites in `routes/v1/mail.ts` continue to work; the real
 * gate lives inside `deliverOutbound` so EVERY send path is protected.
 */
export async function checkOutboundRateLimit(
  agentId: string,
  plan: string,
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const decision = await checkOutboundRateLimitImpl({ agentId, plan });
  return { allowed: decision.allowed, limit: decision.limit, current: decision.current };
}

let outboundQueue: Queue | null = null;

function getOutboundQueue(): Queue | null {
  if (outboundQueue) return outboundQueue;
  if (!isRedisConfigured()) return null;

  try {
    outboundQueue = new Queue("outbound-mail", { ...createBullMQConnection("outbound-mail:queue") });
    outboundQueue.on("error", (err) => {
      logger.warn({ err: err.message }, "[mail-transport] Outbound queue connection error");
    });
    return outboundQueue;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, "[mail-transport] Failed to initialize outbound queue");
    return null;
  }
}

export async function deliverOutbound(envelope: TransportEnvelope): Promise<TransportResult> {
  const provider = resolveTransportProvider(envelope.to);

  if (isExternalAddress(envelope.to) && provider.name === "webhook") {
    const config = env();
    if (!config.RESEND_API_KEY) {
      return {
        success: false,
        providerName: "resend",
        error: "External mail delivery unavailable: RESEND_API_KEY is not configured. The message was not sent.",
      };
    }
  }

  if (envelope.agentId) {
    await enrichEnvelopeWithAgentInfo(envelope);
  }

  // Audit #09 — gate EVERY outbound send on the per-sender rate limit BEFORE
  // touching the provider or enqueueing. Calling Resend first and checking
  // afterwards defeats the purpose: the message would already be sent and the
  // monthly quota already consumed.
  //
  // Internal getagent.id ↔ getagent.id mail does not consume the Resend quota
  // and is gated separately at the route layer, so skip the limit there.
  if (provider.name !== "internal") {
    try {
      const userIdForLimit = envelope.metadata && typeof envelope.metadata === "object"
        ? (envelope.metadata as { senderUserId?: string }).senderUserId
        : undefined;
      const planForLimit = envelope.metadata && typeof envelope.metadata === "object"
        ? (envelope.metadata as { plan?: string }).plan
        : undefined;
      // System notifications without an agent context (NDR bounces, magic-link
      // emails, governance appeal mails) bucket under the recipient address so
      // a runaway loop can be contained without starving real customers.
      const systemKey = envelope.isSystemNotification && !envelope.agentId
        ? envelope.to
        : undefined;
      await assertOutboundRateLimit({
        agentId: envelope.agentId,
        userId: !envelope.agentId ? userIdForLimit : undefined,
        systemKey,
        plan: planForLimit,
        reason: envelope.agentId
          ? "agent_quota"
          : envelope.isSystemNotification
            ? "system_quota"
            : "user_quota",
        // Some upstream callers (services/mail.ts sendMessage) persist the
        // outbound row BEFORE calling deliverOutbound. Excluding the
        // in-flight message id from the count prevents an off-by-one where
        // a route-admitted send is rejected here at transport time.
        excludeMessageId: envelope.messageId,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          success: false,
          providerName: provider.name,
          error: err.message,
        };
      }
      throw err;
    }
  }

  const queue = getOutboundQueue();
  if (queue && provider.name === "resend") {
    try {
      const jobAttempts = envelope.noRetry ? 1 : 3;
      // Use messageId as stable jobId — BullMQ rejects duplicate insertions for the same ID,
      // preventing double-delivery if deliverOutbound is called twice for the same message.
      await queue.add("send", { envelope }, {
        jobId: `outbound-${envelope.messageId}`,
        attempts: jobAttempts,
        ...(envelope.noRetry ? {} : { backoff: { type: "exponential", delay: 2000 } }),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      });
      return {
        success: true,
        providerName: "resend",
        providerMessageId: `queued-${envelope.messageId}`,
        queued: true,
      };
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, "[mail-transport] Queue failed, falling back to sync");
    }
  }

  const result = await provider.send(envelope);
  result.providerName = provider.name;
  return result;
}

async function enrichEnvelopeWithAgentInfo(envelope: TransportEnvelope): Promise<void> {
  if (envelope.agentHandle && envelope.agentTrustScore !== undefined) return;

  try {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, envelope.agentId!),
      columns: { handle: true, trustScore: true },
    });
    if (agent) {
      envelope.agentHandle = envelope.agentHandle || agent.handle || undefined;
      envelope.agentTrustScore = envelope.agentTrustScore ?? agent.trustScore;
    }
  } catch (err) {
    logger.warn({ agentId: envelope.agentId, error: err instanceof Error ? err.message : String(err) }, "[mail-transport] Failed to enrich envelope with agent info");
  }
  envelope.agentHandle = envelope.agentHandle || "unknown";
  envelope.agentTrustScore = envelope.agentTrustScore ?? 0;
}

export async function recordOutboundDeliveryResult(
  messageId: string,
  result: TransportResult,
) {
  const providerName = result.providerName || "unknown";
  await db
    .insert(outboundMessageDeliveriesTable)
    .values({
      messageId,
      provider: providerName,
      status: result.success ? "completed" : "failed",
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: result.success ? new Date() : undefined,
      providerMessageId: result.providerMessageId,
      errorMessage: result.error,
    });
}

export function signWebhookPayload(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const data = JSON.stringify(payload);
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function registerProvider(provider: TransportProvider): void {
  providers.unshift(provider);
}

export async function closeOutboundQueue(): Promise<void> {
  if (outboundQueue) {
    await outboundQueue.close();
    outboundQueue = null;
  }
}
