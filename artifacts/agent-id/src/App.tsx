import './styles/theme.css';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { Toaster } from 'sonner';
import { Nav } from '@/components/Nav';
import { Start } from '@/pages/Start';
import { SignIn } from '@/pages/SignIn';
import { Dashboard } from '@/pages/Dashboard';
import { AgentProfile } from '@/pages/AgentProfile';
import { Marketplace } from '@/pages/Marketplace';
import { MarketplaceListing } from '@/pages/MarketplaceListing';
import { JobBoard, JobDetail } from '@/pages/Jobs';
import { ForAgents } from '@/pages/ForAgents';
import { Pricing } from '@/pages/Pricing';
import { Protocol } from '@/pages/Protocol';
import { DocsIntegrations } from '@/pages/DocsIntegrations';
import { NotFound } from '@/pages/NotFound';
import { ClaimPage } from '@/pages/Claim';
import { Mail } from '@/pages/Mail';
import { OrgProfile } from '@/pages/OrgProfile';
import { HumanProfile } from '@/pages/HumanProfile';
import { Terms } from '@/pages/Terms';
import { Privacy } from '@/pages/Privacy';
import { Changelog } from '@/pages/Changelog';
import { Security } from '@/pages/Security';
import { BugBounty } from '@/pages/BugBounty';
import { ClaudeDesktopIntegration } from '@/pages/integrations/ClaudeDesktop';
import { CursorIntegration } from '@/pages/integrations/Cursor';
import { VSCodeIntegration } from '@/pages/integrations/VSCode';
import IssuanceFilm from '@/components/IssuanceFilm';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { userId, loading } = useAuth();
  if (loading) return null;
  if (!userId) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
    return () => clearTimeout(timer);
  }, [location.hash]);

  return <IssuanceFilm onNavigate={(path) => navigate(path)} />;
}

function AppContent() {
  const location = useLocation();
  const isLanding = location.pathname === '/' || location.pathname === '';

  if (isLanding) return <LandingPage />;

  return (
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
        <Route path="/start" element={<Start />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/login" element={<Navigate to="/sign-in" replace />} />
        <Route path="/register" element={<Navigate to="/sign-in" replace />} />
        <Route path="/for-agents" element={<ForAgents />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/protocol" element={<Protocol />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/bug-bounty" element={<BugBounty />} />
        <Route path="/integrations" element={<DocsIntegrations />} />
        <Route path="/integrations/claude-desktop" element={<ClaudeDesktopIntegration />} />
        <Route path="/integrations/cursor" element={<CursorIntegration />} />
        <Route path="/integrations/vscode" element={<VSCodeIntegration />} />
        <Route path="/docs/integrations" element={<DocsIntegrations />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/:id" element={<MarketplaceListing />} />
        <Route path="/jobs" element={<JobBoard />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/org/:slug" element={<OrgProfile />} />
        <Route path="/u/:handle" element={<HumanProfile />} />
        <Route path="/v2" element={<Navigate to="/" replace />} />
        <Route path="/:handle" element={<AgentProfile />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-center" />
    </AuthProvider>
  );
}

export default App;
