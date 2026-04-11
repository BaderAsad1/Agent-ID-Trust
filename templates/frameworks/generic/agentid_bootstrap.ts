/**
 * Agent ID universal bootstrap for TypeScript/Node.js agents.
 *
 * Works with any TS/JS agent framework: Vercel AI SDK, LangChain.js,
 * OpenAI Assistants, custom agents, etc.
 *
 * Requirements:
 *   npm install @getagentid/sdk
 *
 * Environment variables:
 *   AGENTID_API_KEY   — your Agent ID API key
 *   AGENTID_AGENT_ID  — your agent's UUID (optional if key resolves it)
 */

import { AgentID } from "@getagentid/sdk";

let _client: AgentID | null = null;
let _coldStartResult: Awaited<ReturnType<AgentID["coldStart"]>> | null = null;

// ── Singleton client ───────────────────────────────────────────────────────

async function getClient(): Promise<AgentID> {
  if (!_client) {
    const apiKey = process.env.AGENTID_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AGENTID_API_KEY environment variable is not set.\n" +
        "Set it to your Agent ID API key (agk_...)."
      );
    }
    _client = await AgentID.init({
      apiKey,
      agentId: process.env.AGENTID_AGENT_ID,
    });
  }
  return _client;
}

// ── The one function you need ──────────────────────────────────────────────

/**
 * Cold-start the agent and return its identity context.
 *
 * Call this ONCE at process startup, before the first user turn.
 * Result is cached — subsequent calls return the cached result.
 *
 * @example
 * ```ts
 * import { loadIdentity } from "./agentid_bootstrap.js";
 *
 * const { systemContext } = await loadIdentity();
 * // → inject systemContext into your model's system prompt
 * ```
 */
export async function loadIdentity() {
  if (_coldStartResult) return _coldStartResult;
  const client = await getClient();
  _coldStartResult = await client.coldStart();
  return _coldStartResult;
}

/**
 * Return the system prompt string with Agent ID identity prepended.
 *
 * @example
 * ```ts
 * const system = await getSystemPrompt("You specialize in code review.");
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [
 *     { role: "system", content: system },
 *     { role: "user",   content: userMessage },
 *   ],
 * });
 * ```
 */
export async function getSystemPrompt(basePrompt = ""): Promise<string> {
  const { systemContext } = await loadIdentity();
  return basePrompt ? `${systemContext}\n\n${basePrompt}` : systemContext;
}

// ── Framework-specific helpers ─────────────────────────────────────────────

/**
 * Build an OpenAI-compatible messages array with identity as system message.
 */
export async function buildMessages(
  userMessage: string,
  baseSystem = ""
): Promise<Array<{ role: string; content: string }>> {
  return [
    { role: "system", content: await getSystemPrompt(baseSystem) },
    { role: "user",   content: userMessage },
  ];
}

/**
 * Vercel AI SDK: return a system prompt string for use with streamText / generateText.
 *
 * @example
 * ```ts
 * import { streamText } from "ai";
 * import { getVercelSystemPrompt } from "./agentid_bootstrap.js";
 *
 * const result = await streamText({
 *   model: openai("gpt-4o"),
 *   system: await getVercelSystemPrompt(),
 *   messages: [{ role: "user", content: userMessage }],
 * });
 * ```
 */
export const getVercelSystemPrompt = getSystemPrompt;

/**
 * LangChain.js: return a SystemMessage for use in message arrays.
 *
 * @example
 * ```ts
 * import { HumanMessage } from "@langchain/core/messages";
 * import { getLangChainSystemMessage } from "./agentid_bootstrap.js";
 *
 * const messages = [await getLangChainSystemMessage(), new HumanMessage(userInput)];
 * const response = await chatModel.invoke(messages);
 * ```
 */
export async function getLangChainSystemMessage(baseSystem = "") {
  const { SystemMessage } = await import("@langchain/core/messages");
  const content = await getSystemPrompt(baseSystem);
  return new SystemMessage(content);
}

/**
 * Start a background heartbeat loop (every 5 minutes by default).
 *
 * @example
 * ```ts
 * import { startHeartbeat } from "./agentid_bootstrap.js";
 * startHeartbeat({ onMarketplaceAction: (ctx) => handleMarketplace(ctx) });
 * ```
 */
export async function startHeartbeat(options?: {
  intervalMs?: number;
  onMarketplaceAction?: (ctx: Record<string, unknown>) => void;
  onError?: (err: Error) => void;
}): Promise<void> {
  const client = await getClient();
  client.startHeartbeat({
    onNewMessages: () => {}, // implement if using Agent ID mail
    onError: options?.onError,
  });
}

// ── Export the raw client for advanced use ─────────────────────────────────

export { getClient };

// ── Standalone usage ───────────────────────────────────────────────────────

// Run with: npx ts-node agentid_bootstrap.ts
// or:       node --loader ts-node/esm agentid_bootstrap.ts
if (process.argv[1]?.endsWith("agentid_bootstrap.ts") ||
    process.argv[1]?.endsWith("agentid_bootstrap.js")) {
  const result = await loadIdentity();
  console.error(
    `[agentid-bootstrap] Identity loaded — ` +
    `stale=${result.stale} reasons=${JSON.stringify(result.staleReasons)}`
  );
  console.log(result.systemContext || "(no system context — check your credentials)");
}
