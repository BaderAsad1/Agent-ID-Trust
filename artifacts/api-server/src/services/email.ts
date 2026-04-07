import { Queue } from "bullmq";
import { isRedisConfigured, getBullMQConnection } from "../lib/redis.js";
import {
  renderTemplate,
  type EmailTemplate,
} from "./email-templates.js";
import {
  deliverOutbound,
  resolveTransportProvider,
  type TransportEnvelope,
} from "./mail-transport.js";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

const FROM_EMAIL = env().FROM_EMAIL;
const QUEUE_NAME = "email-notifications";

let emailQueue: Queue | null = null;

function getQueue(): Queue | null {
  if (emailQueue) return emailQueue;
  if (!isRedisConfigured()) return null;
  try {
    emailQueue = new Queue(QUEUE_NAME, { ...getBullMQConnection() });
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
    logger.warn({ recipient, subject, reason: "no_email_transport" }, "[email] Skipping notification — no real email transport configured");
    return;
  }
  const result = await deliverOutbound(envelope(recipient, subject, html));
  if (result.success) {
    logger.info({
      recipient,
      subject,
      provider: result.providerName,
      providerMessageId: result.providerMessageId,
    }, "[email] Email sent");
  } else {
    logger.error({
      recipient,
      subject,
      provider: result.providerName,
      error: result.error,
    }, "[email] Email delivery failed");
  }
}

export async function sendEmail(
  template: EmailTemplate,
  recipient: string,
  idempotencyKey?: string,
): Promise<void> {
  try {
    if (!env().RESEND_API_KEY) {
      logger.warn({
        template: template.type,
        recipient,
        reason: "RESEND_API_KEY not set",
      }, "[email] Skipping email");
      return;
    }

    const { subject, html } = renderTemplate(template);

    const queue = getQueue();
    if (queue) {
      try {
        const jobOptions: Parameters<typeof queue.add>[2] = {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        };
        // Stable jobId prevents duplicate deliveries if the same event fires twice
        // (e.g., double-click reaching the server, or an inadvertent retry).
        if (idempotencyKey) {
          jobOptions.jobId = `notif-${template.type}-${idempotencyKey}`;
        }
        await queue.add("send-email", { recipient, subject, html }, jobOptions);
        logger.info({
          template: template.type,
          recipient,
          subject,
        }, "[email] Email queued");
        return;
      } catch {
        logger.warn({
          template: template.type,
          recipient,
          reason: "falling back to direct send",
        }, "[email] Queue failed");
      }
    }

    await deliverEmail(recipient, subject, html);
  } catch (err) {
    logger.error({
      template: template.type,
      recipient,
      error: err instanceof Error ? err.message : String(err),
    }, "[email] Unexpected error");
  }
}

export async function sendAgentRegisteredEmail(
  userEmail: string,
  agentHandle: string,
  agentDisplayName: string,
  agentId: string,
): Promise<void> {
  await sendEmail(
    { type: "welcome", data: { agentHandle, agentDisplayName } },
    userEmail,
    agentId,
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

export async function sendMagicLinkEmail(
  recipientEmail: string,
  magicUrl: string,
): Promise<void> {
  // Magic link emails must NOT go through the retry queue.
  // A failed first attempt is safer than retrying and delivering duplicates —
  // each duplicate is a confusing extra email with a one-time token.
  try {
    if (!env().RESEND_API_KEY) {
      logger.warn({ recipient: recipientEmail, reason: "RESEND_API_KEY not set" }, "[email] Skipping magic link email");
      return;
    }
    const { subject, html } = renderTemplate({ type: "magic_link", data: { magicUrl } });
    const magicLinkEnvelope = {
      ...envelope(recipientEmail, subject, html),
      noRetry: true,
      // System notification: bypasses agent-message delivery tracking in the worker.
      // Magic link emails are transactional auth emails, not agent-to-user messages,
      // so they have no corresponding agentMessagesTable row to update.
      isSystemNotification: true,
    };
    const result = await deliverOutbound(magicLinkEnvelope);
    if (result.success) {
      logger.info({ recipient: recipientEmail, provider: result.providerName, providerMessageId: result.providerMessageId }, "[email] Magic link email sent");
    } else {
      logger.error({ recipient: recipientEmail, provider: result.providerName, error: result.error }, "[email] Magic link email delivery failed");
    }
  } catch (err) {
    logger.error({ recipient: recipientEmail, error: err instanceof Error ? err.message : String(err) }, "[email] Failed to send magic link email");
    throw err;
  }
}

export async function sendRenewalReminderEmail(
  userEmail: string,
  handle: string,
  expiresAt: string,
): Promise<void> {
  try {
    const subject = `Handle renewal reminder: @${handle}`;
    const html = `<p>Your handle <strong>@${handle}</strong> expires on ${new Date(expiresAt).toLocaleDateString()}. Please renew it to keep your handle.</p>`;
    await deliverEmail(userEmail, subject, html);
  } catch (err) {
    logger.error({ err, handle, userEmail }, "[email] Failed to send renewal reminder");
  }
}

export async function sendTrademarkClaimEmail(
  teamEmail: string,
  handle: string,
  claimantName: string,
  claimantEmail: string,
): Promise<void> {
  try {
    const subject = `Trademark claim filed: @${handle}`;
    const html = `<p>A trademark claim has been filed for handle <strong>@${handle}</strong> by <strong>${claimantName}</strong> (${claimantEmail}). Please review in the admin panel.</p>`;
    await deliverEmail(teamEmail, subject, html);
  } catch (err) {
    logger.error({ err, handle, teamEmail }, "[email] Failed to send trademark claim notification");
  }
}
