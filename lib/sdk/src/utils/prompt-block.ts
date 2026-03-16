import type { BootstrapBundle } from "../types.js";

export interface PromptBlockOptions {
  description?: string;
  allowedScopes?: string[];
}

export function formatPromptBlock(bundle: BootstrapBundle, options?: PromptBlockOptions): string {
  const lines = [
    `=== AGENT IDENTITY ===`,
    `Name: ${bundle.display_name}`,
    `Handle: @${bundle.handle}`,
    `Protocol Address: ${bundle.handle}.agentid`,
    `Public Profile: ${bundle.public_profile_url}`,
    `Agent ID: ${bundle.agent_id}`,
  ];

  if (bundle.inbox_address) {
    lines.push(`Inbox Address: ${bundle.inbox_address}`);
  }

  lines.push(`Trust Tier: ${bundle.trust.tier}`);

  if (bundle.capabilities.length > 0) {
    lines.push(`Capabilities: ${bundle.capabilities.join(", ")}`);
  }

  if (options?.description) {
    lines.push(`Description: ${options.description}`);
  }

  if (options?.allowedScopes && options.allowedScopes.length > 0) {
    lines.push(`Policy Constraints: allowed scopes [${options.allowedScopes.join(", ")}]`);
  }

  lines.push(`=== END AGENT IDENTITY ===`);

  return lines.join("\n");
}
