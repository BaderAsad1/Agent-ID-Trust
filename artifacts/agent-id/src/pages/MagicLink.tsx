import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Mail } from 'lucide-react';

const BASE = import.meta.env.BASE_URL || '/';

export function MagicLinkPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'invalid'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const verifyAttempted = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
    const token = hashParams.get('token');

    const searchParams = new URLSearchParams(window.location.search);
    const returnTo = searchParams.get('returnTo') || '/dashboard';

    if (!token) {
      setStatus('invalid');
      return;
    }

    async function verify(t: string) {
      try {
        const url = `${BASE}api/auth/magic-link/verify`.replace(/\/\//g, '/');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: t }),
        });
        if (res.ok) {
          setStatus('success');
          redirectTimer.current = setTimeout(() => navigate(returnTo, { replace: true }), 1500);
        } else {
          const body = await res.json().catch(() => ({}));
          const code = body.code || '';
          if (code === 'TOKEN_EXPIRED' || (body.message || '').toLowerCase().includes('expired')) {
            setErrorMsg('This link has expired. Please request a new one.');
          } else if (code === 'INVALID_TOKEN' || (body.message || '').toLowerCase().includes('invalid')) {
            setErrorMsg('This link is invalid. Please request a new one.');
          } else {
            setErrorMsg(body.message || 'Verification failed. Please try again.');
          }
          setStatus('error');
        }
      } catch {
        setErrorMsg('Network error. Please check your connection and try again.');
        setStatus('error');
      }
    }

    verify(token);
  }, [navigate]);

  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: '#050711',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', sans-serif",
    color: '#e8e8f0',
    padding: '32px 16px',
  };

  if (status === 'loading') {
    return (
      <div style={shell}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Loader2
            size={32}
            style={{ color: '#4f7df3', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
            Verifying your link
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)' }}>
            Please wait while we sign you in...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={shell}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <CheckCircle size={24} style={{ color: '#34d399' }} aria-hidden="true" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
            You're signed in
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)' }}>
            Taking you back where you left off...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div style={shell}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Mail size={24} style={{ color: '#f87171' }} aria-hidden="true" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
            Invalid link
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, marginBottom: 32 }}>
            This sign-in link is missing a token. Make sure you clicked the full link from your email.
          </p>
          <button
            onClick={() => navigate('/sign-in')}
            style={{
              padding: '12px 32px', fontSize: 14, fontWeight: 600,
              background: 'linear-gradient(135deg, #4f7df3, #6366f1)',
              color: '#fff', border: 'none', borderRadius: 12,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              minHeight: 44,
            }}
          >
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <AlertCircle size={24} style={{ color: '#f87171' }} aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
          Verification failed
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, marginBottom: 32 }}>
          {errorMsg}
        </p>
        <button
          onClick={() => navigate('/sign-in')}
          style={{
            padding: '12px 32px', fontSize: 14, fontWeight: 600,
            background: 'linear-gradient(135deg, #4f7df3, #6366f1)',
            color: '#fff', border: 'none', borderRadius: 12,
            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            minHeight: 44,
          }}
        >
          Request a new link
        </button>
      </div>
    </div>
  );
}
