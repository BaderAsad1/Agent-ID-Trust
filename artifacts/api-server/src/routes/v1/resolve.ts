import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { getAgentByHandle, getAgentById } from "../../services/agents";
import { detectAgent } from "../../middlewares/cli-markdown";
import { generateAgentProfileMarkdown } from "../../services/agent-markdown";
import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, marketplaceListingsTable, resolutionEventsTable } from "@workspace/db/schema";
import { normalizeHandle, formatHandle, formatDomain, formatProfileUrl, formatDID, formatResolverUrl } from "../../utils/handle";
import { getResolutionCache, setResolutionCache, deleteResolutionCache } from "../../lib/resolution-cache";

async function getLineageBlock(agent: typeof agentsTable.$inferSelect): Promise<Record<string, unknown> | null> {
  if (!agent.parentAgentId) return null;

  const parent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agent.parentAgentId),
    columns: { handle: true, id: true },
  });

  if (!parent) return null;

  const parentHandle = normalizeHandle(parent.handle);

  return {
    parentAgentId: parent.id,
    parentHandle: parent.handle,
    parentResolverUrl: formatResolverUrl(parentHandle),
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

async function getPricing(agentId: string): Promise<{ priceType: string; priceAmount: string | null; deliveryHours: number | null } | null> {
  const listing = await db.query.marketplaceListingsTable.findFirst({
    where: and(
      eq(marketplaceListingsTable.agentId, agentId),
      eq(marketplaceListingsTable.status, "active"),
    ),
    columns: { priceType: true, priceAmount: true, deliveryHours: true },
  });
  if (!listing) return null;
  return {
    priceType: listing.priceType,
    priceAmount: listing.priceAmount,
    deliveryHours: listing.deliveryHours,
  };
}

function toResolvedAgent(
  agent: typeof agentsTable.$inferSelect,
  ownerKey: string | null,
  pricing: { priceType: string; priceAmount: string | null; deliveryHours: number | null } | null,
) {
  const handle = normalizeHandle(agent.handle);
  return {
    handle: agent.handle,
    domain: formatDomain(handle),
    protocolAddress: formatHandle(handle),
    did: formatDID(handle),
    resolverUrl: formatResolverUrl(handle),
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
    paymentMethods: agent.paymentMethods || [],
    metadata: agent.metadata,
    tasksCompleted: agent.tasksCompleted,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    profileUrl: formatProfileUrl(handle),
    erc8004Uri: `${process.env.APP_URL || 'https://getagent.id'}/api/v1/p/${handle}/erc8004`,
    credential: {
      namespace: ".agentid",
      did: formatDID(handle),
      domain: formatDomain(handle),
    },
  };
}

async function enrichAndResolve(agent: typeof agentsTable.$inferSelect) {
  const [ownerKey, pricing, lineage] = await Promise.all([
    getOwnerKey(agent.id),
    getPricing(agent.id),
    getLineageBlock(agent),
  ]);
  return { ...toResolvedAgent(agent, ownerKey, pricing), lineage };
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
    if (!agent || agent.verificationStatus !== "verified") {
      throw new AppError(404, "AGENT_NOT_FOUND", "Agent not found");
    }

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
    const capability = req.query.capability as string | undefined;
    const minTrust = req.query.minTrust ? parseInt(req.query.minTrust as string, 10) : undefined;
    const protocol = req.query.protocol as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const conditions = [
      eq(agentsTable.status, "active"),
      eq(agentsTable.verificationStatus, "verified"),
    ];

    if (minTrust !== undefined && !isNaN(minTrust)) {
      conditions.push(gte(agentsTable.trustScore, minTrust));
    }

    let whereClause = and(...conditions);

    if (capability) {
      const capFilter = sql`${agentsTable.capabilities}::jsonb @> ${JSON.stringify([capability])}::jsonb`;
      whereClause = and(whereClause, capFilter);
    }

    if (protocol) {
      const protoFilter = sql`${agentsTable.protocols}::jsonb @> ${JSON.stringify([protocol])}::jsonb`;
      whereClause = and(whereClause, protoFilter);
    }

    const agents = await db.query.agentsTable.findMany({
      where: whereClause,
      orderBy: (agents, { desc }) => [desc(agents.trustScore)],
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

    const resolved = await enrichAndResolve(agent);
    res.json({ resolved: true, agent: resolved, orgNamespace: orgSlug });
  } catch (err) {
    next(err);
  }
});

export { deleteResolutionCache };
export default router;
