import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, usersTable } from "@workspace/db/schema";
import { logActivity } from "../../services/activity-logger";

const router = Router();

const transferSchema = z.object({
  targetUserId: z.string().min(1),
});

router.post("/:agentId/transfer", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "targetUserId is required");
    }

    const { targetUserId } = parsed.data;

    if (targetUserId === req.userId) {
      throw new AppError(400, "INVALID_TRANSFER", "Cannot transfer to yourself");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, req.userId!)),
    });
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found or you do not own it");
    }

    const targetUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, targetUserId),
      columns: { id: true },
    });
    if (!targetUser) {
      throw new AppError(404, "TARGET_NOT_FOUND", "Target user not found");
    }

    const [updated] = await db
      .update(agentsTable)
      .set({ userId: targetUserId, updatedAt: new Date() })
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, req.userId!)))
      .returning();

    if (!updated) {
      throw new AppError(500, "TRANSFER_FAILED", "Transfer failed");
    }

    await logActivity({
      agentId,
      eventType: "agent.handle_transferred",
      payload: {
        fromUserId: req.userId,
        toUserId: targetUserId,
        handle: agent.handle,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      handle: agent.handle,
      previousOwner: req.userId,
      newOwner: targetUserId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
