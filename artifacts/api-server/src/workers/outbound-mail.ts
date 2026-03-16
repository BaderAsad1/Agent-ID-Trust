import { Worker, type Job } from "bullmq";
import { getBullMQConnection, isRedisConfigured } from "../lib/redis";
import { logger } from "../middlewares/request-logger";
import {
  type TransportEnvelope,
  type TransportResult,
  ResendTransportProvider,
  recordOutboundDeliveryResult,
} from "../services/mail-transport";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentMessagesTable } from "@workspace/db/schema";

const QUEUE_NAME = "outbound-mail";

const resendProvider = new ResendTransportProvider();

let outboundWorker: Worker | null = null;

async function processOutboundJob(job: Job<{ envelope: TransportEnvelope }>): Promise<void> {
  const { envelope } = job.data;

  const result = await resendProvider.send(envelope);

  if (envelope.isSystemNotification) {
    if (!result.success) {
      throw new Error(`System notification delivery failed: ${result.error}`);
    }
    logger.info({ to: envelope.to }, "[outbound-mail] System notification sent");
    return;
  }

  await recordOutboundDeliveryResult(envelope.messageId, {
    ...result,
    providerName: "resend",
  });

  if (result.success) {
    await db
      .update(agentMessagesTable)
      .set({ deliveryStatus: "delivered", updatedAt: new Date() })
      .where(eq(agentMessagesTable.id, envelope.messageId));
  } else {
    throw new Error(`Outbound delivery failed: ${result.error}`);
  }
}

export function initOutboundMailWorker(): void {
  if (!isRedisConfigured()) {
    return;
  }

  outboundWorker = new Worker(
    QUEUE_NAME,
    processOutboundJob,
    {
      ...getBullMQConnection(),
      concurrency: 5,
    },
  );
  outboundWorker.on("error", (err) => {
    logger.warn({ err: err.message }, "[outbound-mail-worker] Worker connection error");
  });

  outboundWorker.on("failed", async (job, err) => {
    if (!job) return;
    const messageId = job.data.envelope?.messageId;
    const isRetryExhausted = job.attemptsMade >= (job.opts?.attempts ?? 3);

    logger.error({
      messageId,
      attempt: job.attemptsMade,
      maxAttempts: job.opts?.attempts ?? 3,
      retriesExhausted: isRetryExhausted,
      error: err.message,
    }, "[outbound-mail] Delivery failed");

    if (isRetryExhausted && messageId) {
      try {
        await db
          .update(agentMessagesTable)
          .set({ deliveryStatus: "failed", updatedAt: new Date() })
          .where(eq(agentMessagesTable.id, messageId));
        logger.info({ messageId }, "[outbound-mail] Marked message as failed after retries exhausted");
      } catch (updateErr) {
        logger.error({ messageId, error: updateErr instanceof Error ? updateErr.message : String(updateErr) }, "[outbound-mail] Failed to update message status");
      }
    }
  });

  outboundWorker.on("ready", () => {
    logger.info("[outbound-mail] Outbound mail worker started");
  });
}

export async function closeOutboundMailWorker(): Promise<void> {
  if (outboundWorker) {
    await outboundWorker.close();
    outboundWorker = null;
  }
}
