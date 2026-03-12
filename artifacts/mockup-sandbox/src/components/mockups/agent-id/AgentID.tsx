import './_group.css';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './_shared/AuthContext';
import { Nav } from './_shared/Nav';
import { Home } from './_shared/Home';
import { Start } from './_shared/Start';
import { SignIn } from './_shared/SignIn';
import { Dashboard } from './_shared/Dashboard';
import { AgentProfile } from './_shared/AgentProfile';
import { Marketplace } from './_shared/Marketplace';
import { MarketplaceListing } from './_shared/MarketplaceListing';
import { JobBoard, JobDetail } from './_shared/Jobs';
import { ForAgents } from './_shared/ForAgents';
import { Mail } from './_shared/Mail';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { userId, loading } = useAuth();
  if (loading) return null;
  if (!userId) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

export function AgentID() {
  const autoLogin = (() => { try { return new URLSearchParams(window.location.search).get('auto_login'); } catch { return null; } })();
  const initialRoute = autoLogin ? '/dashboard' : '/';
  return (
    <AuthProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <div
          id="agent-id-scroll-container"
          className="min-h-screen overflow-y-auto"
          style={{
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/start" element={<Start />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/for-agents" element={<ForAgents />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/:id" element={<MarketplaceListing />} />
            <Route path="/jobs" element={<JobBoard />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/:handle" element={<AgentProfile />} />
          </Routes>
        </div>
      </MemoryRouter>
    </AuthProvider>
  );
}
