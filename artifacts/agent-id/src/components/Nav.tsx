import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDashboard = location.pathname.startsWith('/dashboard');

  useEffect(() => {
    const el = document.getElementById('agent-id-scroll-container');
    if (!el) return;
    const handler = () => setScrolled(el.scrollTop > 10);
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  if (isDashboard) return null;

  const navLinks = [
    { label: 'Marketplace', onClick: () => navigate('/marketplace') },
    { label: 'Jobs', onClick: () => navigate('/jobs') },
    { label: 'Pricing', onClick: () => navigate('/pricing') },
    { label: 'For Agents', onClick: () => navigate('/for-agents'), highlight: true },
  ];

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(5,7,17,0.85)' : 'rgba(5,7,17,0.5)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          height: 56,
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-12 h-full flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="cursor-pointer flex items-center gap-2"
            style={{ background: 'none', border: 'none' }}
            aria-label="Home"
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 10px rgba(79,125,243,0.4)',
              display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}>Agent ID</span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(l => (
              <button
                key={l.label}
                onClick={l.onClick}
                className="text-sm transition-colors cursor-pointer hover:opacity-80"
                style={{
                  color: l.highlight ? 'var(--accent)' : 'rgba(232,232,240,0.45)',
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: 13,
                  letterSpacing: '0.01em',
                }}
                aria-label={l.label}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {userId ? (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-1.5 text-sm rounded-lg transition-all cursor-pointer hover:bg-white/5"
                  style={{
                    color: 'rgba(232,232,240,0.45)',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    borderRadius: 8,
                  }}
                  aria-label="Dashboard"
                >Dashboard</button>
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  className="px-3 py-1.5 text-sm rounded-lg transition-all cursor-pointer hover:bg-white/5"
                  style={{ color: 'rgba(232,232,240,0.3)', background: 'transparent', border: 'none', fontFamily: 'var(--font-body)', fontSize: 13 }}
                  aria-label="Sign Out"
                >Sign Out</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/sign-in')}
                  className="px-4 py-1.5 text-sm rounded-lg transition-all cursor-pointer hover:bg-white/5"
                  style={{
                    color: 'rgba(232,232,240,0.45)',
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                  }}
                  aria-label="Sign In"
                >Sign In</button>
                <button
                  onClick={() => navigate('/start')}
                  className="px-5 py-1.5 text-sm font-semibold rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
                  style={{
                    background: 'rgba(79,125,243,0.15)',
                    color: '#fff',
                    border: '1px solid rgba(79,125,243,0.25)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    borderRadius: 8,
                  }}
                  aria-label="Register"
                >Register</button>
              </>
            )}
          </div>

          <button
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }}
            aria-label="Menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={mobileOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 pt-16 md:hidden" style={{ background: 'var(--bg-base)' }}>
          <div className="flex flex-col gap-4 p-6">
            {navLinks.map(l => (
              <button
                key={l.label}
                onClick={() => { l.onClick?.(); setMobileOpen(false); }}
                className="text-left py-3 text-lg cursor-pointer"
                style={{ color: l.highlight ? 'var(--accent)' : 'var(--text-primary)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
                aria-label={l.label}
              >{l.label}</button>
            ))}
            <div className="border-t pt-4 mt-2 flex flex-col gap-3" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {userId ? (
                <>
                  <button onClick={() => { navigate('/dashboard'); setMobileOpen(false); }} className="py-3 text-center rounded-lg border cursor-pointer" style={{ color: 'var(--text-primary)', borderColor: 'rgba(255,255,255,0.08)', background: 'none' }} aria-label="Dashboard">Dashboard</button>
                  <button onClick={() => { logout(); navigate('/'); setMobileOpen(false); }} className="py-3 text-center rounded-lg cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }} aria-label="Sign Out">Sign Out</button>
                </>
              ) : (
                <>
                  <button onClick={() => { navigate('/sign-in'); setMobileOpen(false); }} className="py-3 text-center rounded-lg border cursor-pointer" style={{ color: 'var(--text-primary)', borderColor: 'rgba(255,255,255,0.08)', background: 'none', fontFamily: 'var(--font-body)' }} aria-label="Sign In">Sign In</button>
                  <button onClick={() => { navigate('/start'); setMobileOpen(false); }} className="py-3 text-center rounded-lg font-medium cursor-pointer" style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font-body)' }} aria-label="Register">Register</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
