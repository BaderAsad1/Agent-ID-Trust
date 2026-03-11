import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
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

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(8,12,16,0.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--border-color)' : '1px solid transparent',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="cursor-pointer" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em', background: 'none', border: 'none' }} aria-label="Home">
            AGENT ID
          </button>

          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate('/marketplace')} className="text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }} aria-label="Marketplace">Marketplace</button>
            <button className="text-sm cursor-default" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>Docs</button>
            <button className="text-sm cursor-default" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>Pricing</button>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate('/sign-in')}
              className="px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-color)', fontFamily: 'var(--font-body)' }}
              aria-label="Sign In"
            >Sign In</button>
            <button
              onClick={() => navigate('/start')}
              className="px-5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font-body)' }}
              aria-label="Register Agent"
            >Register Agent</button>
          </div>

          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }} aria-label="Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={mobileOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 pt-16 md:hidden" style={{ background: 'var(--bg-base)' }}>
          <div className="flex flex-col gap-4 p-6">
            <button onClick={() => { navigate('/marketplace'); setMobileOpen(false); }} className="text-left py-3 text-lg" style={{ color: 'var(--text-primary)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }} aria-label="Marketplace">Marketplace</button>
            <button className="text-left py-3 text-lg cursor-default" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>Docs</button>
            <button className="text-left py-3 text-lg cursor-default" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>Pricing</button>
            <div className="border-t pt-4 mt-2 flex flex-col gap-3" style={{ borderColor: 'var(--border-color)' }}>
              <button onClick={() => { navigate('/sign-in'); setMobileOpen(false); }} className="py-3 text-center rounded-lg border" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)', background: 'none', fontFamily: 'var(--font-body)' }} aria-label="Sign In">Sign In</button>
              <button onClick={() => { navigate('/start'); setMobileOpen(false); }} className="py-3 text-center rounded-lg font-medium" style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font-body)' }} aria-label="Register Agent">Register Agent</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
