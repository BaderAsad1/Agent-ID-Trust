import { lt } from "drizzle-orm";
import { db } from "@workspace/db";
import { undeliverableMessagesTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export async function cleanupExpiredUndeliverableMessages(): Promise<number> {
  const result = await db
    .delete(undeliverableMessagesTable)
    .where(lt(undeliverableMessagesTable.expiresAt, new Date()));

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info({ count }, "[undeliverable-cleanup] Removed expired undeliverable messages");
  }
  return count;
}

export function initUndeliverableCleanupWorker(): void {
  cleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredUndeliverableMessages();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, "[undeliverable-cleanup] Cleanup failed");
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info("[undeliverable-cleanup] Cleanup worker started (runs every 6 hours)");
}

export function stopUndeliverableCleanupWorker(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
