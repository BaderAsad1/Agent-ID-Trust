import { useNavigate } from 'react-router-dom';

export function Footer() {
  const navigate = useNavigate();
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
            <button onClick={() => navigate('/marketplace')} className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', background: 'none', border: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Marketplace</button>
            <button onClick={() => navigate('/jobs')} className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', background: 'none', border: 'none', fontFamily: 'var(--font-body)', fontSize: 12 }}>Jobs</button>
            <span className="text-sm cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', fontSize: 12 }}>Documentation</span>
            <span className="text-sm cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', fontSize: 12 }}>Status</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', fontSize: 12 }}>Privacy</span>
            <span className="text-sm cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', fontSize: 12 }}>Terms</span>
            <span className="text-sm cursor-pointer" style={{ color: 'rgba(232,232,240,0.35)', fontSize: 12 }}>GitHub</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(232,232,240,0.2)' }}>&copy; 2026 Agent ID. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
