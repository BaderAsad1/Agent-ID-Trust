import { Redis } from "ioredis";
import { env } from "./env";

let _initialized = false;
let _redis!: Redis;
let _redisSub!: Redis;
let _bullMQRedis!: Redis;

function initInstances(): void {
  if (_initialized) return;
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL not configured");

  _redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _redis.on("error", (err) => {
    console.error(`[redis:commands] ${err.message}`);
  });
  _redis.on("connect", () => {
    _redis.config("SET", "maxmemory-policy", "allkeys-lru").catch(() => {});
  });

  _redisSub = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _redisSub.on("error", (err) => {
    console.error(`[redis:subscriber] ${err.message}`);
  });

  _bullMQRedis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  _bullMQRedis.on("error", (err) => {
    console.error(`[redis:bullmq] ${err.message}`);
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
}
