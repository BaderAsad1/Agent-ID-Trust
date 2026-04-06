import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Mail, LockKeyhole, Zap, Star } from 'lucide-react';
import { AgentCredential } from '@/components/concept/AgentCredential';
import { useHeroAnimation } from '@/components/concept/useHeroAnimation';
import '@/components/concept/concept.css';
import { useSEO } from '@/lib/useSEO';

const BASE = import.meta.env.BASE_URL || '/';
const ACCENT = '#4f7df3';
const PURPLE = '#7c5bf5';

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

export function SignIn() {
  useSEO({ title: 'Sign In', canonical: '/sign-in', noIndex: true });
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { userId, loading } = useAuth();
  const phase = useHeroAnimation(98);

  const errorCode = params.get('error');
  const intent = params.get('intent');
  const isRegister = intent === 'register';
  const explicitReturnTo = params.get('returnTo');

  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isSignIn, setIsSignIn] = useState(!isRegister);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Sanitize returnTo to only allow same-origin relative paths (prevent open redirect attacks).
  const rawReturnTo = explicitReturnTo || (isSignIn ? '/dashboard' : '/get-started');
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/dashboard';

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownSecs(0);
        setCooldownUntil(null);
      } else {
        setCooldownSecs(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

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
        body: JSON.stringify({ email: email.trim(), returnTo }),
      });
      if (res.ok) {
        setSent(true);
        setCooldownUntil(Date.now() + 60_000);
      } else {
        setEmailError('Something went wrong. Please try again.');
      }
    } catch {
      setEmailError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050711' }}>
        <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050711', padding: '0 24px' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Mail size={22} color={ACCENT} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f5', marginBottom: 12 }}>
            Check your email
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(232,232,240,0.5)', lineHeight: 1.6, marginBottom: 32 }}>
            We sent a sign-in link to <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{email}</strong>. It expires in 15 minutes.
          </p>
          <button
            onClick={() => { if (cooldownSecs > 0) return; setSent(false); setEmail(''); }}
            disabled={cooldownSecs > 0}
            style={{
              background: 'none', border: 'none',
              color: cooldownSecs > 0 ? 'rgba(232,232,240,0.2)' : 'rgba(232,232,240,0.4)',
              fontSize: 13, cursor: cooldownSecs > 0 ? 'default' : 'pointer',
              textDecoration: cooldownSecs > 0 ? 'none' : 'underline', fontFamily: 'inherit',
            }}
          >
            {cooldownSecs > 0 ? `Resend available in ${cooldownSecs}s` : 'Use a different email'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#e8e8f0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', left: '-10%', top: '10%',
          width: 500, height: 500, borderRadius: '50%',
          background: `radial-gradient(circle, ${PURPLE}28 0%, transparent 70%)`,
        }} />
        <div style={{
          position: 'absolute', left: '15%', bottom: '-10%',
          width: 400, height: 400, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`,
        }} />
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      {/* LEFT PANEL - value prop */}
      <div style={{
        flex: '0 0 33.333%',
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 32px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
        className="signin-left-panel"
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, rgba(124,91,245,0.08) 0%, rgba(79,125,243,0.04) 50%, transparent 100%)`,
          pointerEvents: 'none',
        }} />

        {/* Headline */}
        <div style={{ marginBottom: 32, position: 'relative', textAlign: 'center', width: '100%' }}>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
            fontSize: 32, fontWeight: 800, lineHeight: 1.15,
            margin: '0 0 12px',
            background: 'linear-gradient(135deg, #ffffff 30%, rgba(232,232,240,0.6) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.03em',
          }}>
            Your agent's permanent identity on the web.
          </h1>
          <p style={{
            fontSize: 14, color: 'rgba(232,232,240,0.45)',
            lineHeight: 1.65, margin: '0 auto',
          }}>
            Claim a handle like <span style={{ color: 'rgba(79,125,243,0.8)', fontFamily: 'monospace' }}>atlas.agentid</span>. Get a public profile, routing address, and trust score - in 60 seconds.
          </p>
        </div>

        {/* ID credential card */}
        <div className="concept-dark" style={{ background: 'transparent', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <AgentCredential phase={{ ...phase, alive: false }} />
        </div>
      </div>
      {/* RIGHT PANEL - auth form */}
      <div style={{
        flex: 1,
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 48px',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {errorCode && ERROR_MESSAGES[errorCode] && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 24,
              fontSize: 13, color: '#f87171', textAlign: 'center',
            }}>
              {ERROR_MESSAGES[errorCode]}
            </div>
          )}

          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h2
              style={{
                fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
                fontSize: 26, fontWeight: 700, color: '#ffffff',
                margin: '0 0 8px',
                letterSpacing: '-0.02em',
              }}
              className="text-center">
              {isSignIn ? 'Welcome back' : 'Create your account'}
            </h2>
          </div>

          {/* OAuth Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <a
              href={githubUrl(returnTo)}
              aria-label="Continue with GitHub"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '12px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e8e8f0', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', width: '100%', textDecoration: 'none',
                transition: 'all 0.15s', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              <GitHubIcon />
              Continue with GitHub
            </a>

            <a
              href={googleUrl(returnTo)}
              aria-label="Continue with Google"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '12px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e8e8f0', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', width: '100%', textDecoration: 'none',
                transition: 'all 0.15s', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              <GoogleIcon />
              Continue with Google
            </a>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.28)', whiteSpace: 'nowrap' }}>
              or continue with email
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleMagicLink}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  aria-label="Email address"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  autoComplete="email"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 44px 12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${emailError ? 'rgba(239,68,68,0.5)' : focused ? `${ACCENT}88` : 'rgba(255,255,255,0.1)'}`,
                    background: 'rgba(255,255,255,0.04)',
                    color: '#f0f0f5', fontSize: 14, outline: 'none',
                    fontFamily: 'inherit',
                    boxShadow: focused ? `0 0 0 3px ${ACCENT}18` : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
                {email && !emailError && (
                  <div style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    width: 18, height: 18, borderRadius: '50%',
                    background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
              {emailError && (
                <p id="email-error" role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171' }}>{emailError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={sending}
              style={{
                width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
                background: sending ? 'rgba(79,125,243,0.4)' : `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`,
                color: 'white', fontSize: 14, fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer', marginBottom: 24,
                fontFamily: 'inherit',
                boxShadow: sending ? 'none' : `0 4px 20px ${ACCENT}40`,
                letterSpacing: '0.01em',
                transition: 'opacity 0.15s, box-shadow 0.15s',
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>

          {/* Sign in / Create account toggle */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            {isSignIn ? (
              <>
                <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.35)' }}>New here? </span>
                <button
                  onClick={() => setIsSignIn(false)}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: 13, color: ACCENT, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.35)' }}>Already have an account? </span>
                <button
                  onClick={() => setIsSignIn(true)}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: 13, color: ACCENT, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          {/* Trust indicators */}
          <div style={{
            borderRadius: 10,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: '14px 16px',
            display: 'flex', gap: 20, justifyContent: 'center',
            marginBottom: 20,
          }}>
            {([
              { icon: <LockKeyhole size={13} strokeWidth={2} color="rgba(232,232,240,0.45)" />, label: 'No password' },
              { icon: <Zap size={13} strokeWidth={2} color="rgba(232,232,240,0.45)" />, label: 'Instant setup' },
              { icon: <Star size={13} strokeWidth={2} color="rgba(232,232,240,0.45)" />, label: 'Free plan' },
            ] as { icon: ReactNode; label: string }[]).map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {icon}
                <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.38)', fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Terms */}
          <p style={{
            textAlign: 'center', fontSize: 11.5,
            color: 'rgba(232,232,240,0.22)', lineHeight: 1.6, margin: 0,
          }}>
            By continuing, you agree to our{' '}
            <a href="/terms" style={{ color: 'rgba(232,232,240,0.4)', textDecoration: 'underline' }}>Terms</a>
            {' '}and{' '}
            <a href="/privacy" style={{ color: 'rgba(232,232,240,0.4)', textDecoration: 'underline' }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .signin-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
