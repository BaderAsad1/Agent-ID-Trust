import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function WaitlistGate({ children }: { children: React.ReactNode }) {
  const enabled = import.meta.env.VITE_WAITLIST_ENABLED === 'true';

  if (!enabled) return <>{children}</>;

  return <WaitlistScreen />;
}

function WaitlistScreen() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dots, setDots] = useState('');

  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(iv);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === 'submitting') return;

    setState('submitting');
    try {
      const res = await fetch(`${API_BASE}/api/v1/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'waitlist_gate' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setState('success');
        setMessage(data.message || "You're on the list.");
      } else {
        setState('error');
        setMessage(data.message || 'Something went wrong. Try again.');
      }
    } catch {
      setState('error');
      setMessage('Connection failed. Try again.');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#050711',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,125,243,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '20%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Noise overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        backgroundSize: '200px 200px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 520, width: '100%', padding: '0 24px',
        textAlign: 'center',
      }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: -32 }}>
          <img
            src={`${import.meta.env.BASE_URL}app-icon.png`}
            alt="Agent ID"
            style={{ width: 140, height: 140, objectFit: 'contain' }}
          />
        </div>

        {/* Agent ID wordmark */}
        <div style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 15, fontWeight: 700, letterSpacing: '0.12em',
          color: 'rgba(232,232,240,0.5)', textTransform: 'uppercase' as const,
          marginBottom: 40,
        }}>
          Agent ID
        </div>

        {/* Main headline */}
        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 'clamp(32px, 5.5vw, 52px)', fontWeight: 900, lineHeight: 1.05,
          color: '#e8e8f0', margin: '0 0 20px',
          letterSpacing: '-0.02em',
        }}>
          The identity layer for
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #4f7df3, #7c9df5, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            autonomous agents
          </span>
        </h1>

        {/* Subline */}
        <p style={{
          fontSize: 'clamp(14px, 2vw, 17px)', lineHeight: 1.7,
          color: '#8690a8', maxWidth: 440, margin: '0 auto 44px',
        }}>
          Verified identity. Portable trust. Machine-native payments.
          <br />
          One protocol address for every agent on the internet.
        </p>

        {state === 'success' ? (
          <div style={{ animation: 'waitlist-fade-in 0.4s ease-out' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
              marginBottom: 20,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#e8e8f0', margin: '0 0 8px', fontFamily: "'Bricolage Grotesque', sans-serif" }}>
              {message}
            </p>
            <p style={{ fontSize: 14, color: '#8690a8', margin: 0 }}>
              We'll reach out when it's your turn.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} style={{
              display: 'flex', gap: 10,
              maxWidth: 440, margin: '0 auto',
            }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
                  style={{
                    width: '100%', padding: '14px 18px',
                    fontSize: 15, fontFamily: "'Inter', sans-serif",
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${state === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 12, color: '#e8e8f0',
                    outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(79,125,243,0.5)'; }}
                  onBlur={e => { e.target.style.borderColor = state === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'; }}
                />
              </div>
              <button
                type="submit"
                disabled={state === 'submitting'}
                style={{
                  padding: '14px 28px', fontSize: 14, fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  background: state === 'submitting'
                    ? 'rgba(79,125,243,0.5)'
                    : 'linear-gradient(135deg, #4f7df3, #6366f1)',
                  color: '#fff', border: 'none', borderRadius: 12,
                  cursor: state === 'submitting' ? 'wait' : 'pointer',
                  transition: 'opacity 0.2s, transform 0.1s',
                  whiteSpace: 'nowrap' as const,
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (state !== 'submitting') (e.target as HTMLButtonElement).style.opacity = '0.9'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
              >
                {state === 'submitting' ? `Joining${dots}` : 'Request access'}
              </button>
            </form>

            {state === 'error' && message && (
              <p style={{ fontSize: 13, color: '#EF4444', marginTop: 12 }}>{message}</p>
            )}
          </>
        )}

        {/* Status line */}
        <div style={{
          marginTop: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
          fontSize: 12, color: 'rgba(134,144,168,0.6)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#34d399', display: 'inline-block',
              boxShadow: '0 0 8px rgba(52,211,153,0.4)',
            }} />
            Building in private
          </span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>Launch 2026</span>
        </div>

      </div>

      <style>{`
        @keyframes waitlist-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: rgba(134,144,168,0.5); }
      `}</style>
    </div>
  );
}
