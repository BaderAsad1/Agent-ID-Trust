import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const BASE = import.meta.env.BASE_URL || '/';

const SCOPE_LABELS: Record<string, { label: string; desc: string }> = {
  'read':          { label: 'Read access',      desc: 'View your agent profile and public data' },
  'write':         { label: 'Write access',     desc: 'Update your agent profile and settings' },
  'agents:read':   { label: 'View agents',      desc: 'Read your registered agents' },
  'agents:write':  { label: 'Manage agents',    desc: 'Create and update agents on your behalf' },
  'tasks:read':    { label: 'View tasks',       desc: 'See your agent tasks and results' },
  'tasks:write':   { label: 'Run tasks',        desc: 'Create and execute agent tasks' },
  'mail:read':     { label: 'Read mail',        desc: 'Access your agent inbox' },
  'mail:write':    { label: 'Send mail',        desc: 'Send messages as your agent' },
};

export function Authorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, agents, loading } = useAuth();

  const clientId   = params.get('client_id') || '';
  const clientName = params.get('client_name') || clientId || 'Unknown App';
  const scopeStr   = params.get('scopes') || params.get('scope') || 'read';
  const scopes     = scopeStr.split(' ').filter(Boolean);
  const state      = params.get('state') || '';
  const redirectUri      = params.get('redirect_uri') || '';
  const codeChallenge    = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256';
  const preselectedAgentId = params.get('agent_id') || '';

  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgentId);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = window.location.pathname + window.location.search;
      navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  if (loading || !user) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!clientId || !redirectUri) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
        <div style={{ textAlign: 'center', maxWidth: 380, padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Invalid Authorization Request</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>This authorization link is missing required parameters. Please contact the application developer.</p>
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

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .authorize-card { animation: fadeUp 0.3s ease both; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: '24px 16px',
      }}>
        <div className="authorize-card" style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          padding: '40px 36px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(79,125,243,0.15)',
                border: '1px solid rgba(79,125,243,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>🔗</div>
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.15)', fontWeight: 300 }}>×</div>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <img src={`${BASE}app-icon.png`} alt="Agent ID" style={{ width: 32, height: 32, borderRadius: 6 }} />
              </div>
            </div>

            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
              Authorize <span style={{ color: 'var(--accent)' }}>{clientName}</span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              This app wants to act on behalf of one of your agents
            </p>
          </div>

          {scopes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                Permissions requested
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scopes.map(scope => {
                  const info = SCOPE_LABELS[scope] || { label: scope, desc: '' };
                  return (
                    <div key={scope} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 10,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{info.label}</div>
                        {info.desc && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{info.desc}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Authorizing as
            </p>
            {agents.length === 0 ? (
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
                  You have no registered agents.{' '}
                  <button onClick={() => navigate('/dashboard')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    Register one first
                  </button>
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      background: selectedAgentId === agent.id ? 'rgba(79,125,243,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedAgentId === agent.id ? 'rgba(79,125,243,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      width: '100%',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: selectedAgentId === agent.id ? 'rgba(79,125,243,0.2)' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, flexShrink: 0,
                    }}>
                      {agent.displayName?.[0]?.toUpperCase() || agent.handle?.[0]?.toUpperCase() || '🤖'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {agent.displayName || agent.handle}
                      </div>
                      {agent.handle && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{agent.handle}</div>
                      )}
                    </div>
                    {selectedAgentId === agent.id && (
                      <div style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={approve}
              disabled={approving || agents.length === 0}
              style={{
                width: '100%', padding: '13px 0',
                background: approving ? 'rgba(79,125,243,0.4)' : 'rgba(79,125,243,0.9)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: approving || agents.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'all 0.15s ease',
              }}
            >
              {approving ? 'Authorizing…' : `Authorize as ${selectedAgent?.displayName || selectedAgent?.handle || 'Agent'}`}
            </button>

            <button
              onClick={deny}
              disabled={approving}
              style={{
                width: '100%', padding: '12px 0',
                background: 'transparent',
                color: 'var(--text-dim)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'all 0.15s ease',
              }}
            >
              Cancel
            </button>
          </div>

          <p style={{ marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6 }}>
            Authorizing will allow <strong style={{ color: 'rgba(255,255,255,0.35)' }}>{clientName}</strong> to act as your selected agent within the requested permissions.
          </p>
        </div>
      </div>
    </>
  );
}
