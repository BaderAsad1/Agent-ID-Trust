import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../logger.js";

const API_TIMEOUT_MS = 15_000;

interface FetchOptions {
  method?: string;
  path: string;
  body?: unknown;
  apiKey: string;
  sessionId?: string;
  queryParams?: Record<string, string>;
}

async function agentidFetch(opts: FetchOptions): Promise<unknown> {
  const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8080";
  let url = `${apiBaseUrl}${opts.path}`;

  if (opts.queryParams) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.queryParams)) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    "X-Agent-Key": opts.apiKey,
    "Accept": "application/json",
    "User-Agent": "AgentID-Client/1.0 AgentID-MCP/1.0",
  };
  if (opts.sessionId) {
    headers["X-MCP-Session"] = opts.sessionId;
  }
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const resp = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    const contentType = resp.headers.get("content-type") || "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await resp.json();
    } else {
      data = await resp.text();
    }

    if (!resp.ok) {
      return {
        error: true,
        status: resp.status,
        message: typeof data === "object" && data !== null && "message" in data
          ? (data as Record<string, unknown>).message
          : `API returned ${resp.status}`,
        details: data,
      };
    }

    return data;
  } catch (err) {
    logger.error({ err, path: opts.path }, "[tools] API request failed");
    return {
      error: true,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function unwrapResolveResponse(result: unknown): Record<string, unknown> | null {
  if (typeof result !== "object" || result === null || "error" in result) return null;
  const r = result as Record<string, unknown>;
  if (r.resolved === true && typeof r.agent === "object" && r.agent !== null) {
    return r.agent as Record<string, unknown>;
  }
  return r;
}

async function generateEd25519KeyPair(): Promise<{
  publicKeySpkiBase64: string;
  privateKeyPkcs8Der: Buffer;
}> {
  const crypto = await import("crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });

  return {
    publicKeySpkiBase64: Buffer.from(pubDer).toString("base64"),
    privateKeyPkcs8Der: Buffer.from(privDer),
  };
}

async function signChallenge(challenge: string, privateKeyPkcs8Der: Buffer): Promise<string> {
  const crypto = await import("crypto");
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPkcs8Der,
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, Buffer.from(challenge), privateKey);
  return Buffer.from(signature).toString("base64");
}

const TRUST_TIER_TO_MIN_SCORE: Record<string, number> = {
  untrusted: 0,
  low: 10,
  moderate: 30,
  high: 60,
  verified: 80,
};

export function registerAllTools(server: McpServer, apiKey: string, getSessionId: () => string | undefined) {
  server.tool(
    "agentid_whoami",
    "Get the identity, trust score, credentials, and full bootstrap bundle of the currently authenticated agent",
    {},
    async () => {
      const result = await agentidFetch({ path: "/api/v1/agents/whoami", apiKey, sessionId: getSessionId() });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_register",
    "Register a new agent with an Ed25519 key pair. Generates keys, registers with the Agent ID network, signs the verification challenge, and returns the API key, DID, and claim URL.",
    {
      handle: z.string().min(3).max(100).describe("Unique handle for the agent (lowercase, alphanumeric + hyphens)"),
      displayName: z.string().min(1).max(255).describe("Display name for the agent"),
      description: z.string().max(5000).optional().describe("Description of what the agent does"),
      capabilities: z.array(z.string()).max(50).optional().describe("List of capabilities the agent supports"),
      endpointUrl: z.string().url().optional().describe("The agent's endpoint URL for task delivery"),
    },
    async (params) => {
      const sessionId = getSessionId();
      const keys = await generateEd25519KeyPair();

      const registerResult = await agentidFetch({
        method: "POST",
        path: "/api/v1/programmatic/agents/register",
        body: {
          handle: params.handle.toLowerCase(),
          displayName: params.displayName,
          publicKey: keys.publicKeySpkiBase64,
          keyType: "ed25519",
          description: params.description,
          capabilities: params.capabilities,
          endpointUrl: params.endpointUrl,
        },
        apiKey,
        sessionId,
      });

      if (typeof registerResult === "object" && registerResult !== null && "error" in registerResult) {
        return { content: [{ type: "text", text: JSON.stringify(registerResult, null, 2) }] };
      }

      const regData = registerResult as Record<string, unknown>;
      const agentId = regData.agentId as string;
      const challenge = regData.challenge as string;
      const kid = regData.kid as string;

      const signature = await signChallenge(challenge, keys.privateKeyPkcs8Der);

      const verifyResult = await agentidFetch({
        method: "POST",
        path: "/api/v1/programmatic/agents/verify",
        body: {
          agentId,
          challenge,
          signature,
          kid,
        },
        apiKey,
        sessionId,
      });

      if (typeof verifyResult === "object" && verifyResult !== null && "error" in verifyResult) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            registrationSucceeded: true,
            verificationFailed: true,
            agentId,
            registerResult: regData,
            verifyError: verifyResult,
          }, null, 2) }],
        };
      }

      const verifyData = verifyResult as Record<string, unknown>;
      const handle = (regData.handle || params.handle.toLowerCase()) as string;
      const did = regData.did || verifyData.did || `did:agentid:${handle}`;
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: true,
          agentId,
          handle,
          did,
          apiKey: verifyData.apiKey,
          claimUrl: verifyData.claimUrl,
          publicKeyBase64: keys.publicKeySpkiBase64,
          message: "Store the apiKey securely. It authenticates all subsequent requests for this agent.",
        }, null, 2) }],
      };
    },
  );

  server.tool(
    "agentid_resolve",
    "Resolve an agent's full identity by handle or UUID. Returns their DID, trust score, capabilities, verification status, and contact information.",
    {
      identifier: z.string().min(1).describe("Agent handle (e.g. 'my-agent') or UUID"),
    },
    async (params) => {
      const id = params.identifier;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const path = isUuid ? `/api/v1/resolve/id/${id}` : `/api/v1/resolve/${encodeURIComponent(id)}`;
      const result = await agentidFetch({ path, apiKey, sessionId: getSessionId() });
      const agent = unwrapResolveResponse(result);
      return { content: [{ type: "text", text: JSON.stringify(agent || result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_discover",
    "Discover agents by capability, trust tier, or free-text query. Returns a list of matching agents with their trust scores and capabilities.",
    {
      query: z.string().optional().describe("Free-text search query"),
      capability: z.string().optional().describe("Filter by specific capability"),
      trustTier: z.enum(["untrusted", "low", "moderate", "high", "verified"]).optional().describe("Minimum trust tier"),
      protocol: z.string().optional().describe("Filter by protocol support"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return (default 20)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async (params) => {
      const queryParams: Record<string, string> = {};
      if (params.query) queryParams.q = params.query;
      if (params.capability) queryParams.capability = params.capability;
      if (params.trustTier) {
        const minScore = TRUST_TIER_TO_MIN_SCORE[params.trustTier];
        if (minScore !== undefined) queryParams.minTrust = String(minScore);
      }
      if (params.protocol) queryParams.protocol = params.protocol;
      if (params.limit) queryParams.limit = String(params.limit);
      if (params.offset) queryParams.offset = String(params.offset);

      const result = await agentidFetch({ path: "/api/v1/resolve", apiKey, sessionId: getSessionId(), queryParams });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_send_task",
    "Delegate a task to another agent. Sends a typed task payload to the recipient agent for processing.",
    {
      recipientAgentId: z.string().uuid().describe("UUID of the agent to send the task to"),
      taskType: z.string().min(1).max(100).describe("Type of task (e.g. 'text-generation', 'code-review')"),
      payload: z.record(z.string(), z.unknown()).optional().describe("Task payload data"),
      idempotencyKey: z.string().max(255).optional().describe("Optional idempotency key to prevent duplicate tasks"),
    },
    async (params) => {
      const result = await agentidFetch({
        method: "POST",
        path: "/api/v1/tasks",
        body: {
          recipientAgentId: params.recipientAgentId,
          taskType: params.taskType,
          payload: params.payload,
          idempotencyKey: params.idempotencyKey,
        },
        apiKey,
        sessionId: getSessionId(),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_send_message",
    "Send a message to another agent's inbox. The authenticated agent is the sender. Supports text content with optional subject and metadata.",
    {
      senderAgentId: z.string().uuid().describe("UUID of the sending agent (must be the authenticated agent)"),
      recipientAddress: z.string().min(1).describe("Recipient address (e.g. 'handle@getagent.id' or agent email address)"),
      subject: z.string().max(500).optional().describe("Message subject line"),
      body: z.string().min(1).describe("Message body content"),
      bodyFormat: z.enum(["text", "html", "markdown"]).optional().describe("Format of the body (default text)"),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Message priority"),
    },
    async (params) => {
      const result = await agentidFetch({
        method: "POST",
        path: `/api/v1/mail/agents/${params.senderAgentId}/messages`,
        body: {
          direction: "outbound",
          senderType: "agent",
          recipientAddress: params.recipientAddress,
          subject: params.subject,
          body: params.body,
          bodyFormat: params.bodyFormat || "text",
          priority: params.priority || "normal",
        },
        apiKey,
        sessionId: getSessionId(),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_check_inbox",
    "Check the authenticated agent's inbox for inbound messages. Returns message list with pagination.",
    {
      agentId: z.string().uuid().describe("UUID of the agent whose inbox to check (must be the authenticated agent)"),
      status: z.enum(["unread", "read", "all"]).optional().describe("Filter messages by read status"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum messages to return"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async (params) => {
      const queryParams: Record<string, string> = {
        direction: "inbound",
      };
      if (params.status === "unread") queryParams.isRead = "false";
      else if (params.status === "read") queryParams.isRead = "true";
      if (params.limit) queryParams.limit = String(params.limit);
      if (params.offset) queryParams.offset = String(params.offset);

      const result = await agentidFetch({
        path: `/api/v1/mail/agents/${params.agentId}/messages`,
        apiKey,
        sessionId: getSessionId(),
        queryParams,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_verify_credential",
    "Verify a Verifiable Credential (VC) JWT by resolving the issuer agent and checking their trust score, verification status, and credential validity. Optionally enforces a minimum trust threshold.",
    {
      credentialJwt: z.string().min(1).describe("The VC JWT string to verify"),
      minTrustScore: z.number().min(0).max(100).optional().describe("Minimum trust score the issuer must have (0-100)"),
    },
    async (params) => {
      const sessionId = getSessionId();
      const parts = params.credentialJwt.split(".");
      if (parts.length !== 3) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: true,
            message: "Invalid JWT format — expected three dot-separated segments",
          }, null, 2) }],
        };
      }

      let payload: Record<string, unknown> = {};
      try {
        const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
        payload = JSON.parse(payloadStr);
      } catch {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: true,
            message: "Failed to decode JWT payload",
          }, null, 2) }],
        };
      }

      const issuerRef = (payload.iss || payload.sub || (payload.vc as Record<string, unknown>)?.issuer) as string | undefined;
      const subject = (payload.credentialSubject || (payload.vc as Record<string, unknown>)?.credentialSubject) as Record<string, unknown> | undefined;
      const expirationDate = payload.exp || payload.expirationDate;

      const results: Record<string, unknown> = {
        jwt: params.credentialJwt.substring(0, 20) + "...",
        format: "valid_jwt_structure",
        payload: {
          type: payload.type || (payload.vc as Record<string, unknown>)?.type,
          issuanceDate: payload.iat || payload.issuanceDate,
          expirationDate,
          subject: subject ? { id: (subject as Record<string, unknown>).id } : undefined,
        },
      };

      if (expirationDate) {
        const expMs = typeof expirationDate === "number" ? expirationDate * 1000 : new Date(expirationDate as string).getTime();
        results.expired = expMs < Date.now();
      }

      if (issuerRef) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerRef);
        const resolveResult = await agentidFetch({
          path: isUuid ? `/api/v1/resolve/id/${issuerRef}` : `/api/v1/resolve/${encodeURIComponent(issuerRef)}`,
          apiKey,
          sessionId,
        });

        const agent = unwrapResolveResponse(resolveResult);

        if (agent) {
          results.issuer = {
            agentId: isUuid ? issuerRef : agent.agentId,
            handle: agent.handle,
            did: agent.did,
            trustScore: agent.trustScore,
            trustTier: agent.trustTier,
            verificationStatus: agent.verificationStatus,
            verificationMethod: agent.verificationMethod,
          };

          const score = typeof agent.trustScore === "number" ? agent.trustScore : 0;
          const isVerified = agent.verificationStatus === "verified";

          results.verification = {
            issuerResolved: true,
            issuerVerified: isVerified,
            issuerTrustScore: score,
            issuerTrustTier: agent.trustTier,
          };

          if (params.minTrustScore !== undefined) {
            results.trustCheck = {
              required: params.minTrustScore,
              actual: score,
              passed: score >= params.minTrustScore,
            };
          }
        } else {
          results.issuer = { ref: issuerRef, resolved: false };
          results.verification = {
            issuerResolved: false,
            warning: "Could not resolve issuer — credential origin cannot be verified",
          };
        }
      } else {
        results.verification = {
          issuerResolved: false,
          warning: "No issuer found in JWT — cannot verify credential origin",
        };
      }

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "agentid_spawn_subagent",
    "Spawn an ephemeral subagent that inherits the parent agent's trust. The child agent gets its own API key and identity.",
    {
      parentAgentId: z.string().uuid().describe("UUID of the parent agent spawning the subagent"),
      handle: z.string().min(3).max(100).describe("Handle for the new subagent"),
      displayName: z.string().min(1).max(255).describe("Display name for the subagent"),
      description: z.string().max(5000).optional().describe("Description of the subagent"),
      agentType: z.enum(["subagent", "ephemeral"]).optional().describe("Type of child agent (default: subagent)"),
      ttlSeconds: z.number().int().positive().optional().describe("Time-to-live in seconds (required for ephemeral type)"),
      capabilities: z.array(z.string()).max(50).optional().describe("Capabilities the subagent supports"),
      endpointUrl: z.string().url().optional().describe("Endpoint URL for the subagent"),
    },
    async (params) => {
      const result = await agentidFetch({
        method: "POST",
        path: `/api/v1/agents/${params.parentAgentId}/subagents`,
        body: {
          handle: params.handle.toLowerCase(),
          displayName: params.displayName,
          description: params.description,
          agentType: params.agentType || "subagent",
          ttlSeconds: params.ttlSeconds,
          capabilities: params.capabilities,
          endpointUrl: params.endpointUrl,
        },
        apiKey,
        sessionId: getSessionId(),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_mpp_pay",
    "Initiate a Stripe Machine Payments Protocol (MPP) payment. Creates a payment intent for machine-to-machine transactions on Agent ID. Returns the payment intent ID and client secret for completing the payment.",
    {
      amountCents: z.number().int().positive().describe("Payment amount in cents (e.g., 100 = $1.00)"),
      paymentType: z.string().optional().describe("Type of payment (e.g., 'premium_resolve', 'api_call')"),
      resourceId: z.string().optional().describe("Optional resource ID the payment is for"),
      targetUrl: z.string().url().optional().describe("Optional URL to call after payment succeeds"),
    },
    async (params) => {
      const sessionId = getSessionId();

      const createResult = await agentidFetch({
        method: "POST",
        path: "/api/v1/mpp/create-intent",
        body: {
          amountCents: params.amountCents,
          paymentType: params.paymentType || "api_call",
          resourceId: params.resourceId,
        },
        apiKey,
        sessionId,
      });

      if (typeof createResult === "object" && createResult !== null && "error" in createResult) {
        return { content: [{ type: "text", text: JSON.stringify(createResult, null, 2) }] };
      }

      const result: Record<string, unknown> = {
        success: true,
        ...(createResult as Record<string, unknown>),
        protocol: "stripe_mpp",
        instructions: "Use the clientSecret to confirm the payment via Stripe, then retry the target URL with the X-MPP-Payment header set to the paymentIntentId.",
      };

      if (params.targetUrl) {
        result.targetUrl = params.targetUrl;
        result.retryInstructions = `After confirming payment, retry: fetch('${params.targetUrl}', { headers: { 'X-MPP-Payment': '<paymentIntentId>' } })`;
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_mpp_providers",
    "List available payment providers and protocols supported by Agent ID, including Stripe MPP and x402 USDC.",
    {},
    async () => {
      const result = await agentidFetch({
        path: "/api/v1/mpp/providers",
        apiKey,
        sessionId: getSessionId(),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "agentid_get_trust",
    "Get a detailed trust score breakdown for any agent, including component scores and a visual bar chart representation.",
    {
      identifier: z.string().min(1).describe("Agent handle or UUID to look up"),
    },
    async (params) => {
      const id = params.identifier;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const path = isUuid ? `/api/v1/resolve/id/${id}` : `/api/v1/resolve/${encodeURIComponent(id)}`;
      const result = await agentidFetch({ path, apiKey, sessionId: getSessionId() });

      if (typeof result === "object" && result !== null && "error" in result) {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      const agent = unwrapResolveResponse(result);
      if (!agent) {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      const score = typeof agent.trustScore === "number" ? agent.trustScore : 0;
      const breakdown = agent.trustBreakdown as Record<string, unknown> | undefined;

      function bar(value: number, max: number, width = 20): string {
        const filled = Math.round((value / max) * width);
        return "█".repeat(filled) + "░".repeat(width - filled);
      }

      let chart = `\n🔒 Trust Report: ${agent.handle || id}\n`;
      chart += `${"─".repeat(50)}\n`;
      chart += `Overall: ${bar(score, 100)} ${score}/100 (${agent.trustTier || "unknown"})\n\n`;

      if (breakdown && typeof breakdown === "object") {
        for (const [component, value] of Object.entries(breakdown)) {
          if (typeof value === "number") {
            chart += `  ${component.padEnd(20)} ${bar(value, 100, 15)} ${value}\n`;
          } else if (typeof value === "object" && value !== null) {
            const v = value as Record<string, unknown>;
            const s = typeof v.score === "number" ? v.score : (typeof v.value === "number" ? v.value : 0);
            chart += `  ${component.padEnd(20)} ${bar(s, 100, 15)} ${s}\n`;
          }
        }
      }

      chart += `\n${"─".repeat(50)}`;
      chart += `\nVerification: ${agent.verificationStatus || "unknown"}`;
      chart += `\nCapabilities: ${Array.isArray(agent.capabilities) ? (agent.capabilities as string[]).join(", ") : "none"}`;

      return {
        content: [
          { type: "text", text: chart },
          { type: "text", text: JSON.stringify({ trustScore: score, trustTier: agent.trustTier, trustBreakdown: breakdown, handle: agent.handle, verificationStatus: agent.verificationStatus }, null, 2) },
        ],
      };
    },
  );
}
