import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, auditEventsTable } from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { logger } from "../../middlewares/request-logger";
import { env } from "../../lib/env";

const router = Router();

router.post("/:handle/feedback", requireAgentAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, handle),
      columns: {
        id: true,
        handle: true,
        status: true,
        isPublic: true,
      },
    });

    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const body = req.body as Record<string, unknown>;
    const { value, valueDecimals, tag1, endpoint, chain } = body;

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new AppError(400, "INVALID_VALUE", "value must be an integer between 0 and 100");
    }
    if (!chain || typeof chain !== "string" || chain.trim().length === 0) {
      throw new AppError(400, "INVALID_CHAIN", "chain is required and must be a non-empty string");
    }
    if (valueDecimals !== undefined && (typeof valueDecimals !== "number" || !Number.isInteger(valueDecimals) || valueDecimals < 0)) {
      throw new AppError(400, "INVALID_VALUE_DECIMALS", "valueDecimals must be a non-negative integer");
    }
    if (tag1 !== undefined && tag1 !== null && typeof tag1 !== "string") {
      throw new AppError(400, "INVALID_TAG1", "tag1 must be a string");
    }
    if (endpoint !== undefined && endpoint !== null && typeof endpoint !== "string") {
      throw new AppError(400, "INVALID_ENDPOINT", "endpoint must be a string");
    }
    if (endpoint && typeof endpoint === "string") {
      try {
        new URL(endpoint);
      } catch {
        throw new AppError(400, "INVALID_ENDPOINT", "endpoint must be a valid URL");
      }
    }

    const submittingAgent = req.authenticatedAgent!;

    await db.insert(auditEventsTable).values({
      actorType: "agent",
      actorId: submittingAgent.id,
      eventType: "reputation_feedback",
      targetType: "agent",
      targetId: agent.id,
      payload: {
        value,
        valueDecimals: typeof valueDecimals === "number" ? valueDecimals : 0,
        tag1: tag1 ?? null,
        endpoint: endpoint ?? null,
        chain: chain.trim(),
        handle,
      },
      ipAddress: req.ip?.slice(0, 64) ?? null,
    });

    const onchainEnabled =
      env().ONCHAIN_MINTING_ENABLED === "true" || env().ONCHAIN_MINTING_ENABLED === "1";

    let txHash: string | undefined;

    if (onchainEnabled) {
      logger.info(
        { agentId: agent.id, chain, value },
        "[feedback] On-chain reputation submission is enabled but no ReputationRegistry contract configured — skipping",
      );
    }

    res.json({ submitted: true, ...(txHash ? { txHash } : {}) });
  } catch (err) {
    next(err);
  }
});

export default router;
