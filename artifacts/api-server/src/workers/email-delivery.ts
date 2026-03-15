import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions, isRedisConfigured } from "../lib/redis";
import {
  deliverOutbound,
  resolveTransportProvider,
  type TransportEnvelope,
} from "../services/mail-transport";

const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@getagent.id";
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
    console.log(JSON.stringify({
      level: "warn",
      service: "email-worker",
      event: "email.skipped",
      recipient,
      subject,
      reason: "no_email_transport",
    }));
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

  if (result.success) {
    console.log(JSON.stringify({
      level: "info",
      service: "email-worker",
      event: "email.sent",
      recipient,
      subject,
      provider: result.providerName,
      providerMessageId: result.providerMessageId,
    }));
  } else {
    throw new Error(`Email delivery failed: ${result.error}`);
  }
}

export function initEmailDeliveryWorker(): void {
  if (!isRedisConfigured()) {
    console.log("[email-worker] Redis not configured — email queue disabled, using direct delivery");
    return;
  }

  const connection = getRedisConnectionOptions();

  emailWorker = new Worker<EmailDeliveryJob>(
    QUEUE_NAME,
    processEmailJob,
    {
      connection,
      concurrency: 3,
    },
  );

  emailWorker.on("failed", (job, err) => {
    if (!job) return;
    console.log(JSON.stringify({
      level: "error",
      service: "email-worker",
      event: "email.delivery_failed",
      recipient: job.data.recipient,
      subject: job.data.subject,
      attempt: job.attemptsMade,
      error: err.message,
    }));
  });

  emailWorker.on("completed", (job) => {
    if (!job) return;
    console.log(JSON.stringify({
      level: "info",
      service: "email-worker",
      event: "email.delivery_completed",
      recipient: job.data.recipient,
      subject: job.data.subject,
    }));
  });

  console.log("[email-worker] Email delivery worker started");
}

export async function closeEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.close();
    emailWorker = null;
  }
}
