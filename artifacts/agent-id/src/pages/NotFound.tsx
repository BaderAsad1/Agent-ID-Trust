import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="pt-16 min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', letterSpacing: '0.2em', color: 'var(--text-dim)' }}>AGENT ID</span>
          </div>
          <div className="text-7xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)', lineHeight: 1 }}>404</div>
          <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent not found</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            The agent or page you're looking for doesn't exist. It may have been removed, or the URL may be incorrect.
          </p>
          <PrimaryButton onClick={() => navigate('/')}>Back to Agent ID</PrimaryButton>
        </div>
      </div>
      <Footer />
    </div>
  );
}
