import { createHmac } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { outboundMessageDeliveriesTable } from "@workspace/db/schema";

export interface TransportEnvelope {
  messageId: string;
  from: string;
  to: string;
  subject?: string;
  body: string;
  bodyFormat: string;
  metadata?: Record<string, unknown>;
}

export interface TransportResult {
  success: boolean;
  providerMessageId?: string;
  providerName?: string;
  error?: string;
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
    const baseDomain = process.env.MAIL_BASE_DOMAIN || "agents.local";
    return address.endsWith(`@${baseDomain}`);
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
  new WebhookTransportProvider(),
];

export function resolveTransportProvider(address: string): TransportProvider {
  for (const provider of providers) {
    if (provider.canDeliver(address)) return provider;
  }
  return providers[providers.length - 1];
}

export async function deliverOutbound(envelope: TransportEnvelope): Promise<TransportResult> {
  const provider = resolveTransportProvider(envelope.to);
  const result = await provider.send(envelope);
  result.providerName = provider.name;
  return result;
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
