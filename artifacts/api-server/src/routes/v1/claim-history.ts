/**
 * Agent Claim History Routes — Phase 3
 *
 * Owner claim state machine: unclaimed → claimed → transferred / disputed
 * Claim history is immutable (append-only). Claims are never deleted.
 *
 * GET  /v1/agents/:agentId/claim-history  — Get claim history for an agent
 * POST /v1/agents/:agentId/claims/dispute — Submit a dispute
 */
import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentClaimHistoryTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { writeAuditEvent } from "../../services/auth-session";

const router = Router();

router.get("/:agentId/claim-history", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });
    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");

    const isOwner = agent.ownerUserId === userId;
    const isAdmin = !!(req.user as { isAdmin?: boolean })?.isAdmin;

    if (!isOwner && !isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this agent's claim history");
    }

    const history = await db.query.agentClaimHistoryTable.findMany({
      where: eq(agentClaimHistoryTable.agentId, agentId),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });

    res.json({ agentId, history });
  } catch (err) {
    next(err);
  }
});

const disputeSchema = z.object({
  evidence: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/:agentId/claims/dispute", requireAuth, async (req, res, next) => {
  try {
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);

    const agentId = req.params.agentId as string;
    const { evidence, notes } = parsed.data;
    const userId = req.user!.id;

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });
    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");

    const { createHash } = await import("crypto");
    const evidenceHash = evidence
      ? createHash("sha256").update(evidence).digest("hex")
      : undefined;

    const [record] = await db.insert(agentClaimHistoryTable).values({
      agentId,
      action: "disputed",
      fromOwner: agent.ownerUserId || undefined,
      toOwner: userId,
      performedByUserId: userId,
      evidenceHash,
      notes,
      disputeStatus: "pending",
    }).returning();

    await writeAuditEvent("user", userId, "claim.dispute.submitted", "agent", agentId, {
      historyId: record.id,
      agentId,
      signal: "claim_dispute",
    });

    res.status(201).json({
      success: true,
      historyId: record.id,
      agentId,
      action: "disputed",
      disputeStatus: "pending",
      message: "Dispute submitted for admin review.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
