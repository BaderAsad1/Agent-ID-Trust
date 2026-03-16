import { Router, type Request } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, type Agent, type AgentInbox } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { computeTrustScore, type TrustSignal } from "../../services/trust-score";
import { getInboxByAgent, getInboxStats } from "../../services/mail";
import { listAgentKeys } from "../../services/agent-keys";
import { logActivity } from "../../services/activity-logger";
import { getUserPlan, getPlanLimits } from "../../services/billing";

const SPEC_VERSION = "1.1.0";
const HEARTBEAT_INTERVAL_SECONDS = 300;

const router = Router();

interface TrustResult {
  trustScore: number;
  trustTier: string;
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

  const promptBlock = buildPromptBlockText(agent, trust, effectiveInbox, capabilities, limits, APP_URL);

  const bundle: Record<string, unknown> = {
    spec_version: SPEC_VERSION,
    agent_id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    protocol_address: `${agent.handle}.agentid`,
    provisional_domain: `${agent.handle.toLowerCase()}.getagent.id`,
    public_profile_url: `/api/v1/public/agents/${agent.handle}`,
    inbox_id: effectiveInbox?.id || null,
    inbox_address: effectiveInbox?.address || null,
    inbox_poll_endpoint: effectiveInbox ? inboxPollEndpoint(agent.id) : null,
    trust: {
      score: trust.trustScore,
      tier: trust.trustTier,
      signals: trust.signals,
    },
    capabilities,
    auth_methods: authMethods,
    key_ids: keys.map(k => ({ kid: k.kid, key_type: k.keyType, status: k.status })),
    status: agent.status,
    prompt_block: promptBlock,
    uuid_resolution_url: `${APP_URL}/api/v1/resolve/id/${agent.id}`,
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
): string {
  const scopes = (agent.scopes as string[]) || [];
  const APP_URL = appUrl || process.env.APP_URL || "https://getagent.id";

  const lines = [
    `=== AGENT IDENTITY ===`,
    `Name: ${agent.displayName}`,
    `Handle: @${agent.handle}`,
    `Protocol Address: ${agent.handle}.agentid`,
    `Agent ID: ${agent.id}`,
    `UUID Resolution: ${APP_URL}/api/v1/resolve/id/${agent.id}`,
  ];

  if (agent.isPublic) {
    lines.push(`Public Profile: /api/v1/public/agents/${agent.handle}`);
  }

  if (inbox) {
    lines.push(`Inbox Address: ${inbox.address}`);
  } else if (limits && !limits.canReceiveMail) {
    lines.push(`Inbox: not available (requires paid plan)`);
  }

  lines.push(`Trust Tier: ${trust.trustTier}`);

  if (capabilities.length > 0) {
    lines.push(`Capabilities: ${capabilities.join(", ")}`);
  }

  if (agent.description) {
    lines.push(`Description: ${agent.description}`);
  }

  if (scopes.length > 0) {
    lines.push(`Policy Constraints: allowed scopes [${scopes.join(", ")}]`);
  }

  lines.push(`=== END AGENT IDENTITY ===`);

  return lines.join("\n");
}

function buildPromptBlockJson(
  agent: Agent,
  trust: TrustResult,
  inbox: AgentInbox | null,
  capabilities: string[],
): Record<string, unknown> {
  const scopes = (agent.scopes as string[]) || [];

  return {
    agent_name: agent.displayName,
    handle: `@${agent.handle}`,
    agent_id: agent.id,
    protocol_address: `${agent.handle}.agentid`,
    public_profile_url: `/api/v1/public/agents/${agent.handle}`,
    inbox_address: inbox?.address || null,
    trust_tier: trust.trustTier,
    capabilities,
    description: agent.description || null,
    policy_constraints: {
      allowed_scopes: scopes,
    },
  };
}

router.get("/whoami", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = req.authenticatedAgent!;
    const bundle = await buildBootstrapBundle(agent);
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

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

    const [trust, inbox] = await Promise.all([
      computeTrustScore(agent.id),
      getInboxByAgent(agent.id),
    ]);

    const capabilities = (agent.capabilities as string[]) || [];

    if (format === "json") {
      const block = buildPromptBlockJson(agent, trust, inbox, capabilities);
      res.json({ format: "json", prompt_block: block });
    } else {
      const block = buildPromptBlockText(agent, trust, inbox, capabilities);
      res.setHeader("Content-Type", "text/plain");
      res.send(block);
    }
  } catch (err) {
    next(err);
  }
});

const heartbeatSchema = z.object({
  endpoint_url: z.url().optional(),
  runtime_context: z.object({
    framework: z.string().optional(),
    version: z.string().optional(),
  }).passthrough().optional(),
});

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

    await logActivity({
      agentId: agent.id,
      eventType: "agent.heartbeat",
      payload: {
        endpoint_url: parsed.data.endpoint_url,
        runtime_context: parsed.data.runtime_context,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      acknowledged: true,
      server_time: now.toISOString(),
      next_expected_heartbeat: new Date(now.getTime() + HEARTBEAT_INTERVAL_SECONDS * 1000).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export { buildBootstrapBundle };
export default router;
