interface Session {
  id: string;
  apiKey: string;
  agentData: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, Session>();

function cleanExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanExpired, 60_000).unref();

export function createSession(id: string, apiKey: string, agentData: Record<string, unknown>): Session {
  const session: Session = {
    id,
    apiKey,
    agentData,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  const now = Date.now();
  if (now - session.lastAccessedAt > TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  session.lastAccessedAt = now;
  return session;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function getSessionCount(): number {
  return sessions.size;
}
