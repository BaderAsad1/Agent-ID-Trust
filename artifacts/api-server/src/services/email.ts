import {
  deliverOutbound,
  resolveTransportProvider,
  type TransportEnvelope,
  type TransportResult,
} from "./mail-transport.js";

const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@agentid.dev";

function envelope(
  to: string,
  subject: string,
  body: string,
  bodyFormat: "text" | "html" = "html",
): TransportEnvelope {
  return {
    messageId: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: FROM_EMAIL,
    to,
    subject,
    body,
    bodyFormat,
  };
}

async function sendNotification(
  env: TransportEnvelope,
): Promise<TransportResult> {
  const provider = resolveTransportProvider(env.to);
  if (provider.name === "webhook") {
    console.warn(
      `[email] Skipping notification to ${env.to} — no real email transport configured (RESEND_API_KEY not set)`,
    );
    return { success: false, providerName: "none", error: "No email transport configured" };
  }
  return deliverOutbound(env);
}

export async function sendAgentRegisteredEmail(
  userEmail: string,
  agentHandle: string,
  agentDisplayName: string,
) {
  const html = `
    <h2>Your agent has been registered</h2>
    <p><strong>${agentDisplayName}</strong> (<code>@${agentHandle}</code>) is now registered on Agent ID.</p>
    <p>Next step: verify your agent's identity to increase its trust score.</p>
    <p>Visit your <a href="${process.env.APP_URL || "https://agentid.dev"}/dashboard">dashboard</a> to manage your agent.</p>
  `;
  return sendNotification(
    envelope(userEmail, `Agent registered: ${agentDisplayName}`, html),
  );
}

export async function sendCredentialIssuedEmail(
  userEmail: string,
  agentHandle: string,
  credentialType: string,
) {
  const html = `
    <h2>Credential issued</h2>
    <p>A new <strong>${credentialType}</strong> credential has been issued for <code>@${agentHandle}</code>.</p>
    <p>If you did not initiate this, please review your agent's security settings immediately.</p>
  `;
  return sendNotification(
    envelope(userEmail, `Credential issued for @${agentHandle}`, html),
  );
}

export async function sendNewProposalEmail(
  userEmail: string,
  jobTitle: string,
  proposerHandle: string,
) {
  const html = `
    <h2>New proposal received</h2>
    <p><code>@${proposerHandle}</code> submitted a proposal for your job: <strong>${jobTitle}</strong>.</p>
    <p>Review it in your <a href="${process.env.APP_URL || "https://agentid.dev"}/dashboard/marketplace">dashboard</a>.</p>
  `;
  return sendNotification(
    envelope(userEmail, `New proposal for: ${jobTitle}`, html),
  );
}

export async function sendMarketplaceOrderEmail(
  userEmail: string,
  listingTitle: string,
  orderAmount: string,
) {
  const html = `
    <h2>New marketplace order</h2>
    <p>You received an order for <strong>${listingTitle}</strong> ($${orderAmount}).</p>
    <p>Check your <a href="${process.env.APP_URL || "https://agentid.dev"}/dashboard/marketplace">marketplace dashboard</a> for details.</p>
  `;
  return sendNotification(
    envelope(userEmail, `New order: ${listingTitle}`, html),
  );
}
