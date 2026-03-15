import { isRedisConfigured, getRedisConnectionOptions } from "./redis";

const CACHE_TTL = 60;
const KEY_PREFIX = "resolve:handle:";

let redisClient: import("ioredis").default | null = null;
let redisReady = false;

async function getClient(): Promise<import("ioredis").default | null> {
  if (!isRedisConfigured()) return null;
  if (redisClient && redisReady) return redisClient;

  if (redisClient && !redisReady) {
    try { redisClient.disconnect(); } catch {}
    redisClient = null;
  }

  try {
    const { default: Redis } = await import("ioredis");
    const opts = getRedisConnectionOptions();
    redisClient = new Redis({
      ...opts,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });

    redisClient.on("ready", () => { redisReady = true; });
    redisClient.on("error", () => { redisReady = false; });
    redisClient.on("close", () => { redisReady = false; });

    await redisClient.connect();
    return redisClient;
  } catch {
    redisClient = null;
    redisReady = false;
    return null;
  }
}

export async function getResolutionCache(handle: string): Promise<unknown | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    const raw = await client.get(`${KEY_PREFIX}${handle}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setResolutionCache(handle: string, data: unknown): Promise<void> {
  try {
    const client = await getClient();
    if (!client) return;
    await client.set(`${KEY_PREFIX}${handle}`, JSON.stringify(data), "EX", CACHE_TTL);
  } catch {
  }
}

export async function deleteResolutionCache(handle: string): Promise<void> {
  try {
    const client = await getClient();
    if (!client) return;
    await client.del(`${KEY_PREFIX}${handle}`);
  } catch {
  }
}
