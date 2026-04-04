import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, apiKeysTable, agentClaimTokensTable, agentOwsWalletsTable, type Agent } from "@workspace/db/schema";
import { computeTrustScore, getTrustImprovementTips } from "./trust-score";
import { getInboxByAgent } from "./mail";
import { listAgentKeys } from "./agent-keys";
import { getUserPlan, getPlanLimits } from "./billing";
import { getHandleTier, HANDLE_TIERS } from "./handle";
import { deriveAnchorState } from "../lib/anchor-state";

const SPEC_VERSION = "1.2.0";
const APP_URL = () => process.env.APP_URL || "https://getagent.id";

export async function buildBootstrapBundle(agent: Agent): Promise<Record<string, unknown>> {
  const [trust, inbox, keys, plan, owsWalletRecord] = await Promise.all([
    computeTrustScore(agent.id),
    getInboxByAgent(agent.id),
    listAgentKeys(agent.id),
    getUserPlan(agent.userId),
    db.query.agentOwsWalletsTable.findFirst({ where: eq(agentOwsWalletsTable.agentId, agent.id) }),
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
    did: `did:web:getagent.id:agents:${agent.id}`,
    permanent: true,
    resolutionUrl: `${baseUrl}/api/v1/resolve/id/${agent.id}`,
    profileUrl: `${baseUrl}/id/${agent.id}`,
    note: "This UUID-based identity is permanent and never expires, regardless of handle status.",
  };

  const handleIdentity = agent.handle && agent.handleExpiresAt ? {
    handle: agent.handle,
    did: `did:web:getagent.id:agents:${agent.id}`,
    tier: agent.handleTier ?? null,
    expiresAt: agent.handleExpiresAt,
    paid: agent.handlePaid ?? false,
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

  // Derive on-chain anchor state via shared helper (single source of truth)
  const agentAny = agent as unknown as { chainRegistrations?: unknown; nftStatus?: string };
  const anchorState = deriveAnchorState(agentAny.chainRegistrations, agentAny.nftStatus);
  const { erc8004Status, onchainStatus } = anchorState;
  const onchainAnchorValue = anchorState.onchainAnchor;

  const walletNetwork = agent.walletNetwork || "base-sepolia";
  const isTestnet = walletNetwork.includes("sepolia") || walletNetwork.includes("testnet");
  const explorerBase = isTestnet ? "https://sepolia.basescan.org" : "https://basescan.org";
  const usdcContract = isTestnet
    ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const walletInfo = agent.walletAddress ? {
    status: "provisioned" as const,
    address: agent.walletAddress,
    network: walletNetwork,
    provisionedAt: agent.walletProvisionedAt,
    isSelfCustodial: agent.walletIsSelfCustodial || false,
    usdcBalance: agent.walletUsdcBalance || "0",
    explorerUrl: `${explorerBase}/address/${agent.walletAddress}`,
    basescanUrl: `${explorerBase}/address/${agent.walletAddress}`,
    fundingInstructions: `Send USDC on ${walletNetwork} to ${agent.walletAddress}`,
    x402PaymentEndpoint: `${baseUrl}/api/v1/pay/upgrade/x402`,
    x402Endpoint: `${baseUrl}/api/v1/pay/upgrade/x402`,
  } : {
    status: "not_provisioned" as const,
    address: null,
    provisionEndpoint: `${baseUrl}/api/v1/agents/${agent.id}/wallet/provision`,
  };

  const bundle: Record<string, unknown> = {
    spec_version: SPEC_VERSION,
    machineIdentity,
    handleIdentity,
    agent_id: agent.id,
    handle: agent.handle,
    display_name: agent.displayName,
    did: `did:web:getagent.id:agents:${agent.id}`,
    handleAliasDid: null,
    protocol_address: agent.handle ? `${agent.handle}.agentid` : `${agent.id}.agentid`,
    erc8004_uri: `${baseUrl}/api/v1/p/${agent.id}/erc8004`,
    erc8004Uri: `${baseUrl}/api/v1/p/${agent.id}/erc8004`,
    erc8004Status,
    onchain_anchor: onchainAnchorValue,
    onchainAnchor: onchainAnchorValue,
    onchainStatus,
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
    wallet: walletInfo,
    plan: plan,
    plan_features: {
      inbox: limits.canReceiveMail,
      publicResolution: limits.canBePublic,
      marketplaceListing: limits.canListOnMarketplace,
      fleetManagement: limits.fleetManagement,
      analyticsAccess: limits.analyticsAccess,
    },
    ows_wallet: owsWalletRecord ? {
      standard: "OWS",
      sdkPackage: "@open-wallet-standard/core",
      walletId: owsWalletRecord.walletId ?? owsWalletRecord.id,
      address: owsWalletRecord.address,
      network: owsWalletRecord.network,
      registeredAt: owsWalletRecord.provisionedAt ?? owsWalletRecord.createdAt,
    } : null,
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
  DID:       did:web:getagent.id:agents:${agentId}
  Profile:   ${baseUrl}/id/${agentId}
  Resolve:   GET ${baseUrl}/api/v1/resolve/id/${agentId}`;

  const handleSection = handle && agent.handleExpiresAt
    ? `Handle Identity (paid alias, expiring):
  Handle:    ${handle}.agentid
  DID:       did:web:getagent.id:agents:${agentId}
  Profile:   ${baseUrl}/${handle}
  Resolve:   GET ${baseUrl}/api/v1/resolve/${handle}
  Expires:   ${agent.handleExpiresAt.toISOString()}
  Note:      Handle is a paid alias (like ENS). Renew before expiry to keep it.`
    : `Handle Identity: none — agent resolves by UUID only
  Register a handle at: ${baseUrl}/api/v1/pay/handle/claim (5+ chars, included with Starter/Pro/Enterprise plans)`;

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

=== AGENT WALLET ===
${agent.walletAddress ? (() => {
  const net = agent.walletNetwork || "base-sepolia";
  const testnet = net.includes("sepolia") || net.includes("testnet");
  const explorer = testnet ? "https://sepolia.basescan.org" : "https://basescan.org";
  const usdc = testnet ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e" : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  return `Wallet Address: ${agent.walletAddress}
Network:        ${net}
USDC Balance:   ${agent.walletUsdcBalance || "0"}
Fund wallet:    Send USDC on ${net} to ${agent.walletAddress}
USDC Contract:  ${usdc}
Explorer:       ${explorer}/address/${agent.walletAddress}
x402 Payment:   POST ${baseUrl}/api/v1/pay/upgrade/x402 (include x-payment header)`;
})() : `Wallet: not provisioned
Provision:   POST ${baseUrl}/api/v1/agents/${agentId}/wallet/provision`}

=== IDENTITY MODEL ===
Your Agent ID (UUID) is your permanent machine identity — like an IP address. It never expires.
Your handle (if any) is a paid, expiring alias — like a domain name / ENS. Renew it or lose it.
Always use your UUID for programmatic identity. Use your handle for human-readable resolution.`;
}
