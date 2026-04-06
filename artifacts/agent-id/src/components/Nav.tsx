import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(to + '/');
  return (
    <Link
      to={to}
      style={{
        color: active ? 'rgba(232,232,240,0.85)' : 'rgba(232,232,240,0.45)',
        textDecoration: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 500,
        padding: '6px 12px',
        borderRadius: 8,
        transition: 'color 0.15s',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
      className="hover:text-white/80"
    >
      {children}
    </Link>
  );
}

export function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, agents, logout } = useAuth();
  const hasAgents = !!(agents && agents.length > 0);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isDashboard = location.pathname.startsWith('/dashboard');

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  if (isDashboard) return null;

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(5,7,17,0.92)' : 'rgba(5,7,17,0.55)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          height: 56,
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-12 h-full flex items-center justify-between gap-4">

          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="cursor-pointer flex items-center gap-2 shrink-0"
            style={{ background: 'none', border: 'none' }}
            aria-label="Home"
          >
            <img
              src={`${import.meta.env.BASE_URL}app-icon.png`}
              alt="Agent ID"
              style={{ width: 26, height: 26, borderRadius: 5 }}
            />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}>Agent ID</span>
          </button>

          {/* Centre nav links - hidden on mobile */}
          <div className="hidden md:flex items-center">
            <NavLink to="/marketplace">Marketplace</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/docs">Docs</NavLink>
            <NavLink to="/for-agents">For Agents</NavLink>
          </div>

          {/* Right side CTAs */}
          <div className="flex items-center gap-2 shrink-0">
            {userId ? (
              <>
                {hasAgents ? (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="hidden sm:block px-4 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5"
                    style={{
                      color: 'rgba(232,232,240,0.45)',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      borderRadius: 8,
                    }}
                  >Dashboard</button>
                ) : (
                  <button
                    onClick={() => navigate('/get-started')}
                    className="px-5 py-1.5 font-semibold rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
                    style={{
                      background: 'rgba(79,125,243,0.15)',
                      color: '#fff',
                      border: '1px solid rgba(79,125,243,0.25)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      borderRadius: 8,
                    }}
                  >Register Agent</button>
                )}
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  className="hidden sm:block px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5"
                  style={{ color: 'rgba(232,232,240,0.3)', background: 'transparent', border: 'none', fontFamily: 'var(--font-body)', fontSize: 13 }}
                >Sign Out</button>
              </>
            ) : (
              <button
                onClick={() => navigate('/sign-in?intent=register')}
                className="px-5 py-1.5 font-semibold rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
                style={{
                  background: 'rgba(79,125,243,0.15)',
                  color: '#fff',
                  border: '1px solid rgba(79,125,243,0.25)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  borderRadius: 8,
                }}
              >Get Started</button>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/5 transition-colors"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 2 }}>
                {mobileMenuOpen ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 3l10 10M13 3L3 13" stroke="rgba(232,232,240,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <>
                    <span style={{ width: 16, height: 1.5, background: 'rgba(232,232,240,0.45)', borderRadius: 1 }} />
                    <span style={{ width: 12, height: 1.5, background: 'rgba(232,232,240,0.45)', borderRadius: 1 }} />
                    <span style={{ width: 16, height: 1.5, background: 'rgba(232,232,240,0.45)', borderRadius: 1 }} />
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed top-[56px] left-0 right-0 z-40"
          style={{
            background: 'rgba(5,7,17,0.97)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 0 20px',
          }}
        >
          {[
            { to: '/marketplace', label: 'Marketplace' },
            { to: '/pricing', label: 'Pricing' },
            { to: '/docs', label: 'Docs' },
            { to: '/for-agents', label: 'For Agents' },
            ...(userId && hasAgents ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
          ].map(link => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                display: 'block', padding: '12px 24px',
                fontSize: 15, fontWeight: 500,
                color: 'rgba(232,232,240,0.7)',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              {link.label}
            </Link>
          ))}
          {userId && (
            <button
              onClick={() => { logout(); navigate('/'); setMobileMenuOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 24px', marginTop: 4,
                fontSize: 14, color: 'rgba(232,232,240,0.3)',
                background: 'transparent', border: 'none',
                fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}
            >Sign Out</button>
          )}
        </div>
      )}
    </>
  );
}
