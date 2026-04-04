const AGK_PATTERN = /agk_[a-zA-Z0-9_-]{6,}/g;

export function redactApiKey(value: string): string {
  return value.replace(AGK_PATTERN, (match) => `${match.slice(0, 8)}...[REDACTED]`);
}

export function redactSecrets(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[DEPTH_LIMIT]";
  if (typeof obj === "string") {
    return redactApiKey(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, depth + 1));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lk = key.toLowerCase();
      if (lk === "apikey" || lk === "api_key" || lk === "authorization" || lk === "x-agent-key") {
        if (typeof value === "string") {
          result[key] = value.startsWith("agk_") ? `${value.slice(0, 8)}...[REDACTED]` : "[REDACTED]";
        } else {
          result[key] = "[REDACTED]";
        }
      } else {
        result[key] = redactSecrets(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}
