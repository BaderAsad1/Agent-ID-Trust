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

interface ResendEmailsClient {
  send(params: {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
}

interface ResendClient {
  emails: ResendEmailsClient;
}

export class ResendTransportProvider implements TransportProvider {
  name = "resend";
  private client: ResendClient | null = null;

  private async getClient(): Promise<ResendClient> {
    if (!this.client) {
      const { Resend } = await import("resend");
      this.client = new Resend(process.env.RESEND_API_KEY) as unknown as ResendClient;
    }
    return this.client;
  }

  async send(envelope: TransportEnvelope): Promise<TransportResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        providerName: this.name,
        error: "RESEND_API_KEY not configured",
      };
    }
    const fromEmail = process.env.FROM_EMAIL || "notifications@getagent.id";
    const resend = await this.getClient();
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [envelope.to],
      subject: envelope.subject || "(no subject)",
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
    const baseDomain = process.env.MAIL_BASE_DOMAIN || "agents.local";
    return !!process.env.RESEND_API_KEY && !address.endsWith(`@${baseDomain}`);
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
