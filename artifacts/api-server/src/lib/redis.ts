export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
}

let connectionOpts: RedisConnectionOptions | null = null;

export function getRedisConnectionOptions(): RedisConnectionOptions {
  if (connectionOpts) return connectionOpts;

  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    connectionOpts = {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    };
  } else {
    connectionOpts = {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }

  return connectionOpts;
}

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

export async function closeRedis(): Promise<void> {
}
