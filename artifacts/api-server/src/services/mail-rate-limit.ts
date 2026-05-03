import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentMessagesTable, auditEventsTable } from "@workspace/db/schema";
import { env } from "../lib/env";
import { getRedis, isRedisConfigured } from "../lib/redis";
import { logger } from "../middlewares/request-logger";

/**
 * Outbound mail rate limiter.
 *
 * Audit #09 (originally #255) called out that the prior implementation lived
 * in `mail-transport.ts` and was only invoked from two HTTP routes, leaving
 * every other send path (NDR auto-replies, notification emails, governance
 * appeal mails, queue workers) completely uncapped. A single compromised or
 * runaway agent could drain the Resend monthly quota and trigger a global
 * suspension that would cascade to every other Agent ID customer.
 *
 * This module is now the single source of truth for outbound mail throttling.
 * It is wired into `deliverOutbound` so EVERY send path is protected, the
 * existing route-level checks remain as defense-in-depth, and rate-limit hits
 * are recorded both as audit events (durable, queryable) and in-memory
 * counters (surfaced via /metrics).
 */

export interface RateLimitContext {
  /** Owning agent — primary key for the per-agent budget. */
  agentId?: string;
  /** Owning user — primary key for the per-user budget. */
  userId?: string;
  /**
   * Free-form bucket key for sends that have neither an agent nor a user
   * (NDR bounces, system notifications, etc). Falls back to a global system
   * bucket if not supplied.
   */
  systemKey?: string;
  /** Plan tier — overrides the per-tier limit lookup. Optional. */
  plan?: string;
  /**
   * Reason label used for the metrics counter / audit row. Helps operators
   * tell apart "agent-quota" hits from "system NDR loop" hits.
   */
  reason?: string;
  /**
   * Message ID to EXCLUDE from the DB count.
   *
   * Some send paths (notably `services/mail.ts sendMessage`) insert the
   * outbound `agent_messages` row BEFORE handing the envelope to
   * `deliverOutbound`. Without this exclusion, the in-flight message would be
   * counted against its own quota, producing an off-by-one where the final
   * allowed message is rejected at transport time even though the upstream
   * route pre-check correctly admitted it. Pass the just-inserted row's id
   * here so the count reflects only *previously* persisted sends.
   */
  excludeMessageId?: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  current: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  bucket: string;
}

/** Thrown by `assertOutboundRateLimit` when the per-sender budget is exhausted. */
export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly code = "RATE_LIMIT_EXCEEDED";
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
    public readonly limit: number,
    public readonly current: number,
    public readonly bucket: string,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

interface PlanLimits {
  /** Plan-tier defaults (per hour, per agent). -1 means unlimited. 0 means no outbound. */
  perHour: Record<string, number>;
  /** Per-user hourly cap, applied across all of the user's agents. */
  userPerHour: number;
  /** System-bucket cap (NDRs and unattributed system notifications). */
  systemPerHour: number;
}

function loadLimits(): PlanLimits {
  const cfg = env();
  const num = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    perHour: {
      none: num(cfg.OUTBOUND_MAIL_LIMIT_NONE, 0),
      free: num(cfg.OUTBOUND_MAIL_LIMIT_NONE, 0),
      starter: num(cfg.OUTBOUND_MAIL_LIMIT_STARTER, 100),
      builder: num(cfg.OUTBOUND_MAIL_LIMIT_STARTER, 100),
      pro: num(cfg.OUTBOUND_MAIL_LIMIT_PRO, 1000),
      team: num(cfg.OUTBOUND_MAIL_LIMIT_PRO, 1000),
      enterprise: num(cfg.OUTBOUND_MAIL_LIMIT_ENTERPRISE, -1),
    },
    userPerHour: num(cfg.OUTBOUND_MAIL_LIMIT_USER, 5000),
    systemPerHour: num(cfg.OUTBOUND_MAIL_LIMIT_SYSTEM, 500),
  };
}

const WINDOW_MS = 60 * 60 * 1000;
const WINDOW_SECONDS = WINDOW_MS / 1000;

// ── Metrics ──────────────────────────────────────────────────────────────────
// Counter map keyed by reason (e.g. "agent_quota", "user_quota", "system_quota")
// Surfaced through /metrics as `agentid_mail_outbound_rate_limited_total{reason}`.
const rateLimitedCounter = new Map<string, number>();
// Counter for sends that passed the check, broken out by bucket type so
// operators can compute hit-rate percentages.
const allowedCounter = new Map<string, number>();

function bumpCounter(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function getRateLimitMetrics(): { rateLimited: Map<string, number>; allowed: Map<string, number> } {
  return { rateLimited: new Map(rateLimitedCounter), allowed: new Map(allowedCounter) };
}

/** @internal — test only. */
export function _resetRateLimitMetrics(): void {
  rateLimitedCounter.clear();
  allowedCounter.clear();
}

// ── Counters ─────────────────────────────────────────────────────────────────

async function countOutbound(where: ReturnType<typeof and>): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMessagesTable)
    .where(where);
  return row?.count ?? 0;
}

// ── System / per-recipient bucket storage ────────────────────────────────────
//
// The system bucket protects every send path that has neither an agent nor a
// user attached: NDR auto-replies, governance / appeal mails, magic-link
// emails, unattributed system notifications. The transport layer also splits
// it per-recipient (`systemKey = recipient address`) so a runaway loop to one
// address cannot starve real customers.
//
// Originally this lived in an in-process `Map`. That is incorrect once we run
// more than one API server replica — each replica enforces its own copy of
// the budget, so the effective platform-wide cap becomes N × the configured
// value. A single bad sender (or NDR loop) could blow well past the
// per-window quota by spreading its sends across replicas.
//
// We now store the buckets in Redis as a sliding window using a sorted set:
//
//   key   = `mail-rl:<systemKey>`
//   score = unix-ms timestamp of each send
//   value = `<ts>-<random>` (unique so duplicate ts don't collapse entries)
//
// On every check we ZREMRANGEBYSCORE the entries older than (now - WINDOW_MS),
// then ZCARD to get the current count. PEXPIRE keeps the key from leaking if
// the bucket falls idle. The reset time is derived from the oldest surviving
// entry's score.
//
// If Redis is not configured (local dev, unit tests) or a Redis call fails,
// we fall back to the in-process Map so the limiter degrades to "best effort
// per-process" rather than failing open completely.

const systemBucketCounts = new Map<string, { count: number; resetAt: number }>();

function redisKey(key: string): string {
  return `mail-rl:${key}`;
}

function inProcessIncrement(key: string): { count: number; resetAt: number } {
  const now = Date.now();
  const existing = systemBucketCounts.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + WINDOW_MS };
    systemBucketCounts.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

function inProcessPeek(key: string): { count: number; resetAt: number } {
  const now = Date.now();
  const existing = systemBucketCounts.get(key);
  if (!existing || existing.resetAt <= now) {
    return { count: 0, resetAt: now + WINDOW_MS };
  }
  return existing;
}

async function redisPeek(key: string): Promise<{ count: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const rkey = redisKey(key);
  const pipeline = redis.multi();
  pipeline.zremrangebyscore(rkey, 0, cutoff);
  pipeline.zcard(rkey);
  pipeline.zrange(rkey, 0, 0, "WITHSCORES");
  const results = await pipeline.exec();
  if (!results) throw new Error("redis pipeline returned no results");
  for (const [err] of results) {
    if (err) throw err;
  }
  const count = Number(results[1]?.[1] ?? 0);
  const oldest = results[2]?.[1] as string[] | undefined;
  const oldestScore = oldest && oldest.length >= 2 ? Number(oldest[1]) : NaN;
  const resetAt = Number.isFinite(oldestScore) ? oldestScore + WINDOW_MS : now + WINDOW_MS;
  return { count, resetAt };
}

async function redisIncrement(key: string): Promise<{ count: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const rkey = redisKey(key);
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const pipeline = redis.multi();
  pipeline.zremrangebyscore(rkey, 0, cutoff);
  pipeline.zadd(rkey, now, member);
  pipeline.zcard(rkey);
  pipeline.zrange(rkey, 0, 0, "WITHSCORES");
  pipeline.pexpire(rkey, WINDOW_MS);
  const results = await pipeline.exec();
  if (!results) throw new Error("redis pipeline returned no results");
  for (const [err] of results) {
    if (err) throw err;
  }
  const count = Number(results[2]?.[1] ?? 0);
  const oldest = results[3]?.[1] as string[] | undefined;
  const oldestScore = oldest && oldest.length >= 2 ? Number(oldest[1]) : now;
  const resetAt = oldestScore + WINDOW_MS;
  return { count, resetAt };
}

async function peekSystemBucket(key: string): Promise<{ count: number; resetAt: number }> {
  if (isRedisConfigured()) {
    try {
      return await redisPeek(key);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), key },
        "[mail-rate-limit] Redis peek failed; falling back to in-process bucket",
      );
    }
  }
  return inProcessPeek(key);
}

async function incrementSystemBucket(key: string): Promise<{ count: number; resetAt: number }> {
  if (isRedisConfigured()) {
    try {
      return await redisIncrement(key);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), key },
        "[mail-rate-limit] Redis increment failed; falling back to in-process bucket",
      );
    }
  }
  return inProcessIncrement(key);
}

/** @internal — test only. Clears in-process fallback state. Redis state is
 * left untouched (tests that need to clear Redis should flush it explicitly). */
export function _resetSystemBuckets(): void {
  systemBucketCounts.clear();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a `RateLimitDecision` describing whether the next outbound send is
 * allowed. Pure inspection — does NOT mutate state. Use `assertOutboundRateLimit`
 * to gate a send and trigger the audit/metric side-effects on a hit.
 */
export async function checkOutboundRateLimit(ctx: RateLimitContext): Promise<RateLimitDecision> {
  const limits = loadLimits();
  const oneHourAgo = new Date(Date.now() - WINDOW_MS);

  if (ctx.agentId) {
    const planKey = (ctx.plan ?? "none").toLowerCase();
    const limit = limits.perHour[planKey] ?? limits.perHour.none;
    if (limit === -1) {
      return { allowed: true, limit: -1, current: 0, windowSeconds: WINDOW_SECONDS, retryAfterSeconds: 0, bucket: `agent:${ctx.agentId}` };
    }
    const current = await countOutbound(
      and(
        eq(agentMessagesTable.agentId, ctx.agentId),
        eq(agentMessagesTable.direction, "outbound"),
        gte(agentMessagesTable.createdAt, oneHourAgo),
        ...(ctx.excludeMessageId ? [ne(agentMessagesTable.id, ctx.excludeMessageId)] : []),
      )!,
    );
    return {
      allowed: current < limit,
      limit,
      current,
      windowSeconds: WINDOW_SECONDS,
      retryAfterSeconds: WINDOW_SECONDS,
      bucket: `agent:${ctx.agentId}`,
    };
  }

  if (ctx.userId) {
    const limit = limits.userPerHour;
    if (limit === -1) {
      return { allowed: true, limit: -1, current: 0, windowSeconds: WINDOW_SECONDS, retryAfterSeconds: 0, bucket: `user:${ctx.userId}` };
    }
    const current = await countOutbound(
      and(
        eq(agentMessagesTable.senderUserId, ctx.userId),
        eq(agentMessagesTable.direction, "outbound"),
        gte(agentMessagesTable.createdAt, oneHourAgo),
        ...(ctx.excludeMessageId ? [ne(agentMessagesTable.id, ctx.excludeMessageId)] : []),
      )!,
    );
    return {
      allowed: current < limit,
      limit,
      current,
      windowSeconds: WINDOW_SECONDS,
      retryAfterSeconds: WINDOW_SECONDS,
      bucket: `user:${ctx.userId}`,
    };
  }

  const systemKey = `system:${ctx.systemKey ?? "global"}`;
  const limit = limits.systemPerHour;
  const peeked = await peekSystemBucket(systemKey);
  return {
    allowed: limit === -1 || peeked.count < limit,
    limit,
    current: peeked.count,
    windowSeconds: WINDOW_SECONDS,
    retryAfterSeconds: Math.max(1, Math.ceil((peeked.resetAt - Date.now()) / 1000)),
    bucket: systemKey,
  };
}

/**
 * Asserts the next send is allowed. On hit:
 *   1. Throws a `RateLimitError` (mapped to 429 + `Retry-After` by error-handler).
 *   2. Writes an audit_events row of type `mail.outbound.rate_limited`.
 *   3. Bumps the `agentid_mail_outbound_rate_limited_total{reason}` counter.
 *
 * The DB count is consulted for agent / user buckets (so the limit survives
 * restarts and is consistent across processes). System / per-recipient
 * buckets are stored in Redis as a sliding-window sorted set so the cap is
 * enforced consistently across all API server replicas; the bucket is
 * incremented eagerly on success. If Redis is unavailable the limiter falls
 * back to a per-process in-memory counter (best effort).
 */
export async function assertOutboundRateLimit(ctx: RateLimitContext): Promise<RateLimitDecision> {
  const decision = await checkOutboundRateLimit(ctx);
  const reason = ctx.reason ?? (ctx.agentId ? "agent_quota" : ctx.userId ? "user_quota" : "system_quota");

  if (!decision.allowed) {
    bumpCounter(rateLimitedCounter, reason);
    await recordRateLimitHit(ctx, decision, reason);
    throw new RateLimitError(
      `Outbound mail rate limit exceeded (${decision.current}/${decision.limit} per hour for ${decision.bucket}).`,
      decision.retryAfterSeconds,
      decision.limit,
      decision.current,
      decision.bucket,
    );
  }

  if (!ctx.agentId && !ctx.userId) {
    // System bucket: increment eagerly — the DB query path can't see these sends
    // because they have no senderUserId / agentId.
    await incrementSystemBucket(`system:${ctx.systemKey ?? "global"}`);
  }
  bumpCounter(allowedCounter, reason);
  return decision;
}

async function recordRateLimitHit(ctx: RateLimitContext, decision: RateLimitDecision, reason: string): Promise<void> {
  const actorType = ctx.agentId ? "agent" : ctx.userId ? "user" : "system";
  // audit_events.actorId is NOT NULL — fall back to the zero-UUID for unattributed
  // system sends so we still get a durable record without a schema migration.
  const actorId = ctx.agentId ?? ctx.userId ?? "00000000-0000-0000-0000-000000000000";
  try {
    await db.insert(auditEventsTable).values({
      actorType,
      actorId,
      eventType: "mail.outbound.rate_limited",
      targetType: "mail",
      targetId: decision.bucket.slice(0, 255),
      payload: {
        reason,
        agentId: ctx.agentId,
        userId: ctx.userId,
        systemKey: ctx.systemKey,
        plan: ctx.plan,
        currentCount: decision.current,
        limit: decision.limit,
        windowSeconds: decision.windowSeconds,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    });
  } catch (err) {
    // Audit-log failure must NEVER prevent the rate-limit decision from being
    // enforced — log and swallow so the 429 still propagates to the caller.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), bucket: decision.bucket },
      "[mail-rate-limit] Failed to write audit_events row",
    );
  }
  logger.warn(
    {
      bucket: decision.bucket,
      agentId: ctx.agentId,
      userId: ctx.userId,
      reason,
      current: decision.current,
      limit: decision.limit,
    },
    "[mail-rate-limit] Outbound mail blocked — per-sender quota exhausted",
  );
}
