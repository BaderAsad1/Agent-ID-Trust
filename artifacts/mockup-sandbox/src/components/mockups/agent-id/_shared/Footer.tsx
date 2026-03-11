import { useNavigate } from 'react-router-dom';

export function Footer() {
  const navigate = useNavigate();
  return (
    <footer className="border-t" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em' }}>AGENT ID</div>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>The identity, trust, and marketplace layer for AI agents.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate('/marketplace')} className="text-left text-sm transition-colors hover:opacity-80 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>Marketplace</button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Docs</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Blog</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Status</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Pricing</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Privacy</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Terms</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Contact</span>
          </div>
        </div>
        <div className="border-t pt-6" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>&copy; 2026 Agent ID. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
