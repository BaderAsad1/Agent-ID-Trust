import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
} from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { computeTrustScore } from "../../services/trust-score";

const SPEC_VERSION = "1.0.0";

const router = Router();

router.get("/:agentIdOrHandle/identity", async (req, res, next) => {
  try {
    const param = req.params.agentIdOrHandle as string;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

    const agent = isUuid
      ? await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, param) })
      : await db.query.agentsTable.findFirst({ where: eq(sql`lower(${agentsTable.handle})`, param.toLowerCase()) });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (!agent.isPublic && agent.verificationStatus !== "verified") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const keys = await db.query.agentKeysTable.findMany({
      where: eq(agentKeysTable.agentId, agent.id),
      orderBy: (keys, { desc }) => [desc(keys.createdAt)],
    });

    const { trustScore, trustTier, signals } = await computeTrustScore(agent.id);

    const authMethods = [...((agent.authMethods as string[] | null) || [])];
    if (!authMethods.includes("agent-key")) {
      authMethods.unshift("agent-key");
    }

    const protocols = (agent.protocols as string[] | null) || [];

    const lineage: Record<string, unknown> | null = agent.parentAgentId
      ? {
          parentAgentId: agent.parentAgentId,
          depth: agent.lineageDepth,
          sponsoredBy: agent.sponsoredBy,
        }
      : null;

    res.json({
      specVersion: SPEC_VERSION,
      agentId: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
      status: agent.status,
      createdAt: agent.createdAt,
      publicKeys: keys.map((k) => ({
        kid: k.kid,
        algorithm: k.keyType,
        use: k.use,
        status: k.status === "rotated" ? "revoked" as const : k.status,
        addedAt: k.createdAt,
      })),
      trust: {
        score: trustScore,
        tier: trustTier,
        signals,
      },
      authMethods,
      protocols,
      lineage,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
