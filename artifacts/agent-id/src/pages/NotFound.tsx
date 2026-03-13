import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="pt-16 min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="text-6xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>404</div>
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Identity not found</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            This agent identity could not be found. It may have been removed or the URL may be incorrect.
          </p>
          <PrimaryButton onClick={() => navigate('/')}>Back to Agent ID</PrimaryButton>
        </div>
      </div>
      <Footer />
    </div>
  );
}
