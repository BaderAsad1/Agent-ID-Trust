import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "../middlewares/request-logger";

/**
 * Redis connection management for the API server.
 *
 * Two shared clients (lazy-initialised):
 *   - `_commandClient` — used by app code (rate-limit, trust scores, caches).
 *     `enableOfflineQueue: true` so a brief reconnect queues commands instead
 *     of throwing synchronously.
 *   - `_subscriberClient` — reserved for app-level pub/sub. Lazy — only opened
 *     if a caller actually requests it.
 *
 * Per-Worker / per-Queue clients via `createBullMQConnection(name)`. BullMQ v4+
 * explicitly recommends a separate connection per Worker/Queue
 * (https://docs.bullmq.io/guide/connections#bullmq-and-redis-connection-management).
 * Sharing a single client causes BullMQ to silently `.duplicate()` it for its
 * blocking client + subscriber, which both multiplies socket count and means
 * a single socket hiccup cascades to every Worker as the
 * `Stream isn't writeable / max clients reached` log storm we observed in
 * production.
 */

let _commandClient: Redis | null = null;
let _subscriberClient: Redis | null = null;
const _bullMQConnections = new Set<Redis>();
let _evictionPolicyChecked = false;

const REQUIRED_EVICTION_POLICY = "noeviction";

function createClient(connectionName: string, opts: RedisOptions): Redis {
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL not configured");
  const client = new Redis(url, {
    connectionName,
    ...opts,
  });
  client.on("error", (err) => {
    logger.error({ err, connectionName }, `[redis:${connectionName}] Redis connection error`);
  });
  return client;
}

/**
 * BullMQ requires Redis to use the `noeviction` maxmemory-policy. Any other
 * policy (volatile-lru, allkeys-lru, etc.) allows Redis to silently drop keys
 * under memory pressure, which would cause queued jobs (domain provisioning,
 * mail outbound, webhook retry, agent expiry, NFT anchor, ...) to disappear
 * without any error surface — a production data-loss bug.
 *
 * See: https://docs.bullmq.io/guide/going-to-production#maxmemory-policy
 *
 * We attempt to set the policy programmatically on connect. On managed Redis
 * providers where CONFIG SET is disabled, we surface a loud error instead of
 * silently continuing, so the operator knows to fix it at the provider level.
 */
async function enforceEvictionPolicy(client: Redis): Promise<void> {
  try {
    await client.config("SET", "maxmemory-policy", REQUIRED_EVICTION_POLICY);
  } catch (err) {
    logger.warn(
      { err },
      `[redis] Could not CONFIG SET maxmemory-policy (likely a managed Redis provider). Will verify current policy.`,
    );
  }
  const result = (await client.config("GET", "maxmemory-policy")) as string[] | null;
  const current = Array.isArray(result) && result.length >= 2 ? result[1] : null;
  if (current === REQUIRED_EVICTION_POLICY) {
    logger.info({ policy: current }, "[redis] Eviction policy verified");
    return;
  }
  const message =
    `Redis maxmemory-policy is "${current}" but BullMQ requires "${REQUIRED_EVICTION_POLICY}". ` +
    `Queued jobs may be silently dropped under memory pressure. ` +
    `Set maxmemory-policy=noeviction in your Redis configuration.`;
  throw new Error(message);
}

/**
 * Startup check: ensure Redis is reachable and the eviction policy is correct.
 * Call once during process startup. In production this throws on misconfiguration
 * so the process refuses to start rather than silently risking data loss. In
 * development, a wrong policy is logged loudly but does not block startup so
 * local Redis instances without CONFIG SET access can still be used.
 */
export async function verifyRedisEvictionPolicy(): Promise<void> {
  if (_evictionPolicyChecked) return;
  _evictionPolicyChecked = true;
  if (!env().REDIS_URL) return;
  const client = getRedis();
  try {
    if (client.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onError = (err: Error) => { cleanup(); reject(err); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Timed out waiting for Redis ready")); }, 10_000);
        const cleanup = () => {
          clearTimeout(timeout);
          client.off("ready", onReady);
          client.off("error", onError);
        };
        client.once("ready", onReady);
        client.once("error", onError);
      });
    }
    await enforceEvictionPolicy(client);
  } catch (err) {
    if (env().NODE_ENV === "production") {
      logger.error({ err }, "[redis] Refusing to start: eviction policy check failed");
      throw err;
    }
    logger.error(
      { err },
      "[redis] Eviction policy check failed (continuing in non-production). BullMQ durability is NOT guaranteed.",
    );
  }
}

/**
 * Shared command/cache client. Used by app code (rate-limit, trust scores,
 * caches). `enableOfflineQueue: true` so commands queue during a brief
 * reconnect rather than throwing synchronously.
 */
export function getRedis(): Redis {
  if (!_commandClient) {
    _commandClient = createClient("api-cmd", {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }
  return _commandClient;
}

export const getSharedRedis = getRedis;

/**
 * Shared pub/sub subscriber client. Lazy — only opened if a caller actually
 * requests it.
 */
export function getRedisSub(): Redis {
  if (!_subscriberClient) {
    _subscriberClient = createClient("api-sub", {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
  }
  return _subscriberClient;
}

/**
 * Create a dedicated ioredis connection for a single BullMQ Queue or Worker.
 *
 * BullMQ v4+ explicitly recommends a separate connection per Worker/Queue.
 * When a single client is shared, BullMQ silently `.duplicate()`s it for its
 * internal blocking client + subscriber, so the "shared" abstraction does not
 * actually save sockets — and any error on the shared socket cascades to
 * every Worker simultaneously as the `Stream isn't writeable` log storm.
 *
 * `maxRetriesPerRequest: null` and `enableOfflineQueue: false` are required
 * by BullMQ's blocking client.
 *
 * `name` is used as `connectionName` so `CLIENT LIST` on the Redis side
 * names every consumer (e.g. `bullmq:webhook-worker`).
 */
export function createBullMQConnection(name: string): { connection: Redis } {
  const conn = createClient(`bullmq:${name}`, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _bullMQConnections.add(conn);
  conn.once("end", () => {
    _bullMQConnections.delete(conn);
  });
  return { connection: conn };
}

/**
 * Log the expected steady-state Redis connection count at startup so
 * operators can verify it stays comfortably under the provider's max-clients
 * cap.
 *
 * The count is derived entirely from the actual tracked BullMQ connections
 * (classified by `connectionName` suffix `:worker` vs `:queue`) plus the
 * shared command/subscriber clients, so the projection cannot drift if a
 * Worker or Queue is added or removed. BullMQ silently `.duplicate()`s each
 * Worker connection into a `bclient` and a `subscriber`, so each Worker
 * counts as 3 sockets total; Queues count as 1.
 *
 * Lazy queues created on first use are excluded from the initial projection
 * and will appear in `CLIENT LIST` after their first job.
 */
export function logRedisConnectionPlan(): void {
  let workers = 0;
  let queues = 0;
  let other = 0;
  for (const conn of _bullMQConnections) {
    const name = conn.options?.connectionName ?? "";
    if (name.endsWith(":worker")) workers += 1;
    else if (name.endsWith(":queue")) queues += 1;
    else other += 1;
  }
  const sharedCommand = _commandClient ? 1 : 0;
  const sharedSubscriber = _subscriberClient ? 1 : 0;
  // Each worker is duplicated by BullMQ into bclient + subscriber → +2 each.
  const expected = sharedCommand + sharedSubscriber + queues + other + workers * 3;
  logger.info(
    {
      expectedSteadyStateConnections: expected,
      breakdown: {
        sharedCommand,
        sharedSubscriber,
        eagerQueues: queues,
        workers,
        otherBullMQConnections: other,
        bullmqInternalDuplicatesPerWorker: 2,
      },
      caveat: "Lazy queues (created on first use) are excluded; verify with CLIENT LIST under load.",
    },
    `[redis] Expected steady-state Redis connection count: ~${expected} (verify against provider's max-clients cap)`,
  );
}

export function isRedisConfigured(): boolean {
  return !!env().REDIS_URL;
}

export async function closeRedis(): Promise<void> {
  const all: Redis[] = [];
  if (_commandClient) all.push(_commandClient);
  if (_subscriberClient) all.push(_subscriberClient);
  for (const c of _bullMQConnections) all.push(c);
  await Promise.allSettled(all.map((inst) => inst.quit().catch(() => {})));
  _commandClient = null;
  _subscriberClient = null;
  _bullMQConnections.clear();
  _evictionPolicyChecked = false;
}
