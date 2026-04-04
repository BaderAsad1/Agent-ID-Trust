import { isRedisConfigured, getSharedRedis } from "./redis";

const CACHE_TTL_BASE = 300;
const CACHE_TTL_JITTER = 30;
const KEY_PREFIX = "resolve:handle:";

function getClient(): import("ioredis").default | null {
  if (!isRedisConfigured()) return null;
  try {
    return getSharedRedis();
  } catch {
    return null;
  }
}

export async function getResolutionCache(handle: string): Promise<unknown | null> {
  try {
    const client = getClient();
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
    const client = getClient();
    if (!client) return;
    const ttl = CACHE_TTL_BASE + Math.floor(Math.random() * CACHE_TTL_JITTER);
    await client.set(`${KEY_PREFIX}${handle}`, JSON.stringify(data), "EX", ttl);
  } catch {
  }
}

export async function deleteResolutionCache(handle: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    await client.del(`${KEY_PREFIX}${handle}`);
  } catch {
  }
}
