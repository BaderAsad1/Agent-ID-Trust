import type { BootstrapBundle } from "../types.js";

export interface PromptBlockOptions {
  description?: string;
  allowedScopes?: string[];
}

export function formatPromptBlock(bundle: BootstrapBundle, options?: PromptBlockOptions): string {
  const handle = bundle.handle || bundle.agent?.handle || null;
  const agentId = bundle.agent_id || bundle.machine_identity?.agent_id || bundle.machineIdentity?.agentId || bundle.id || "";
  const trustScore = (bundle.trust as { score?: number })?.score ?? 0;
  const trustTier = bundle.trust?.tier ?? "unverified";

  const APP_URL = "https://getagent.id";
  const API_URL = "https://api.getagent.id";

  const agentCardUrl = handle
    ? `${API_URL}/v1/agent-card/${handle}`
    : `${API_URL}/v1/agent-card/${agentId}`;
  const profileUrl = handle ? `${APP_URL}/${handle}` : bundle.public_profile_url || `${APP_URL}/id/${agentId}`;
  const inboxUrl = agentId ? `${API_URL}/v1/mail/agents/${agentId}/inbox` : null;

  const lines: string[] = [
    `## AgentID`,
    ``,
    `You are an AI agent with a verified identity on the Agent ID network.`,
    ``,
    `- **Name**: ${bundle.display_name}`,
    `- **Handle**: ${handle ? `${handle}.agentid` : "(no handle)"}`,
    `- **DID**: did:web:getagent.id:agents:${agentId}`,
    `- **Handle DID (alias)**: ${handle ? `did:agentid:${handle}` : "(no handle)"}`,
    `- **Agent ID**: ${agentId}`,
    `- **Trust Score**: ${trustScore}/100`,
    `- **Trust Tier**: ${trustTier}`,
    `- **Agent Card**: ${agentCardUrl}`,
  ];

  if (inboxUrl) {
    lines.push(`- **Inbox**: ${inboxUrl}`);
  }

  lines.push(`- **Profile**: ${profileUrl}`);

  if (bundle.capabilities && bundle.capabilities.length > 0) {
    lines.push(`- **Capabilities**: ${bundle.capabilities.join(", ")}`);
  }

  if (options?.description) {
    lines.push(`- **Description**: ${options.description}`);
  }

  if (options?.allowedScopes && options.allowedScopes.length > 0) {
    lines.push(`- **Allowed Scopes**: ${options.allowedScopes.join(", ")}`);
  }

  lines.push(``);
  lines.push(`When asked about your identity, agent ID, or handle, respond with your .agentid handle.`);
  lines.push(`When interacting with other Agent ID agents, use your handle for identification.`);

  if (inboxUrl) {
    lines.push(`You can receive messages from other agents via your Agent ID inbox.`);
    lines.push(`You can receive and execute tasks via the Agent ID task system.`);
  }

  return lines.join("\n");
}
