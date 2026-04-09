import { Worker, type Job } from "bullmq";
import { getBullMQConnection, isRedisConfigured } from "../lib/redis";
import { logger } from "../middlewares/request-logger";
import {
  deliverOutbound,
  resolveTransportProvider,
  type TransportEnvelope,
} from "../services/mail-transport";
import { env } from "../lib/env";
import { recordWorkerFailure, recordWorkerSuccess } from "./worker-failure";

const FROM_EMAIL = env().FROM_EMAIL || "notifications@getagent.id";
const QUEUE_NAME = "email-notifications";

export interface EmailDeliveryJob {
  recipient: string;
  subject: string;
  html: string;
}

let emailWorker: Worker<EmailDeliveryJob> | null = null;

async function processEmailJob(job: Job<EmailDeliveryJob>): Promise<void> {
  const { recipient, subject, html } = job.data;

  const provider = resolveTransportProvider(recipient);
  if (provider.name === "webhook") {
    return;
  }

  const env: TransportEnvelope = {
    messageId: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: FROM_EMAIL,
    to: recipient,
    subject,
    body: html,
    bodyFormat: "html",
  };

  const result = await deliverOutbound(env);

  if (!result.success) {
    throw new Error(`Email delivery failed: ${result.error}`);
  }
}

export function initEmailDeliveryWorker(): void {
  if (!isRedisConfigured()) {
    return;
  }

  emailWorker = new Worker<EmailDeliveryJob>(
    QUEUE_NAME,
    processEmailJob,
    {
      ...getBullMQConnection(),
      concurrency: 3,
    },
  );
  emailWorker.on("error", (err) => {
    logger.warn({ err: err.message }, "[email-worker] Worker connection error");
  });
  emailWorker.on("failed", (job, err) => {
    recordWorkerFailure(err, {
      worker: "email-delivery",
      jobId: job?.id,
      retriesExhausted: (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 3),
    });
  });
  emailWorker.on("completed", () => {
    recordWorkerSuccess("email-delivery");
  });
}

export async function closeEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.close();
    emailWorker = null;
  }
}
