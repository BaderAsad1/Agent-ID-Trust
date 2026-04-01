import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { assertSandboxIsolation } from "../../middlewares/sandbox";
import { getAgentByHandle, getAgentById } from "../../services/agents";
import { detectAgent } from "../../middlewares/cli-markdown";
import { generateAgentProfileMarkdown } from "../../services/agent-markdown";
import { eq, and, gte, desc as drizzleDesc, sql, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, marketplaceListingsTable, resolutionEventsTable, agentOwsWalletsTable } from "@workspace/db/schema";
import { normalizeHandle, formatHandle, formatDomain, formatProfileUrl, formatDID, formatResolverUrl } from "../../utils/handle";
import { getResolutionCache, setResolutionCache, deleteResolutionCache } from "../../lib/resolution-cache";

async function getLineageBlock(agent: typeof agentsTable.$inferSelect): Promise<Record<string, unknown> | null> {
  if (!agent.parentAgentId) return null;

  const parent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agent.parentAgentId),
    columns: { handle: true, id: true, handlePaid: true },
  });

  if (!parent) return null;

  const parentHasHandle = parent.handlePaid && parent.handle;
  const parentHandle = parentHasHandle ? normalizeHandle(parent.handle!) : null;
  const APP_URL = process.env.APP_URL || 'https://getagent.id';

  return {
    parentAgentId: parent.id,
    parentHandle: parent.handle ?? null,
    parentResolverUrl: parentHandle ? formatResolverUrl(parentHandle) : `${APP_URL}/api/v1/resolve/id/${parent.id}`,
    lineageDepth: agent.lineageDepth,
    agentType: agent.agentType,
    isEphemeral: agent.agentType === "ephemeral",
    ttl: agent.ttlExpiresAt
      ? {
          expiresAt: agent.ttlExpiresAt.toISOString(),
          remainingSeconds: Math.max(0, Math.floor((agent.ttlExpiresAt.getTime() - Date.now()) / 1000)),
          isExpired: agent.ttlExpiresAt.getTime() <= Date.now(),
        }
      : null,
  };
}

const router = Router();

async function getOwnerKey(agentId: string): Promise<string | null> {
  const key = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
    columns: { publicKey: true },
  });
  return key?.publicKey ?? null;
}

async function getActiveKeys(agentId: string) {
  const keys = await db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
    columns: { id: true, kid: true, keyType: true, use: true, status: true, purpose: true, expiresAt: true, autoRotateDays: true, createdAt: true },
  });
  return keys;
}

async function getPricing(agentId: string): Promise<{ hasListing: true; priceType: string; priceAmount: string | null; currency: string; deliveryHours: number | null; listingUrl: string } | { hasListing: false }> {
  const listing = await db.query.marketplaceListingsTable.findFirst({
    where: and(
      eq(marketplaceListingsTable.agentId, agentId),
      eq(marketplaceListingsTable.status, "active"),
    ),
    columns: { id: true, priceType: true, priceAmount: true, deliveryHours: true },
  });
  if (!listing) return { hasListing: false };
  const APP_URL = process.env.APP_URL || "https://getagent.id";
  return {
    hasListing: true,
    priceType: listing.priceType,
    priceAmount: listing.priceAmount,
    currency: "usd",
    deliveryHours: listing.deliveryHours,
    listingUrl: `${APP_URL}/marketplace/${listing.id}`,
  };
}

async function getOwsWallets(agentId: string): Promise<{
  evm: string[];
  tron: string[];
  solana: string[];
} | null> {
  const owsRow = await db.query.agentOwsWalletsTable.findFirst({
    where: eq(agentOwsWalletsTable.agentId, agentId),
    columns: { accounts: true },
  });

  if (!owsRow || !owsRow.accounts || owsRow.accounts.length === 0) {
    return null;
  }

  const grouped: { evm: string[]; tron: string[]; solana: string[] } = {
    evm: [],
    tron: [],
    solana: [],
  };

  for (const account of owsRow.accounts) {
    const parts = account.split(":");
    if (parts.length < 3) continue;
    const namespace = parts[0];
    if (namespace === "eip155") {
      grouped.evm.push(account);
    } else if (namespace === "tron") {
      grouped.tron.push(account);
    } else if (namespace === "solana") {
      grouped.solana.push(account);
    }
  }

  const hasAny = grouped.evm.length > 0 || grouped.tron.length > 0 || grouped.solana.length > 0;
  return hasAny ? grouped : null;
}

function buildChainPresence(agent: typeof agentsTable.$inferSelect): Record<string, unknown> | null {
  // Source chain presence from chainRegistrations (canonical registrar path), not chainMints (legacy)
  const chainRegs = agent.chainRegistrations as Record<string, unknown> | unknown[] | null;

  // chainRegistrations may be stored as an object { base: {...} } or as an array [{ chain: "base", ... }]
  let regObj: Record<string, unknown> | null = null;
  if (chainRegs && typeof chainRegs === "object") {
    if (Array.isArray(chainRegs)) {
      // Array form: [{ chain: "base", agentId: ..., ... }]
      regObj = {};
      for (const entry of chainRegs as Record<string, unknown>[]) {
        if (entry && typeof entry === "object" && entry.chain) {
          regObj[entry.chain as string] = entry;
        }
      }
      if (Object.keys(regObj).length === 0) regObj = null;
    } else {
      // Object form: { base: { agentId: ..., txHash: ... } }
      regObj = chainRegs as Record<string, unknown>;
      if (Object.keys(regObj).length === 0) regObj = null;
    }
  }

  // chainMints fallback intentionally removed: resolver must not serve stale legacy data.
  // Agents pre-dating the registrar migration must be re-registered via AgentIDRegistrar
  // for their chain presence to appear in resolve responses.
  return regObj;
}

const NETWORK_TO_CAIP_CHAIN: Record<string, string> = {
  "base-mainnet": "eip155:8453",
  "base": "eip155:8453",
  "base-onchain": "eip155:8453",
  "ethereum-mainnet": "eip155:1",
  "ethereum": "eip155:1",
  "polygon-mainnet": "eip155:137",
  "polygon": "eip155:137",
  "tron-mainnet": "tron:0x2b6653dc",
  "tron": "tron:0x2b6653dc",
  "solana-mainnet": "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ",
  "solana": "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ",
};

function toCAIP10(network: string, address: string): string {
  const chain = NETWORK_TO_CAIP_CHAIN[network] ?? `unknown:${network}`;
  return `${chain}:${address}`;
}

function buildAddresses(
  agent: typeof agentsTable.$inferSelect,
  format?: string,
): Record<string, string> | null {
  const addresses: Record<string, string> = {};
  if (agent.walletAddress) {
    const network = agent.walletNetwork || "base-mainnet";
    addresses[network] = format === "caip"
      ? toCAIP10(network, agent.walletAddress)
      : agent.walletAddress;
  }
  if (agent.onChainOwner) {
    addresses["base-onchain"] = format === "caip"
      ? toCAIP10("base-onchain", agent.onChainOwner)
      : agent.onChainOwner;
  }
  return Object.keys(addresses).length > 0 ? addresses : null;
}

function buildWallets(agent: typeof agentsTable.$inferSelect, format?: string): unknown[] | null {
  if (!agent.walletAddress) return null;
  const network = agent.walletNetwork || "base-mainnet";
  const address = format === "caip"
    ? toCAIP10(network, agent.walletAddress)
    : agent.walletAddress;

  return [{
    type: "mpc",
    network,
    address,
    custodian: "coinbase-cdp",
  }];
}

const CHAIN_ADDRESS_PREFIXES: Record<string, string[]> = {
  base: ["base-", "base"],
  evm: ["base-", "ethereum-", "polygon-", "evm-"],
  tron: ["tron-", "tron"],
  solana: ["solana-", "sol-"],
};

function applyChainFilter(
  data: Record<string, unknown>,
  chain: string | undefined,
): Record<string, unknown> {
  if (!chain) return data;

  const chainPresence = data.chainPresence as Record<string, unknown> | null;
  const filteredPresence = chainPresence && chainPresence[chain]
    ? { [chain]: chainPresence[chain] }
    : null;

  const wallets = data.wallets as unknown[] | null;
  const filteredWallets = chain === "base" || chain === "evm" ? wallets : null;

  const owsWallets = data.owsWallets as Record<string, string[]> | null;
  const filteredOws: Record<string, string[]> = {};
  if (owsWallets) {
    if (chain === "base" || chain === "evm") {
      if (owsWallets.evm) filteredOws.evm = owsWallets.evm;
    } else if (chain === "tron") {
      if (owsWallets.tron) filteredOws.tron = owsWallets.tron;
    } else if (chain === "solana") {
      if (owsWallets.solana) filteredOws.solana = owsWallets.solana;
    }
  }

  const addresses = data.addresses as Record<string, string> | null;
  let filteredAddresses: Record<string, string> | null = null;
  if (addresses) {
    const prefixes = CHAIN_ADDRESS_PREFIXES[chain] ?? [`${chain}-`];
    const filtered: Record<string, string> = {};
    for (const [key, val] of Object.entries(addresses)) {
      if (prefixes.some((p) => key.startsWith(p) || key === p.replace(/-$/, ""))) {
        filtered[key] = val;
      }
    }
    filteredAddresses = Object.keys(filtered).length > 0 ? filtered : null;
  }

  return {
    ...data,
    addresses: filteredAddresses,
    chainPresence: filteredPresence,
    wallets: filteredWallets,
    owsWallets: Object.keys(filteredOws).length > 0 ? filteredOws : null,
    walletAddress: chain === "base" || chain === "evm" ? data.walletAddress : null,
    walletNetwork: chain === "base" || chain === "evm" ? data.walletNetwork : null,
  };
}

function toResolvedAgent(
  agent: typeof agentsTable.$inferSelect,
  ownerKey: string | null,
  pricing: ({ hasListing: true; priceType: string; priceAmount: string | null; currency: string; deliveryHours: number | null; listingUrl: string } | { hasListing: false }),
  owsWallets: { evm: string[]; tron: string[]; solana: string[] } | null,
  format?: string,
) {
  const APP_URL = process.env.APP_URL || 'https://getagent.id';
  const hasHandle = agent.handlePaid && agent.handle;
  const handle = hasHandle ? normalizeHandle(agent.handle!) : null;

  const addresses = buildAddresses(agent, format);
  const wallets = buildWallets(agent, format);
  const chainPresence = buildChainPresence(agent);

  // Determine anchoring state from chainRegistrations (canonical) not chainMints (legacy)
  const chainRegs = agent.chainRegistrations as Record<string, unknown> | unknown[] | null;
  const baseAnchor = (() => {
    if (!chainRegs) return null;
    if (Array.isArray(chainRegs)) {
      return (chainRegs as Record<string, unknown>[]).find(e => e.chain === "base") ?? null;
    }
    return (chainRegs as Record<string, unknown>).base ?? null;
  })();
  const isBaseAnchored = !!baseAnchor;
  const erc8004Status = isBaseAnchored ? "anchored" : "off-chain";
  const anchoringMethod = isBaseAnchored ? "base-registrar" : "off-chain";
  const onchainStatus = isBaseAnchored ? "anchored" : (agent.nftStatus === "pending_anchor" ? "pending" : "off-chain");

  const anchorRecords = isBaseAnchored
    ? { base: baseAnchor }
    : null;

  return {
    machineIdentity: {
      agentId: agent.id,
      did: `did:web:getagent.id:agents:${agent.id}`,
      resolutionUrl: `${APP_URL}/api/v1/resolve/id/${agent.id}`,
    },
    handleIdentity: handle ? {
      handle: agent.handle,
      domain: formatDomain(handle),
      protocolAddress: formatHandle(handle),
      did: formatDID(handle),
      resolverUrl: formatResolverUrl(handle),
      profileUrl: formatProfileUrl(handle),
      erc8004Uri: `${APP_URL}/api/v1/p/${handle}/erc8004`,
      erc8004Status,
      expiresAt: agent.handleExpiresAt ?? null,
    } : null,
    handle: agent.handle ?? null,
    domain: handle ? formatDomain(handle) : null,
    protocolAddress: handle ? formatHandle(handle) : null,
    did: handle ? formatDID(handle) : `did:web:getagent.id:agents:${agent.id}`,
    resolverUrl: handle ? formatResolverUrl(handle) : `${APP_URL}/api/v1/resolve/id/${agent.id}`,
    displayName: agent.displayName,
    description: agent.description,
    endpointUrl: agent.endpointUrl,
    capabilities: agent.capabilities || [],
    protocols: agent.protocols || [],
    authMethods: agent.authMethods || [],
    trustScore: agent.trustScore,
    trustTier: agent.trustTier,
    trustBreakdown: agent.trustBreakdown,
    verificationStatus: agent.verificationStatus,
    verificationMethod: agent.verificationMethod,
    verifiedAt: agent.verifiedAt,
    status: agent.handleStatus ?? agent.status,
    handleStatus: agent.handleStatus ?? null,
    avatarUrl: agent.avatarUrl,
    ownerKey,
    pricing,
    addresses,
    wallets,
    owsWallets,
    chainPresence,
    anchorRecords,
    walletAddress: agent.walletAddress
      ? (format === "caip"
          ? toCAIP10(agent.walletNetwork || "base-mainnet", agent.walletAddress)
          : agent.walletAddress)
      : null,
    walletNetwork: agent.walletAddress ? (agent.walletNetwork || "base-mainnet") : null,
    paymentMethods: agent.paymentMethods || [],
    metadata: agent.metadata,
    metadataUrl: handle ? `${APP_URL}/api/v1/resolve/${handle}` : `${APP_URL}/api/v1/resolve/id/${agent.id}`,
    tasksCompleted: agent.tasksCompleted,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    profileUrl: handle ? formatProfileUrl(handle) : `${APP_URL}/id/${agent.id}`,
    erc8004Uri: handle ? `${APP_URL}/api/v1/p/${handle}/erc8004` : null,
    onchainAnchor: baseAnchor,
    onchainStatus,
    credential: {
      namespace: ".agentid",
      did: handle ? formatDID(handle) : `did:web:getagent.id:agents:${agent.id}`,
      domain: handle ? formatDomain(handle) : null,
      anchoringMethod,
    },
  };
}

async function enrichAndResolve(agent: typeof agentsTable.$inferSelect, format?: string) {
  const [ownerKey, pricing, lineage, keys, owsWallets] = await Promise.all([
    getOwnerKey(agent.id),
    getPricing(agent.id),
    getLineageBlock(agent),
    getActiveKeys(agent.id),
    getOwsWallets(agent.id),
  ]);
  const meta = (agent.metadata as Record<string, unknown> | null) ?? {};
  const agentIsSandbox = agent.handle?.startsWith("sandbox-") || meta.isSandbox === true;
  return {
    ...toResolvedAgent(agent, ownerKey, pricing, owsWallets, format),
    ...(agentIsSandbox ? { sandboxRef: `sandbox_${agent.id}`, isSandbox: true } : {}),
    lineage,
    publicKeys: keys.map(k => ({
      id: k.id,
      kid: k.kid,
      algorithm: k.keyType,
      use: k.use,
      status: k.status,
      purpose: k.purpose,
      expiresAt: k.expiresAt,
      autoRotateDays: k.autoRotateDays,
      createdAt: k.createdAt,
    })),
  };
}

function wantsMarkdown(req: Request): boolean {
  const accept = req.headers["accept"] || "";
  if (accept.includes("text/markdown")) return true;
  if (req.query.format === "markdown") return true;
  return false;
}

function logResolutionEvent(
  handle: string,
  agentId: string | null,
  clientType: string,
  responseTimeMs: number,
  cacheHit: string,
) {
  db.insert(resolutionEventsTable)
    .values({
      handle,
      resolvedAgentId: agentId,
      clientType,
      responseTimeMs,
      cacheHit,
    })
    .catch((err) => {
      console.error("[resolve] Failed to log resolution event:", err instanceof Error ? err.message : err);
    });
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkIdRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = idRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    idRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 100;
}

router.get("/id/:agentId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.agentId as string;
    if (!uuidRe.test(agentId)) {
      throw new AppError(400, "INVALID_ID", "agentId must be a valid UUID");
    }

    const clientIp = req.ip || "unknown";
    if (!checkIdRateLimit(clientIp)) {
      res.status(429).json({ error: "Rate limit exceeded", code: "RATE_LIMIT", retryAfterSeconds: 60 });
      return;
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", "Agent not found");
    }

    assertSandboxIsolation(req, agent);

    const format = req.query.format as string | undefined;
    const chain = req.query.chain as string | undefined;
    let resolved = await enrichAndResolve(agent, format);
    if (chain) {
      resolved = applyChainFilter(resolved as unknown as Record<string, unknown>, chain) as typeof resolved;
    }

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ resolved: true, agent: resolved });
  } catch (err) {
    next(err);
  }
});

function isEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isTronAddress(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) && !isTronAddress(addr);
}

router.get("/address/:address", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = req.params.address as string;

    const isEvm = isEvmAddress(address);
    const isTron = !isEvm && isTronAddress(address);
    const isSolana = !isEvm && !isTron && isSolanaAddress(address);

    if (!isEvm && !isTron && !isSolana) {
      throw new AppError(400, "INVALID_ADDRESS", "Address must be an EVM (0x...), Tron (T...), or Solana (base58) address");
    }

    type RelationshipType = "nft_owner" | "mpc_wallet" | "ows_registered";

    interface MatchedHandle {
      handle: string;
      agentId: string;
      relationship: RelationshipType;
    }

    const matches: MatchedHandle[] = [];
    const seenRelationships = new Set<string>();
    const addressLower = address.toLowerCase();
    const addressExact = address;

    function addMatch(handle: string, agentId: string, relationship: RelationshipType): void {
      const key = `${agentId}:${relationship}`;
      if (!seenRelationships.has(key)) {
        seenRelationships.add(key);
        matches.push({ handle, agentId, relationship });
      }
    }

    if (isEvm) {
      const mpcAgents = await db.query.agentsTable.findMany({
        where: and(
          sql`lower(${agentsTable.walletAddress}) = ${addressLower}`,
          eq(agentsTable.status, "active"),
        ),
        columns: { handle: true, id: true },
      });

      for (const a of mpcAgents) {
        if (a.handle) addMatch(a.handle, a.id, "mpc_wallet");
      }

      const nftOwnerAgents = await db.query.agentsTable.findMany({
        where: and(
          sql`lower(${agentsTable.onChainOwner}) = ${addressLower}`,
          eq(agentsTable.status, "active"),
        ),
        columns: { handle: true, id: true },
      });

      for (const a of nftOwnerAgents) {
        if (a.handle) addMatch(a.handle, a.id, "nft_owner");
      }
    }

    const chainMintsAgents = await db.query.agentsTable.findMany({
      where: and(
        sql`${agentsTable.chainMints} IS NOT NULL AND ${agentsTable.chainMints}::text != '{}'`,
        eq(agentsTable.status, "active"),
      ),
      columns: { handle: true, id: true, chainMints: true },
    });

    for (const a of chainMintsAgents) {
      if (!a.handle) continue;
      const mints = (a.chainMints as Record<string, unknown>) ?? {};
      for (const [chain, chainData] of Object.entries(mints)) {
        if (!chainData || typeof chainData !== "object") continue;
        const mintEntry = chainData as Record<string, unknown>;
        const ownerAddr = typeof mintEntry.owner === "string" ? mintEntry.owner : null;
        if (!ownerAddr) continue;

        const isEvmChain = chain === "base" || chain === "ethereum" || chain === "polygon";
        const addressMatch = isEvmChain
          ? ownerAddr.toLowerCase() === addressLower
          : ownerAddr === addressExact;

        if (addressMatch) {
          addMatch(a.handle, a.id, "nft_owner");
        }
      }
    }

    const owsRows = await db.query.agentOwsWalletsTable.findMany({
      columns: { agentId: true, accounts: true },
    });

    for (const row of owsRows) {
      const accounts = row.accounts ?? [];
      const matched = accounts.some((acc: string) => {
        const parts = acc.split(":");
        if (parts.length < 3) return false;
        const namespace = parts[0];
        const accAddress = parts[parts.length - 1];
        const isEvmNamespace = namespace === "eip155";
        if (isEvmNamespace) {
          return accAddress.toLowerCase() === addressLower;
        }
        return accAddress === addressExact;
      });

      if (matched) {
        const agent = await db.query.agentsTable.findFirst({
          where: and(eq(agentsTable.id, row.agentId), eq(agentsTable.status, "active")),
          columns: { handle: true, id: true },
        });
        if (agent?.handle) {
          addMatch(agent.handle, agent.id, "ows_registered");
        }
      }
    }

    const APP_URL = process.env.APP_URL || "https://getagent.id";

    res.json({
      address,
      addressType: isEvm ? "evm" : isTron ? "tron" : "solana",
      handles: matches.map((m) => ({
        handle: m.handle,
        agentId: m.agentId,
        relationship: m.relationship,
        resolveUrl: `${APP_URL}/api/v1/resolve/${m.handle}`,
      })),
      total: matches.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:handle", async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const handle = normalizeHandle(req.params.handle as string);
    const machine = detectAgent(req);

    if (!machine) {
      logResolutionEvent(handle, null, "browser", Date.now() - startTime, "NONE");
      res.redirect(302, formatProfileUrl(handle));
      return;
    }

    const format = req.query.format as string | undefined;
    const chain = req.query.chain as string | undefined;

    const cached = await getResolutionCache(handle);
    if (cached && !wantsMarkdown(req) && !format && !chain) {
      const responseTimeMs = Date.now() - startTime;
      logResolutionEvent(handle, null, "machine", responseTimeMs, "HIT");
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const agent = await getAgentByHandle(handle);
    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", `No agent found for handle "${handle}"`);
    }

    assertSandboxIsolation(req, agent);

    if (agent.status === "revoked") {
      const APP_URL = process.env.APP_URL || "https://getagent.id";
      const revokedHandle = agent.handle ? normalizeHandle(agent.handle) : handle;
      logResolutionEvent(handle, agent.id, "machine", Date.now() - startTime, "NONE");
      res.status(410).json({
        error: "AGENT_REVOKED",
        message: `Agent "${handle}" has been revoked and is no longer active.`,
        revocation: {
          revokedAt: agent.revokedAt,
          reason: agent.revocationReason,
          statement: agent.revocationStatement,
          did: `did:agentid:${revokedHandle}`,
          recordUrl: `${(process.env.APP_URL || "https://getagent.id")}/api/v1/resolve/${revokedHandle}`,
        },
      });
      return;
    }

    if (!agent.isPublic) {
      const APP_URL = process.env.APP_URL || "https://getagent.id";
      res.status(403).json({
        error: "AGENT_NOT_PUBLIC",
        message: `Agent "${handle}" exists but is not publicly listed. Use UUID-based resolution instead.`,
        uuidResolutionUrl: `${APP_URL}/api/v1/resolve/id/${agent.id}`,
        hint: "Public resolution requires a paid plan. The agent can still be resolved by its UUID.",
      });
      return;
    }

    if (agent.status !== "active") {
      throw new AppError(404, "AGENT_NOT_FOUND", `No agent found for handle "${handle}"`);
    }

    let resolved = await enrichAndResolve(agent, format);
    if (chain) {
      resolved = applyChainFilter(resolved as unknown as Record<string, unknown>, chain) as typeof resolved;
    }

    if (wantsMarkdown(req)) {
      const md = generateAgentProfileMarkdown(resolved);
      const responseTimeMs = Date.now() - startTime;
      logResolutionEvent(handle, agent.id, "machine", responseTimeMs, "MISS");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(md);
      return;
    }

    const responseBody = {
      resolved: true,
      agent: resolved,
    };

    if (!format && !chain) {
      await setResolutionCache(handle, responseBody);
    }

    const responseTimeMs = Date.now() - startTime;
    logResolutionEvent(handle, agent.id, "machine", responseTimeMs, "MISS");

    res.setHeader("X-Cache", "MISS");
    res.json(responseBody);
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const handle = normalizeHandle(req.params.handle as string);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalResult, last24hResult, last7dResult, avgResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(resolutionEventsTable)
        .where(eq(resolutionEventsTable.handle, handle)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(resolutionEventsTable)
        .where(and(
          eq(resolutionEventsTable.handle, handle),
          gte(resolutionEventsTable.createdAt, oneDayAgo),
        )),

      db.select({ count: sql<number>`count(*)::int` })
        .from(resolutionEventsTable)
        .where(and(
          eq(resolutionEventsTable.handle, handle),
          gte(resolutionEventsTable.createdAt, sevenDaysAgo),
        )),

      db.select({ avg: sql<number>`COALESCE(AVG(${resolutionEventsTable.responseTimeMs}), 0)` })
        .from(resolutionEventsTable)
        .where(eq(resolutionEventsTable.handle, handle)),
    ]);

    res.json({
      handle,
      totalResolutions: totalResult[0]?.count ?? 0,
      resolutionsLast24h: last24hResult[0]?.count ?? 0,
      resolutionsLast7d: last7dResult[0]?.count ?? 0,
      avgResponseTimeMs: Math.round(Number(avgResult[0]?.avg ?? 0)),
    });
  } catch (err) {
    next(err);
  }
});

const reverseSchema = z.object({
  endpointUrl: z.string().min(1),
});

export async function handleReverse(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = reverseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "endpointUrl is required", parsed.error.issues);
    }

    const { endpointUrl } = parsed.data;

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.endpointUrl, endpointUrl),
        eq(agentsTable.status, "active"),
        eq(agentsTable.isPublic, true),
        eq(agentsTable.verificationStatus, "verified"),
      ),
    });

    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", "No verified agent found for this endpoint URL");
    }

    assertSandboxIsolation(req, agent);

    const resolved = await enrichAndResolve(agent);

    res.json({
      resolved: true,
      agent: resolved,
    });
  } catch (err) {
    next(err);
  }
}

router.post("/reverse", handleReverse);

export async function handleAgentDiscovery(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query.q as string | undefined;
    const capability = req.query.capability as string | undefined;
    const minTrust = req.query.minTrust ? parseInt(req.query.minTrust as string, 10) : undefined;
    const protocol = req.query.protocol as string | undefined;
    const verifiedOnly = req.query.verifiedOnly === "true";
    const sort = (req.query.sort as string) || "trust";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const requestIsSandbox = req.isSandbox === true;

    const conditions = [
      eq(agentsTable.status, "active"),
      eq(agentsTable.verificationStatus, "verified"),
      requestIsSandbox
        ? sql`(${agentsTable.metadata}->>'isSandbox')::boolean = true`
        : sql`((${agentsTable.metadata}->>'isSandbox') IS NULL OR (${agentsTable.metadata}->>'isSandbox')::boolean = false)`,
    ];

    if (minTrust !== undefined && !isNaN(minTrust)) {
      conditions.push(gte(agentsTable.trustScore, minTrust));
    }

    if (verifiedOnly) {
      conditions.push(eq(agentsTable.verificationStatus, "verified"));
    }

    let whereClause = and(...conditions);

    if (q && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[<>&'"]/g, "");
      const tsQuery = sanitized.split(/\s+/).filter(Boolean).map(w => w + ":*").join(" & ");
      const fullTextFilter = sql`(
        "search_vector" @@ to_tsquery('english', ${tsQuery})
        OR ${agentsTable.handle} % ${sanitized}
        OR ${agentsTable.displayName} % ${sanitized}
      )`;
      whereClause = and(whereClause, fullTextFilter);
    }

    if (capability) {
      const capFilter = sql`${agentsTable.capabilities}::jsonb @> ${JSON.stringify([capability])}::jsonb`;
      whereClause = and(whereClause, capFilter);
    }

    if (protocol) {
      const protoFilter = sql`${agentsTable.protocols}::jsonb @> ${JSON.stringify([protocol])}::jsonb`;
      whereClause = and(whereClause, protoFilter);
    }

    const orderByFn = sort === "recent"
      ? [drizzleDesc(agentsTable.createdAt)]
      : sort === "activity"
        ? [drizzleDesc(agentsTable.updatedAt)]
        : [drizzleDesc(agentsTable.trustScore)];

    const agents = await db.query.agentsTable.findMany({
      where: whereClause,
      orderBy: orderByFn,
      limit,
      offset,
    });

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentsTable)
      .where(whereClause!);

    const enriched = await Promise.all(agents.map(a => enrichAndResolve(a)));

    res.json({
      agents: enriched,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/erc8004/:chainId/:agentId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chainId = (req.params.chainId as string).toLowerCase();
    const erc8004AgentIdRaw = req.params.agentId as string;
    const erc8004AgentIdNum = parseInt(erc8004AgentIdRaw, 10);

    if (isNaN(erc8004AgentIdNum)) {
      throw new AppError(400, "INVALID_AGENT_ID", "erc8004 agentId must be a valid integer");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        sql`${agentsTable.erc8004AgentId} = ${erc8004AgentIdNum}`,
        sql`lower(${agentsTable.erc8004Chain}) = ${chainId}`,
        eq(agentsTable.status, "active"),
      ),
    });

    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", `No agent found for chainId=${chainId} agentId=${erc8004AgentIdNum}`);
    }

    const resolved = await enrichAndResolve(agent);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ resolved: true, agent: resolved });
  } catch (err) {
    next(err);
  }
});

router.get("/", handleAgentDiscovery);

router.get("/:orgSlug/:handle", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgSlug = (req.params.orgSlug as string).toLowerCase();
    const handle = normalizeHandle(req.params.handle as string);

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        sql`${agentsTable.orgNamespace} = ${`${orgSlug}.${handle}`}`,
        eq(agentsTable.status, "active"),
      ),
    });

    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", `No agent found for "${orgSlug}/${handle}"`);
    }

    assertSandboxIsolation(req, agent);

    const resolved = await enrichAndResolve(agent);
    res.json({ resolved: true, agent: resolved, orgNamespace: orgSlug });
  } catch (err) {
    next(err);
  }
});

export { deleteResolutionCache };
export default router;
