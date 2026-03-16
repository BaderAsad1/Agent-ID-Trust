import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { Footer } from '@/components/Footer';

export function ClaimPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { userId, loading: authLoading, login, refreshAgents } = useAuth();

  const [state, setState] = useState<'loading' | 'not-logged-in' | 'claiming' | 'success' | 'error'>('loading');
  const [claimedAgent, setClaimedAgent] = useState<{ handle: string; displayName: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const doClaim = useCallback(async () => {
    if (!token) return;
    setState('claiming');
    try {
      const result = await api.agents.claim({ token });
      setClaimedAgent({ handle: result.handle, displayName: result.displayName });
      await refreshAgents();
      setState('success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to claim agent';
      setErrorMessage(msg);
      setState('error');
    }
  }, [token, refreshAgents]);

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setErrorMessage('No claim token provided. Please use the full claim URL you received.');
      setState('error');
      return;
    }

    if (!userId) {
      setState('not-logged-in');
      return;
    }

    doClaim();
  }, [authLoading, userId, token, doClaim]);

  const handleSignIn = () => {
    login();
  };

  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: '#050711',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-body)',
    color: '#e8e8f0',
    padding: '32px 20px',
  };

  if (state === 'loading' || (authLoading && state !== 'error')) {
    return (
      <div style={shell}>
        <Loader2 size={24} style={{ color: '#4f7df3', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (state === 'not-logged-in') {
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)', marginBottom: 24,
            textTransform: 'uppercase',
          }}>CLAIM AGENT</div>

          <div style={{
            borderRadius: 18, border: '1px solid rgba(79,125,243,0.15)',
            background: 'rgba(8,10,22,0.98)', padding: '40px 32px',
            boxShadow: '0 0 60px rgba(79,125,243,0.06), 0 30px 80px -15px rgba(0,0,0,0.6)',
          }}>
            <LogIn size={40} style={{ color: '#4f7df3', marginBottom: 20 }} />
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
              marginBottom: 12, color: '#e8e8f0',
            }}>Sign in to claim your agent</h2>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, marginBottom: 28 }}>
              You need to sign in to your Agent ID account to claim ownership of this agent. Your claim token will be preserved.
            </p>
            <button
              onClick={handleSignIn}
              style={{
                width: '100%', padding: '14px 24px', borderRadius: 12,
                background: '#4f7df3', border: 'none', color: '#fff',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: 'inherit',
              }}
            >
              <LogIn size={16} /> Sign In
            </button>
          </div>
        </div>
        <div style={{ marginTop: 'auto', width: '100%' }}><Footer /></div>
      </div>
    );
  }

  if (state === 'claiming') {
    return (
      <div style={shell}>
        <Loader2 size={24} style={{ color: '#4f7df3', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 16, fontSize: 14, color: 'rgba(232,232,240,0.45)' }}>Claiming agent...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (state === 'success' && claimedAgent) {
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)', marginBottom: 24,
            textTransform: 'uppercase',
          }}>OWNERSHIP CONFIRMED</div>

          <div style={{
            borderRadius: 18, border: '1px solid rgba(52,211,153,0.15)',
            background: 'rgba(8,10,22,0.98)', padding: '40px 32px',
            boxShadow: '0 0 60px rgba(52,211,153,0.06), 0 30px 80px -15px rgba(0,0,0,0.6)',
          }}>
            <CheckCircle size={48} style={{ color: '#34d399', marginBottom: 20 }} />
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
              marginBottom: 8, color: '#e8e8f0',
            }}>Agent Claimed!</h2>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, marginBottom: 8 }}>
              You are now the verified handler of
            </p>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 16, color: '#4f7df3',
              fontWeight: 600, marginBottom: 28,
            }}>
              {claimedAgent.handle}<span style={{ color: 'rgba(232,232,240,0.3)' }}>.agentid</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10,
                  background: '#4f7df3', border: 'none', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Go to Dashboard</button>
              <button
                onClick={() => navigate(`/${claimedAgent.handle}`)}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(232,232,240,0.6)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >View Profile</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', width: '100%' }}><Footer /></div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          borderRadius: 18, border: '1px solid rgba(239,68,68,0.15)',
          background: 'rgba(8,10,22,0.98)', padding: '40px 32px',
          boxShadow: '0 0 60px rgba(239,68,68,0.06), 0 30px 80px -15px rgba(0,0,0,0.6)',
        }}>
          <AlertCircle size={48} style={{ color: 'rgba(239,68,68,0.6)', marginBottom: 20 }} />
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            marginBottom: 12, color: '#e8e8f0',
          }}>Claim Failed</h2>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, marginBottom: 28 }}>
            {errorMessage}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(232,232,240,0.6)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Go to Dashboard</button>
        </div>
      </div>
      <div style={{ marginTop: 'auto', width: '100%' }}><Footer /></div>
    </div>
  );
}
