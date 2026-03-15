import { Queue } from "bullmq";
import { isRedisConfigured, getRedisConnectionOptions } from "../lib/redis.js";
import {
  renderTemplate,
  type EmailTemplate,
} from "./email-templates.js";
import {
  deliverOutbound,
  resolveTransportProvider,
  type TransportEnvelope,
} from "./mail-transport.js";

const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@getagent.id";
const QUEUE_NAME = "email-notifications";

let emailQueue: Queue | null = null;

function getQueue(): Queue | null {
  if (emailQueue) return emailQueue;
  if (!isRedisConfigured()) return null;
  try {
    emailQueue = new Queue(QUEUE_NAME, { connection: getRedisConnectionOptions() });
    return emailQueue;
  } catch {
    return null;
  }
}

function envelope(
  to: string,
  subject: string,
  body: string,
): TransportEnvelope {
  return {
    messageId: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: FROM_EMAIL,
    to,
    subject,
    body,
    bodyFormat: "html",
  };
}

async function deliverEmail(recipient: string, subject: string, html: string): Promise<void> {
  const provider = resolveTransportProvider(recipient);
  if (provider.name === "webhook") {
    console.log(JSON.stringify({
      level: "warn",
      service: "email",
      event: "email.skipped",
      recipient,
      subject,
      reason: "no_email_transport",
    }));
    return;
  }
  const result = await deliverOutbound(envelope(recipient, subject, html));
  if (result.success) {
    console.log(JSON.stringify({
      level: "info",
      service: "email",
      event: "email.sent",
      recipient,
      subject,
      provider: result.providerName,
      providerMessageId: result.providerMessageId,
    }));
  } else {
    console.log(JSON.stringify({
      level: "error",
      service: "email",
      event: "email.failed",
      recipient,
      subject,
      provider: result.providerName,
      error: result.error,
    }));
  }
}

export async function sendEmail(
  template: EmailTemplate,
  recipient: string,
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log(JSON.stringify({
        level: "warn",
        service: "email",
        event: "email.skipped",
        template: template.type,
        recipient,
        reason: "RESEND_API_KEY not set",
      }));
      return;
    }

    const { subject, html } = renderTemplate(template);

    const queue = getQueue();
    if (queue) {
      try {
        await queue.add("send-email", { recipient, subject, html }, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        });
        console.log(JSON.stringify({
          level: "info",
          service: "email",
          event: "email.queued",
          template: template.type,
          recipient,
          subject,
        }));
        return;
      } catch {
        console.log(JSON.stringify({
          level: "warn",
          service: "email",
          event: "email.queue_failed",
          template: template.type,
          recipient,
          reason: "falling back to direct send",
        }));
      }
    }

    await deliverEmail(recipient, subject, html);
  } catch (err) {
    console.log(JSON.stringify({
      level: "error",
      service: "email",
      event: "email.unexpected_error",
      template: template.type,
      recipient,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}

export async function sendAgentRegisteredEmail(
  userEmail: string,
  agentHandle: string,
  agentDisplayName: string,
): Promise<void> {
  await sendEmail(
    { type: "welcome", data: { agentHandle, agentDisplayName } },
    userEmail,
  );
}

export async function sendVerificationCompleteEmail(
  userEmail: string,
  agentHandle: string,
  agentDisplayName: string,
  verificationMethod: string,
): Promise<void> {
  await sendEmail(
    { type: "verification_complete", data: { agentHandle, agentDisplayName, verificationMethod } },
    userEmail,
  );
}

export async function sendNewTaskEmail(
  userEmail: string,
  agentHandle: string,
  agentDisplayName: string,
  taskType: string,
  taskId: string,
): Promise<void> {
  await sendEmail(
    { type: "new_task", data: { agentHandle, agentDisplayName, taskType, taskId } },
    userEmail,
  );
}

export async function sendCredentialIssuedEmail(
  userEmail: string,
  agentHandle: string,
  credentialType: string,
): Promise<void> {
  await sendEmail(
    { type: "credential_issued", data: { agentHandle, credentialType } },
    userEmail,
  );
}

export async function sendNewProposalEmail(
  userEmail: string,
  jobTitle: string,
  proposerHandle: string,
): Promise<void> {
  await sendEmail(
    { type: "new_proposal", data: { jobTitle, proposerHandle } },
    userEmail,
  );
}

export async function sendMarketplaceOrderEmail(
  userEmail: string,
  listingTitle: string,
  orderAmount: string,
): Promise<void> {
  await sendEmail(
    { type: "order_placed", data: { listingTitle, orderAmount, orderId: "" } },
    userEmail,
  );
}

export async function sendOrderCompletedEmail(
  userEmail: string,
  listingTitle: string,
  orderAmount: string,
  orderId: string,
  role: "buyer" | "seller",
): Promise<void> {
  await sendEmail(
    { type: "order_completed", data: { listingTitle, orderAmount, orderId, role } },
    userEmail,
  );
}
