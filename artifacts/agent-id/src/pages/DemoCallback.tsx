/**
 * /demo/callback
 *
 * Receives the OAuth authorization code after the agent grants consent.
 * Exchanges it for a token (real PKCE flow), then displays the agent's
 * verified identity — exactly what a third-party app would receive.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSEO } from '@/lib/useSEO';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

interface AgentIdentity {
  agentId: string;
  handle?: string | null;
  displayName?: string;
  trustScore?: number;
  trustTier?: string;
  did?: string;
  capabilities?: string[];
  scopes?: string[];
}

const TIER_COLORS: Record<string, string> = {
  elite:      '#c084fc',
  trusted:    '#60a5fa',
  verified:   '#34d399',
  basic:      '#94a3b8',
  unverified: '#64748b',
};

export function DemoCallback() {
  useSEO({ title: 'Agent Authenticated — Agent ID Demo' });

  const [params]  = useSearchParams();
  const code      = params.get('code');
  const state     = params.get('state');
  const error     = params.get('error');

  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [agent, setAgent]   = useState<AgentIdentity | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    if (error) {
      setStatus('error');
      setErrMsg(params.get('error_description') || error);
      return;
    }
    if (!code) {
      setStatus('error');
      setErrMsg('No authorization code received.');
      return;
    }

    const storedVerifier = sessionStorage.getItem('demo_code_verifier');
    const storedState    = sessionStorage.getItem('demo_state');

    if (storedState && state && storedState !== state) {
      setStatus('error');
      setErrMsg('State mismatch — possible CSRF. Please try again.');
      return;
    }

    exchange(code, storedVerifier ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exchange(code: string, codeVerifier: string) {
    try {
      const callbackUri = window.location.origin + '/demo/callback';

      const body = new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     'agclient_demo',
        redirect_uri:  callbackUri,
        code_verifier: codeVerifier,
      });

      const tokenRes = await fetch('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        const j = await tokenRes.json().catch(() => ({}));
        throw new Error(j.error_description || j.error || 'Token exchange failed');
      }

      const tokenData = await tokenRes.json();
      const token     = tokenData.access_token as string;
      setAccessToken(token);

      // Use the token to fetch the agent's info
      const meRes = await fetch(`${API_BASE}/agents/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (meRes.ok) {
        const me = await meRes.json();
        setAgent({
          agentId:     me.id ?? me.agentId,
          handle:      me.handle,
          displayName: me.displayName,
          trustScore:  me.trustScore,
          trustTier:   me.trustTier,
          did:         me.did ?? `did:web:getagent.id:agents:${me.id ?? me.agentId}`,
          capabilities: me.capabilities ?? [],
          scopes:       tokenData.scope?.split(' ') ?? ['read', 'agents:read'],
        });
      } else {
        // Fallback: parse agent info from the token response if available
        setAgent({
          agentId:  tokenData.sub ?? tokenData.agent_id ?? 'unknown',
          did:      `did:web:getagent.id:agents:${tokenData.sub ?? 'unknown'}`,
          trustTier: 'verified',
          scopes:   tokenData.scope?.split(' ') ?? ['read', 'agents:read'],
        });
      }

      sessionStorage.removeItem('demo_code_verifier');
      sessionStorage.removeItem('demo_state');
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (status === 'exchanging') {
    return (
      <div style={center}>
        <div style={spinnerStyle} />
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 20 }}>
          Exchanging authorization code for access token…
        </p>
        <p style={{ color: 'rgba(79,125,243,0.7)', fontSize: 12, marginTop: 8, fontFamily: 'monospace' }}>
          POST /oauth/token · grant_type=authorization_code · PKCE S256
        </p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div style={center}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Authorization failed</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 }}>{errMsg}</p>
        <Link to="/demo" style={{ color: '#4f7df3', fontSize: 14 }}>← Try again</Link>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  const tier      = agent?.trustTier ?? 'verified';
  const tierColor = TIER_COLORS[tier] ?? '#94a3b8';

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

      {/* Success pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(52,211,153,0.08)',
        border: '1px solid rgba(52,211,153,0.2)',
        borderRadius: 20, padding: '6px 14px',
        fontSize: 12, color: 'rgba(52,211,153,0.9)',
        marginBottom: 32, letterSpacing: '0.04em',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="#34d399" strokeWidth="1.2"/>
          <path d="M3.5 6l2 2 3-3" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        AGENT AUTHENTICATED
      </div>

      {/* Identity card — what the third-party app receives */}
      <div style={{
        maxWidth: 500, width: '100%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, overflow: 'hidden',
      }}>

        {/* Card header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Acme Corp AI Platform</div>
            <div style={{ fontSize: 12, color: 'rgba(52,211,153,0.8)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
              Agent identity verified
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="url(#cb-grad)"/>
              <defs>
                <linearGradient id="cb-grad" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#4f7df3"/>
                  <stop offset="100%" stopColor="#7c5cf6"/>
                </linearGradient>
              </defs>
              <path d="M12 4L5 7v5c0 4.4 3 8.4 7 9.4 4-1 7-5 7-9.4V7L12 4z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2"/>
              <path d="M9 12l2.5 2.5 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Identity fields */}
        <div style={{ padding: '20px 24px' }}>
          {agent?.handle && (
            <Row label="Handle" value={`@${agent.handle}`} mono />
          )}
          {agent?.displayName && (
            <Row label="Display name" value={agent.displayName} />
          )}
          <Row label="Agent ID" value={agent?.agentId ?? ''} mono truncate />
          <Row label="DID" value={agent?.did ?? ''} mono truncate />

          {/* Trust tier */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Trust tier</span>
            <span style={{
              fontSize: 12, fontWeight: 600, color: tierColor,
              background: `${tierColor}15`,
              border: `1px solid ${tierColor}30`,
              borderRadius: 6, padding: '2px 10px',
              textTransform: 'capitalize',
            }}>
              {tier}
              {agent?.trustScore !== undefined && ` · ${agent.trustScore}`}
            </span>
          </div>

          {/* Scopes granted */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>Scopes granted</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(agent?.scopes ?? ['read', 'agents:read']).map(s => (
                <span key={s} style={{
                  fontSize: 11, fontFamily: 'monospace',
                  background: 'rgba(79,125,243,0.1)',
                  border: '1px solid rgba(79,125,243,0.2)',
                  borderRadius: 5, padding: '2px 8px',
                  color: 'rgba(79,125,243,0.9)',
                }}>{s}</span>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          {(agent?.capabilities ?? []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>Capabilities</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(agent?.capabilities ?? []).slice(0, 6).map(c => (
                  <span key={c} style={{
                    fontSize: 11,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 5, padding: '2px 8px',
                    color: 'rgba(255,255,255,0.6)',
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Access token preview */}
          {accessToken && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, padding: '10px 14px', marginTop: 8,
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Access Token (real JWT)
              </div>
              <div style={{
                fontSize: 10, fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.35)',
                wordBreak: 'break-all', lineHeight: 1.5,
              }}>
                {accessToken.slice(0, 60)}…
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <Link to="/demo" style={{
            flex: 1, textAlign: 'center',
            padding: '9px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none', fontWeight: 500,
          }}>
            ← Try again
          </Link>
          <a href="/docs/sign-in" style={{
            flex: 1, textAlign: 'center',
            padding: '9px 0',
            background: 'rgba(79,125,243,0.12)',
            border: '1px solid rgba(79,125,243,0.3)',
            borderRadius: 10, fontSize: 13, color: 'rgba(79,125,243,0.9)',
            textDecoration: 'none', fontWeight: 600,
          }}>
            Integrate into your app →
          </a>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        This is the real OAuth flow — PKCE, real tokens, real agent identity.
      </p>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function Row({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 12 }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12,
        fontFamily: mono ? 'monospace' : undefined,
        color: 'rgba(255,255,255,0.75)',
        ...(truncate ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 } : {}),
      }}>
        {value}
      </span>
    </div>
  );
}

const center: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-body)',
};

const spinnerStyle: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: '50%',
  border: '2px solid rgba(79,125,243,0.2)',
  borderTopColor: '#4f7df3',
  animation: 'spin 0.8s linear infinite',
};

export default DemoCallback;
