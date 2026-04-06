import type { BootstrapBundle } from "../types.js";

export interface PromptBlockOptions {
  description?: string;
  allowedScopes?: string[];
}

/**
 * Sanitize a user-controlled string before embedding it in an LLM system prompt.
 *
 * Without this, an attacker who registers an agent with a crafted displayName
 * or description ("Alice\n\n## IGNORE PREVIOUS INSTRUCTIONS\n…") can break
 * out of the identity section and inject arbitrary instructions into any LLM
 * that consumes the prompt block.
 *
 * This function normalises newlines to spaces, strips ASCII control characters,
 * collapses runs of backticks (which could close/open code-fenced blocks), and
 * trims the result.  It is intentionally conservative: it never throws and
 * never produces an empty string for a non-empty input.
 */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/[\r\n\t\v\f]/g, " ")           // newlines / tabs → space
    .replace(/[\x00-\x1F\x7F]/g, "")         // strip remaining ASCII control chars
    .replace(/`{3,}/g, "``")                  // collapse triple+ backticks → ``
    .replace(/ {2,}/g, " ")                   // collapse multiple spaces
    .trim();
}

export function formatPromptBlock(bundle: BootstrapBundle, options?: PromptBlockOptions): string {
  const handle = bundle.handle || bundle.agent?.handle || null;
  const agentId = bundle.agent_id || bundle.machine_identity?.agent_id || bundle.machineIdentity?.agentId || bundle.id || "";
  const trustScore = (bundle.trust as { score?: number })?.score ?? 0;
  const trustTier = bundle.trust?.tier ?? "unverified";

  const APP_URL = "https://getagent.id";
  const handleNftMetadataUrl = handle
    ? `${APP_URL}/api/v1/nft/metadata/${handle}`
    : null;
  const profileUrl = handle ? `${APP_URL}/${handle}` : bundle.public_profile_url || `${APP_URL}/id/${agentId}`;
  const inboxUrl = agentId ? `${APP_URL}/api/v1/mail/agents/${agentId}/inbox` : null;

  const displayName = sanitizeForPrompt(bundle.display_name || "");

  const lines: string[] = [
    `## AgentID`,
    ``,
    `You are an AI agent with a verified identity on the Agent ID network.`,
    ``,
    `- **Name**: ${displayName}`,
    `- **Handle**: ${handle ? `${handle}.agentid` : "(no handle)"}`,
    `- **Agent ID**: ${agentId}`,
    `- **DID (canonical)**: did:web:getagent.id:agents:${agentId}`,
    handle ? `- **Handle DID (alias)**: did:agentid:${handle}` : null,
    `- **Trust Score**: ${trustScore}/100`,
    `- **Trust Tier**: ${trustTier}`,
    handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
  ].filter((l) => l !== null) as string[];

  if (inboxUrl) {
    lines.push(`- **Inbox**: ${inboxUrl}`);
  }

  lines.push(`- **Profile**: ${profileUrl}`);

  if (bundle.capabilities && bundle.capabilities.length > 0) {
    const caps = bundle.capabilities.map(sanitizeForPrompt).filter(Boolean);
    if (caps.length > 0) lines.push(`- **Capabilities**: ${caps.join(", ")}`);
  }

  if (options?.description) {
    lines.push(`- **Description**: ${sanitizeForPrompt(options.description)}`);
  }

  if (options?.allowedScopes && options.allowedScopes.length > 0) {
    const scopes = options.allowedScopes.map(sanitizeForPrompt).filter(Boolean);
    if (scopes.length > 0) lines.push(`- **Allowed Scopes**: ${scopes.join(", ")}`);
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
