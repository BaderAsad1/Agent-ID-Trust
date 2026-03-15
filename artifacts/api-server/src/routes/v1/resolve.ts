import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { getAgentByHandle } from "../../services/agents";
import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, marketplaceListingsTable } from "@workspace/db/schema";

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
  return {
    handle: agent.handle,
    domain: `${agent.handle.toLowerCase()}.getagent.id`,
    protocolAddress: `${agent.handle}.agentid`,
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
    profileUrl: `https://getagent.id/${agent.handle}`,
  };
}

async function enrichAndResolve(agent: typeof agentsTable.$inferSelect) {
  const [ownerKey, pricing] = await Promise.all([
    getOwnerKey(agent.id),
    getPricing(agent.id),
  ]);
  return toResolvedAgent(agent, ownerKey, pricing);
}

router.get("/:handle", async (req: Request, res: Response, next: NextFunction) => {
  try {
    let handle = (req.params.handle as string).toLowerCase();
    if (handle.endsWith(".agentid")) {
      handle = handle.replace(/\.agentid$/, "");
    } else if (handle.endsWith(".agent")) {
      handle = handle.replace(/\.agent$/, "");
    }

    const agent = await getAgentByHandle(handle);
    if (!agent || agent.status !== "active" || !agent.isPublic) {
      throw new AppError(404, "AGENT_NOT_FOUND", `No agent found for handle "${handle}"`);
    }

    const resolved = await enrichAndResolve(agent);

    res.json({
      resolved: true,
      agent: resolved,
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
    const verifiedOnly = req.query.verifiedOnly === "true";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const conditions = [
      eq(agentsTable.status, "active"),
      eq(agentsTable.isPublic, true),
    ];

    if (minTrust !== undefined && !isNaN(minTrust)) {
      conditions.push(gte(agentsTable.trustScore, minTrust));
    }

    if (verifiedOnly) {
      conditions.push(eq(agentsTable.verificationStatus, "verified"));
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

export default router;
