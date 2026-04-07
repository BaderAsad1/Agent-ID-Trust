import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

const PLATFORM_NAME = "Agent ID";

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; background: #0a0a0f; color: #e8e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
  .header { font-size: 13px; color: rgba(232,232,240,0.4); letter-spacing: 0.5px; margin-bottom: 32px; text-transform: uppercase; }
  .content { font-size: 15px; line-height: 1.6; color: rgba(232,232,240,0.85); }
  .content p { margin: 0 0 16px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(232,232,240,0.08); font-size: 12px; color: rgba(232,232,240,0.3); }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
  .accent { color: #4f7df3; }
  a { color: #4f7df3; text-decoration: none; }
  .detail-row { padding: 8px 0; border-bottom: 1px solid rgba(232,232,240,0.06); font-size: 14px; }
  .detail-label { color: rgba(232,232,240,0.4); }
  .detail-value { color: rgba(232,232,240,0.85); }
</style>
</head>
<body>
<div class="container">
  <div class="header">${PLATFORM_NAME}</div>
  <div class="content">${content}</div>
  <div class="footer">
    <p>${PLATFORM_NAME} &mdash; Identity infrastructure for AI agents</p>
    <p>This is a transactional email. You are receiving it because of activity on your account.</p>
  </div>
</div>
</body>
</html>`;
}

export function registrationConfirmedTemplate(params: {
  handle: string;
  agentId: string;
}): { subject: string; html: string } {
  const content = `
    <p>Your agent has been registered on ${PLATFORM_NAME}.</p>
    <div class="detail-row">
      <span class="detail-label">Handle:</span>
      <span class="detail-value mono">${params.handle}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Agent ID:</span>
      <span class="detail-value mono" style="font-size: 12px;">${params.agentId}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Domain:</span>
      <span class="detail-value mono">${params.handle}.getagent.id</span>
    </div>
    <p style="margin-top: 24px;">Your agent address is <span class="mono accent">${params.handle}@getagent.id</span>. You can now configure verification, mail routing, and marketplace listing from your dashboard.</p>
  `;
  return {
    subject: `Agent registered: ${params.handle}`,
    html: baseLayout(content),
  };
}

export function verificationCompleteTemplate(params: {
  handle: string;
  trustScore: number;
}): { subject: string; html: string } {
  const content = `
    <p>Verification for <span class="mono accent">${params.handle}</span> is complete.</p>
    <div class="detail-row">
      <span class="detail-label">Status:</span>
      <span class="detail-value">Verified</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Trust Score:</span>
      <span class="detail-value">${params.trustScore}/100</span>
    </div>
    <p style="margin-top: 24px;">Your agent now carries a verified badge in the registry and marketplace. Other agents and users can verify your identity through the .agentid protocol.</p>
  `;
  return {
    subject: `Verification complete: ${params.handle}`,
    html: baseLayout(content),
  };
}

export function newMessageReceivedTemplate(params: {
  handle: string | undefined;
  messageCount: number;
  senders: string[];
  subjects: string[];
}): { subject: string; html: string } {
  const senderList = params.senders.slice(0, 5).map(s =>
    `<div class="detail-row"><span class="detail-value">${s}</span></div>`
  ).join("");

  const subjectLine = params.messageCount === 1
    ? `New message for ${params.handle}`
    : `${params.messageCount} new messages for ${params.handle}`;

  const content = `
    <p>You have ${params.messageCount} new message${params.messageCount > 1 ? "s" : ""} in the inbox for <span class="mono accent">${params.handle}</span>.</p>
    ${params.subjects.length > 0 ? `
    <p style="color: rgba(232,232,240,0.5); font-size: 13px; margin-bottom: 8px;">Recent subjects:</p>
    ${params.subjects.slice(0, 3).map(s => `<div class="detail-row"><span class="detail-value">${s}</span></div>`).join("")}
    ` : ""}
    ${senderList ? `
    <p style="color: rgba(232,232,240,0.5); font-size: 13px; margin-top: 16px; margin-bottom: 8px;">From:</p>
    ${senderList}
    ` : ""}
    <p style="margin-top: 24px;">View and respond from your <a href="https://getagent.id">dashboard</a>.</p>
  `;
  return {
    subject: subjectLine,
    html: baseLayout(content),
  };
}

export function marketplaceOrderPlacedTemplate(params: {
  handle: string;
  orderId: string;
  serviceName: string;
  amount: string;
  buyerHandle?: string;
}): { subject: string; html: string } {
  const content = `
    <p>A new order has been placed for <span class="mono accent">${params.handle}</span>.</p>
    <div class="detail-row">
      <span class="detail-label">Order ID:</span>
      <span class="detail-value mono" style="font-size: 12px;">${params.orderId}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Service:</span>
      <span class="detail-value">${params.serviceName}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Amount:</span>
      <span class="detail-value">${params.amount}</span>
    </div>
    ${params.buyerHandle ? `
    <div class="detail-row">
      <span class="detail-label">Buyer:</span>
      <span class="detail-value mono">${params.buyerHandle}</span>
    </div>
    ` : ""}
    <p style="margin-top: 24px;">View order details in your <a href="https://getagent.id">dashboard</a>.</p>
  `;
  return {
    subject: `Order placed: ${params.serviceName}`,
    html: baseLayout(content),
  };
}

export function marketplaceOrderCompletedTemplate(params: {
  handle: string;
  orderId: string;
  serviceName: string;
}): { subject: string; html: string } {
  const content = `
    <p>Order for <span class="mono accent">${params.handle}</span> has been completed.</p>
    <div class="detail-row">
      <span class="detail-label">Order ID:</span>
      <span class="detail-value mono" style="font-size: 12px;">${params.orderId}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Service:</span>
      <span class="detail-value">${params.serviceName}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status:</span>
      <span class="detail-value">Completed</span>
    </div>
    <p style="margin-top: 24px;">View the completed order in your <a href="https://getagent.id">dashboard</a>.</p>
  `;
  return {
    subject: `Order completed: ${params.serviceName}`,
    html: baseLayout(content),
  };
}

export function planUpgradeConfirmedTemplate(params: {
  plan: string;
  handle?: string;
  features: string[];
}): { subject: string; html: string } {
  const featureList = params.features.map(f =>
    `<div class="detail-row"><span class="detail-value">${f}</span></div>`
  ).join("");

  const content = `
    <p>Your plan has been upgraded to <span class="accent" style="font-weight: 600;">${params.plan}</span>.</p>
    ${params.handle ? `
    <div class="detail-row">
      <span class="detail-label">Agent:</span>
      <span class="detail-value mono">${params.handle}</span>
    </div>
    ` : ""}
    <div class="detail-row">
      <span class="detail-label">Plan:</span>
      <span class="detail-value">${params.plan}</span>
    </div>
    ${featureList ? `
    <p style="color: rgba(232,232,240,0.5); font-size: 13px; margin-top: 16px; margin-bottom: 8px;">Included features:</p>
    ${featureList}
    ` : ""}
    <p style="margin-top: 24px;">Your new plan is active immediately. Manage billing from your <a href="https://getagent.id">dashboard</a>.</p>
  `;
  return {
    subject: `Plan upgraded to ${params.plan}`,
    html: baseLayout(content),
  };
}

const MESSAGE_BATCH_INTERVAL_MS = 5 * 60 * 1000;

interface PendingNotification {
  handle: string | undefined;
  recipientEmail: string;
  senderAddress: string;
  subject: string;
  timer: ReturnType<typeof setTimeout>;
  messages: Array<{ sender: string; subject: string }>;
}

const pendingBatches = new Map<string, PendingNotification>();

export function queueMessageNotification(
  agentId: string,
  handle: string | undefined,
  recipientEmail: string,
  senderAddress: string,
  subject: string,
  sendFn: (email: string, subject: string, html: string) => Promise<void>,
): void {
  const existing = pendingBatches.get(agentId);

  if (existing) {
    existing.messages.push({ sender: senderAddress, subject });
    return;
  }

  const notification: PendingNotification = {
    handle,
    recipientEmail,
    senderAddress,
    subject,
    messages: [{ sender: senderAddress, subject }],
    timer: setTimeout(async () => {
      const batch = pendingBatches.get(agentId);
      pendingBatches.delete(agentId);

      if (!batch) return;

      const template = newMessageReceivedTemplate({
        handle: batch.handle,
        messageCount: batch.messages.length,
        senders: [...new Set(batch.messages.map(m => m.sender))],
        subjects: batch.messages.map(m => m.subject).filter(Boolean),
      });

      try {
        await sendFn(batch.recipientEmail, template.subject, template.html);
      } catch (err) {
        logger.error({ err }, "[mail-templates] Failed to send batched notification");
      }
    }, MESSAGE_BATCH_INTERVAL_MS),
  };

  pendingBatches.set(agentId, notification);
}
