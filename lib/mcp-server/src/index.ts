import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { webcrypto } from "node:crypto";

const DEFAULT_BASE_URL = "https://getagent.id";

const subtle = (webcrypto as unknown as Crypto).subtle;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: CryptoKey;
  kid: string;
}> {
  const keyPair = await subtle.generateKey(
    { name: "Ed25519" } as EcKeyGenParams,
    false,
    ["sign", "verify"],
  );
  const publicKeyBuffer = await subtle.exportKey(
    "spki",
    (keyPair as CryptoKeyPair).publicKey,
  );
  const bytes = new Uint8Array(16);
  webcrypto.getRandomValues(bytes);
  const kid = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: (keyPair as CryptoKeyPair).privateKey,
    kid,
  };
}

async function signChallenge(
  challenge: string,
  privateKey: CryptoKey,
): Promise<string> {
  const data = new TextEncoder().encode(challenge);
  const signature = await subtle.sign("Ed25519" as string, privateKey, data);
  return arrayBufferToBase64(signature);
}

async function apiRequest(
  method: string,
  path: string,
  baseUrl: string,
  apiKey?: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "AgentID-Client/1.0 AgentID-MCP/1.0",
  };
  if (apiKey) headers["X-Agent-Key"] = apiKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const msg =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).message ||
          (parsed as Record<string, unknown>).error ||
          `HTTP ${res.status}`
        : `HTTP ${res.status}`;
    throw new Error(String(msg));
  }

  return parsed;
}

export function createServer(): McpServer {
  const serverApiKey = process.env.AGENTID_API_KEY;
  const serverBaseUrl = process.env.API_BASE_URL || DEFAULT_BASE_URL;

  if (!serverApiKey) {
    throw new Error(
      "AGENTID_API_KEY environment variable is required. " +
        "Set it to your agent API key (agk_...) before starting the MCP server.",
    );
  }

  const server = new McpServer({
    name: "agentid",
    version: "1.0.0",
  });

  server.tool(
    "agentid_register",
    "Register a new AI agent on Agent ID. Returns agent_id, handle, and API key. The agent is automatically verified via cryptographic key-signing. Note: stores the new agent's API key in the response — save it immediately.",
    {
      handle: z.string().describe("Globally unique handle for the agent (e.g. 'research-agent')"),
      displayName: z.string().describe("Human-readable display name"),
      description: z.string().optional().describe("Short description of what the agent does"),
      capabilities: z.array(z.string()).optional().describe("List of capabilities (e.g. ['research', 'summarization'])"),
      endpointUrl: z.string().optional().describe("URL where the agent receives tasks"),
    },
    async (params) => {
      const base = serverBaseUrl;

      const keyPair = await generateKeyPair();

      const registerResult = (await apiRequest(
        "POST",
        "/api/v1/programmatic/agents/register",
        base,
        undefined,
        {
          handle: params.handle,
          displayName: params.displayName,
          publicKey: keyPair.publicKey,
          keyType: "ed25519",
          description: params.description,
          capabilities: params.capabilities,
          endpointUrl: params.endpointUrl,
        },
      )) as {
        agentId: string;
        handle: string;
        challenge: string;
        kid: string;
        expiresAt: string;
      };

      const signature = await signChallenge(
        registerResult.challenge,
        keyPair.privateKey,
      );

      const verifyResult = (await apiRequest(
        "POST",
        "/api/v1/programmatic/agents/verify",
        base,
        undefined,
        {
          agentId: registerResult.agentId,
          challenge: registerResult.challenge,
          signature,
          kid: registerResult.kid,
        },
      )) as {
        verified: boolean;
        agentId: string;
        handle: string;
        apiKey: string;
        trustScore: number;
        trustTier: string;
        planStatus: string;
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                agentId: verifyResult.agentId,
                handle: verifyResult.handle,
                apiKey: verifyResult.apiKey,
                trustScore: verifyResult.trustScore,
                trustTier: verifyResult.trustTier,
                verified: verifyResult.verified,
                message:
                  "Agent registered and verified successfully. Save the API key immediately — it cannot be retrieved again. Set it as AGENTID_API_KEY in your MCP server environment to authenticate subsequent calls.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_whoami",
    "Get the identity and bootstrap bundle of the authenticated agent (configured via AGENTID_API_KEY). Returns handle, DID, trust score, capabilities, and inbox info.",
    {
      agentId: z.string().optional().describe("Specific agent ID (optional — auto-detected from the configured API key)"),
    },
    async (params) => {
      const base = serverBaseUrl;

      let agentId = params.agentId;
      if (!agentId) {
        const whoami = (await apiRequest(
          "GET",
          "/api/v1/agents/whoami",
          base,
          serverApiKey,
        )) as { id?: string; agent_id?: string };
        agentId = whoami.id || whoami.agent_id || "";
      }

      const bootstrap = (await apiRequest(
        "GET",
        `/api/v1/agents/${agentId}/bootstrap`,
        base,
        serverApiKey,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                agentId,
                handle: bootstrap.handle,
                did: `did:web:getagent.id:agents:${agentId}`,
                handleAlias: bootstrap.handle ? `did:agentid:${bootstrap.handle}` : null,
                protocolAddress: bootstrap.protocol_address,
                trustScore: (bootstrap.trust as Record<string, unknown>)?.score,
                trustTier: (bootstrap.trust as Record<string, unknown>)?.tier,
                capabilities: bootstrap.capabilities,
                status: bootstrap.status,
                inboxAddress: bootstrap.inbox_address,
                publicProfileUrl: bootstrap.public_profile_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_resolve",
    "Resolve a .agentid handle to the full Agent ID Object. Returns identity, capabilities, trust score, endpoint, and more. No authentication required.",
    {
      handle: z.string().describe("Handle to resolve (e.g. 'research-agent' or 'research-agent.agentid')"),
    },
    async (params) => {
      const base = serverBaseUrl;
      const cleanHandle = params.handle.replace(/\.(agentid|agent)$/i, "").toLowerCase();

      const result = (await apiRequest(
        "GET",
        `/api/v1/resolve/${encodeURIComponent(cleanHandle)}`,
        base,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_discover",
    "Discover agents on Agent ID by capability, minimum trust score, protocol, or verification status. Returns a list of matching agents.",
    {
      capability: z.string().optional().describe("Filter by capability (e.g. 'research', 'code-review')"),
      minTrust: z.number().optional().describe("Minimum trust score (0-100)"),
      protocol: z.string().optional().describe("Filter by protocol ('mcp', 'a2a', 'rest')"),
      verifiedOnly: z.boolean().optional().describe("Only return verified agents"),
      limit: z.number().optional().describe("Max results to return (default: 20)"),
      offset: z.number().optional().describe("Pagination offset"),
    },
    async (params) => {
      const base = serverBaseUrl;
      const qp = new URLSearchParams();
      if (params.capability) qp.set("capability", params.capability);
      if (params.minTrust !== undefined) qp.set("minTrust", String(params.minTrust));
      if (params.protocol) qp.set("protocol", params.protocol);
      if (params.verifiedOnly) qp.set("verifiedOnly", "true");
      if (params.limit !== undefined) qp.set("limit", String(params.limit));
      if (params.offset !== undefined) qp.set("offset", String(params.offset));
      const qs = qp.toString();

      const result = (await apiRequest(
        "GET",
        `/api/v1/resolve${qs ? `?${qs}` : ""}`,
        base,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_send_task",
    "Send a task to another agent via Agent ID. Authenticated using the server-configured AGENTID_API_KEY. The recipient agent will see the task in their inbox.",
    {
      senderAgentId: z.string().describe("Your agent ID (the sender)"),
      recipientAgentId: z.string().describe("Target agent ID to send the task to"),
      taskType: z.string().describe("Type of task (e.g. 'research', 'summarize', 'code-review')"),
      payload: z.record(z.unknown()).optional().describe("Task payload — any structured data for the recipient"),
    },
    async (params) => {
      const base = serverBaseUrl;

      const result = (await apiRequest(
        "POST",
        "/api/v1/tasks",
        base,
        serverApiKey,
        {
          senderAgentId: params.senderAgentId,
          recipientAgentId: params.recipientAgentId,
          taskType: params.taskType,
          payload: params.payload,
        },
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_check_inbox",
    "Check the authenticated agent's inbox for pending tasks and unread messages. Authenticated using the server-configured AGENTID_API_KEY.",
    {
      agentId: z.string().describe("Agent ID to check inbox for"),
      limit: z.number().optional().describe("Max messages/tasks to return (default: 20)"),
    },
    async (params) => {
      const base = serverBaseUrl;
      const limit = params.limit ?? 20;

      let tasks: Record<string, unknown>;
      let tasksError: string | null = null;
      let messages: Record<string, unknown>;
      let messagesError: string | null = null;

      const [tasksResult, messagesResult] = await Promise.allSettled([
        apiRequest(
          "GET",
          `/api/v1/tasks?recipientAgentId=${params.agentId}&businessStatus=pending&limit=${limit}`,
          base,
          serverApiKey,
        ),
        apiRequest(
          "GET",
          `/api/v1/mail/agents/${params.agentId}/messages?direction=inbound&isRead=false&limit=${limit}`,
          base,
          serverApiKey,
        ),
      ]);

      if (tasksResult.status === "fulfilled") {
        tasks = tasksResult.value as Record<string, unknown>;
      } else {
        tasks = { tasks: [], total: 0 };
        tasksError = tasksResult.reason instanceof Error ? tasksResult.reason.message : "Failed to fetch tasks";
      }

      if (messagesResult.status === "fulfilled") {
        messages = messagesResult.value as Record<string, unknown>;
      } else {
        messages = { messages: [], total: 0 };
        messagesError = messagesResult.reason instanceof Error ? messagesResult.reason.message : "Failed to fetch messages";
      }

      const result: Record<string, unknown> = {
        pendingTasks: tasks,
        unreadMessages: messages,
      };
      if (tasksError || messagesError) {
        result.errors = {
          ...(tasksError ? { tasks: tasksError } : {}),
          ...(messagesError ? { messages: messagesError } : {}),
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "agentid_verify_credential",
    "Verify an Agent ID Verifiable Credential. Checks expiration, structure, and cryptographic proof via the Agent ID API. No authentication required.",
    {
      credential: z
        .object({
          "@context": z.array(z.string()),
          type: z.array(z.string()),
          issuer: z.string(),
          issuanceDate: z.string(),
          expirationDate: z.string(),
          credentialSubject: z.object({
            handle: z.string(),
          }).passthrough(),
          proof: z
            .object({
              signatureValue: z.string(),
            })
            .passthrough(),
        })
        .passthrough()
        .describe("The full Verifiable Credential object to verify"),
    },
    async (params) => {
      const base = serverBaseUrl;
      const cred = params.credential;

      if (!cred.proof?.signatureValue) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: false, reason: "Missing proof signature" }),
            },
          ],
        };
      }

      if (new Date(cred.expirationDate) < new Date()) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: false, reason: "Credential has expired" }),
            },
          ],
        };
      }

      const handle = cred.credentialSubject?.handle;
      if (!handle) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: false, reason: "Missing credential subject handle" }),
            },
          ],
        };
      }

      try {
        const result = (await apiRequest(
          "POST",
          `/api/v1/p/${encodeURIComponent(handle)}/credential/verify`,
          base,
          undefined,
          cred,
        )) as { valid: boolean; reason?: string };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                reason: err instanceof Error ? err.message : "Verification failed",
              }),
            },
          ],
        };
      }
    },
  );

  server.tool(
    "agentid_send_message",
    "Send a message to another agent's inbox. Authenticated using the server-configured AGENTID_API_KEY.",
    {
      fromAgentId: z.string().describe("Your agent ID (the sender)"),
      toAgentId: z.string().describe("Recipient agent ID"),
      subject: z.string().optional().describe("Message subject line"),
      body: z.string().describe("Message body text"),
      threadId: z.string().optional().describe("Thread UUID for conversation threading"),
    },
    async (params) => {
      const result = (await apiRequest(
        "POST",
        `/api/v1/mail/agents/${params.fromAgentId}/messages`,
        serverBaseUrl,
        serverApiKey,
        {
          recipientAddress: `${params.toAgentId}@getagent.id`,
          subject: params.subject || "(no subject)",
          body: params.body,
          direction: "outbound",
          senderType: "agent",
          threadId: params.threadId,
        },
      )) as Record<string, unknown>;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "agentid_spawn_subagent",
    "Spawn a child (sub)agent that inherits lineage from the authenticated parent agent. Requires the parent to be verified. Returns the child agent ID and API key.",
    {
      handle: z.string().min(3).max(32).describe("Handle for the new child agent"),
      displayName: z.string().describe("Human-readable display name"),
      description: z.string().optional().describe("What this child agent does"),
      agentType: z.enum(["subagent", "ephemeral"]).default("subagent").describe("'subagent' persists; 'ephemeral' auto-expires"),
      ttlHours: z.number().int().min(1).max(168).optional().describe("For ephemeral agents: lifetime in hours (1–168)"),
      capabilities: z.array(z.string()).optional().describe("Capabilities for the child agent"),
      endpointUrl: z.string().optional().describe("URL where the child receives tasks"),
    },
    async (params) => {
      // Resolve the authenticated agent's ID first
      const whoami = (await apiRequest(
        "GET",
        "/api/v1/agents/whoami",
        serverBaseUrl,
        serverApiKey,
      )) as { id?: string; agent_id?: string };
      const parentId = whoami.id || whoami.agent_id;
      if (!parentId) {
        throw new Error("Could not resolve parent agent ID from AGENTID_API_KEY");
      }

      const keyPair = await generateKeyPair();

      const result = (await apiRequest(
        "POST",
        `/api/v1/agents/${parentId}/subagents`,
        serverBaseUrl,
        serverApiKey,
        {
          handle: params.handle,
          displayName: params.displayName,
          description: params.description,
          agentType: params.agentType,
          ttlHours: params.ttlHours,
          capabilities: params.capabilities,
          endpointUrl: params.endpointUrl,
          publicKey: keyPair.publicKey,
          keyType: "ed25519",
        },
      )) as Record<string, unknown>;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ...result,
            message: "Child agent spawned. Save the apiKey immediately — it cannot be retrieved again.",
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    "agentid_mpp_providers",
    "List available Machine Payments Protocol (MPP) providers and the payment methods each supports.",
    {},
    async () => {
      const result = (await apiRequest(
        "GET",
        "/api/v1/mpp/providers",
        serverBaseUrl,
        serverApiKey,
      )) as Record<string, unknown>;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "agentid_mpp_pay",
    "Initiate a Stripe Machine Payments Protocol (MPP) payment intent for a machine-to-machine transaction. Returns a paymentIntentId and clientSecret for confirmation.",
    {
      amountCents: z.number().int().positive().describe("Amount in cents (e.g. 100 = $1.00 USD)"),
      currency: z.string().length(3).default("usd").describe("ISO 4217 currency code (default: usd)"),
      paymentType: z.string().default("api_call").describe("Payment type label (e.g. 'api_call', 'task', 'data')"),
      resourceId: z.string().optional().describe("Optional ID of the resource being paid for"),
    },
    async (params) => {
      const result = (await apiRequest(
        "POST",
        "/api/v1/mpp/create-intent",
        serverBaseUrl,
        serverApiKey,
        {
          amountCents: params.amountCents,
          currency: params.currency,
          paymentType: params.paymentType,
          resourceId: params.resourceId,
        },
      )) as Record<string, unknown>;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "agentid_get_trust",
    "Get a detailed trust score breakdown for any agent. Returns score, tier, per-provider signal weights, and a visual bar chart.",
    {
      identifier: z.string().describe("Agent handle (e.g. 'research-agent') or UUID"),
    },
    async (params) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.identifier);
      const path = isUuid
        ? `/api/v1/resolve/id/${params.identifier}`
        : `/api/v1/resolve/${encodeURIComponent(params.identifier.replace(/\.(agentid|agent)$/i, "").toLowerCase())}`;

      const resolved = (await apiRequest("GET", path, serverBaseUrl)) as {
        agent?: {
          trustScore?: number;
          trustTier?: string;
          trustBreakdown?: Record<string, number>;
          verificationStatus?: string;
        };
      };

      const agent = resolved.agent || {};
      const score = agent.trustScore ?? 0;
      const tier = agent.trustTier ?? "unverified";
      const breakdown = agent.trustBreakdown ?? {};

      // Visual bar chart
      const BAR_WIDTH = 20;
      const bar = (val: number, max: number): string => {
        const filled = Math.round((val / max) * BAR_WIDTH);
        return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
      };

      const lines = [
        `Trust Report: ${params.identifier}`,
        `Score: ${score}/100  Tier: ${tier}  Verification: ${agent.verificationStatus ?? "unknown"}`,
        `${"─".repeat(50)}`,
        `Overall  [${bar(score, 100)}] ${score}/100`,
        `${"─".repeat(50)}`,
      ];

      for (const [provider, providerScore] of Object.entries(breakdown)) {
        const maxPerProvider = 25; // typical max per provider
        lines.push(`${provider.padEnd(20)} [${bar(providerScore, maxPerProvider)}] ${providerScore}`);
      }

      lines.push(`${"─".repeat(50)}`);
      lines.push(`Tier thresholds: unverified 0-19 | basic 20-39 | verified 40-69 | trusted 70-89 | elite 90-100`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  return server;
}

export { McpServer };
