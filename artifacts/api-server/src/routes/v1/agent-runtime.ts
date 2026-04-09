import { Router, type Request } from "express";
import { createHash } from "crypto";
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

/**
 * Compute a stable checksum for a prompt-block payload.
 * Used by agents to detect whether their block has changed since last fetch
 * without having to diff the full content.
 *   version  — first 8 hex chars, human-readable shorthand
 *   checksum — full 64-char SHA-256 hex, machine-comparable
 */
function computeBlockChecksum(content: string): { version: string; checksum: string } {
  const checksum = createHash("sha256").update(content, "utf8").digest("hex");
  return { version: checksum.slice(0, 8), checksum };
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

=== STARTUP SEQUENCE (run on every cold start / new conversation) ===
IMPORTANT: steps 1-3 must execute BEFORE the first user turn. You cannot hot-swap a
system prompt inside a running conversation — these steps only take effect at startup.

1. Load AGENTID_API_KEY from env var or ~/.agentid/api_key
2. GET ${APP_URL}/api/v1/agents/${agent.id}/prompt-block
   → Include the full response text in your SYSTEM PROMPT parameter (not a user message):
     Claude API:  system="<this file's text> ... <prompt-block response>"
     OpenAI API:  messages=[{"role":"system","content":"<prompt-block response>"}]
     LangChain:   SystemMessage("<prompt-block response>")
3. POST ${APP_URL}/api/v1/agents/${agent.id}/heartbeat  → you are now online

SDK pattern:
  const agent = await AgentID.readStateFile('.agentid-state.json');
  await agent.refreshBootstrap();   // fetches fresh prompt-block + trust data
  agent.startHeartbeat();           // sends heartbeat every 5 min

First-run only (after /bootstrap/activate):
  await agent.writeStateFile('.agentid-state.json');  // persists agentId + apiKey to disk

=== MID-SESSION UPDATES ===
If you receive an update instruction during a running conversation:
  POST /heartbeat → read the identity object in the response for current state.
  You can fetch /prompt-block and read the content to update your working context.
  You cannot replace your literal system prompt — work from what you fetched instead.

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

/**
 * Structured prompt-block format — separates four distinct documents:
 *
 *  identity   — who this agent is (stable; changes rarely)
 *  policy     — what this agent is allowed to do (trust, scopes, limits)
 *  behavior   — LLM guidance text (the existing text block; changes on platform updates)
 *  marketplace — discoverability and economic parameters
 *
 * Each document has its own lifecycle. Agents should track the `meta.checksum`
 * to detect changes and re-ingest only the document(s) that changed.
 */
function buildPromptBlockStructured(
  agent: Agent,
  trust: TrustResult,
  inbox: AgentInbox | null,
  capabilities: string[],
  limits?: ReturnType<typeof getPlanLimits>,
  appUrl?: string,
  planName?: string,
  apiKeyPrefix?: string,
): Record<string, unknown> {
  const APP_URL = appUrl || process.env.APP_URL || "https://getagent.id";
  const hasHandle = !!(agent.handlePaid && agent.handle);
  const scopes = (agent.scopes as string[]) || [];
  const breakdown = (agent.trustBreakdown as Record<string, number>) || {};

  // Tier-to-consequence mapping — kept in sync with trust-score service
  const tierConsequences: Record<string, { escrowCapCents: number; txLimitCents: number; discoverable: boolean; listingEligible: boolean }> = {
    unverified: { escrowCapCents: 0,       txLimitCents: 0,       discoverable: false, listingEligible: false },
    basic:      { escrowCapCents: 10_000,  txLimitCents: 5_000,   discoverable: true,  listingEligible: false },
    verified:   { escrowCapCents: 100_000, txLimitCents: 50_000,  discoverable: true,  listingEligible: true  },
    trusted:    { escrowCapCents: 500_000, txLimitCents: 250_000, discoverable: true,  listingEligible: true  },
    elite:      { escrowCapCents: -1,      txLimitCents: -1,      discoverable: true,  listingEligible: true  }, // -1 = unlimited
  };
  const tierConseq = tierConsequences[trust.trustTier] ?? tierConsequences.unverified;

  const identity = {
    agentId:             agent.id,
    did:                 `did:web:getagent.id:agents:${agent.id}`,
    displayName:         agent.displayName,
    status:              agent.status,
    verificationStatus:  agent.verificationStatus,
    handle:              hasHandle ? agent.handle : null,
    protocolAddress:     hasHandle ? `${agent.handle}.agentid` : null,
    publicProfileUrl:    hasHandle ? `${APP_URL}/${agent.handle}` : `${APP_URL}/id/${agent.id}`,
    inboxAddress:        inbox?.address || null,
    createdAt:           agent.createdAt?.toISOString() ?? null,
  };

  const policy = {
    trustTier:           trust.trustTier,
    trustScore:          trust.trustScore,
    trustBreakdown:      breakdown,
    allowedScopes:       scopes,
    capabilities,
    rateLimitRpm:        60,
    maxPayloadBytes:     1_048_576,
    spendLimitCents:     agent.authorizedSpendLimitCents ?? 0,
    paymentAuthorized:   agent.paymentAuthorized ?? false,
    plan:                planName || "none",
  };

  const marketplace = {
    trustTier:           trust.trustTier,
    trustScore:          trust.trustScore,
    discoverable:        tierConseq.discoverable,
    listingEligible:     tierConseq.listingEligible,
    escrowCapCents:      tierConseq.escrowCapCents,   // -1 = unlimited
    transactionLimitCents: tierConseq.txLimitCents,   // -1 = unlimited
  };

  const behavior = buildPromptBlockText(agent, trust, inbox, capabilities, limits, appUrl, planName, apiKeyPrefix);

  // Compute per-document checksums so agents can detect partial changes
  const identityChecksum = computeBlockChecksum(JSON.stringify(identity));
  const policyChecksum   = computeBlockChecksum(JSON.stringify(policy));
  const behaviorChecksum = computeBlockChecksum(behavior);
  const marketplaceChecksum = computeBlockChecksum(JSON.stringify(marketplace));

  // Top-level checksum covers all four documents
  const fullChecksum = computeBlockChecksum(
    identityChecksum.checksum + policyChecksum.checksum + behaviorChecksum.checksum + marketplaceChecksum.checksum
  );

  return {
    meta: {
      schemaVersion: "1",
      version:       fullChecksum.version,
      checksum:      fullChecksum.checksum,
      updatedAt:     agent.updatedAt?.toISOString() ?? new Date().toISOString(),
      documents: {
        identity:    { version: identityChecksum.version,    checksum: identityChecksum.checksum },
        policy:      { version: policyChecksum.version,      checksum: policyChecksum.checksum },
        behavior:    { version: behaviorChecksum.version,    checksum: behaviorChecksum.checksum },
        marketplace: { version: marketplaceChecksum.version, checksum: marketplaceChecksum.checksum },
      },
    },
    identity,
    policy,
    behavior,
    marketplace,
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

    const [trust, inbox, keyRecord, userPlan] = await Promise.all([
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
      getUserPlan(agent.userId),
    ]);

    const capabilities = (agent.capabilities as string[]) || [];
    const apiKeyPrefix = keyRecord?.keyPrefix;
    const limits = getPlanLimits(userPlan);
    const APP_URL = process.env.APP_URL || "https://getagent.id";

    if (format === "structured") {
      // Canonical format: four separated documents with per-document checksums
      const block = buildPromptBlockStructured(
        agent, trust, inbox, capabilities, limits, APP_URL, userPlan, apiKeyPrefix,
      );
      res.setHeader("X-AgentID-Block-Version", block.meta.version as string);
      res.setHeader("X-AgentID-Block-Checksum", block.meta.checksum as string);
      res.setHeader("X-AgentID-Block-UpdatedAt", block.meta.updatedAt as string);
      res.json(block);
    } else if (format === "json") {
      const block = buildPromptBlockJson(agent, trust, inbox, capabilities);
      const content = JSON.stringify(block);
      const { version, checksum } = computeBlockChecksum(content);
      res.setHeader("X-AgentID-Block-Version", version);
      res.setHeader("X-AgentID-Block-Checksum", checksum);
      res.setHeader("X-AgentID-Block-UpdatedAt", agent.updatedAt?.toISOString() ?? new Date().toISOString());
      res.json({ format: "json", version, checksum, prompt_block: block });
    } else {
      // Default: text
      const block = buildPromptBlockText(
        agent, trust, inbox, capabilities, limits, APP_URL, userPlan, apiKeyPrefix,
      );
      const { version, checksum } = computeBlockChecksum(block);
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("X-AgentID-Block-Version", version);
      res.setHeader("X-AgentID-Block-Checksum", checksum);
      res.setHeader("X-AgentID-Block-UpdatedAt", agent.updatedAt?.toISOString() ?? new Date().toISOString());
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

    // Capture pre-heartbeat state for diff computation.
    // `agent` from ensureAgentOwnership holds the DB row as-of request time.
    const prevTrustScore = agent.trustScore ?? 0;
    const prevTrustTier  = agent.trustTier  ?? "unverified";
    const prevCapabilities = (agent.capabilities as string[]) || [];

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

    // Compute current prompt-block checksum so agents can detect stale blocks
    const currentCapabilities = (current.capabilities as string[]) || [];
    const promptBlockContent = buildPromptBlockText(
      current, trust, inbox, currentCapabilities,
    );
    const { version: promptBlockVersion, checksum: promptBlockChecksum } = computeBlockChecksum(promptBlockContent);

    // State delta — what changed since the last heartbeat
    const capabilitiesAdded   = currentCapabilities.filter(c => !prevCapabilities.includes(c));
    const capabilitiesRemoved = prevCapabilities.filter(c => !currentCapabilities.includes(c));
    const trustScoreDelta     = trust.trustScore - prevTrustScore;
    const trustTierChanged    = trust.trustTier !== prevTrustTier;

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
        capabilities: currentCapabilities,
        inbox: inbox?.address || null,
      },
      mail: {
        unreadCount,
        hasNewMessages: unreadCount > 0,
        inboxEndpoint: `${APP_URL}/api/v1/mail/agents/${agent.id}/inbox/unread`,
      },
      // State delta — diffs since last heartbeat, not just a snapshot.
      // action_required = true when something material changed that the agent should re-ingest.
      state_delta: {
        trust_score_delta:      trustScoreDelta,
        trust_tier_changed:     trustTierChanged,
        previous_trust_tier:    trustTierChanged ? prevTrustTier : null,
        capabilities_added:     capabilitiesAdded,
        capabilities_removed:   capabilitiesRemoved,
        prompt_block_version:   promptBlockVersion,
        prompt_block_checksum:  promptBlockChecksum,
        unread_count:           unreadCount,
        action_required:        trustTierChanged || capabilitiesAdded.length > 0 || capabilitiesRemoved.length > 0,
      },
      promptBlockUrl: `${APP_URL}/api/v1/agents/${agent.id}/prompt-block?format=structured`,
      updateContextInstructions: "Use state_delta to determine what changed. If action_required is true, refetch promptBlockUrl. Compare prompt_block_checksum against your cached version to detect stale blocks without re-fetching. The identity object is authoritative for current session state.",
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
