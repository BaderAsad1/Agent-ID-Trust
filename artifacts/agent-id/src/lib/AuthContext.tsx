import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api, type Agent } from './api';

interface AuthUser {
  id: string;
  replitUserId?: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  userId: string | null;
  agents: Agent[];
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
  refreshAgents: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userId: null,
  agents: [],
  loading: true,
  error: null,
  login: () => {},
  logout: () => {},
  refreshAgents: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const logout = useCallback(() => {
    const base = import.meta.env.BASE_URL || '/';
    window.location.href = `${base}api/logout`;
  }, []);

  const refreshAgents = useCallback(async () => {
    if (!user) return;
    try {
      const result = await api.agents.list();
      setAgents(result.agents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const res = await fetch(`${base}api/auth/user`, {
          credentials: 'include',
        });
        if (!res.ok) {
          setUser(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.user) {
          setUser(data.user);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user) {
      refreshAgents();
    }
  }, [user, refreshAgents]);

  const userId = user?.id ?? null;

  return (
    <AuthContext.Provider value={{ user, userId, agents, loading, error, login, logout, refreshAgents }}>
      {children}
    </AuthContext.Provider>
  );
}
