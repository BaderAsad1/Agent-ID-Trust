import { Router } from "express";
import { eq, sql, desc, inArray, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  tasksTable,
  agentActivityLogTable,
  paymentLedgerTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { agentOwnerFilter } from "../../services/agents";

const router = Router();

router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!;

    const allUserAgents = await db.query.agentsTable.findMany({
      where: agentOwnerFilter(userId),
      columns: { id: true, handle: true, displayName: true, trustScore: true, status: true },
    });

    // Exclude revoked agents from stats — they no longer represent the user's active fleet.
    const userAgents = allUserAgents.filter((a) => a.status !== "revoked");

    if (userAgents.length === 0) {
      res.json({
        totalAgents: 0,
        activeAgents: 0,
        tasksReceived: 0,
        tasksCompleted: 0,
        tasksPending: 0,
        marketplaceEarnings: 0,
        recentActivity: [],
      });
      return;
    }

    const agentIds = userAgents.map((a) => a.id);
    const activeAgents = userAgents.filter((a) => a.status === "active").length;

    const taskStats = await db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tasksTable.businessStatus} = 'completed')::int`,
        pending: sql<number>`count(*) filter (where ${tasksTable.businessStatus} = 'pending')::int`,
        accepted: sql<number>`count(*) filter (where ${tasksTable.businessStatus} = 'accepted')::int`,
      })
      .from(tasksTable)
      .where(inArray(tasksTable.recipientAgentId, agentIds));

    let marketplaceEarnings = 0;
    try {
      const earningsResult = await db
        .select({
          total: sql<number>`coalesce(sum(${paymentLedgerTable.amount}::numeric), 0)::float`,
        })
        .from(paymentLedgerTable)
        .where(
          and(
            inArray(paymentLedgerTable.accountId, agentIds),
            eq(paymentLedgerTable.direction, "inbound"),
          ),
        );
      marketplaceEarnings = earningsResult[0]?.total ?? 0;
    } catch {
      marketplaceEarnings = 0;
    }

    const recentActivity = await db.query.agentActivityLogTable.findMany({
      where: inArray(agentActivityLogTable.agentId, agentIds),
      orderBy: [desc(agentActivityLogTable.createdAt)],
      limit: 20,
    });

    res.json({
      totalAgents: userAgents.length,
      activeAgents,
      tasksReceived: taskStats[0]?.total ?? 0,
      tasksCompleted: taskStats[0]?.completed ?? 0,
      tasksPending: (taskStats[0]?.pending ?? 0) + (taskStats[0]?.accepted ?? 0),
      marketplaceEarnings,
      agents: userAgents,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
