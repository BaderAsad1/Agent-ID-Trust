import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, apiKeysTable, agentClaimTokensTable, type Agent } from "@workspace/db/schema";
import { computeTrustScore, getTrustImprovementTips } from "./trust-score";
import { getInboxByAgent } from "./mail";
import { listAgentKeys } from "./agent-keys";
import { getUserPlan, getPlanLimits } from "./billing";
import { getHandleTier, HANDLE_TIERS } from "./handle";

const SPEC_VERSION = "1.2.0";
const APP_URL = () => process.env.APP_URL || "https://getagent.id";

export async function buildBootstrapBundle(agent: Agent): Promise<Record<string, unknown>> {
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

  const baseUrl = APP_URL();
  const effectiveInbox = limits.canReceiveMail ? inbox : null;

  const apiKeyRecord = await db.query.apiKeysTable.findFirst({
    where: and(
      eq(apiKeysTable.ownerId, agent.id),
      eq(apiKeysTable.ownerType, "agent"),
      isNull(apiKeysTable.revokedAt),
    ),
    columns: { keyPrefix: true },
  });

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
      claimUrl = `${baseUrl}/claim?token=${encodeURIComponent(activeClaimToken.token)}`;
    }
  }

  const trustImprovementTips = getTrustImprovementTips(trust.trustBreakdown ?? {}, agent);

  const machineIdentity = {
    agentId: agent.id,
    did: `did:agentid:${agent.id}`,
    permanent: true,
    resolutionUrl: `${baseUrl}/api/v1/resolve/id/${agent.id}`,
    profileUrl: `${baseUrl}/id/${agent.id}`,
    note: "This UUID-based identity is permanent and never expires, regardless of handle status.",
  };

  const handleIdentity = agent.handle && agent.handleExpiresAt ? {
    handle: agent.handle,
    did: `did:agentid:${agent.handle}`,
    tier: agent.handleTier ?? null,
    expiresAt: agent.handleExpiresAt,
    paid: agent.handlePaid ?? false,
    isOnchain: agent.handleIsOnchain ?? false,
    resolutionUrl: `${baseUrl}/api/v1/resolve/${agent.handle}`,
    profileUrl: `${baseUrl}/${agent.handle}`,
    renewUrl: `${baseUrl}/dashboard/agents/${agent.id}/handle/renew`,
    note: "Handle is a paid alias (like an ENS domain) — it expires and may be lost if not renewed.",
  } : null;

  const paymentOptions = {
    stripeCheckout: `${baseUrl}/api/v1/pay/upgrade`,
    agenticPayment: `${baseUrl}/api/v1/pay/options`,
    handleClaim: `${baseUrl}/api/v1/pay/handle/claim`,
  };

  const promptBlock = buildPromptBlock(agent, trust, effectiveInbox, capabilities, limits, baseUrl, plan, apiKeyRecord?.keyPrefix);

  const bundle: Record<string, unknown> = {
    spec_version: SPEC_VERSION,
    machineIdentity,
    handleIdentity,
    agent_id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    did: handleIdentity ? `did:agentid:${agent.handle}` : `did:agentid:${agent.id}`,
    protocol_address: agent.handle ? `${agent.handle}.agentid` : `${agent.id}.agentid`,
    erc8004_uri: `${baseUrl}/api/v1/p/${agent.id}/erc8004`,
    erc8004Uri: `${baseUrl}/api/v1/p/${agent.id}/erc8004`,
    provisional_domain: agent.handle ? `${agent.handle.toLowerCase()}.getagent.id` : null,
    public_profile_url: agent.handle ? `/api/v1/public/agents/${agent.handle}` : `/api/v1/resolve/id/${agent.id}`,
    inbox_id: effectiveInbox?.id || null,
    inbox_address: effectiveInbox?.address || null,
    inbox_poll_endpoint: effectiveInbox ? `/api/v1/mail/agents/${agent.id}/messages` : null,
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
    uuid_resolution_url: `${baseUrl}/api/v1/resolve/id/${agent.id}`,
    claim_url: claimUrl,
    is_owned: !!agent.isClaimed,
    payment_options: paymentOptions,
    plan: plan,
    plan_features: {
      inbox: limits.canReceiveMail,
      publicResolution: limits.canBePublic,
      marketplaceListing: limits.canListOnMarketplace,
      fleetManagement: limits.fleetManagement,
      analyticsAccess: limits.analyticsAccess,
    },
  };

  if (!limits.canReceiveMail) {
    bundle.inbox = null;
    bundle.inboxUnavailable = {
      reason: "Inbox requires a Starter plan or above.",
      currentPlan: plan,
      upgradeUrl: `${baseUrl}/pricing`,
      paymentOptions,
    };
  }

  return bundle;
}

export function buildPromptBlock(
  agent: Agent,
  trust: { trustScore: number; trustTier: string; signals?: unknown[] },
  inbox: { address: string } | null,
  capabilities: string[],
  limits?: ReturnType<typeof getPlanLimits>,
  appUrl?: string,
  planName?: string,
  apiKeyPrefix?: string,
): string {
  const baseUrl = appUrl || APP_URL();
  const handle = agent.handle;
  const agentId = agent.id;

  const machineIdentitySection = `Machine Identity (permanent, UUID-based):
  Agent ID:  ${agentId}
  DID:       did:agentid:${agentId}
  Profile:   ${baseUrl}/id/${agentId}
  Resolve:   GET ${baseUrl}/api/v1/resolve/id/${agentId}`;

  const handleSection = handle && agent.handleExpiresAt
    ? `Handle Identity (paid alias, expiring):
  Handle:    ${handle}.agentid
  DID:       did:agentid:${handle}
  Profile:   ${baseUrl}/${handle}
  Resolve:   GET ${baseUrl}/api/v1/resolve/${handle}
  Expires:   ${agent.handleExpiresAt.toISOString()}
  Note:      Handle is a paid alias (like ENS). Renew before expiry to keep it.`
    : `Handle Identity: none — agent resolves by UUID only
  Register a handle at: ${baseUrl}/api/v1/pay/handle/claim (5+ chars, $10/yr with active plan)`;

  const inboxSection = inbox?.address
    ? `Your inbox address: ${inbox.address}
Check inbox:    GET  ${baseUrl}/api/v1/mail/agents/${agentId}/inbox
List messages:  GET  ${baseUrl}/api/v1/mail/agents/${agentId}/messages
Send message:   POST ${baseUrl}/api/v1/mail/agents/${agentId}/messages`
    : `Inbox: requires Starter plan — upgrade at ${baseUrl}/pricing
Agentic payment: POST ${baseUrl}/api/v1/pay/upgrade`;

  const planSection = `Current plan: ${planName || "none"}
Upgrade options:
  Starter ($29/mo): inbox, tasks
  Pro ($79/mo):     fleet, analytics
  Enterprise:       contact sales
Agentic payment: POST ${baseUrl}/api/v1/pay/options`;

  return `=== AGENT ID IDENTITY ===
Name:             ${agent.displayName}
${machineIdentitySection}

${handleSection}

Trust Score:  ${trust.trustScore} / 100
Trust Tier:   ${trust.trustTier}
Verification: ${agent.verificationStatus}

=== PLAN & FEATURES ===
${planSection}

=== MAIL ===
${inboxSection}

=== API ACCESS ===
Base URL:    ${baseUrl}/api/v1
Auth header: X-Agent-Key: <your-api-key>
Heartbeat:   POST ${baseUrl}/api/v1/agents/${agentId}/heartbeat
Bootstrap:   GET  ${baseUrl}/api/v1/agents/${agentId}/bootstrap
Prompt:      GET  ${baseUrl}/api/v1/agents/${agentId}/prompt-block

=== HTTP CLIENT REQUIREMENTS ===
All API requests MUST include a descriptive User-Agent header.

Required headers for every request:
  User-Agent:   AgentID-Client/1.0 <your-platform>/<version>
  X-Agent-Key:  ${apiKeyPrefix ? apiKeyPrefix + "..." : "<your-api-key>"}

=== IDENTITY MODEL ===
Your Agent ID (UUID) is your permanent machine identity — like an IP address. It never expires.
Your handle (if any) is a paid, expiring alias — like a domain name / ENS. Renew it or lose it.
Always use your UUID for programmatic identity. Use your handle for human-readable resolution.`;
}
