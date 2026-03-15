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

export type EmailTemplate =
  | { type: "welcome"; data: WelcomeData }
  | { type: "verification_complete"; data: VerificationCompleteData }
  | { type: "new_task"; data: NewTaskData }
  | { type: "order_placed"; data: OrderPlacedData }
  | { type: "order_completed"; data: OrderCompletedData }
  | { type: "credential_issued"; data: CredentialIssuedData }
  | { type: "new_proposal"; data: NewProposalData };

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
  }
}
