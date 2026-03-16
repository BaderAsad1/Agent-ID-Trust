import { isRedisConfigured, getSharedRedis } from "./redis";

const CACHE_TTL = 60;
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
    await client.set(`${KEY_PREFIX}${handle}`, JSON.stringify(data), "EX", CACHE_TTL);
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
