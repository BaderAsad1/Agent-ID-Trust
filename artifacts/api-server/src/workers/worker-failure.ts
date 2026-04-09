/**
 * Shared worker failure tracking utility.
 *
 * Provides structured, consistent failure logging across all workers
 * (both BullMQ queue workers and polling/setInterval workers).
 *
 * Features:
 * - Structured ERROR-level log with worker name, job context, and error
 * - Consecutive failure counter per worker (in-memory)
 * - Escalates to FATAL-level log when a worker hits ALERT_THRESHOLD consecutive
 *   failures, acting as a hook for log-based alerting (e.g. Datadog, PagerDuty)
 *
 * To wire up external alerting: subscribe to FATAL-level log events from your
 * log aggregation pipeline and route them to your on-call channel.
 */

import { logger } from "../middlewares/request-logger";

/** Number of consecutive failures before an alert-level log is emitted. */
const ALERT_THRESHOLD = 5;

/** In-memory per-worker consecutive failure counts. Resets on success. */
const failureCounts = new Map<string, number>();

export interface WorkerFailureContext {
  /** Short worker identifier, e.g. "nft-mint", "domain-provisioning" */
  worker: string;
  /** Descriptive job/pass label, e.g. "processPendingAnchors", "deliverWebhook" */
  jobType?: string;
  /** Opaque job data to include in the log for debugging */
  jobData?: Record<string, unknown>;
  /** BullMQ job ID if applicable */
  jobId?: string | undefined;
  /** Number of attempts made (BullMQ) */
  attemptsMade?: number;
  /** Whether this was the final attempt (retries exhausted) */
  retriesExhausted?: boolean;
}

/**
 * Record a worker failure. Call this from every `on("failed", ...)` handler
 * and every `.catch(...)` block in polling workers.
 *
 * @example
 * worker.on("failed", (job, err) => {
 *   recordWorkerFailure(err, {
 *     worker: "domain-provisioning",
 *     jobId: job?.id,
 *     jobData: { domainId: job?.data.domainRecordId },
 *     retriesExhausted: (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 5),
 *   });
 * });
 */
export function recordWorkerFailure(err: unknown, ctx: WorkerFailureContext): void {
  const { worker, jobType, jobData, jobId, attemptsMade, retriesExhausted } = ctx;
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;

  const prev = failureCounts.get(worker) ?? 0;
  const consecutive = prev + 1;
  failureCounts.set(worker, consecutive);

  const logFields = {
    worker,
    jobType,
    jobId,
    attemptsMade,
    retriesExhausted: retriesExhausted ?? false,
    consecutiveFailures: consecutive,
    error: errorMessage,
    ...(jobData ? { jobData } : {}),
    ...(errorStack && process.env.NODE_ENV !== "production" ? { stack: errorStack } : {}),
  };

  if (consecutive >= ALERT_THRESHOLD) {
    // FATAL-level log acts as a trigger for log-based alerting.
    // In production, configure your log aggregation to page on-call when
    // level=fatal and fields.worker is set.
    logger.fatal(logFields, `[worker-failure] ALERT: ${worker} has failed ${consecutive} times consecutively — intervention required`);
  } else {
    logger.error(logFields, `[worker-failure] ${worker} job failed${retriesExhausted ? " (retries exhausted)" : ""}`);
  }
}

/**
 * Record a successful worker pass. Resets the consecutive failure counter.
 * Call this from `on("completed", ...)` handlers or after a polling pass succeeds.
 */
export function recordWorkerSuccess(worker: string): void {
  const prev = failureCounts.get(worker) ?? 0;
  if (prev > 0) {
    logger.info({ worker, previousConsecutiveFailures: prev }, `[worker-failure] ${worker} recovered after ${prev} consecutive failure(s)`);
    failureCounts.delete(worker);
  }
}

/**
 * Get the current consecutive failure count for a worker.
 * Useful for health-check endpoints.
 */
export function getWorkerFailureCount(worker: string): number {
  return failureCounts.get(worker) ?? 0;
}

/**
 * Get all workers currently in a failure state (consecutive failures > 0).
 */
export function getWorkersInFailureState(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [worker, count] of failureCounts) {
    if (count > 0) result[worker] = count;
  }
  return result;
}
