/**
 * /demo  — "Acme Corp AI Assistant"
 *
 * A live mock third-party app that demonstrates the full
 * "Sign in with Agent ID" OAuth flow end-to-end.
 * Real PKCE flow → real consent screen → real agent identity.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildAgentIDAuthUrl } from '@/components/SignInWithAgentID';
import { useAuth } from '@/lib/AuthContext';
import { useSEO } from '@/lib/useSEO';

const DEMO_CLIENT_ID  = 'agclient_demo';
const CALLBACK_PATH   = '/demo/callback';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function randomBase64Url(byteCount: number) {
  const arr = new Uint8Array(byteCount);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Base64Url(plain: string) {
  const encoded = new TextEncoder().encode(plain);
  const digest  = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DemoApp() {
  useSEO({
    title: 'Live Demo — Sign in with Agent ID',
    description: 'See how AI agents authenticate with verifiable identity. Real OAuth flow, real trust scores, real DIDs.',
  });

  const { user } = useAuth();
  const navigate  = useNavigate();
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState<'idle' | 'pkce' | 'redirect'>('idle');

  // If user just came back from a callback with code → show callback page
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('code')) navigate('/demo/callback' + window.location.search, { replace: true });
  }, [navigate]);

  async function startOAuth() {
    setStarting(true);
    setStep('pkce');
    const codeVerifier  = randomBase64Url(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state         = randomBase64Url(16);

    sessionStorage.setItem('demo_code_verifier', codeVerifier);
    sessionStorage.setItem('demo_state',          state);

    setStep('redirect');

    const callbackUri = window.location.origin + CALLBACK_PATH;
    const authUrl = buildAgentIDAuthUrl({
      clientId:            DEMO_CLIENT_ID,
      redirectUri:         callbackUri,
      scopes:              ['read', 'agents:read'],
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    window.location.href = authUrl;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'var(--font-body)',
    }}>

      {/* Explanation pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(79,125,243,0.08)',
        border: '1px solid rgba(79,125,243,0.2)',
        borderRadius: 20, padding: '6px 14px',
        fontSize: 12, color: 'rgba(79,125,243,0.9)',
        marginBottom: 32, letterSpacing: '0.04em',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f7df3', display: 'inline-block' }} />
        LIVE INTERACTIVE DEMO
      </div>

      {/* Two-panel layout */}
      <div style={{
        display: 'flex', gap: 48, alignItems: 'flex-start',
        maxWidth: 900, width: '100%',
        flexWrap: 'wrap', justifyContent: 'center',
      }}>

        {/* Left: the mock "Acme Corp" app */}
        <div style={{
          flex: '1 1 360px', maxWidth: 420,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, overflow: 'hidden',
        }}>
          {/* Fake browser chrome */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#ff5f57','#febc2e','#28c840'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <div style={{
              flex: 1, background: 'rgba(255,255,255,0.06)',
              borderRadius: 6, padding: '3px 10px',
              fontSize: 11, color: 'rgba(255,255,255,0.35)',
              fontFamily: 'monospace',
            }}>
              app.acmecorp.ai/dashboard
            </div>
          </div>

          {/* App content */}
          <div style={{ padding: 32 }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>⚡</div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>
                Acme Corp AI
              </span>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
              Connect your AI agent
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 28, lineHeight: 1.6 }}>
              Sign in with your verified Agent ID to access the platform.
              Your agent's trust score and capabilities are automatically verified.
            </p>

            {/* Feature list */}
            {[
              'Verified identity — no fake agents',
              'Trust score checked automatically',
              'Scoped access — only what you grant',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{f}</span>
              </div>
            ))}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />

            {/* The real button */}
            <button
              onClick={startOAuth}
              disabled={starting}
              style={{
                width: '100%', height: 48,
                background: starting ? 'rgba(79,125,243,0.3)' : 'rgba(15,18,30,0.95)',
                border: '1px solid rgba(79,125,243,0.4)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: starting ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease',
                color: '#fff',
                fontSize: 14, fontWeight: 600,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {/* AgentID mark */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="url(#demo-grad)"/>
                <defs>
                  <linearGradient id="demo-grad" x1="0" y1="0" x2="24" y2="24">
                    <stop offset="0%" stopColor="#4f7df3"/>
                    <stop offset="100%" stopColor="#7c5cf6"/>
                  </linearGradient>
                </defs>
                <path d="M12 4L5 7v5c0 4.4 3 8.4 7 9.4 4-1 7-5 7-9.4V7L12 4z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2"/>
                <path d="M9 12l2.5 2.5 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ width: 1, height: 22, background: 'rgba(79,125,243,0.4)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{starting ? step === 'pkce' ? 'Generating PKCE...' : 'Redirecting...' : 'Sign in with Agent ID'}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>Powered by getagent.id</span>
              </div>
            </button>

            {!user && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 14 }}>
                You'll be asked to sign in to Agent ID first
              </p>
            )}
          </div>
        </div>

        {/* Right: what's happening explanation */}
        <div style={{ flex: '1 1 300px', maxWidth: 360 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 20, fontFamily: 'var(--font-display)' }}>
            What's happening under the hood
          </h3>

          {[
            {
              n: '1', title: 'PKCE challenge generated',
              desc: 'A cryptographic code_verifier + SHA-256 challenge is generated in your browser — no secrets sent over the wire.',
              color: '#4f7df3',
            },
            {
              n: '2', title: 'OAuth consent screen',
              desc: 'Your agent selects which of their agents to authorize. They see exactly what scopes the app is requesting.',
              color: '#7c5cf6',
            },
            {
              n: '3', title: 'Authorization code issued',
              desc: 'A one-time code is returned to this app. It\'s tied to the PKCE verifier — unusable by anyone who intercepts it.',
              color: '#34d399',
            },
            {
              n: '4', title: 'Token exchange + identity',
              desc: 'The code is exchanged for an access token. The app now knows the agent\'s DID, trust score, handle, and capabilities.',
              color: '#fbbf24',
            },
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: `${step.color}18`,
                border: `1px solid ${step.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: step.color,
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>{step.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </div>
          ))}

          <div style={{
            background: 'rgba(79,125,243,0.06)',
            border: '1px solid rgba(79,125,243,0.15)',
            borderRadius: 12, padding: '12px 16px',
            marginTop: 8,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Protocol</div>
            <div style={{ fontSize: 12, color: 'rgba(79,125,243,0.9)', fontFamily: 'monospace', lineHeight: 1.7 }}>
              OAuth 2.0 + PKCE (RFC 7636)<br/>
              client_id: agclient_demo<br/>
              scope: read agents:read<br/>
              grant: authorization_code
            </div>
          </div>
        </div>
      </div>

      {/* Footer link */}
      <div style={{ marginTop: 48, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        This demo uses the real Agent ID OAuth infrastructure.{' '}
        <a href="/docs/sign-in" style={{ color: 'rgba(79,125,243,0.7)', textDecoration: 'none' }}>
          Integrate into your app →
        </a>
      </div>
    </div>
  );
}

export default DemoApp;
