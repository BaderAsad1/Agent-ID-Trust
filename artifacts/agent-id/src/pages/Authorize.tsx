import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const BASE = import.meta.env.BASE_URL || '/';

const SCOPE_META: Record<string, { label: string; desc: string; icon: string; risk: 'low' | 'medium' | 'high' }> = {
  'read':          { label: 'Read profile',    desc: 'View your agent profile and public data', icon: '○', risk: 'low' },
  'write':         { label: 'Update profile',  desc: 'Modify your agent profile and settings', icon: '✎', risk: 'medium' },
  'agents:read':   { label: 'View agents',     desc: 'Read your registered agent list', icon: '○', risk: 'low' },
  'agents:write':  { label: 'Manage agents',   desc: 'Create and update agents on your behalf', icon: '✎', risk: 'high' },
  'tasks:read':    { label: 'View tasks',      desc: 'See your agent tasks and results', icon: '○', risk: 'low' },
  'tasks:write':   { label: 'Run tasks',       desc: 'Create and execute agent tasks', icon: '✎', risk: 'medium' },
  'mail:read':     { label: 'Read mail',       desc: 'Access your agent inbox messages', icon: '○', risk: 'low' },
  'mail:write':    { label: 'Send mail',       desc: 'Send messages as your agent', icon: '✎', risk: 'medium' },
};

const TRUST_COLORS: Record<string, string> = {
  elite: '#c084fc',
  trusted: '#60a5fa',
  verified: '#34d399',
  basic: '#94a3b8',
  unverified: '#64748b',
};

const TRUST_LABELS: Record<string, string> = {
  elite: 'Elite',
  trusted: 'Trusted',
  verified: 'Verified',
  basic: 'Basic',
  unverified: 'Unverified',
};

export function Authorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, agents, loading } = useAuth();

  const clientId            = params.get('client_id') || '';
  const clientName          = params.get('client_name') || clientId || 'Unknown App';
  const scopeStr            = params.get('scopes') || params.get('scope') || 'read';
  const scopes              = scopeStr.split(' ').filter(Boolean);
  const state               = params.get('state') || '';
  const redirectUri         = params.get('redirect_uri') || '';
  const codeChallenge       = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256';
  const preselectedAgentId  = params.get('agent_id') || '';

  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgentId);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      // Use router-relative path (no basename prefix) so returnTo navigates correctly after sign-in
      const returnTo = location.pathname + location.search;
      navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [loading, user, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  if (loading || !user) {
    return (
      <div style={fullscreenCenter}>
        <div style={spinner} />
      </div>
    );
  }

  if (!clientId || !redirectUri) {
    return (
      <div style={fullscreenCenter}>
        <div style={{ textAlign: 'center', maxWidth: 380, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.4 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-display)' }}>Invalid Request</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.6 }}>
            This authorization link is missing required parameters. Please contact the app developer.
          </p>
        </div>
      </div>
    );
  }

  function deny() {
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'The user denied access');
    if (state) url.searchParams.set('state', state);
    window.location.href = url.toString();
  }

  async function approve() {
    if (!selectedAgentId) {
      setError('Please select an agent to authorize.');
      return;
    }
    setApproving(true);
    setError('');
    try {
      const endpoint = `${BASE}api/oauth/authorize/approve`.replace(/\/\//g, '/');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: clientId,
          agent_id: selectedAgentId,
          redirect_uri: redirectUri,
          scope: scopeStr,
          state,
          code_challenge: codeChallenge || undefined,
          code_challenge_method: codeChallenge ? codeChallengeMethod : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Authorization failed. Please try again.');
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setApproving(false);
    }
  }

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const highRiskScopes = scopes.filter(s => SCOPE_META[s]?.risk === 'high');
  const hasHighRisk = highRiskScopes.length > 0;

  let redirectDomain = '';
  try { redirectDomain = new URL(redirectUri).hostname; } catch { redirectDomain = redirectUri; }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .auth-card { animation: fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .agent-row { transition: border-color 0.15s, background 0.15s; }
        .agent-row:hover { border-color: rgba(79,125,243,0.25) !important; background: rgba(79,125,243,0.06) !important; }
        .btn-approve:hover:not(:disabled) { background: rgba(79,125,243,1) !important; box-shadow: 0 0 24px rgba(79,125,243,0.35); }
        .btn-deny:hover:not(:disabled) { background: rgba(255,255,255,0.05) !important; border-color: rgba(255,255,255,0.16) !important; }
      `}</style>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '24px 16px', position: 'relative' }}>
        {/* Subtle background glow */}
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse at center, rgba(79,125,243,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Header brand bar */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(79,125,243,0.15)', border: '1px solid rgba(79,125,243,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`${BASE}app-icon.png`} alt="Agent ID" style={{ width: 18, height: 18, borderRadius: 4 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.01em', fontFamily: 'var(--font-display)' }}>
            agent<span style={{ color: 'rgba(79,125,243,0.9)' }}>ID</span>
          </span>
        </div>

        <div className="auth-card" style={{ width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' }}>

          {/* Top section — app connector */}
          <div style={{ padding: '36px 36px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            {/* App icon + connecting dots + Agent ID icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 24 }}>
              {/* Third-party app icon placeholder */}
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {clientName[0]?.toUpperCase() || '?'}
              </div>

              {/* Connecting line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingInline: 12 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: `rgba(79,125,243,${0.2 + i * 0.2})`, animation: `pulse 1.6s ${i * 0.15}s infinite` }} />
                ))}
              </div>

              {/* Agent ID icon */}
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(79,125,243,0.12)', border: '1px solid rgba(79,125,243,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src={`${BASE}app-icon.png`} alt="Agent ID" style={{ width: 32, height: 32, borderRadius: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6, fontFamily: 'var(--font-display)', letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>{clientName}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}> wants access</span>
                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 4, marginLeft: 6, verticalAlign: 'middle', letterSpacing: '0.04em' }}>BETA</span>
              </h1>
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.55 }}>
                This app will act on behalf of your selected agent on{' '}
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{redirectDomain}</span>
              </p>
            </div>
          </div>

          {/* Scopes */}
          <div style={{ padding: '24px 36px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={sectionLabel}>Permissions requested</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {scopes.length === 0 ? (
                <div style={scopeRow}>
                  <div style={scopeDot('#94a3b8')} />
                  <div>
                    <div style={scopeTitle}>Basic read access</div>
                    <div style={scopeDesc}>View public agent profile data</div>
                  </div>
                </div>
              ) : scopes.map(scope => {
                const meta = SCOPE_META[scope] || { label: scope, desc: '', icon: '○', risk: 'low' as const };
                const dotColor = meta.risk === 'high' ? '#f97316' : meta.risk === 'medium' ? '#facc15' : '#34d399';
                return (
                  <div key={scope} style={scopeRow}>
                    <div style={scopeDot(dotColor)} />
                    <div>
                      <div style={scopeTitle}>{meta.label}</div>
                      {meta.desc && <div style={scopeDesc}>{meta.desc}</div>}
                    </div>
                    {meta.risk === 'high' && (
                      <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                        SENSITIVE
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {hasHighRisk && (
              <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 8, fontSize: 11.5, color: 'rgba(249,115,22,0.8)', lineHeight: 1.5 }}>
                This app is requesting sensitive permissions. Only authorize if you trust <strong>{clientName}</strong>.
              </div>
            )}
          </div>

          {/* Agent selector */}
          <div style={{ padding: '24px 36px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={sectionLabel}>Authorizing as</p>
            {agents.length === 0 ? (
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>You have no registered agents.</p>
                <button onClick={() => navigate('/dashboard')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Register one first →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {agents.map(agent => {
                  const isSelected = selectedAgentId === agent.id;
                  const tierColor = TRUST_COLORS[(agent as unknown as Record<string,unknown>).trustTier as string] || '#64748b';
                  const tierLabel = TRUST_LABELS[(agent as unknown as Record<string,unknown>).trustTier as string] || '';
                  return (
                    <button
                      key={agent.id}
                      className="agent-row"
                      onClick={() => setSelectedAgentId(agent.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 13px',
                        background: isSelected ? 'rgba(79,125,243,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(79,125,243,0.4)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 11,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: isSelected ? 'rgba(79,125,243,0.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: isSelected ? '#7da5f5' : 'rgba(255,255,255,0.5)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                        {agent.displayName?.[0]?.toUpperCase() || agent.handle?.[0]?.toUpperCase() || '?'}
                      </div>

                      {/* Name + handle */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                          {agent.displayName || agent.handle}
                        </div>
                        {agent.handle && (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                            @{agent.handle}.agentid
                          </div>
                        )}
                      </div>

                      {/* Trust tier badge */}
                      {tierLabel && (
                        <div style={{ fontSize: 10, fontWeight: 600, color: tierColor, background: `${tierColor}18`, border: `1px solid ${tierColor}30`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                          {tierLabel.toUpperCase()}
                        </div>
                      )}

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(79,125,243,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: tierLabel ? 6 : 'auto' }}>
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: '24px 36px 28px' }}>
            {error && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn-approve"
                onClick={approve}
                disabled={approving || agents.length === 0}
                style={{
                  width: '100%', padding: '13px 0',
                  background: 'rgba(79,125,243,0.85)',
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontSize: 14, fontWeight: 600, cursor: approving || agents.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-body)', transition: 'all 0.2s ease',
                  opacity: approving || agents.length === 0 ? 0.5 : 1,
                }}
              >
                {approving ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ ...spinner, width: 14, height: 14, borderWidth: 2 }} />
                    Authorizing…
                  </span>
                ) : (
                  `Authorize as ${selectedAgent?.displayName || selectedAgent?.handle || 'selected agent'}`
                )}
              </button>

              <button
                className="btn-deny"
                onClick={deny}
                disabled={approving}
                style={{
                  width: '100%', padding: '12px 0',
                  background: 'transparent', color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'var(--font-body)', transition: 'all 0.15s ease',
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6 }}>
                Secured by <strong style={{ color: 'rgba(79,125,243,0.5)' }}>Agent ID</strong> · You can revoke access at any time from your dashboard
              </p>
            </div>
          </div>
        </div>

        {/* Bottom link */}
        <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          Not you?{' '}
          <button onClick={() => navigate('/sign-in')} style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
            Sign in with a different account
          </button>
        </div>
      </div>
    </>
  );
}

const fullscreenCenter: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
};

const spinner: React.CSSProperties = {
  width: 24, height: 24,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: 'rgba(79,125,243,0.9)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  display: 'inline-block',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.25)',
  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10,
};

const scopeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 9,
};

function scopeDot(color: string): React.CSSProperties {
  return { width: 7, height: 7, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 };
}

const scopeTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 };
const scopeDesc: React.CSSProperties = { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 2, lineHeight: 1.4 };
