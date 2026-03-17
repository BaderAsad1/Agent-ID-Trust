import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { assertSandboxIsolation } from "../../middlewares/sandbox";
import { getAgentByHandle, getAgentById } from "../../services/agents";
import { detectAgent } from "../../middlewares/cli-markdown";
import { generateAgentProfileMarkdown } from "../../services/agent-markdown";
import { eq, and, gte, desc as drizzleDesc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, marketplaceListingsTable, resolutionEventsTable } from "@workspace/db/schema";
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

function toResolvedAgent(
  agent: typeof agentsTable.$inferSelect,
  ownerKey: string | null,
  pricing: ({ hasListing: true; priceType: string; priceAmount: string | null; currency: string; deliveryHours: number | null; listingUrl: string } | { hasListing: false }),
) {
  const APP_URL = process.env.APP_URL || 'https://getagent.id';
  const hasHandle = agent.handlePaid && agent.handle;
  const handle = hasHandle ? normalizeHandle(agent.handle!) : null;

  return {
    machineIdentity: {
      agentId: agent.id,
      did: `did:agentid:${agent.id}`,
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
      expiresAt: agent.handleExpiresAt ?? null,
    } : null,
    handle: agent.handle ?? null,
    domain: handle ? formatDomain(handle) : null,
    protocolAddress: handle ? formatHandle(handle) : null,
    did: handle ? formatDID(handle) : `did:agentid:${agent.id}`,
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
    status: agent.status,
    avatarUrl: agent.avatarUrl,
    ownerKey,
    pricing,
    walletAddress: agent.walletAddress || null,
    walletNetwork: agent.walletAddress ? (agent.walletNetwork || "base-mainnet") : null,
    paymentMethods: agent.paymentMethods || [],
    metadata: agent.metadata,
    tasksCompleted: agent.tasksCompleted,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    profileUrl: handle ? formatProfileUrl(handle) : `${APP_URL}/id/${agent.id}`,
    erc8004Uri: handle ? `${APP_URL}/api/v1/p/${handle}/erc8004` : null,
    credential: {
      namespace: ".agentid",
      did: handle ? formatDID(handle) : `did:agentid:${agent.id}`,
      domain: handle ? formatDomain(handle) : null,
    },
  };
}

async function enrichAndResolve(agent: typeof agentsTable.$inferSelect) {
  const [ownerKey, pricing, lineage, keys] = await Promise.all([
    getOwnerKey(agent.id),
    getPricing(agent.id),
    getLineageBlock(agent),
    getActiveKeys(agent.id),
  ]);
  const meta = (agent.metadata as Record<string, unknown> | null) ?? {};
  const agentIsSandbox = agent.handle?.startsWith("sandbox-") || meta.isSandbox === true;
  return {
    ...toResolvedAgent(agent, ownerKey, pricing),
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

    const resolved = await enrichAndResolve(agent);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ resolved: true, agent: resolved });
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

    const cached = await getResolutionCache(handle);
    if (cached && !wantsMarkdown(req)) {
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
          recordUrl: `${APP_URL}/api/v1/resolve/${revokedHandle}`,
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

    const resolved = await enrichAndResolve(agent);

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

    await setResolutionCache(handle, responseBody);

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

    const enriched = await Promise.all(agents.map(enrichAndResolve));

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
