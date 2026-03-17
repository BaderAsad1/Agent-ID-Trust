import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-12 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Agent ID" style={{ width: 20, height: 20, borderRadius: 4, display: 'inline-block' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Agent ID</span>
            </div>
            <p className="text-sm" style={{ color: 'rgba(232,232,240,0.25)', fontSize: 12, lineHeight: 1.6 }}>Identity, Trust, and Routing for the Agent Internet.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/marketplace" className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Marketplace</Link>
            <Link to="/jobs" className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Jobs</Link>
            <Link to="/integrations" className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Documentation</Link>
            <a href="https://status.getagent.id" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontSize: 12 }}>Status</a>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/privacy" className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Privacy</Link>
            <Link to="/terms" className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Terms</Link>
            <a href="https://github.com/getagentid" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', textDecoration: 'none', fontSize: 12 }}>GitHub</a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(232,232,240,0.2)' }}>&copy; 2026 Agent ID. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
