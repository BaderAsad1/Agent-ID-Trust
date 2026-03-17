import { eq, or, and, lt, isNull, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable } from "@workspace/db/schema";
import { recomputeAndStore, determineTier } from "../services/trust-score";
import { logger } from "../middlewares/request-logger";

const RECALCULATION_INTERVAL_MS = 60 * 60 * 1000;
const INACTIVITY_THRESHOLD_DAYS = 30;
const INACTIVITY_DECAY_PER_WEEK = 1;
const INACTIVITY_DECAY_MAX = 10;
const INACTIVITY_TRUST_FLOOR = 20;

let timer: ReturnType<typeof setInterval> | null = null;

async function expireOverdueKeys() {
  try {
    const now = new Date();

    const overdueKeys = await db.query.agentKeysTable.findMany({
      where: and(
        eq(agentKeysTable.status, "active"),
        isNotNull(agentKeysTable.expiresAt),
        lt(agentKeysTable.expiresAt, now),
      ),
      columns: { id: true, agentId: true, kid: true, expiresAt: true },
    });

    if (overdueKeys.length === 0) return;

    logger.info(`[trust-worker] Expiring ${overdueKeys.length} overdue keys`);

    for (const key of overdueKeys) {
      try {
        await db
          .update(agentKeysTable)
          .set({ status: "expired", updatedAt: now })
          .where(eq(agentKeysTable.id, key.id));

        try {
          const { deliverWebhookEvent } = await import("../services/webhook-delivery");
          await deliverWebhookEvent(key.agentId, "key.expired", {
            keyId: key.id,
            kid: key.kid,
            expiredAt: key.expiresAt,
          });
        } catch {}
      } catch (err) {
        logger.error({ err, keyId: key.id, agentId: key.agentId }, "[trust-worker] Failed to expire key");
      }
    }

    logger.info(`[trust-worker] Key expiry pass complete: ${overdueKeys.length} keys expired`);
  } catch (err) {
    logger.error({ err }, "[trust-worker] Failed to run key expiry pass");
  }
}

async function applyInactivityDecay() {
  try {
    const inactivityCutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const staleAgents = await db.query.agentsTable.findMany({
      where: and(
        eq(agentsTable.status, "active"),
        eq(agentsTable.verificationStatus, "verified"),
        or(
          lt(agentsTable.lastHeartbeatAt, inactivityCutoff),
          and(
            isNull(agentsTable.lastHeartbeatAt),
            lt(agentsTable.createdAt, inactivityCutoff),
          ),
        ),
      ),
      columns: { id: true, handle: true, trustScore: true, trustTier: true, lastHeartbeatAt: true, createdAt: true, verificationStatus: true },
    });

    if (staleAgents.length === 0) {
      logger.info("[trust-worker] No inactive verified agents to decay");
      return;
    }

    let decayed = 0;
    const now = Date.now();

    for (const agent of staleAgents) {
      try {
        const lastActivityAt = agent.lastHeartbeatAt
          ? new Date(agent.lastHeartbeatAt).getTime()
          : new Date(agent.createdAt).getTime();
        const inactiveDays = (now - lastActivityAt) / (1000 * 60 * 60 * 24);
        const fullWeeks = Math.floor(inactiveDays / 7);
        const decayAmount = Math.min(fullWeeks * INACTIVITY_DECAY_PER_WEEK, INACTIVITY_DECAY_MAX);

        if (decayAmount <= 0) continue;

        const newScore = Math.max(agent.trustScore - decayAmount, INACTIVITY_TRUST_FLOOR);

        if (newScore === agent.trustScore) continue;

        const isVerified = agent.verificationStatus === "verified";
        const newTier = determineTier(newScore, isVerified);

        await db
          .update(agentsTable)
          .set({ trustScore: newScore, trustTier: newTier, updatedAt: new Date() })
          .where(eq(agentsTable.id, agent.id));

        decayed++;
        logger.debug({ agentId: agent.id, handle: agent.handle, oldScore: agent.trustScore, newScore, decayAmount }, "[trust-worker] Applied inactivity decay");
      } catch (err) {
        logger.error({ err, agentId: agent.id }, "[trust-worker] Failed to apply inactivity decay");
      }
    }

    logger.info(`[trust-worker] Inactivity decay applied to ${decayed} of ${staleAgents.length} inactive verified agents`);
  } catch (err) {
    logger.error({ err }, "[trust-worker] Failed to run inactivity decay");
  }
}

async function recalculateAllTrust() {
  await expireOverdueKeys();

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

    await applyInactivityDecay();
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
