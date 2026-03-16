import { Queue, Worker, type Job } from "bullmq";
import { and, eq, lte, sql, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, apiKeysTable } from "@workspace/db/schema";
import { getRedisConnectionOptions, isRedisConfigured } from "../lib/redis";
import { logger } from "../middlewares/request-logger";

const QUEUE_NAME = "agent-expiry";
const EXPIRY_INTERVAL_MS = 5 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function expireEphemeralAgents(): Promise<number> {
  const now = new Date();

  const expired = await db
    .update(agentsTable)
    .set({
      status: "inactive",
      updatedAt: now,
    })
    .where(
      and(
        eq(agentsTable.agentType, "ephemeral"),
        lte(agentsTable.ttlExpiresAt, now),
        sql`${agentsTable.status} IN ('active', 'draft')`,
      ),
    )
    .returning({
      id: agentsTable.id,
      parentAgentId: agentsTable.parentAgentId,
    });

  if (expired.length === 0) return 0;

  const expiredIds = expired.map((a) => a.id);
  await db
    .update(apiKeysTable)
    .set({ revokedAt: now })
    .where(
      and(
        inArray(apiKeysTable.ownerId, expiredIds),
        eq(apiKeysTable.ownerType, "agent"),
        isNull(apiKeysTable.revokedAt),
      ),
    );

  const parentCountMap = new Map<string, number>();
  for (const agent of expired) {
    if (agent.parentAgentId) {
      parentCountMap.set(
        agent.parentAgentId,
        (parentCountMap.get(agent.parentAgentId) || 0) + 1,
      );
    }
  }

  for (const [parentId, count] of parentCountMap) {
    await db
      .update(agentsTable)
      .set({
        subagentCount: sql`GREATEST(${agentsTable.subagentCount} - ${count}, 0)`,
        updatedAt: now,
      })
      .where(eq(agentsTable.id, parentId));
  }

  logger.info({ expiredCount: expired.length }, "[agent-expiry] Expired ephemeral agents");
  return expired.length;
}

export function startAgentExpiryWorker(): void {
  if (!isRedisConfigured()) {
    logger.info("[agent-expiry] Redis not configured — using in-process fallback timer");
    if (!fallbackTimer) {
      fallbackTimer = setInterval(async () => {
        try {
          await expireEphemeralAgents();
        } catch (err) {
          logger.error({ err }, "[agent-expiry] Error expiring ephemeral agents");
        }
      }, EXPIRY_INTERVAL_MS);
    }
    return;
  }

  if (worker) return;

  const connection = getRedisConnectionOptions();

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    },
  });

  queue.on("error", (err) => {
    logger.warn({ err: err.message }, "[agent-expiry] Queue connection error");
  });

  queue.upsertJobScheduler(
    "expire-ephemeral-agents",
    { every: EXPIRY_INTERVAL_MS },
    { name: "expire-ephemeral-agents" },
  ).catch((err) => {
    logger.error({ err }, "[agent-expiry] Failed to register repeatable job");
  });

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const count = await expireEphemeralAgents();
      return { expiredCount: count };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("error", (err) => {
    logger.warn({ err: err.message }, "[agent-expiry] Worker connection error");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "[agent-expiry] Job failed");
  });

  worker.on("completed", (job) => {
    const result = job?.returnvalue as { expiredCount?: number } | undefined;
    if (result && result.expiredCount && result.expiredCount > 0) {
      logger.info({ jobId: job?.id, expiredCount: result.expiredCount }, "[agent-expiry] Job completed");
    }
  });

  logger.info("[agent-expiry] Agent expiry BullMQ worker started (interval: 5 min)");
}

export async function stopAgentExpiryWorker(): Promise<void> {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}

export { expireEphemeralAgents };
