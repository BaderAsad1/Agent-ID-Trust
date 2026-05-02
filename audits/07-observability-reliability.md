# Audit #07 — Observability, Reliability & Worker Health

**Scope:** `artifacts/api-server` — logging, error handling, BullMQ workers, Redis usage, external-API reliability, health endpoints, metrics/alerting, graceful shutdown, recurring deploy-time errors.
**Out of scope:** Implementing fixes; Stripe/billing flow correctness (audit #06).
**Date:** 2026-05-02

---

## 0. Executive Summary

The platform has a respectable observability spine — pino logging with secret redaction, request-id propagation, hashed-IP correlation, a Prometheus `/metrics` endpoint, a worker-failure escalation utility, and a graceful-shutdown handler that sequences worker close → server close → DB pool close. **The dominant risk today is Redis connection management.** All BullMQ Workers and Queues share a single ioredis instance, the process holds at least three top-level Redis connections (commands / subscriber / BullMQ) plus a derived rate-limit-redis client, and BullMQ itself silently duplicates the shared connection per Worker into a `bclient` and `subscriber`. With 10 workers/queues using BullMQ, this multiplies rapidly and is what is producing the recurring `ERR max number of clients reached` and the cascading `Stream isn't writeable and enableOfflineQueue options is false` errors visible every few seconds in deployment logs. Two further high-priority items: the `routes/health.ts` "rich" health endpoint is shadowed by a `/healthz` handler in `app.ts` whose Redis check is dead code (wrong dynamic-import path and wrong export name — `getRedisClient` does not exist; the correct symbol is `getRedis`), and Drizzle/pg errors thrown from polling workers (`webhook-retry`, `job-expiry`) are logged with an opaque `cause: {}` because the default pino `err` serializer does not recurse into `err.cause`. None of these are correctness bugs that destroy data, but they hide root causes from operators and create the "always-red" log baseline that desensitises everyone to real incidents.

Severity legend: **HIGH** = production bug / data-loss risk / page-on-call signal; **MEDIUM** = correctness or hygiene issue that bites under load; **LOW** = nit / future hardening.

---

## 1. Recurring deployment errors — root causes

### 1.1 `Worker connection error … Stream isn't writeable and enableOfflineQueue options is false` — HIGH

Observed every few seconds across `[outbound-mail-worker]`, `[domain-worker]`, `[handle-lifecycle]`, `[agent-expiry]`, `[email-worker]`, `[webhook-worker]`. Root cause is in `artifacts/api-server/src/lib/redis.ts`:

* The file creates exactly **three** ioredis connections at startup — `_redis`, `_redisSub`, `_bullMQRedis` — and `getBullMQConnection()` returns the **same shared `_bullMQRedis`** for every queue and every worker (8 BullMQ workers + 2 BullMQ queues + the `mail-transport` outbound queue all share it).
* All three connections are configured with `maxRetriesPerRequest: null` (correct for BullMQ) **and** `enableOfflineQueue: false`. The combination means: as soon as the TCP socket is even momentarily not writeable (e.g. during reconnect after a "max clients" eviction), every command issued in that window throws `Stream isn't writeable …` synchronously, instead of being queued until the socket recovers. BullMQ Workers issue blocking reads on a tight loop, so a single 50 ms reconnect window produces tens of these errors per worker — exactly what the logs show.
* Worse, BullMQ silently duplicates whatever connection it is handed into a `bclient` (blocking) and `subscriber` per Worker for its internal wait-for-jobs and event channels. So the "single shared connection" abstraction is a fiction at the Redis side — each Worker effectively opens **two extra connections**. With ~8 Workers we're already at ~16 plus the 3 base + the rate-limit-redis store ≈ 20+ persistent connections per process.

**Recommendations**
* Give BullMQ a *factory* (`new IORedis(url, {...})`) per Worker/Queue rather than a shared instance. BullMQ's docs explicitly recommend this since v4 — a separate connection per Worker eliminates the cascading "stream not writeable" storm. Centralise the factory in `lib/redis.ts` so options stay consistent.
* Set `enableOfflineQueue: true` for the **command** client (`_redis`) — it's used by app code that should tolerate a brief reconnect rather than throw. Keep `false` only for the BullMQ-dedicated connections (per BullMQ guidance).
* Add `connectionName` (e.g. `"api-cmd"`, `"api-sub"`, `"bullmq:webhook-worker"`) so `CLIENT LIST` on the Redis side names every consumer for debugging.
* Add a process-wide cap by counting active connections in `lib/redis.ts` and warning when >N.

### 1.2 `ERR max number of clients reached` — HIGH

Direct consequence of §1.1 plus the absence of any process-global ceiling on connections. The Replit-managed Redis tier appears to cap somewhere around 30. With 10 BullMQ workers/queues each silently demanding a `bclient` + `subscriber`, plus the rate-limiter store, the headroom is gone and any redeploy-without-clean-shutdown leaves orphan connections that Redis only reaps on its own idle timeout.

**Recommendations**
* The connection-per-worker change in §1.1 must be paired with a clear ceiling: count `(workers × 2) + base + rate-limit ≤ Redis.maxclients × 0.6` and surface it in a startup log line (e.g. `[redis] expected steady-state connection count: 18 of <max>`).
* Provider-side: raise `maxclients` at the Redis provider, or move BullMQ to a separate Redis instance from the rate-limit/cache instance (already a documented BullMQ best practice).
* Verify `closeRedis()` is genuinely awaited on SIGTERM (it is — see §6) but also handle the `SIGUSR2` (nodemon/dev) and `before-exit` paths so dev hot-reloads don't leak.

### 1.3 `[webhook-retry] Error retrying pending deliveries  err={"query": "...", "params": [...], "cause": {}}` — HIGH (visibility) / MEDIUM (root cause unknown)

The error is a `DrizzleQueryError` whose `.cause` holds the underlying `pg.Error`. Pino's default `err` serializer does **not** recurse into `cause`, and `pg.Error` exposes its useful fields (`code`, `detail`, `severity`, `hint`) as own-properties that *do* enumerate but are hidden because Drizzle's `cause` is a non-enumerable getter on some versions. Result: every operator who looks at this log sees `cause: {}` and cannot tell whether the failure is a connection drop, a deadlock, a permission error, or an OOM.

* The actual failures correlate **exactly** in time with the Redis "max clients" / "stream not writeable" bursts above. The polling timer fires `setInterval(... 60s)`, fires while the DB pool is exhausted (because BullMQ is hammering the DB to mark jobs failed during the connection storm), and the resulting pg error is what we see.

**Recommendations**
* Register a custom pino `err` serializer that walks `err.cause` recursively (cap depth 3) and pulls `code`, `detail`, `severity`, `hint`, `routine`, `where`, `position` for `pg.Error`. Without this, the audit trail for any DB error in workers is effectively useless.
* `webhook-retry` should not run on a naked `setInterval` — convert it to a BullMQ `upsertJobScheduler` with concurrency 1 and proper retries (same pattern `agent-expiry` and `handle-lifecycle` already use). The current `setInterval` keeps firing during a graceful shutdown and there is no in-flight guard, so two polling passes can overlap and double-process pending deliveries — see §3.
* Add an in-flight reentrancy guard like `reputation.ts` has (`isRunning` flag).

### 1.4 `[job-expiry] Error expiring jobs  err={...,"cause":{}}` — MEDIUM (visibility)

Same root cause and same fix as §1.3 — opaque `cause` on a Drizzle error from an `UPDATE … RETURNING` against `job_posts`. The failures cluster with Redis incidents. The polling job is started directly in `index.ts:101` as a `setInterval`, with no in-flight guard.

**Recommendations**
* Same custom err serializer.
* Move `expireJobs()` to the same BullMQ scheduler used by `agent-expiry` and `handle-lifecycle` — there's no reason this single SQL UPDATE needs its own bespoke `setInterval` outside the worker registry.

---

## 2. Worker inventory

| Worker | Type | Schedule | Concurrency | Retries / Backoff | DLQ / failure handling | Idempotent? | Graceful shutdown | Observed health |
|---|---|---|---|---|---|---|---|---|
| `webhook-delivery` (`webhook-worker`) | BullMQ Queue+Worker | Producer-driven | 5 | 3 attempts, exponential delay 2s | `failed` event marks `inboxWebhooksTable.failureCount++`, writes `webhook.failed` event after `MAX_ATTEMPTS`. `removeOnFail: { age: 86400 }`. Producer-side dedup via stable jobIds is **not** used here. | Partially — DB updates set absolute `failureCount` increment, multiple concurrent attempts can over-increment. | `worker.close() + queue.close()` awaited | Connection-error noise (§1.1). Otherwise functional. |
| `outbound-mail` | BullMQ Worker | Producer (`mail-transport.getOutboundQueue()`) | 5 | 3 attempts (1 if `noRetry`), exponential 2s | On final failure marks `agentMessagesTable.deliveryStatus="failed"`. Re-throws on system-notification failure to trigger retry. | Yes — producer uses `jobId: outbound-${envelope.messageId}` (BullMQ rejects duplicate IDs). | `worker.close()` awaited | Heaviest source of connection-error noise (§1.1). |
| `email-delivery` (`email-worker`) | BullMQ Worker | Producer-driven | 3 | Inherits queue defaults (none set ⇒ effectively 1 attempt) | `recordWorkerFailure`/`recordWorkerSuccess` integration — **good**. No DB side-effects on failure. | No — recipient/subject/html job; duplicate enqueue would double-send. | `worker.close()` awaited | Quiet. |
| `domain-provisioning` (`domain-worker`) | BullMQ Queue+Worker | Producer-driven | 3 | 5 attempts, exponential 5s | On exhaustion sets `agentDomainsTable.status="failed"` with metadata. Activity-log call wrapped in try/catch (good). | Producer uses `jobId: provision-${domainRecordId}` ⇒ idempotent against double-enqueue. | `worker.close() + queue.close()` awaited | Connection-error noise (§1.1). |
| `agent-expiry` | BullMQ Queue+Worker via `upsertJobScheduler` | Every 5 min | 1 | Default (no explicit attempts on the scheduled job) | `recordWorkerFailure`/`recordWorkerSuccess` integration. `removeOnFail: { count: 50 }`. | Yes — `expireEphemeralAgents` and `cleanupStaleUnverifiedAgents` are SQL-set-based and safe to re-run. | `worker.close() + queue.close()` awaited; in-process fallback timer cleared | Connection-error noise. Logic correct. |
| `handle-lifecycle` | BullMQ Queue+Worker via `upsertJobScheduler` | Daily | 1 | Default | `recordWorkerFailure`/`recordWorkerSuccess`. | Yes — set-based SQL on `handleExpiresAt` cutoffs; reminder dedup via `renewalNotifiedAt` 24h window. | `worker.close() + queue.close()` awaited; fallback timer cleared | Connection-error noise. **One concern**: `processSuspendedHandles()` is called inside the loop with its own try/catch but the error is logged only — no failure metric is emitted for that sub-step. |
| `nft-mint` | `setInterval` (no Redis) | Every 60 s | n/a (single process) | DB-encoded retry counter in `agents.metadata.anchorAttempts`, `MAX_RETRIES = 3` | Marks `nftStatus="anchor_failed"` on exhaustion. Audit-log writes wrapped in try/catch — but one is `} catch {}` (line 203) silently swallowing audit-log write failures. **MEDIUM**: that silently drops the only forensic trail of failed mint attempts. | Yes — selects `nftStatus="pending_anchor"` and increments attempts before invoking RPC. Concurrent runs *would* double-attempt — guarded only by `isRunning`-style gate that **isn't present**. | `clearInterval` only — does not await any in-flight RPC call (txn could land after process exits ⇒ race with restart). | Quiet. |
| `nft-transfer-detector` | `setInterval` (no Redis) | Every 60 s, behind `NFT_TRANSFER_DETECTOR_ENABLED` flag | n/a | Inline try/catch around log fetch; per-event try/catch | `recordWorkerFailure`/`recordWorkerSuccess` good. | **Partially** — `lastCheckedBlock` is in-memory only. On restart it falls back to `currentBlock - 1000n`, so up to ~1000 blocks may be re-scanned (≈30 min of Base) and any non-platform transfer in that window is at risk of being processed twice (e.g. `pending_claim` re-set, audit-trail noise). The DB updates are mostly idempotent (`status` set to the same value), but the dispute-window timestamp would be reset, extending the dispute window beyond the original 7-day promise. **MEDIUM**. | `clearInterval` only | Disabled by default. |
| `trust-recalculation` (`trust-worker`) | `setInterval` (no Redis) | Hourly | n/a | Per-agent try/catch; `recordWorkerFailure`/`recordWorkerSuccess` at the pass level | Yes (paginated, batch size 100). | `clearInterval` only | Quiet. |
| `webhook-retry` | `setInterval` (no Redis) | Every 60 s | n/a | None — relies on the `webhook_deliveries.next_retry_at` column | **No** — there is no in-flight guard. Two overlapping passes (e.g. if a single pass exceeds 60 s under load) would re-issue the same pending webhook twice; each path increments `attempts` and signs a fresh body, so the receiver may see a duplicate POST. **MEDIUM**. | `clearInterval` only | Recurring `cause: {}` errors (§1.3). |
| `undeliverable-cleanup` | `setInterval` (no Redis) | Every 6 h | n/a | None — single SQL `DELETE` | Yes (set-based delete by `expiresAt < now`). | `clearInterval` only | Quiet. |
| `reputation` (`startReputationJob`) | `setTimeout` + `setInterval` (no Redis) | Hourly, after 5-min warmup | n/a (`Promise.allSettled` over `BATCH_SIZE` chunks) | In-flight guard via `isRunning` flag — **good**. | Yes. | `clearInterval` only | Quiet. |
| `job-expiry` (in `index.ts`) | `setInterval` (no Redis) | Every 60 s | n/a | None | Yes (set-based UPDATE). | No in-flight guard. `clearInterval` cleared in shutdown. | Recurring `cause: {}` errors (§1.4). |

**Cross-cutting observations**

* Five workers (`nft-mint`, `nft-transfer-detector`, `trust-recalculation`, `webhook-retry`, `reputation`, `job-expiry`) are bare `setInterval` polling. Three of them (`webhook-retry`, `nft-mint`, `job-expiry`) lack any in-flight guard and can re-enter on slow passes, with real correctness consequences. **MEDIUM** — wrap each polling worker in a shared `runOnceAtATime` helper or move them to BullMQ.
* The "BullMQ vs setInterval" split is inconsistent. `agent-expiry` and `handle-lifecycle` are exemplary — BullMQ scheduler + Worker + retry policy + worker-failure tracking + in-process fallback. The polling workers should adopt the same pattern.
* Worker concurrencies are uniform-ish but never tuned. None of them set `lockDuration`. BullMQ's default is 30 s, which is shorter than any sane domain-provisioning attempt (DNS poll loop is 6 s + Cloudflare round-trips). A long DNS verify pass under load could lose the lock and cause the job to be re-attempted by a sibling worker mid-flight. **MEDIUM** for `domain-worker`.
* Worker startup is sequential and synchronous in `index.ts:79–96`. If `verifyRedisEvictionPolicy()` throws in production (not configured), the process dies *before* the HTTP server starts — that's correct fail-closed behaviour, but it means a Redis hiccup at boot is fatal.

---

## 3. Logging discipline — `lib/logger.ts` (actually `middlewares/request-logger.ts`)

* **Pino + pino-http** — good. Level driven by `LOG_LEVEL`. Production transport is the default (stdout, JSON), dev uses `pino/file` to stdout — fine.
* **Redaction** is two-layered: pino's path-based `redact` (`req.headers.authorization`, `*.apiKey`, `*.privateKey`, etc.) plus a custom `formatters.log` that walks each object via `redactSecrets()` (in `lib/redact.ts`) and:
  * Masks `agk_…` API-key strings anywhere in the tree.
  * Redacts `apikey`, `api_key`, `authorization`, `x-agent-key` keys (case-insensitive).
  * 10-level recursion guard. **Good defensive coding.**
* **PII**: IPs are SHA-256-hashed and truncated to 16 hex chars before logging — good. `userId` and `agentId` flow through `customProps`. No raw email addresses logged in handler paths sampled.
* **Request-id propagation**: `requestIdMiddleware` (`middlewares/request-id.ts`) reads `X-Request-Id` if present or mints a uuid v4, sets it on `req.requestId`, echoes it back as `X-Request-Id`. `pino-http` reads from there via `genReqId`. The error handler (`error-handler.ts`) returns `requestId` in the JSON error body — **excellent for support tickets**.
* **HTTP log levels**: `customLogLevel` returns `warn` for **any** 4xx. That's loud — every 401 from an unauthenticated probe and every 404 from a bot generates a WARN. Recommend `info` for 4xx ≤ 404, `warn` only for 422/429, `error` for 5xx. **LOW**.
* **Console use**: `console.error/log` only appears in `scripts/verify-stripe-integration.ts` and `seo/guides.ts` (the latter is example-code in a string, not actual logging). **Clean**.
* **`err` serializer gap (HIGH)**: As noted in §1.3, the default pino `err` serializer does not recurse into `err.cause`, which is exactly where Drizzle puts the underlying `pg.Error`. This single gap is what produced the entire `cause: {}` log noise that has been masking real DB issues for weeks. Add a custom serializer in `request-logger.ts`:

  ```ts
  serializers: { err: (e) => ({ ...stdSerializers.err(e), cause: walkCause(e.cause) }) }
  ```

* **HTTP body / SQL params logging**: Drizzle errors include the SQL query and params in the log. The params for `expireJobs` are timestamps — fine. But the params for `webhook-deliveries` queries can contain `webhook_id` / agent identifiers. Consider gating SQL-param logging behind `LOG_LEVEL=debug` to avoid leaking partial agent identifiers in default-level prod logs. **LOW**.

---

## 4. Error handling

* **Express error handler** (`middlewares/error-handler.ts`) — clean: typed `AppError` for known errors, generic 500 with stable `requestId` for everything else, never leaks stack traces to clients. 
* **Top-level handlers** in `index.ts`:
  * `unhandledRejection` → logs and continues. **Acceptable** (Node 20 `--unhandled-rejections=strict` would be the alternative — but recovering is fine here).
  * `uncaughtException` → logs and triggers `gracefulShutdown("uncaughtException")` which exits with **`process.exit(0)`**. **MEDIUM**: a crash should exit with `1` so the orchestrator (Replit Deployments) restarts and logs a non-zero exit. Treating an uncaught exception as a clean shutdown hides incidents from the platform's restart-counter telemetry.
* **Silent `catch {}` blocks** (full list from `rg`):
  * `workers/trust-recalculation.ts:48` — webhook delivery on key.expired. **Acceptable** (best-effort notification) but should at minimum `logger.debug`.
  * `workers/nft-mint.ts:203` — **PROBLEMATIC**: silently swallows `nftAuditLogTable` insert failures. The audit log is the *only* forensic record of failed mint attempts. **MEDIUM** — change to `logger.warn`.
  * `workers/handle-lifecycle.ts:124, 161` — `deleteResolutionCache` failures. Acceptable (cache eviction is best-effort) but could be `logger.debug`.
  * `routes/v1/agents.ts` — 14 silent catches (lines 455, 797, 806, 847, 852, 912, 992, 1023, 1042, 1065, etc.). **MEDIUM**: I sampled five and they're all "best-effort side effects" (cache writes, optional metric updates), but a wholesale audit-and-replace with `.catch(err => logger.debug({ err }, "..."))` would dramatically improve forensic reach without changing behaviour.
  * `lib/resolution-cache.ts` and `lib/ssrf-guard.ts` — fine, expected.
  * `middlewares/agent-auth.ts`, `middlewares/x402.ts` — auth-path silent catches deliberately mask token-validity probes. Acceptable.
* **Try/rethrow consistency**: Sampled 30+ try/catch sites; the dominant pattern is "log + swallow" rather than "log + rethrow". For background workers this is correct, but for **request handlers** it can mask 500s as 200s. Recommend a separate audit pass over `routes/v1/*` looking specifically for handlers that catch and `res.json({ ok: true })` without checking the caught error.
* **Audit-log writes** (`db.insert(nftAuditLogTable)`, `db.insert(auditEventsTable)`) — mostly wrapped in try/catch which is the right tradeoff (audit shouldn't block business action), but the catches should always log at least at WARN (see `nft-mint.ts:203`).

---

## 5. Redis usage

| Aspect | Status | Notes |
|---|---|---|
| Connection pooling | **Single shared instance for BullMQ** | See §1.1. Should be per-worker. |
| Connection count ceiling | **Not enforced** | See §1.2. Add a startup log of expected steady-state and warn if approaching `maxclients`. |
| `enableOfflineQueue` | `false` on all 3 connections | Correct for BullMQ-dedicated, **wrong** for the command client (`_redis`) which app code uses opportunistically. |
| `maxRetriesPerRequest: null` | Set on all 3 | Correct for BullMQ. |
| Eviction policy enforcement | **Yes** — `verifyRedisEvictionPolicy()` runs at startup and refuses to start in prod if `maxmemory-policy != noeviction` | **Good** — this is exactly the right behaviour. Already covered by audit #06 follow-ups. |
| `connectionName` | **Not set** | Add for `CLIENT LIST` debugging. |
| TTL discipline | Mixed — `resolution-cache` uses TTLs; `rate-limit-redis` keys auto-expire via the limiter. | No unbounded sets/lists found. |
| Pub/Sub use | `_redisSub` exists but `rg` shows no active subscriber registrations. | Possibly dead code — confirm and remove if unused (would save 1 connection per process). |
| Metrics | None on Redis | Add `redis_connection_count` and `redis_command_latency_ms` to `/metrics`. |
| Reconnection telemetry | None | When ioredis reconnects, no log line. Operators can't distinguish "Redis was just down" from "all queries randomly fail". Add `client.on("reconnecting", ...)` + `client.on("ready", ...)` logging in `lib/redis.ts`. |

---

## 6. External-API reliability

| Service | Timeout | Retry | Backoff | Circuit breaker | Notes |
|---|---|---|---|---|---|
| Resend (mail-transport) | **None** on the SDK call | BullMQ-driven (3 attempts) | Exponential 2s | None | The `Resend` SDK default is no timeout. A hung Resend connection blocks a Worker concurrency slot for minutes. **MEDIUM** — wrap in `Promise.race` with a 15s hard timeout and re-throw to let BullMQ retry. |
| Resend (webhooks/resend handler) | n/a (we receive) | n/a | — | — | Inbound only. |
| Cloudflare API (`workers/domain-provisioning.ts`) | **None** on `fetch()` | BullMQ-driven (5 attempts) | Exponential 5s | None | A hung Cloudflare request blocks a Worker slot. The DNS-record poll uses 3 polls × 2s explicit interval — fine. **MEDIUM** — add `signal: AbortSignal.timeout(10_000)` on every Cloudflare fetch (matches the webhook-delivery pattern). |
| Base RPC (viem) | `RPC_HTTP_TIMEOUT_MS` and `TX_RECEIPT_TIMEOUT_MS` | `retryCount: 0` (relies on worker-level retry) | n/a | None | Good — explicit timeouts. Worth documenting the chosen values in code (currently magic numbers in `chains/base.ts`). |
| Webhook out (`webhook-delivery.ts` BullMQ) | `AbortSignal.timeout(10_000)` | BullMQ 3 attempts, exponential 2s | — | None | Good. |
| Webhook out (`webhook-delivery.ts` polling `retryPendingDeliveries`) | `AbortController` 10s | DB-driven via `next_retry_at` | Stepped: 1m → 5m → 30m → 2h → 8h | None | Good retry curve, but auto-disable threshold (`MAX_CONSECUTIVE_FAILURES = 50`) is generous; consider lowering. |
| Stripe | — | — | — | — | Out of scope per audit #06. |
| R2 / object storage | n/a here | — | — | — | Not exercised by API server in the paths sampled. |

**Cross-cutting**: There is no library-level circuit breaker or bulkhead anywhere in the codebase (no `opossum`, no `cockatiel`). Given the size of the platform and the concentration of one-or-two external dependencies (Resend, Cloudflare, Base RPC), a per-dependency breaker would prevent a single misbehaving upstream from saturating worker slots. **MEDIUM** — recommend `opossum` around the three named callers in a follow-up task.

---

## 7. Health checks

There are **two** health endpoints in the codebase. This is the most consequential bug found in the audit:

* `app.ts:74-117` — primary `GET /healthz` registered before any auth/rate-limit middleware. Pings DB via `pool.query("SELECT 1")` (good). For Redis it does:

  ```ts
  const redis = await import("../lib/redis" as string);
  const client = (redis as { getRedisClient?: () => unknown }).getRedisClient?.();
  ```

  - The path is wrong (`../lib/redis` from `app.ts` should be `./lib/redis`). The `as string` cast bypasses TypeScript's path checking.
  - The exported symbol is wrong (`getRedisClient` does **not** exist; the correct exports are `getRedis`/`getSharedRedis`).
  - The `?.()` chain swallows both: the import either fails or returns an object without that key, and the `?` falls through to `checks.redis = "skip"`.

  Net effect: **the production `/healthz` endpoint has been silently lying about Redis health for some time**. Because Redis falls into the "skip" branch, the endpoint returns `200 OK / status: "ok"` even when Redis is completely unreachable. **HIGH**.

* `routes/health.ts` — a second, richer implementation mounted at `/api/healthz` via `routes/index.ts:12`. This one uses the correct imports (`isRedisConfigured`, `getSharedRedis`, ping), reports per-service latency, distinguishes `healthy` / `degraded` / `unhealthy`, and returns 503 on DB failure. **It's correct.**

**Recommendations**
* Delete the broken inline `/healthz` in `app.ts` and mount `routes/health.ts` at the top-level `/healthz` path (before auth middleware) so load-balancer probes hit the correct implementation.
* Distinguish liveness (`/livez` — process is up, can serve any HTTP) from readiness (`/readyz` — DB + Redis + at-least-one-worker reporting recent success). Today's `/healthz` conflates them, which means a temporary DB blip would cause the orchestrator to kill the process (via 503) instead of just removing it from rotation.
* Surface worker health: the `app.ts` version pulls `getWorkersInFailureState()` correctly — port that to `routes/health.ts` so the rich endpoint includes `workers: { failing: {...} }`.
* Document which subsystems block startup vs degrade gracefully:
  * **Block startup** (correct): `validateEnv`, `verifyRedisEvictionPolicy` in prod, Stripe price IDs (warn-only — tolerate), credential signing secret in prod.
  * **Degrade gracefully** (correct): missing Redis disables all workers but keeps the HTTP server alive. `Resend` missing degrades mail to in-process / failure.

---

## 8. Metrics & alerting

* `/metrics` endpoint in `app.ts:135-197` — Prometheus text format, gated by `METRICS_TOKEN` (required in prod). Exports:
  * `http_requests_total{method, route, status}` — counter, route normalised (UUIDs collapsed to `:id`). **Good.**
  * `http_request_duration_ms_avg{route}` and `_p95` — gauge. Rolling window 1000 samples per route. **Good** (though p95 from a sample is approximate).
  * `db_pool_total / _idle / _waiting` — sourced from pg `Pool` internals via `require()`. Defensive try/catch. **Good.**
  * `worker_consecutive_failures{worker}` — sourced from `worker-failure.ts`. **Good.**
* **Missing metrics**:
  * Redis connection count and Redis command latency. **HIGH** — without these, the §1.1/1.2 problem is invisible to dashboards.
  * BullMQ queue depth (`Queue.getJobCounts()` per queue). **HIGH** — no operator can see "is the webhook queue backing up?".
  * Event loop lag (`perf_hooks.monitorEventLoopDelay`). **MEDIUM** — single best leading indicator of imminent process unresponsiveness.
  * Outbound-mail provider latency (Resend) and Cloudflare API latency.
  * Process memory / RSS (Node default `process.memoryUsage()`).
* **Worker failure escalation**: `worker-failure.ts` already escalates to `logger.fatal` after 5 consecutive failures with the comment "subscribe to FATAL-level log events from your log aggregation pipeline and route them to your on-call channel." This is the right shape, but only `email-delivery`, `agent-expiry`, `handle-lifecycle`, `nft-mint`, `nft-transfer-detector`, `trust-recalculation` actually call `recordWorkerFailure`. **`webhook-delivery`, `outbound-mail`, `domain-provisioning`, `webhook-retry`, `job-expiry`, `undeliverable-cleanup` do not.** Bring all workers under the same hood. **MEDIUM**.
* Recommended alert thresholds (for whoever wires this up):
  * `worker_consecutive_failures{worker=*} >= 5` — page.
  * `redis_connection_count >= 0.8 × maxclients` — warn, alert at 0.95.
  * `db_pool_waiting > 0 for 5m` — warn (pool exhausted).
  * `bullmq_queue_depth{queue=outbound-mail} > 1000` — warn.
  * `event_loop_lag_p95 > 200ms` — warn.

---

## 9. Graceful shutdown — `index.ts:119-156`

What's there:
* Sequenced close: timer → polling workers → `server.close()` → BullMQ workers → BullMQ queues → DB pool → exit.
* SIGTERM and SIGINT both handled.
* `unhandledRejection` and `uncaughtException` handled.

What's missing or weak:
* **`process.exit(0)` from `uncaughtException`** — should be `1`. **MEDIUM** (see §4).
* **No timeout** — if any single `await closeXxx()` hangs (e.g. Redis quit blocked because of the §1.1 connection storm), the process hangs forever and the orchestrator must SIGKILL it. Wrap the entire body in `Promise.race([..., setTimeout(15_000).then(() => process.exit(1))])`. **MEDIUM**.
* **`server.close()` is fire-and-forget** — should `await new Promise(res => server.close(res))` so in-flight HTTP requests drain.
* **Polling workers** (`stopTrustWorker`, `stopReputationJob`, `stopWebhookRetryWorker`, `stopNftMintWorker`, `stopNftTransferDetector`) are `clearInterval` only — they do NOT await any in-flight pass. A polling pass mid-DB-write will continue to completion *after* `pool.end()` is called, producing "client has already been ended" errors during shutdown. **MEDIUM** — give each polling worker a `runningPromise` field that `stopXxx()` awaits.
* **No SIGUSR2** — dev hot-reload (`tsx watch`, `nodemon`) sends SIGUSR2; without a handler the process restarts without releasing Redis connections, contributing to the "max clients" symptom in dev.
* **`undeliverable-cleanup`** is the only worker whose stop function isn't `await`ed in the shutdown sequence (it's synchronous `clearInterval`, so harmless, but inconsistent with the rest).

---

## 10. Production debug ergonomics

* Request-id surfaced in error response body **and** `X-Request-Id` response header. **Good** — support tickets can include the id.
* Hashed-IP correlation lets ops correlate sessions without raw PII. **Good.**
* DrizzleQueryError opacity (§1.3) is the dominant gap.
* No obvious "log search by request-id" tooling configured at the platform level — that's outside the codebase, but worth noting that adding the err-cause serializer would unlock the rest of the value.
* `routes/v1/agents.ts` has 14 silent catches that swallow side-effect errors without even a debug log — these would each be valuable signal in a support investigation.

---

## 11. Prioritised recommendations (consolidated)

**HIGH**
1. Per-Worker Redis connections in `lib/redis.ts` — eliminate shared `_bullMQRedis`. Stops the §1.1 + §1.2 storm at the source.
2. Custom pino `err` serializer that walks `err.cause` (with `pg.Error` field extraction) — turns §1.3 / §1.4 from opaque noise into actionable errors.
3. Fix `/healthz` in `app.ts:74` — wrong import path and wrong export name make the Redis check dead code. Either delete and forward to `routes/health.ts`, or fix it.
4. Add `redis_connection_count`, `bullmq_queue_depth{queue}`, and `event_loop_lag` to `/metrics`. These three together would have made the §1.1/1.2 incident visible in seconds.

**MEDIUM**
5. Convert `webhook-retry` and `job-expiry` to BullMQ schedulers (mirror `agent-expiry`/`handle-lifecycle`); add in-flight reentrancy guards to the remaining setInterval workers (`nft-mint`).
6. `process.exit(1)` (not 0) from `uncaughtException`; wrap `gracefulShutdown` body in a 15s race.
7. Add `AbortSignal.timeout(10_000)` to every Cloudflare and Resend external call.
8. Persist `lastCheckedBlock` in `nft-transfer-detector` to Redis or DB so restarts don't re-process up to 1000 blocks.
9. Bring the remaining six workers under `recordWorkerFailure`/`recordWorkerSuccess` so the FATAL-escalation hook covers everything.
10. Set explicit `lockDuration` on `domain-worker` (e.g. 60s) — DNS verify under load can exceed BullMQ's 30s default.
11. Replace `console.log/error` in `scripts/verify-stripe-integration.ts` with the pino logger if it's ever run from a long-lived process; otherwise leave for CLI ergonomics.
12. Lower `customLogLevel` for 404s back to `info` to cut WARN noise.

**LOW**
13. Add `connectionName` to all ioredis instances.
14. Add `client.on("reconnecting", …)` / `("ready", …)` logging.
15. Audit `routes/v1/agents.ts` silent catches — convert to `.catch(err => logger.debug(...))`.
16. Distinguish `/livez` and `/readyz`.
17. Document subsystem startup-vs-degrade matrix in `replit.md`.
18. Confirm `_redisSub` is actually used — if not, delete to save one connection per process.
