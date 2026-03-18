import { Router } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  agentTransfersTable,
} from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { computeTrustScore } from "../../services/trust-score";
import { getOperatorCount, getCurrentOperator } from "../../services/operator-history";

const SPEC_VERSION = "1.2.0";

const router = Router();

router.get("/:agentIdOrHandle", async (req, res, next) => {
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
          parent_agent_id: agent.parentAgentId,
          depth: agent.lineageDepth,
          sponsored_by: agent.sponsoredBy,
        }
      : null;

    const operatorCount = await getOperatorCount(agent.id);
    const currentOperator = await getCurrentOperator(agent.id);

    const trustSurfaces = {
      historical_agent_reputation: agent.historicalAgentReputation ?? trustScore,
      current_operator_reputation: agent.currentOperatorReputation ?? trustScore,
      effective_live_trust: agent.effectiveLiveTrust ?? trustScore,
    };

    let transfer: Record<string, unknown> | null = null;
    if (agent.transferStatus) {
      const latestTransfer = await db.query.agentTransfersTable.findFirst({
        where: eq(agentTransfersTable.agentId, agent.id),
        orderBy: [desc(agentTransfersTable.createdAt)],
        columns: { transferType: true },
      });

      transfer = {
        status: agent.transferStatus,
        under_new_ownership: agent.transferredAt !== null,
        transferred_at: agent.transferredAt,
        transfer_type: latestTransfer?.transferType ?? null,
      };
    }

    const operatorHistory = {
      total_operators: Math.max(operatorCount, 1),
      current_operator_verified: currentOperator?.verificationStatus === "verified" || false,
    };

    res.json({
      spec_version: SPEC_VERSION,
      agent_id: agent.id,
      handle: agent.handle,
      display_name: agent.displayName,
      status: agent.status,
      created_at: agent.createdAt,
      public_keys: keys.map((k) => ({
        kid: k.kid,
        algorithm: k.keyType,
        use: k.use,
        status: k.status === "rotated" ? "revoked" as const : k.status,
        added_at: k.createdAt,
      })),
      trust: {
        score: trustScore,
        tier: trustTier,
        signals,
      },
      trust_surfaces: trustSurfaces,
      transfer,
      operator_history: operatorHistory,
      auth_methods: authMethods,
      protocols,
      lineage,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentIdOrHandle/identity", (req, res) => {
  res.redirect(301, `/api/v1/public/agents/${req.params.agentIdOrHandle}`);
});

export default router;
