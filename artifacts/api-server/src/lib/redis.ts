import { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "../middlewares/request-logger";

let _initialized = false;
let _redis!: Redis;
let _redisSub!: Redis;
let _bullMQRedis!: Redis;
let _evictionPolicyChecked = false;

const REQUIRED_EVICTION_POLICY = "noeviction";

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

function initInstances(): void {
  if (_initialized) return;
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL not configured");

  _redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _redis.on("error", (err) => {
    logger.error({ err }, '[redis:commands] Redis connection error');
  });

  _redisSub = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _redisSub.on("error", (err) => {
    logger.error({ err }, '[redis:subscriber] Redis connection error');
  });

  _bullMQRedis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _bullMQRedis.on("error", (err) => {
    logger.error({ err }, '[redis:bullmq] Redis connection error');
  });

  _initialized = true;
}

export function getRedis(): Redis {
  initInstances();
  return _redis;
}

export const getSharedRedis = getRedis;

export function getRedisSub(): Redis {
  initInstances();
  return _redisSub;
}

export function getBullMQConnection(): { connection: Redis } {
  initInstances();
  return { connection: _bullMQRedis };
}

export function isRedisConfigured(): boolean {
  return !!env().REDIS_URL;
}

export async function closeRedis(): Promise<void> {
  if (!_initialized) return;
  await Promise.allSettled(
    [_redis, _redisSub, _bullMQRedis].map((inst) => inst.quit().catch(() => {})),
  );
  _initialized = false;
  _evictionPolicyChecked = false;
}
