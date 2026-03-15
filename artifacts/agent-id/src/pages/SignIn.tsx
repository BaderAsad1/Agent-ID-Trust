import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function SignIn() {
  const navigate = useNavigate();
  const { userId, loading, login } = useAuth();

  useEffect(() => {
    if (!loading && userId) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (!loading && !userId) {
      login();
    }
  }, [loading, userId, login]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div style={{ textAlign: 'center', color: 'rgba(232,232,240,0.5)', fontSize: 14 }}>
        Redirecting to sign in...
      </div>
    </div>
  );
}
