import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api, setCurrentUserId, getCurrentUserId, type Agent } from './api';

interface AuthState {
  userId: string | null;
  agents: Agent[];
  loading: boolean;
  error: string | null;
  login: (userId: string) => void;
  logout: () => void;
  refreshAgents: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  userId: null,
  agents: [],
  loading: false,
  error: null,
  login: () => {},
  logout: () => {},
  refreshAgents: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(() => {
    const existing = getCurrentUserId();
    if (existing) return existing;
    try {
      const params = new URLSearchParams(window.location.search);
      const autoLogin = params.get('auto_login');
      if (autoLogin) {
        setCurrentUserId(autoLogin);
        return autoLogin;
      }
    } catch {}
    return null;
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback((id: string) => {
    setCurrentUserId(id);
    setUserId(id);
  }, []);

  const logout = useCallback(() => {
    setCurrentUserId(null);
    setUserId(null);
    setAgents([]);
  }, []);

  const refreshAgents = useCallback(async () => {
    const uid = getCurrentUserId();
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.agents.list();
      setAgents(result.agents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      refreshAgents();
    }
  }, [userId, refreshAgents]);

  return (
    <AuthContext.Provider value={{ userId, agents, loading, error, login, logout, refreshAgents }}>
      {children}
    </AuthContext.Provider>
  );
}
