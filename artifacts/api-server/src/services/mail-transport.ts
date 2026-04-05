import { createHmac } from "crypto";
import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { outboundMessageDeliveriesTable, agentsTable, agentMessagesTable } from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";
import { Queue } from "bullmq";
import { getBullMQConnection, isRedisConfigured } from "../lib/redis";

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

const RATE_LIMITS: Record<string, number> = {
  none: 0,
  starter: 100,
  pro: 1000,
  enterprise: -1,
};

export async function checkOutboundRateLimit(agentId: string, plan: string): Promise<{ allowed: boolean; limit: number; current: number }> {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.none;
  if (limit === -1) return { allowed: true, limit: -1, current: 0 };

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMessagesTable)
    .where(
      and(
        eq(agentMessagesTable.agentId, agentId),
        eq(agentMessagesTable.direction, "outbound"),
        gte(agentMessagesTable.createdAt, oneHourAgo),
      ),
    );

  const current = result?.count ?? 0;
  return { allowed: current < limit, limit, current };
}

let outboundQueue: Queue | null = null;

function getOutboundQueue(): Queue | null {
  if (outboundQueue) return outboundQueue;
  if (!isRedisConfigured()) return null;

  try {
    outboundQueue = new Queue("outbound-mail", { ...getBullMQConnection() });
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
