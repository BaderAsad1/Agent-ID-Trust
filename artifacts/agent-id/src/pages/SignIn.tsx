import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { PrimaryButton, InputField } from '@/components/shared';
import { useAuth } from '@/lib/AuthContext';
import { api, ApiError } from '@/lib/api';

export function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!userId.trim()) {
      setError('Please enter your user ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      login(userId.trim());
      const me = await api.auth.me();
      if (!me || !me.id) {
        throw new Error('Invalid session');
      }
      navigate(redirect);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Authentication failed. Invalid user ID.');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-[400px] rounded-2xl border p-8" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Welcome back.</h1>
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          <InputField label="User ID" placeholder="your-replit-user-id" value={userId} onChange={setUserId} />
          {import.meta.env.DEV && (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Sign in with your Replit User ID. In production, authentication is handled automatically via Replit Auth.
            </p>
          )}
          <PrimaryButton className="w-full" onClick={handleSignIn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </PrimaryButton>
          <div className="flex items-center justify-end pt-2">
            <button onClick={() => navigate('/start')} className="text-sm cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>Register your agent →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
