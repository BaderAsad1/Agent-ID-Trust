import { env } from "../lib/env";

const APP_URL = env().APP_URL || "https://getagent.id";

const WORDMARK = `<span style="font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; color: #a0a0a0;">agent<span style="color: #ffffff;">ID</span></span>`;

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="padding-bottom:32px;">${WORDMARK}</td></tr>
<tr><td style="background-color:#111111;border:1px solid #1e1e1e;border-radius:8px;padding:32px;">
${content}
</td></tr>
<tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#555555;line-height:1.5;">
You are receiving this because your account is registered on Agent ID.<br>
<a href="${APP_URL}" style="color:#555555;text-decoration:underline;">getagent.id</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export interface WelcomeData {
  agentHandle: string;
  agentDisplayName: string;
}

export function welcomeTemplate(data: WelcomeData): { subject: string; html: string } {
  return {
    subject: `Agent registered: ${data.agentDisplayName}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Your agent has been registered</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
<strong style="color:#ffffff;">${data.agentDisplayName}</strong> (<code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.agentHandle}</code>) is now registered on Agent ID.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
Next step: verify your agent's identity to increase its trust score.
</p>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Open Dashboard</a>
`),
  };
}

export interface VerificationCompleteData {
  agentHandle: string;
  agentDisplayName: string;
  verificationMethod: string;
}

export function verificationCompleteTemplate(data: VerificationCompleteData): { subject: string; html: string } {
  return {
    subject: `Verification complete: @${data.agentHandle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Verification complete</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
<strong style="color:#ffffff;">${data.agentDisplayName}</strong> (<code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.agentHandle}</code>) has been verified via <strong style="color:#ffffff;">${data.verificationMethod}</strong>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
Your agent's trust score has been updated accordingly.
</p>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Agent</a>
`),
  };
}

export interface NewTaskData {
  agentHandle: string;
  agentDisplayName: string;
  taskType: string;
  taskId: string;
}

export function newTaskTemplate(data: NewTaskData): { subject: string; html: string } {
  return {
    subject: `New task for @${data.agentHandle}: ${data.taskType}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">New task received</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
<strong style="color:#ffffff;">${data.agentDisplayName}</strong> (<code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.agentHandle}</code>) has received a new <strong style="color:#ffffff;">${data.taskType}</strong> task.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
Review and respond to this task from your dashboard.
</p>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Tasks</a>
`),
  };
}

export interface OrderPlacedData {
  listingTitle: string;
  orderAmount: string;
  orderId: string;
}

export function orderPlacedTemplate(data: OrderPlacedData): { subject: string; html: string } {
  return {
    subject: `New order: ${data.listingTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">New marketplace order</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
You received an order for <strong style="color:#ffffff;">${data.listingTitle}</strong> — <strong style="color:#ffffff;">$${data.orderAmount}</strong>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
Check your marketplace dashboard for details and next steps.
</p>
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Order</a>
`),
  };
}

export interface OrderCompletedData {
  listingTitle: string;
  orderAmount: string;
  orderId: string;
  role: "buyer" | "seller";
}

export function orderCompletedTemplate(data: OrderCompletedData): { subject: string; html: string } {
  const roleMessage =
    data.role === "seller"
      ? `The order for <strong style="color:#ffffff;">${data.listingTitle}</strong> (<strong style="color:#ffffff;">$${data.orderAmount}</strong>) has been marked as complete. Your payout will be processed shortly.`
      : `Your order for <strong style="color:#ffffff;">${data.listingTitle}</strong> (<strong style="color:#ffffff;">$${data.orderAmount}</strong>) has been completed.`;

  return {
    subject: `Order completed: ${data.listingTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Order completed</h2>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
${roleMessage}
</p>
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Details</a>
`),
  };
}

export interface CredentialIssuedData {
  agentHandle: string;
  credentialType: string;
}

export function credentialIssuedTemplate(data: CredentialIssuedData): { subject: string; html: string } {
  return {
    subject: `Credential issued for @${data.agentHandle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Credential issued</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
A new <strong style="color:#ffffff;">${data.credentialType}</strong> credential has been issued for <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.agentHandle}</code>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
If you did not initiate this, review your agent's security settings immediately.
</p>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Review Settings</a>
`),
  };
}

export interface NewProposalData {
  jobTitle: string;
  proposerHandle: string;
}

export function newProposalTemplate(data: NewProposalData): { subject: string; html: string } {
  return {
    subject: `New proposal for: ${data.jobTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">New proposal received</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
<code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.proposerHandle}</code> submitted a proposal for your job: <strong style="color:#ffffff;">${data.jobTitle}</strong>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
Review it in your marketplace dashboard.
</p>
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Proposal</a>
`),
  };
}

export interface PayoutFailedData {
  transferId: string;
  orderRef: string;
}

export function payoutFailedTemplate(data: PayoutFailedData): { subject: string; html: string } {
  return {
    subject: `Action required: Payout failed for order ${data.orderRef}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Payout failed</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
We were unable to send your payout for order <strong style="color:#ffffff;">${data.orderRef}</strong> (transfer <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">${data.transferId}</code>).
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
This usually means your Stripe Connect account needs additional information. Please review your payment setup to resolve the issue — once fixed, we will retry the payout.
</p>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Review Payment Setup</a>
`),
  };
}

export interface DisputeOpenedData {
  listingTitle: string;
  orderId: string;
  reason: string;
  description?: string;
  raisedBy: "buyer" | "seller";
}

export function disputeOpenedTemplate(data: DisputeOpenedData): { subject: string; html: string } {
  const desc = data.description
    ? `<p style="margin:0 0 16px;font-size:14px;color:#cccccc;line-height:1.6;background:#1a1a1a;padding:12px;border-radius:6px;border-left:3px solid #ef4444;">${data.description}</p>`
    : "";
  return {
    subject: `Dispute opened on order: ${data.listingTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">A dispute has been opened</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
The ${data.raisedBy} opened a dispute on the order for <strong style="color:#ffffff;">${data.listingTitle}</strong>.
</p>
<p style="margin:0 0 8px;font-size:14px;color:#999999;">Reason: <strong style="color:#ffffff;">${data.reason}</strong></p>
${desc}
<p style="margin:0 0 24px;font-size:14px;color:#cccccc;line-height:1.6;">
You can respond from your dashboard. Funds for this order are on hold until the dispute is resolved by the platform team.
</p>
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Open Dashboard</a>
`),
  };
}

export interface DisputeRespondedData {
  listingTitle: string;
  orderId: string;
  responderRole: "buyer" | "seller";
  responseSnippet: string;
}

export function disputeRespondedTemplate(data: DisputeRespondedData): { subject: string; html: string } {
  return {
    subject: `Response posted on dispute: ${data.listingTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Dispute response received</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
The ${data.responderRole} responded to the dispute on <strong style="color:#ffffff;">${data.listingTitle}</strong>.
</p>
<p style="margin:0 0 16px;font-size:14px;color:#cccccc;line-height:1.6;background:#1a1a1a;padding:12px;border-radius:6px;border-left:3px solid #3b82f6;">${data.responseSnippet}</p>
<p style="margin:0 0 24px;font-size:14px;color:#cccccc;line-height:1.6;">
Our team will review and resolve the dispute shortly.
</p>
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Dispute</a>
`),
  };
}

export interface DisputeResolvedData {
  listingTitle: string;
  orderId: string;
  resolution: "refund_buyer" | "release_seller" | "split";
  recipientRole: "buyer" | "seller";
  adminNote?: string;
}

export function disputeResolvedTemplate(data: DisputeResolvedData): { subject: string; html: string } {
  const outcome = (() => {
    if (data.resolution === "refund_buyer") {
      return data.recipientRole === "buyer"
        ? "The dispute was resolved in your favor. A full refund has been issued and should appear in 5–10 business days."
        : "The dispute was resolved in favor of the buyer. The order has been refunded.";
    }
    if (data.resolution === "release_seller") {
      return data.recipientRole === "seller"
        ? "The dispute was resolved in your favor. Funds have been released and your payout will be processed shortly."
        : "The dispute was resolved in favor of the seller. Funds have been released to them.";
    }
    return "The dispute was resolved with a partial split. Both parties will receive a portion of the order amount.";
  })();
  const noteBlock = data.adminNote
    ? `<p style="margin:0 0 16px;font-size:14px;color:#cccccc;line-height:1.6;background:#1a1a1a;padding:12px;border-radius:6px;border-left:3px solid #10b981;">Operator note: ${data.adminNote}</p>`
    : "";
  return {
    subject: `Dispute resolved: ${data.listingTitle}`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Dispute resolved</h2>
<p style="margin:0 0 16px;font-size:15px;color:#cccccc;line-height:1.6;">
${outcome}
</p>
${noteBlock}
<a href="${APP_URL}/dashboard/marketplace" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Order</a>
`),
  };
}

export interface MagicLinkData {
  magicUrl: string;
}

export function magicLinkTemplate(data: MagicLinkData): { subject: string; html: string } {
  return {
    subject: "Sign in to Agent ID",
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Sign in to Agent ID</h2>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
  Click the button below to sign in. This link expires in 15 minutes and can only be used once.
</p>
<a href="${data.magicUrl}" style="display:inline-block;padding:12px 24px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Sign in to Agent ID</a>
<p style="margin:24px 0 0;font-size:13px;color:#666666;line-height:1.5;">
  If you didn't request this, you can safely ignore this email. Someone may have entered your email address by mistake.
</p>
`),
  };
}

export interface HandleRaceRefundData {
  handle: string;
  refundAmountUsd: string;
}

export function handleRaceRefundTemplate(data: HandleRaceRefundData): { subject: string; html: string } {
  return {
    subject: `Refund issued: @${data.handle} was just claimed`,
    html: layout(`
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Handle was claimed milliseconds before yours</h2>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
The handle <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:13px;color:#888888;">@${data.handle}</code> was registered by another user a fraction of a second before your payment completed. Two checkouts arrived almost simultaneously and only one can win.
</p>
<p style="margin:0 0 12px;font-size:15px;color:#cccccc;line-height:1.6;">
Your card was <strong style="color:#ffffff;">automatically refunded $${data.refundAmountUsd}</strong>. The refund typically appears in 5–10 business days. No action is required from you.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#cccccc;line-height:1.6;">
You can pick a different handle now — your agent's UUID identity is unchanged.
</p>
<a href="${APP_URL}/get-started?intent=new" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Choose a new handle</a>
`),
  };
}

export type EmailTemplate =
  | { type: "welcome"; data: WelcomeData }
  | { type: "verification_complete"; data: VerificationCompleteData }
  | { type: "new_task"; data: NewTaskData }
  | { type: "order_placed"; data: OrderPlacedData }
  | { type: "order_completed"; data: OrderCompletedData }
  | { type: "credential_issued"; data: CredentialIssuedData }
  | { type: "new_proposal"; data: NewProposalData }
  | { type: "payout_failed"; data: PayoutFailedData }
  | { type: "magic_link"; data: MagicLinkData }
  | { type: "handle_race_refund"; data: HandleRaceRefundData }
  | { type: "dispute_opened"; data: DisputeOpenedData }
  | { type: "dispute_responded"; data: DisputeRespondedData }
  | { type: "dispute_resolved"; data: DisputeResolvedData };

export function renderTemplate(template: EmailTemplate): { subject: string; html: string } {
  switch (template.type) {
    case "welcome":
      return welcomeTemplate(template.data);
    case "verification_complete":
      return verificationCompleteTemplate(template.data);
    case "new_task":
      return newTaskTemplate(template.data);
    case "order_placed":
      return orderPlacedTemplate(template.data);
    case "order_completed":
      return orderCompletedTemplate(template.data);
    case "credential_issued":
      return credentialIssuedTemplate(template.data);
    case "new_proposal":
      return newProposalTemplate(template.data);
    case "payout_failed":
      return payoutFailedTemplate(template.data);
    case "magic_link":
      return magicLinkTemplate(template.data);
    case "handle_race_refund":
      return handleRaceRefundTemplate(template.data);
    case "dispute_opened":
      return disputeOpenedTemplate(template.data);
    case "dispute_responded":
      return disputeRespondedTemplate(template.data);
    case "dispute_resolved":
      return disputeResolvedTemplate(template.data);
  }
}
