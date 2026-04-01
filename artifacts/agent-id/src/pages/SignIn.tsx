import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const BASE = import.meta.env.BASE_URL || '/';

function githubUrl(returnTo?: string) {
  const base = `${BASE}api/auth/github`.replace(/\/\//g, '/');
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

function googleUrl(returnTo?: string) {
  const base = `${BASE}api/auth/google`.replace(/\/\//g, '/');
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Sign-in failed. Please try again.',
  oauth_state_mismatch: 'Session expired. Please try again.',
  token_expired: 'This sign-in link has expired. Please request a new one.',
  invalid_token: 'Invalid sign-in link. Please request a new one.',
  provider_not_configured: 'This sign-in method is not available yet.',
};

const STORAGE_KEY = 'agent-id-getstarted-draft';

function getOnboardingContext(): { isOnboarding: boolean; intent: 'new' | 'claim' | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { isOnboarding: false, intent: null };
    const draft = JSON.parse(raw);
    if (draft.pendingAuth) {
      return { isOnboarding: true, intent: draft.intent ?? null };
    }
  } catch {}
  return { isOnboarding: false, intent: null };
}

export function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { userId, loading } = useAuth();

  const returnTo = params.get('returnTo') || '/dashboard';
  const errorCode = params.get('error');

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isReturningUser, setIsReturningUser] = useState(false);

  const { isOnboarding, intent } = getOnboardingContext();

  useEffect(() => {
    if (!loading && userId) {
      navigate(returnTo, { replace: true });
    }
  }, [loading, userId, navigate, returnTo]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError('');
    setSending(true);
    try {
      const base = `${BASE}api/auth/magic-link/send`.replace(/\/\//g, '/');
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setEmailError('Something went wrong. Please try again.');
      }
    } catch {
      setEmailError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function getHeading() {
    if (isReturningUser) return 'Welcome back';
    if (isOnboarding) {
      if (intent === 'claim') return 'First, create your account';
      return 'Create your account to get started';
    }
    return 'Create your account';
  }

  function getSubtext() {
    if (isReturningUser) return 'Sign in to your Agent ID account.';
    if (isOnboarding) {
      if (intent === 'claim') return 'You need an account to link an agent to your profile.';
      return 'You need an account to register your agent.';
    }
    return 'Get your agent a verified identity, wallet, and trust score.';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', fontSize: 22,
          }}>✉️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 12 }}>
            Check your email
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(232,232,240,0.5)', lineHeight: 1.6, marginBottom: 32 }}>
            We sent a sign-in link to <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{email}</strong>.
            It expires in 15 minutes.
          </p>
          <button
            onClick={() => { setSent(false); setEmail(''); }}
            style={{
              background: 'none', border: 'none', color: 'rgba(232,232,240,0.4)',
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#a0a0a0', letterSpacing: 0.5 }}>
              agent<span style={{ color: '#ffffff' }}>ID</span>
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>
            {getHeading()}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', margin: 0 }}>
            {getSubtext()}
          </p>
        </div>

        {errorCode && ERROR_MESSAGES[errorCode] && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 24,
            fontSize: 13, color: '#f87171', textAlign: 'center',
          }}>
            {ERROR_MESSAGES[errorCode]}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          <a
            href={githubUrl(returnTo)}
            aria-label="Continue with GitHub"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 8, textDecoration: 'none',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#f0f0f5', fontSize: 14, fontWeight: 500, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            <GitHubIcon />
            Continue with GitHub
          </a>

          <a
            href={googleUrl(returnTo)}
            aria-label="Continue with Google"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 8, textDecoration: 'none',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#f0f0f5', fontSize: 14, fontWeight: 500, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            <GoogleIcon />
            Continue with Google
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.3)', whiteSpace: 'nowrap' }}>or continue with email</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <form onSubmit={handleMagicLink}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
              aria-label="Email address"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              autoComplete="email"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${emailError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: '#f0f0f5', fontSize: 14, outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.25)')}
              onBlur={(e) => (e.target.style.borderColor = emailError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)')}
            />
            {emailError && (
              <p id="email-error" role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171' }}>{emailError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={sending}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
              background: sending ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
              color: sending ? 'rgba(232,232,240,0.4)' : '#f0f0f5',
              fontSize: 14, fontWeight: 500, cursor: sending ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {sending ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {isReturningUser ? (
            <button
              onClick={() => setIsReturningUser(false)}
              style={{
                background: 'none', border: 'none', fontSize: 13,
                color: 'rgba(232,232,240,0.4)', cursor: 'pointer',
              }}
            >
              New here?{' '}
              <span style={{ color: 'rgba(232,232,240,0.7)', textDecoration: 'underline' }}>
                Create an account
              </span>
            </button>
          ) : (
            <button
              onClick={() => setIsReturningUser(true)}
              style={{
                background: 'none', border: 'none', fontSize: 13,
                color: 'rgba(232,232,240,0.4)', cursor: 'pointer',
              }}
            >
              Already have an account?{' '}
              <span style={{ color: 'rgba(232,232,240,0.7)', textDecoration: 'underline' }}>
                Sign in
              </span>
            </button>
          )}
        </div>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'rgba(232,232,240,0.25)', lineHeight: 1.6 }}>
          By continuing, you agree to the{' '}
          <a href="/terms" style={{ color: 'rgba(232,232,240,0.4)', textDecoration: 'underline' }}>Terms</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: 'rgba(232,232,240,0.4)', textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
