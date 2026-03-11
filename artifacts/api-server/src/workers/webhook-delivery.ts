import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnectionOptions, isRedisConfigured } from "../lib/redis";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { inboxWebhooksTable, messageEventsTable } from "@workspace/db/schema";
import { signWebhookPayload } from "../services/mail-transport";

export interface WebhookDeliveryJob {
  webhookId: string;
  webhookUrl: string;
  webhookSecret: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  messageId: string;
}

const QUEUE_NAME = "webhook-delivery";
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS = [1000, 5000, 15000];

let webhookQueue: Queue<WebhookDeliveryJob> | null = null;
let webhookWorker: Worker<WebhookDeliveryJob> | null = null;

async function processWebhookJob(job: Job<WebhookDeliveryJob>): Promise<void> {
  const { webhookId, webhookUrl, webhookSecret, eventType, payload, messageId } = job.data;

  const timestamp = new Date().toISOString();
  const webhookPayload = { event: eventType, payload, timestamp };
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (webhookSecret) {
    const signature = signWebhookPayload(webhookPayload as unknown as Record<string, unknown>, webhookSecret);
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
    headers["X-Webhook-Timestamp"] = timestamp;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(webhookPayload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
  }

  await db
    .update(inboxWebhooksTable)
    .set({
      lastDeliveredAt: new Date(),
      failureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(inboxWebhooksTable.id, webhookId));

  await db.insert(messageEventsTable).values({
    messageId,
    eventType: "webhook.delivered",
    payload: {
      webhookId,
      url: webhookUrl,
      statusCode: response.status,
      attempt: job.attemptsMade + 1,
      queueBacked: true,
    },
  });
}

export function initWebhookDeliveryWorker(): void {
  if (!isRedisConfigured()) {
    console.log("[webhook-worker] Redis not configured — webhook queue disabled, using in-process delivery");
    return;
  }

  const connection = getRedisConnectionOptions();

  webhookQueue = new Queue<WebhookDeliveryJob>(QUEUE_NAME, { connection });

  webhookWorker = new Worker<WebhookDeliveryJob>(
    QUEUE_NAME,
    processWebhookJob,
    {
      connection,
      concurrency: 5,
    },
  );

  webhookWorker.on("failed", async (job, err) => {
    if (!job) return;
    const { webhookId, webhookUrl, messageId } = job.data;

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await db
        .update(inboxWebhooksTable)
        .set({
          failureCount: sql`${inboxWebhooksTable.failureCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(inboxWebhooksTable.id, webhookId));

      await db.insert(messageEventsTable).values({
        messageId,
        eventType: "webhook.failed",
        payload: {
          webhookId,
          url: webhookUrl,
          error: err.message,
          totalAttempts: job.attemptsMade,
          queueBacked: true,
        },
      });
    }
  });

  webhookWorker.on("ready", () => {
    console.log("[webhook-worker] Webhook delivery worker started");
  });
}

export async function enqueueWebhookDelivery(job: WebhookDeliveryJob): Promise<boolean> {
  if (!webhookQueue) {
    return false;
  }

  await webhookQueue.add("deliver", job, {
    attempts: MAX_ATTEMPTS,
    backoff: {
      type: "custom",
    },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });

  return true;
}

export function isWebhookQueueAvailable(): boolean {
  return webhookQueue !== null;
}

export async function closeWebhookWorker(): Promise<void> {
  if (webhookWorker) await webhookWorker.close();
  if (webhookQueue) await webhookQueue.close();
}
