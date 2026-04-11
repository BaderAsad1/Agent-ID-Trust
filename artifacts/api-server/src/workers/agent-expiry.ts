import { Queue, Worker, type Job } from "bullmq";
import { and, eq, lte, sql, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, apiKeysTable, agentKeysTable, agentVerificationChallengesTable, agentClaimTokensTable } from "@workspace/db/schema";
import { getBullMQConnection, isRedisConfigured } from "../lib/redis";
import { recordWorkerFailure, recordWorkerSuccess } from "./worker-failure";
import { logger } from "../middlewares/request-logger";

const QUEUE_NAME = "agent-expiry";
const EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
const STALE_UNVERIFIED_AGE_MS = 24 * 60 * 60 * 1000;
const SANDBOX_AGENT_TTL_MS = 24 * 60 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupStaleUnverifiedAgents(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_UNVERIFIED_AGE_MS);

  const staleAgents = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.verificationStatus, "pending"),
        eq(agentsTable.status, "draft"),
        lte(agentsTable.createdAt, cutoff),
      ),
    );

  if (staleAgents.length === 0) return 0;

  const staleIds = staleAgents.map((a) => a.id);

  await db.transaction(async (tx) => {
    await tx.delete(agentKeysTable).where(inArray(agentKeysTable.agentId, staleIds));
    await tx.delete(agentVerificationChallengesTable).where(inArray(agentVerificationChallengesTable.agentId, staleIds));
    await tx.delete(agentClaimTokensTable).where(inArray(agentClaimTokensTable.agentId, staleIds));
    await tx
      .delete(apiKeysTable)
      .where(
        and(
          inArray(apiKeysTable.ownerId, staleIds),
          eq(apiKeysTable.ownerType, "agent"),
        ),
      );
    await tx.delete(agentsTable).where(inArray(agentsTable.id, staleIds));
  });

  logger.info({ cleanedCount: staleIds.length, agentIds: staleIds }, "[agent-expiry] Cleaned up stale unverified agents");
  return staleIds.length;
}

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

async function cleanupSandboxAgents(): Promise<number> {
  const cutoff = new Date(Date.now() - SANDBOX_AGENT_TTL_MS);

  const sandboxAgents = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(
      and(
        lte(agentsTable.createdAt, cutoff),
        sql`(${agentsTable.metadata}->>'isSandbox')::boolean = true`,
      ),
    );

  if (sandboxAgents.length === 0) return 0;

  const sandboxIds = sandboxAgents.map((a) => a.id);

  await db.transaction(async (tx) => {
    await tx.delete(agentKeysTable).where(inArray(agentKeysTable.agentId, sandboxIds));
    await tx.delete(agentVerificationChallengesTable).where(inArray(agentVerificationChallengesTable.agentId, sandboxIds));
    await tx.delete(agentClaimTokensTable).where(inArray(agentClaimTokensTable.agentId, sandboxIds));
    await tx
      .delete(apiKeysTable)
      .where(
        and(
          inArray(apiKeysTable.ownerId, sandboxIds),
          eq(apiKeysTable.ownerType, "agent"),
        ),
      );
    await tx.delete(agentsTable).where(inArray(agentsTable.id, sandboxIds));
  });

  logger.info({ cleanedCount: sandboxIds.length }, "[agent-expiry] Cleaned up expired sandbox agents");
  return sandboxIds.length;
}

async function runExpiryTasks(): Promise<{ expiredCount: number; cleanedCount: number; sandboxCleanedCount: number }> {
  const expiredCount = await expireEphemeralAgents();
  const cleanedCount = await cleanupStaleUnverifiedAgents();
  const sandboxCleanedCount = await cleanupSandboxAgents();
  return { expiredCount, cleanedCount, sandboxCleanedCount };
}

export function startAgentExpiryWorker(): void {
  if (!isRedisConfigured()) {
    logger.info("[agent-expiry] Redis not configured — using in-process fallback timer");
    if (!fallbackTimer) {
      fallbackTimer = setInterval(async () => {
        try {
          await runExpiryTasks();
        } catch (err) {
          logger.error({ err }, "[agent-expiry] Error in expiry tasks");
        }
      }, EXPIRY_INTERVAL_MS);
    }
    return;
  }

  if (worker) return;

  queue = new Queue(QUEUE_NAME, {
    ...getBullMQConnection(),
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
      return await runExpiryTasks();
    },
    {
      ...getBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("error", (err) => {
    logger.warn({ err: err.message }, "[agent-expiry] Worker connection error");
  });

  worker.on("failed", (job, err) => {
    recordWorkerFailure(err, {
      worker: "agent-expiry",
      jobId: job?.id,
      retriesExhausted: (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 5),
    });
  });

  worker.on("completed", (job) => {
    recordWorkerSuccess("agent-expiry");
    const result = job?.returnvalue as { expiredCount?: number; cleanedCount?: number } | undefined;
    if (result && ((result.expiredCount && result.expiredCount > 0) || (result.cleanedCount && result.cleanedCount > 0))) {
      logger.info({ jobId: job?.id, expiredCount: result.expiredCount, cleanedCount: result.cleanedCount }, "[agent-expiry] Job completed");
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

export { expireEphemeralAgents, cleanupStaleUnverifiedAgents };
