import { Router, type Request } from "express";
import { z } from "zod/v4";
import { eq, and, sql, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentMessagesTable, agentClaimTokensTable, apiKeysTable, type Agent, type AgentInbox } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { computeTrustScore, getTrustImprovementTips, type TrustSignal } from "../../services/trust-score";
import { getInboxByAgent, getInboxStats } from "../../services/mail";
import { listAgentKeys } from "../../services/agent-keys";
import { logActivity } from "../../services/activity-logger";
import { getAgentById } from "../../services/agents";
import { getUserPlan, getPlanLimits } from "../../services/billing";

const SPEC_VERSION = "1.1.0";
const HEARTBEAT_INTERVAL_SECONDS = 300;

const router = Router();

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

async function buildBootstrapBundle(agent: Agent) {
  const [trust, inbox, keys, plan] = await Promise.all([
    computeTrustScore(agent.id),
    getInboxByAgent(agent.id),
    listAgentKeys(agent.id),
    getUserPlan(agent.userId),
  ]);

  const limits = getPlanLimits(plan);

  const capabilities = (agent.capabilities as string[]) || [];
  const authMethods = [...((agent.authMethods as string[] | null) || [])];
  if (!authMethods.includes("agent-key")) {
    authMethods.unshift("agent-key");
  }

  const APP_URL = process.env.APP_URL || "https://getagent.id";
  const effectiveInbox = limits.canReceiveMail ? inbox : null;

  const apiKeyRecord = await db.query.apiKeysTable.findFirst({
    where: and(
      eq(apiKeysTable.ownerId, agent.id),
      eq(apiKeysTable.ownerType, "agent"),
      isNull(apiKeysTable.revokedAt),
    ),
    columns: { keyPrefix: true },
  });
  const promptBlock = buildPromptBlockText(agent, trust, effectiveInbox, capabilities, limits, APP_URL, plan, apiKeyRecord?.keyPrefix);

  let claimUrl: string | null = null;
  if (!agent.isClaimed) {
    const activeClaimToken = await db.query.agentClaimTokensTable.findFirst({
      where: and(
        eq(agentClaimTokensTable.agentId, agent.id),
        eq(agentClaimTokensTable.isActive, true),
        eq(agentClaimTokensTable.isUsed, false),
      ),
    });
    if (activeClaimToken) {
      claimUrl = `${APP_URL}/claim?token=${encodeURIComponent(activeClaimToken.token)}`;
    }
  }

  const trustImprovementTips = getTrustImprovementTips(trust.trustBreakdown ?? {}, agent);

  const hasHandle = agent.handlePaid && agent.handle;
  const handleIdentity = hasHandle
    ? {
        handle: agent.handle,
        protocol_address: `${agent.handle}.agentid`,
        erc8004_uri: `${APP_URL}/api/v1/p/${agent.handle}/erc8004`,
        public_profile_url: `${APP_URL}/${agent.handle}`,
        handle_expires_at: agent.handleExpiresAt ?? null,
        handle_tier: agent.handleTier ?? null,
      }
    : null;

  const bundle: Record<string, unknown> = {
    spec_version: SPEC_VERSION,
    machine_identity: {
      agent_id: agent.id,
      did: `did:agentid:${agent.id}`,
      uuid_resolution_url: `${APP_URL}/api/v1/resolve/id/${agent.id}`,
    },
    handle_identity: handleIdentity,
    display_name: agent.displayName,
    inbox_id: effectiveInbox?.id || null,
    inbox_address: effectiveInbox?.address || null,
    inbox_poll_endpoint: effectiveInbox ? inboxPollEndpoint(agent.id) : null,
    trust: {
      score: trust.trustScore,
      tier: trust.trustTier,
      signals: trust.signals,
    },
    trustImprovementTips,
    capabilities,
    auth_methods: authMethods,
    key_ids: keys.map(k => ({
      id: k.id,
      kid: k.kid,
      key_type: k.keyType,
      status: k.status,
      purpose: k.purpose,
      expires_at: k.expiresAt,
      auto_rotate_days: k.autoRotateDays,
      created_at: k.createdAt,
    })),
    status: agent.status,
    prompt_block: promptBlock,
    claim_url: claimUrl,
    is_owned: !!agent.isClaimed,
  };

  if (!limits.canReceiveMail) {
    bundle.inbox = null;
    bundle.inboxUnavailable = {
      reason: "Inbox requires a paid plan.",
      currentPlan: plan,
      upgradePath: `${APP_URL}/billing/upgrade`,
    };
  }

  return bundle;
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

  return `=== AGENT ID IDENTITY ===
Name:             ${agent.displayName}
Machine ID:       ${agent.id}  (permanent, never expires)
DID:              did:agentid:${agent.id}
Trust Score:      ${trust.trustScore} / 100
Trust Tier:       ${trust.trustTier}
Verification:     ${agent.verificationStatus}
Plan:             ${planName && planName !== 'none' ? planName : 'no active plan — upgrade at ' + APP_URL + '/pricing'}

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
${capabilities.length ? capabilities.join(', ') : 'None declared — update via PATCH /api/v1/agents/' + agent.id}

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
      did: `did:agentid:${agent.id}`,
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
        did: `did:agentid:${current.id}`,
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

export { buildBootstrapBundle };
export default router;
