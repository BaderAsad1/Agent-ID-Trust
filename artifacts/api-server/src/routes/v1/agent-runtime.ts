import { Router, type Request } from "express";
import { z } from "zod/v4";
import { eq, and, sql, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentMessagesTable, apiKeysTable, type Agent, type AgentInbox } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { computeTrustScore, type TrustSignal } from "../../services/trust-score";
import { getInboxByAgent, getInboxStats } from "../../services/mail";
import { logActivity, getActivityLog } from "../../services/activity-logger";
import { getAgentById } from "../../services/agents";
import { getUserPlan, getPlanLimits } from "../../services/billing";
import { buildBootstrapBundle } from "../../services/identity";

const HEARTBEAT_INTERVAL_SECONDS = 300;

const router = Router();

/**
 * Sanitize a user-controlled string before embedding it in an LLM system prompt.
 * Strips newlines, ASCII control characters, and collapses backtick runs.
 * Without this a crafted displayName or capability string can break prompt
 * boundaries and inject instructions into any LLM that consumes the prompt block.
 */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/[\r\n\t\v\f]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/`{3,}/g, "``")
    .replace(/ {2,}/g, " ")
    .trim();
}

interface TrustResult {
  trustScore: number;
  trustTier: string;
  trustBreakdown?: Record<string, number>;
  signals: TrustSignal[];
}

function ensureAgentOwnership(req: Request, agentId: string): Agent {
  const agent = req.authenticatedAgent;
  if (!agent || agent.id !== agentId) {
    throw new AppError(403, "FORBIDDEN", "You can only access your own agent runtime");
  }
  return agent;
}

function inboxPollEndpoint(agentId: string): string {
  return `/api/v1/mail/agents/${agentId}/messages`;
}

function buildPromptBlockText(
  agent: Agent,
  trust: TrustResult,
  inbox: AgentInbox | null,
  capabilities: string[],
  limits?: ReturnType<typeof getPlanLimits>,
  appUrl?: string,
  planName?: string,
  apiKeyPrefix?: string,
): string {
  const APP_URL = appUrl || process.env.APP_URL || "https://getagent.id";

  const inboxSection = inbox?.address
    ? `Your inbox address: ${inbox.address}
Check inbox:    GET  ${APP_URL}/api/v1/mail/agents/${agent.id}/inbox
List messages:  GET  ${APP_URL}/api/v1/mail/agents/${agent.id}/messages
Send message:   POST ${APP_URL}/api/v1/mail/agents/${agent.id}/messages
  Body: { "recipientAddress": "<addr>", "subject": "...", "body": "...", "direction": "outbound", "senderType": "agent" }`
    : `Inbox: not available — upgrade at ${APP_URL}/pricing`;

  const hasHandle = agent.handlePaid && agent.handle;
  const handleSection = hasHandle
    ? `Handle (alias):   @${agent.handle}.agentID
Protocol Address: ${agent.handle}.agentid
Trust Score:      ${trust.trustScore} / 100
Trust Tier:       ${trust.trustTier}
Verification:     ${agent.verificationStatus}
Plan:             ${planName || 'none'}

=== RESOLUTION ===
Resolve by UUID:   GET ${APP_URL}/api/v1/resolve/id/${agent.id}
Resolve by handle: GET ${APP_URL}/api/v1/resolve/${agent.handle}
Public profile:    ${APP_URL}/${agent.handle}
ERC-8004 export:   ${APP_URL}/api/v1/p/${agent.handle}/erc8004
Handle expires:   ${agent.handleExpiresAt ? agent.handleExpiresAt.toISOString().split('T')[0] : 'N/A'}`
    : `Handle:           none — purchase at ${APP_URL}/handle/purchase?agentId=${agent.id}`;

  const safeName = sanitizeForPrompt(agent.displayName || "");
  const safePlan = sanitizeForPrompt(planName || "");
  const safeCapabilities = capabilities
    .map(sanitizeForPrompt)
    .filter(Boolean)
    .join(", ");

  return `=== AGENT ID IDENTITY ===
Name:             ${safeName}
Machine ID:       ${agent.id}  (permanent, never expires)
DID:              did:web:getagent.id:agents:${agent.id}
Trust Score:      ${trust.trustScore} / 100
Trust Tier:       ${trust.trustTier}
Verification:     ${agent.verificationStatus}
Plan:             ${safePlan && safePlan !== 'none' ? safePlan : 'no active plan — upgrade at ' + APP_URL + '/pricing'}

${handleSection}

=== RESOLUTION ===
Resolve by UUID:   GET ${APP_URL}/api/v1/resolve/id/${agent.id}

=== MAIL ===
${inboxSection}

=== API ACCESS ===
Base URL:    ${APP_URL}/api/v1
Auth header: X-Agent-Key: <your-api-key>
Heartbeat:   POST ${APP_URL}/api/v1/agents/${agent.id}/heartbeat
Bootstrap:   GET  ${APP_URL}/api/v1/agents/${agent.id}/bootstrap
Prompt:      GET  ${APP_URL}/api/v1/agents/${agent.id}/prompt-block
Activity:    GET  ${APP_URL}/api/v1/agents/${agent.id}/activity

=== HTTP CLIENT REQUIREMENTS ===
All API requests MUST include a descriptive User-Agent header.
Requests with default/empty User-Agent strings (Python-urllib/3.x, node-fetch/1.0, etc.) are blocked at the Cloudflare edge.

Required headers for every request:
  User-Agent:   AgentID-Client/1.0 <your-platform>/<version>
  X-Agent-Key:  ${apiKeyPrefix ? apiKeyPrefix + '...' : '<your-api-key>'}

User-Agent examples by platform:
  Python requests:   AgentID-Client/1.0 python-requests/2.31
  Node.js fetch:     AgentID-Client/1.0 node-fetch/3.3
  LangChain:         AgentID-Client/1.0 langchain/0.1
  CrewAI:            AgentID-Client/1.0 crewai/0.40
  Custom agent:      AgentID-Client/1.0 my-agent/1.0

Blocked defaults (will be rejected at edge):
  Python-urllib/3.x, node-fetch/1.0, axios/1.x, Go-http-client/1.1, undici

curl example:
  curl -H "X-Agent-Key: ${apiKeyPrefix ? apiKeyPrefix + '...' : '<your-api-key>'}" \\
       -H "User-Agent: AgentID-Client/1.0 curl/8.0" \\
       ${APP_URL}/api/v1/agents/${agent.id}/prompt-block

If you use the @agentid/sdk or the MCP server, User-Agent is set automatically.

=== CAPABILITIES ===
${safeCapabilities || 'None declared — update via PATCH /api/v1/agents/' + agent.id}

=== DISCOVER OTHER AGENTS ===
By handle:      GET ${APP_URL}/api/v1/resolve/<handle>
By capability:  GET ${APP_URL}/api/v1/resolve?capability=<cap>
By trust:       GET ${APP_URL}/api/v1/resolve?minTrust=<score>&verifiedOnly=true
Browse all:     GET ${APP_URL}/api/v1/resolve?limit=20

=== TRUST TIERS ===
unverified: 0-19  | basic: 20-39   | verified: 40-69
trusted:   70-89  | elite:  90-100

=== PLATFORM ===
Full docs:    ${APP_URL}/api/llms.txt
API browser:  ${APP_URL}/api/docs
Register:     POST ${APP_URL}/api/v1/programmatic/agents/register
=== END AGENT ID IDENTITY ===`.trim();
}

function buildPromptBlockJson(
  agent: Agent,
  trust: TrustResult,
  inbox: AgentInbox | null,
  capabilities: string[],
): Record<string, unknown> {
  const scopes = (agent.scopes as string[]) || [];

  const hasHandleJson = agent.handlePaid && agent.handle;

  return {
    agent_name: agent.displayName,
    agent_id: agent.id,
    machine_identity: {
      did: `did:web:getagent.id:agents:${agent.id}`,
      uuid: agent.id,
    },
    handle_identity: hasHandleJson
      ? {
          handle: `@${agent.handle}`,
          protocol_address: `${agent.handle}.agentid`,
          public_profile_url: `/api/v1/public/agents/${agent.handle}`,
        }
      : null,
    inbox_address: inbox?.address || null,
    trust_tier: trust.trustTier,
    capabilities,
    description: agent.description || null,
    policy_constraints: {
      allowed_scopes: scopes,
    },
  };
}

router.get("/:agentId/bootstrap", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = ensureAgentOwnership(req, req.params.agentId as string);
    const bundle = await buildBootstrapBundle(agent);
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/runtime", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = ensureAgentOwnership(req, req.params.agentId as string);

    const [trust, inbox, runtimePlan] = await Promise.all([
      computeTrustScore(agent.id),
      getInboxByAgent(agent.id),
      getUserPlan(agent.userId),
    ]);

    const runtimeLimits = getPlanLimits(runtimePlan);

    let inboxConfig: Record<string, unknown> | null = null;
    if (inbox && runtimeLimits.canReceiveMail) {
      const stats = await getInboxStats(inbox.id);
      inboxConfig = {
        inbox_id: inbox.id,
        poll_url: inboxPollEndpoint(agent.id),
        poll_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
        unread_count: stats.messages.unread,
        address: inbox.address,
      };
    }

    const capabilities = (agent.capabilities as string[]) || [];
    const scopes = (agent.scopes as string[]) || [];

    res.json({
      agent_id: agent.id,
      status: agent.status,
      trust: {
        score: trust.trustScore,
        tier: trust.trustTier,
        signals: trust.signals,
      },
      policy_limits: {
        rate_limit_rpm: 60,
        max_payload_bytes: 1048576,
        allowed_scopes: scopes,
      },
      inbox_config: inboxConfig,
      capabilities,
      last_heartbeat: agent.lastHeartbeatAt || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/prompt-block", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = ensureAgentOwnership(req, req.params.agentId as string);
    const format = (req.query.format as string) || "text";

    const [trust, inbox, keyRecord] = await Promise.all([
      computeTrustScore(agent.id),
      getInboxByAgent(agent.id),
      db.query.apiKeysTable.findFirst({
        where: and(
          eq(apiKeysTable.ownerId, agent.id),
          eq(apiKeysTable.ownerType, "agent"),
          isNull(apiKeysTable.revokedAt),
        ),
        columns: { keyPrefix: true },
      }),
    ]);

    const capabilities = (agent.capabilities as string[]) || [];
    const apiKeyPrefix = keyRecord?.keyPrefix;

    if (format === "json") {
      const block = buildPromptBlockJson(agent, trust, inbox, capabilities);
      res.json({ format: "json", prompt_block: block });
    } else {
      const block = buildPromptBlockText(agent, trust, inbox, capabilities, undefined, undefined, undefined, apiKeyPrefix);
      res.setHeader("Content-Type", "text/plain");
      res.send(block);
    }
  } catch (err) {
    next(err);
  }
});

const heartbeatSchema = z.object({
  endpoint_url: z.url().optional(),
  endpointUrl: z.url().optional(),
  url: z.url().optional(),
  runtime_context: z.object({
    framework: z.string().optional(),
    version: z.string().optional(),
  }).passthrough().optional(),
  runtimeContext: z.object({
    framework: z.string().optional(),
    version: z.string().optional(),
  }).passthrough().optional(),
}).transform((data) => ({
  endpoint_url: data.endpoint_url ?? data.endpointUrl ?? data.url,
  runtime_context: data.runtime_context ?? data.runtimeContext,
}));

router.post("/:agentId/heartbeat", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = ensureAgentOwnership(req, req.params.agentId as string);

    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
      lastHeartbeatAt: now,
      updatedAt: now,
    };

    if (parsed.data.endpoint_url) {
      updates.endpointUrl = parsed.data.endpoint_url;
    }

    if (parsed.data.runtime_context) {
      updates.runtimeContext = parsed.data.runtime_context;
    }

    await db
      .update(agentsTable)
      .set(updates)
      .where(eq(agentsTable.id, agent.id));

    const [, freshAgent, trust, inbox] = await Promise.all([
      logActivity({
        agentId: agent.id,
        eventType: "agent.heartbeat",
        payload: {
          endpoint_url: parsed.data.endpoint_url,
          runtime_context: parsed.data.runtime_context,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
      getAgentById(agent.id),
      computeTrustScore(agent.id),
      getInboxByAgent(agent.id),
    ]);

    const current = freshAgent || agent;
    const APP_URL = process.env.APP_URL || "https://getagent.id";

    let unreadCount = 0;
    if (inbox) {
      const [stats] = await db
        .select({
          unread: sql<number>`count(*) filter (where ${agentMessagesTable.isRead} = false and ${agentMessagesTable.direction} = 'inbound')::int`,
        })
        .from(agentMessagesTable)
        .where(eq(agentMessagesTable.inboxId, inbox.id));
      unreadCount = stats.unread;
    }

    res.json({
      acknowledged: true,
      server_time: now.toISOString(),
      next_expected_heartbeat: new Date(now.getTime() + HEARTBEAT_INTERVAL_SECONDS * 1000).toISOString(),
      identity: {
        agent_id: current.id,
        did: `did:web:getagent.id:agents:${current.id}`,
        handle: current.handlePaid && current.handle
          ? `${current.handle}.agentID`
          : null,
        trustScore: trust.trustScore,
        trustTier: trust.trustTier,
        verificationStatus: current.verificationStatus,
        status: current.status,
        capabilities: (current.capabilities as string[]) || [],
        inbox: inbox?.address || null,
      },
      mail: {
        unreadCount,
        hasNewMessages: unreadCount > 0,
        inboxEndpoint: `${APP_URL}/api/v1/mail/agents/${agent.id}/inbox/unread`,
      },
      promptBlockUrl: `${APP_URL}/api/v1/agents/${agent.id}/prompt-block?format=text`,
      updateContext: true,
    });
  } catch (err) {
    next(err);
  }
});

// GET /agents/:agentId/activity
// Returns the HMAC-signed activity log for the authenticated agent.
// Agents can audit their own heartbeat history, activation events, key rotations, etc.
// ?source=signed  — return only entries that carry a valid HMAC signature (default: all)
// ?eventType=     — filter by event type (e.g. agent.heartbeat)
// ?limit=         — max entries per page (default 50, max 200)
// ?offset=        — pagination offset
router.get("/:agentId/activity", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = ensureAgentOwnership(req, req.params.agentId as string);

    const limit = Math.min(
      Math.max(1, parseInt((req.query.limit as string) || "50", 10) || 50),
      200,
    );
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10) || 0);

    const activities = await getActivityLog(agent.id, limit, offset);

    // Optionally surface only entries with HMAC signatures (recommended for forensic use)
    const source = req.query.source as string;
    const filtered = source === "signed"
      ? activities.filter(a => a.signature)
      : activities;

    res.json({
      agentId: agent.id,
      total: filtered.length,
      limit,
      offset,
      activities: filtered.map(a => ({
        id: a.id,
        agentId: a.agentId,
        eventType: a.eventType,
        payload: a.payload,
        signature: a.signature,
        ipAddress: a.ipAddress,
        userAgent: a.userAgent,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export { buildBootstrapBundle };
export default router;
