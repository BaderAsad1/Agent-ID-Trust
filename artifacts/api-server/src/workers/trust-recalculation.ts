import { eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { recomputeAndStore } from "../services/trust-score";
import { logger } from "../middlewares/request-logger";

const RECALCULATION_INTERVAL_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function recalculateAllTrust() {
  try {
    const agents = await db.query.agentsTable.findMany({
      where: or(
        eq(agentsTable.status, "active"),
        eq(agentsTable.status, "draft"),
      ),
      columns: { id: true, handle: true },
    });

    logger.info(`[trust-worker] Starting hourly trust recalculation for ${agents.length} agents`);

    let success = 0;
    let failed = 0;

    for (const agent of agents) {
      try {
        await recomputeAndStore(agent.id);
        success++;
      } catch (err) {
        failed++;
        logger.error({ err, agentId: agent.id }, "[trust-worker] Failed to recalculate trust");
      }
    }

    logger.info(`[trust-worker] Completed: ${success} succeeded, ${failed} failed`);
  } catch (err) {
    logger.error({ err }, "[trust-worker] Failed to run trust recalculation");
  }
}

export function startTrustWorker() {
  if (timer) return;

  logger.info("[trust-worker] Starting hourly trust recalculation worker");

  setTimeout(() => {
    recalculateAllTrust();
  }, 30000);

  timer = setInterval(recalculateAllTrust, RECALCULATION_INTERVAL_MS);
}

export function stopTrustWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
