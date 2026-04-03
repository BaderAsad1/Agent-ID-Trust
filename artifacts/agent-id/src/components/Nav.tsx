import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const isDashboard = location.pathname.startsWith('/dashboard');

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (isDashboard) return null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(5,7,17,0.88)' : 'rgba(5,7,17,0.5)',
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
          <img
            src={`${import.meta.env.BASE_URL}app-icon.png`}
            alt="Agent ID"
            style={{ width: 26, height: 26, borderRadius: 5, display: 'inline-block' }}
          />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>Agent ID</span>
        </button>

        <div className="flex items-center gap-3">
          {userId ? (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5"
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
                className="px-3 py-1.5 rounded-lg transition-all cursor-pointer hover:bg-white/5"
                style={{ color: 'rgba(232,232,240,0.3)', background: 'transparent', border: 'none', fontFamily: 'var(--font-body)', fontSize: 13 }}
                aria-label="Sign Out"
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
              aria-label="Get Started"
            >Get Started</button>
          )}
        </div>
      </div>
    </nav>
  );
}
