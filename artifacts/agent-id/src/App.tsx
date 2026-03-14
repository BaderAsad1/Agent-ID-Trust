import './styles/theme.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { Nav } from '@/components/Nav';
import { Start } from '@/pages/Start';
import { SignIn } from '@/pages/SignIn';
import { Dashboard } from '@/pages/Dashboard';
import { AgentProfile } from '@/pages/AgentProfile';
import { BuyerAcquisitionView } from '@/pages/TransferSale';
import { Marketplace } from '@/pages/Marketplace';
import { MarketplaceListing } from '@/pages/MarketplaceListing';
import { JobBoard, JobDetail } from '@/pages/Jobs';
import { ForAgents } from '@/pages/ForAgents';
import { Pricing } from '@/pages/Pricing';
import { Protocol } from '@/pages/Protocol';
import { DocsIntegrations } from '@/pages/DocsIntegrations';
import { NotFound } from '@/pages/NotFound';
import { Mail } from '@/pages/Mail';
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
  return <IssuanceFilm onNavigate={(path) => navigate(path)} />;
}

function AppContent() {
  const location = useLocation();
  const isLanding = location.pathname === '/' || location.pathname === '';

  if (isLanding) {
    return <LandingPage />;
  }

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
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/for-agents" element={<ForAgents />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/protocol" element={<Protocol />} />
        <Route path="/docs/integrations" element={<DocsIntegrations />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/:id" element={<MarketplaceListing />} />
        <Route path="/jobs" element={<JobBoard />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/transfers/:transferId" element={<BuyerAcquisitionView />} />
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
    </AuthProvider>
  );
}

export default App;
