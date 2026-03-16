import { Redis } from "ioredis";
import { env } from "./env";

let _redis: Redis | null = null;

export function getSharedRedis(): Redis {
  if (_redis) return _redis;
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL not configured");
  _redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  _redis.on("connect", () => {
    _redis?.config("SET", "maxmemory-policy", "noeviction").catch(() => {});
  });
  return _redis;
}

export function getRedisConnectionOptions(): Redis {
  return getSharedRedis();
}

export function isRedisConfigured(): boolean {
  return !!env().REDIS_URL;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    try { await _redis.quit(); } catch {}
    _redis = null;
  }
}
