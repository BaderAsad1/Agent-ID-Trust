import { Queue, Worker, type Job } from "bullmq";
import { and, eq, lte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, handleAuctionsTable } from "@workspace/db/schema";
import { getBullMQConnection, isRedisConfigured } from "../lib/redis";
import { logger } from "../middlewares/request-logger";
import { getHandlePricing } from "../services/handle-pricing";

const QUEUE_NAME = "handle-lifecycle";
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 30;
const AUCTION_DURATION_DAYS = 14;
const AUCTION_START_MULTIPLIER = 10;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function sendRenewalReminders(): Promise<number> {
  const thirtyDaysFromNow = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const agents = await db
    .select({
      id: agentsTable.id,
      handle: agentsTable.handle,
      userId: agentsTable.userId,
      handleExpiresAt: agentsTable.handleExpiresAt,
    })
    .from(agentsTable)
    .where(
      and(
        isNotNull(agentsTable.handleExpiresAt),
        lte(agentsTable.handleExpiresAt, thirtyDaysFromNow),
        sql`${agentsTable.handleExpiresAt} > NOW()`,
        sql`(${agentsTable.renewalNotifiedAt} IS NULL OR ${agentsTable.renewalNotifiedAt} < ${oneDayAgo})`,
      ),
    );

  if (agents.length === 0) return 0;

  for (const agent of agents) {
    try {
      const { usersTable } = await import("@workspace/db/schema");
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, agent.userId),
        columns: { email: true },
      });

      if (user?.email) {
        const { sendRenewalReminderEmail } = await import("../services/email");
        await sendRenewalReminderEmail(user.email, agent.handle ?? "", agent.handleExpiresAt!.toISOString());
      }

      await db
        .update(agentsTable)
        .set({ renewalNotifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(agentsTable.id, agent.id));
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "[handle-lifecycle] Failed to send renewal reminder");
    }
  }

  logger.info({ count: agents.length }, "[handle-lifecycle] Sent renewal reminders");
  return agents.length;
}

async function expireHandles(): Promise<number> {
  const gracePeriodEnd = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({
      id: agentsTable.id,
      handle: agentsTable.handle,
      annualPriceUsd: agentsTable.annualPriceUsd,
    })
    .from(agentsTable)
    .where(
      and(
        isNotNull(agentsTable.handleExpiresAt),
        lte(agentsTable.handleExpiresAt, gracePeriodEnd),
        sql`${agentsTable.handle} IS NOT NULL`,
        sql`${agentsTable.handle} != ''`,
      ),
    );

  if (expired.length === 0) return 0;

  for (const agent of expired) {
    await db.transaction(async (tx) => {
      const oldHandle = agent.handle!;

      await tx
        .update(agentsTable)
        .set({
          handle: `_expired_${agent.id.slice(0, 8)}_${oldHandle}`,
          handleExpiresAt: null,
          handleRegisteredAt: null,
          handleTier: null,
          annualPriceUsd: null,
          renewalNotifiedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));

      try {
        const { deleteResolutionCache } = await import("../lib/resolution-cache");
        await deleteResolutionCache(oldHandle.toLowerCase());
      } catch {}

      const pricing = getHandlePricing(oldHandle);
      const startPrice = pricing.annualPriceCents * AUCTION_START_MULTIPLIER;
      const endsAt = new Date(Date.now() + AUCTION_DURATION_DAYS * 24 * 60 * 60 * 1000);

      await tx.insert(handleAuctionsTable).values({
        handle: oldHandle as string,
        startPrice,
        reservePrice: pricing.annualPriceCents,
        currentPrice: startPrice,
        endsAt,
      });
    });

    logger.info({ handle: agent.handle, agentId: agent.id }, "[handle-lifecycle] Handle expired and auction started");
  }

  return expired.length;
}

async function updateAuctionPrices(): Promise<number> {
  const activeAuctions = await db
    .select()
    .from(handleAuctionsTable)
    .where(
      and(
        eq(handleAuctionsTable.settled, false),
        sql`${handleAuctionsTable.endsAt} > NOW()`,
      ),
    );

  let updated = 0;
  const now = Date.now();

  for (const auction of activeAuctions) {
    const totalDuration = auction.endsAt.getTime() - auction.startedAt.getTime();
    const elapsed = now - auction.startedAt.getTime();
    const progress = Math.min(elapsed / totalDuration, 1);

    const newPrice = Math.max(
      auction.reservePrice,
      Math.round(auction.startPrice - (auction.startPrice - auction.reservePrice) * progress),
    );

    if (newPrice !== auction.currentPrice) {
      await db
        .update(handleAuctionsTable)
        .set({ currentPrice: newPrice, updatedAt: new Date() })
        .where(eq(handleAuctionsTable.id, auction.id));
      updated++;
    }
  }

  const expiredAuctions = await db
    .select()
    .from(handleAuctionsTable)
    .where(
      and(
        eq(handleAuctionsTable.settled, false),
        lte(handleAuctionsTable.endsAt, new Date()),
        isNull(handleAuctionsTable.winnerId),
      ),
    );

  for (const auction of expiredAuctions) {
    await db
      .update(handleAuctionsTable)
      .set({ settled: true, updatedAt: new Date() })
      .where(eq(handleAuctionsTable.id, auction.id));
  }

  if (updated > 0 || expiredAuctions.length > 0) {
    logger.info({ pricesUpdated: updated, auctionsSettled: expiredAuctions.length }, "[handle-lifecycle] Auction prices updated");
  }

  return updated;
}

async function runLifecycleTasks(): Promise<{ reminders: number; expired: number; auctionsUpdated: number }> {
  const reminders = await sendRenewalReminders();
  const expired = await expireHandles();
  const auctionsUpdated = await updateAuctionPrices();
  return { reminders, expired, auctionsUpdated };
}

export function startHandleLifecycleWorker(): void {
  if (!isRedisConfigured()) {
    logger.info("[handle-lifecycle] Redis not configured — using in-process fallback timer");
    if (!fallbackTimer) {
      fallbackTimer = setInterval(async () => {
        try {
          await runLifecycleTasks();
        } catch (err) {
          logger.error({ err }, "[handle-lifecycle] Error in lifecycle tasks");
        }
      }, DAILY_INTERVAL_MS);
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
    logger.warn({ err: err.message }, "[handle-lifecycle] Queue connection error");
  });

  queue.upsertJobScheduler(
    "handle-lifecycle-daily",
    { every: DAILY_INTERVAL_MS },
    { name: "handle-lifecycle-daily" },
  ).catch((err) => {
    logger.error({ err }, "[handle-lifecycle] Failed to register repeatable job");
  });

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      return await runLifecycleTasks();
    },
    {
      ...getBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("error", (err) => {
    logger.warn({ err: err.message }, "[handle-lifecycle] Worker connection error");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "[handle-lifecycle] Job failed");
  });

  worker.on("completed", (job) => {
    const result = job?.returnvalue as { reminders?: number; expired?: number; auctionsUpdated?: number } | undefined;
    if (result && (result.reminders || result.expired || result.auctionsUpdated)) {
      logger.info({ jobId: job?.id, ...result }, "[handle-lifecycle] Job completed");
    }
  });

  logger.info("[handle-lifecycle] Handle lifecycle BullMQ worker started (interval: daily)");
}

export async function stopHandleLifecycleWorker(): Promise<void> {
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
