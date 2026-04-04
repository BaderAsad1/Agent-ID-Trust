import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import { getAgentById, isAgentOwner } from "../../services/agents";
import { initiateVerification, verifyChallenge } from "../../services/verification";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";

const router = Router();

const initiateSchema = z.object({
  method: z.enum(["key_challenge"]).default("key_challenge"),
});

const completeSchema = z.object({
  challenge: z.string().min(1),
  signature: z.string().min(1),
  kid: z.string().min(1),
});

router.post("/:agentId/verify/initiate", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agent = await getAgentById(req.params.agentId as string);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    if (agent.verificationStatus === "verified") {
      throw new AppError(400, "ALREADY_VERIFIED", "Agent is already verified");
    }

    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const challenge = await initiateVerification(agent.id, parsed.data.method);

    res.json({
      agentId: agent.id,
      challenge: challenge.challenge,
      method: challenge.method,
      expiresAt: challenge.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/verify/complete", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agent = await getAgentById(req.params.agentId as string);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { challenge, signature, kid } = parsed.data;
    const result = await verifyChallenge(agent.id, challenge, signature, kid);

    if (!result.success) {
      await logActivity({
        agentId: agent.id,
        eventType: "agent.verification_failed",
        payload: { error: result.error },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw new AppError(400, "VERIFICATION_FAILED", result.error!);
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.verified",
      payload: { method: "key_challenge" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.verified",
        payload: { method: "key_challenge" },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(agent.id, "agent.verified", { method: "key_challenge" });
    } catch {}

    const trust = await recomputeAndStore(agent.id);

    await db
      .update(agentsTable)
      .set({ bootstrapIssuedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentsTable.id, agent.id));

    res.json({
      verified: true,
      agentId: agent.id,
      handle: agent.handle,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      bootstrapIssuedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
