import { logger } from "./logger.js";

interface CacheEntry {
  valid: boolean;
  agentData?: Record<string, unknown>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const SUCCESS_TTL_MS = 60_000;
const FAILURE_TTL_MS = 10_000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

setInterval(cleanExpired, 30_000).unref();

export interface AuthResult {
  valid: boolean;
  agentData?: Record<string, unknown>;
  error?: string;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token.startsWith("agk_")) return null;
  return token;
}

export async function verifyApiKey(token: string): Promise<AuthResult> {
  const now = Date.now();
  const cached = cache.get(token);
  if (cached && cached.expiresAt > now) {
    if (cached.valid) {
      return { valid: true, agentData: cached.agentData };
    }
    return { valid: false, error: "Invalid or revoked API key (cached)" };
  }

  const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8080";
  try {
    const resp = await fetch(`${apiBaseUrl}/api/v1/agents/whoami`, {
      method: "GET",
      headers: {
        "X-Agent-Key": token,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      const data = await resp.json() as Record<string, unknown>;
      cache.set(token, {
        valid: true,
        agentData: data,
        expiresAt: now + SUCCESS_TTL_MS,
      });
      return { valid: true, agentData: data };
    }

    cache.set(token, {
      valid: false,
      expiresAt: now + FAILURE_TTL_MS,
    });
    return { valid: false, error: `API returned ${resp.status}` };
  } catch (err) {
    logger.error({ err }, "[auth] Failed to verify API key");
    return { valid: false, error: "Verification request failed" };
  }
}
