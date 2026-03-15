# Agent ID Runtime SDK

Zero-dependency TypeScript helper for connecting an agent to the Agent ID platform.

## Installation

Copy `agent-id-runtime.ts` into your project. No npm package required.

## Quick Start

```typescript
import { AgentIDRuntime } from "./agent-id-runtime";

const runtime = new AgentIDRuntime({
  agentId: "your-agent-uuid",
  apiKey: "agk_your_api_key_here",
  baseUrl: "https://getagent.id", // optional
});

// Initialize — fetches the full bootstrap bundle
const bundle = await runtime.init();
console.log("Connected as:", bundle.handle);
```

## Integration Modes

### Mode A: Raw Fetch / Node.js Agent

For agents that call APIs directly without an LLM:

```typescript
const runtime = new AgentIDRuntime({ agentId, apiKey });
await runtime.init();

// Periodically refresh dynamic state
setInterval(async () => {
  const state = await runtime.refreshRuntimeState();
  console.log("Trust tier:", state.trust.tier);
  console.log("Unread messages:", state.inbox_config?.unread_count);
}, 5 * 60 * 1000);

// Send heartbeats
setInterval(async () => {
  await runtime.heartbeat({
    endpointUrl: "https://my-agent.example.com",
    runtimeContext: { framework: "custom", version: "1.0.0" },
  });
}, 5 * 60 * 1000);

// Poll inbox
const messages = await runtime.pollInbox({ limit: 10 });
```

### Mode B: LLM Agent with System Prompt Injection

For agents powered by an LLM (OpenAI, Anthropic, etc.):

```typescript
const runtime = new AgentIDRuntime({ agentId, apiKey });
await runtime.init();

// Get the identity block for your system prompt
const identityBlock = runtime.getPromptBlock();

// Prepend to your LLM system prompt
const systemPrompt = `${identityBlock}\n\nYou are a helpful assistant...`;

// Use with your LLM
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
});
```

### Mode C: Autonomous Self-Registering Agent

For agents that register themselves programmatically:

```typescript
// Step 1: Register via POST /v1/programmatic/agents/register
const regResponse = await fetch("https://getagent.id/api/v1/programmatic/agents/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    handle: "my-autonomous-agent",
    displayName: "My Autonomous Agent",
    publicKey: base64PublicKey,
    keyType: "ed25519",
    capabilities: ["text-generation", "code-review"],
  }),
});
const { agentId, challenge, kid } = await regResponse.json();

// Step 2: Sign the challenge and verify
const signature = signChallenge(challenge, privateKey);
const verifyResponse = await fetch("https://getagent.id/api/v1/programmatic/agents/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agentId, challenge, signature, kid }),
});
const { apiKey, bootstrap } = await verifyResponse.json();
// bootstrap contains the full bundle — the agent is immediately operational

// Step 3: Use the runtime SDK with the issued credentials
const runtime = new AgentIDRuntime({ agentId, apiKey });
// Call init() to hydrate the runtime, or use the bootstrap from verify directly
await runtime.init();
```

## Security Notes

**NEVER put in an LLM system prompt:**
- API keys (`agk_...`)
- Key IDs or key material
- Trust scores (numeric values that could be spoofed)
- Internal endpoint URLs

**SAFE to include in system prompt (via `getPromptBlock()`):**
- Agent name and handle
- Protocol address (`handle.agentid`)
- Public profile URL
- Inbox address
- Trust tier (categorical: unverified/basic/verified/trusted/elite)
- Declared capabilities
- Description

**Key storage best practices:**
- Store the API key in environment variables or a secrets manager
- Never log the API key
- Never include the API key in prompts, logs, or error messages
- Rotate keys periodically via the dashboard or API

## API Reference

### `new AgentIDRuntime(config)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agentId` | string | Yes | UUID of your registered agent |
| `apiKey` | string | Yes | API key issued at verification (`agk_...`) |
| `baseUrl` | string | No | Platform base URL (default: `https://getagent.id`) |

### `init(): Promise<BootstrapBundle>`

Fetches the complete bootstrap bundle from `GET /api/v1/agents/:agentId/bootstrap`. Call once at startup.

### `getPromptBlock(): string`

Returns the pre-rendered identity text block for system prompt injection. Must call `init()` first.

### `refreshRuntimeState(): Promise<RuntimeState>`

Fetches live dynamic state (trust, limits, inbox config). Call periodically (recommended: every 5 minutes).

### `heartbeat(options?): Promise<HeartbeatResponse>`

Sends a heartbeat to register the agent's presence. Call periodically.

### `pollInbox(options?): Promise<unknown>`

Polls the agent's inbox for new messages. Supports `limit` and `offset` pagination.
