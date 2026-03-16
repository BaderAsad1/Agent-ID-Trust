import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, Shield, Users, Bot, CheckCircle } from 'lucide-react';
import { Footer } from '@/components/Footer';

interface OrgAgent {
  agentId: string;
  handle: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  status: string;
  trustScore: number;
  verificationStatus: string;
  capabilities: string[];
}

interface OrgData {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
  namespace: string;
  agentCount: number;
  agents: OrgAgent[];
  memberCount: number;
}

const BASE = `${import.meta.env.BASE_URL}api/v1`.replace(/\/\//g, '/');

export function OrgProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/org/${slug}`);
      if (!res.ok) throw new Error('Organization not found');
      const data = await res.json();
      setOrg(data);
    } catch {
      setError(`No organization with slug "${slug}" exists.`);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  if (loading) return (
    <div style={{ background: '#050711', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(79,125,243,0.2)', borderTopColor: '#4f7df3', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (error) return (
    <div className="pt-16" style={{ background: '#050711', minHeight: '100vh' }}>
      <div className="max-w-[600px] mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(239,68,68,0.6)' }} />
        <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 24, fontWeight: 700, color: '#e8e8f0', marginBottom: 8 }}>Organization not found</h3>
        <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.4)', marginBottom: 24 }}>{error}</p>
        <button onClick={fetchOrg} style={{
          padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(232,232,240,0.6)',
          fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}><RefreshCw size={14} /> Retry</button>
      </div>
      <Footer />
    </div>
  );

  if (!org) return null;

  return (
    <div style={{ background: '#050711', minHeight: '100vh', color: '#e8e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: '100px 24px 60px', textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(79,125,243,0.08) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            {org.avatarUrl ? (
              <img src={org.avatarUrl} alt={org.displayName} style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', border: '2px solid rgba(79,125,243,0.3)' }} />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(79,125,243,0.3), rgba(124,91,245,0.3))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(79,125,243,0.3)',
              }}>
                <Shield size={36} style={{ color: 'rgba(232,232,240,0.6)' }} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <h1 style={{
              fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 36, fontWeight: 700,
              letterSpacing: '-0.02em',
            }}>{org.displayName}</h1>
            {org.isVerified && (
              <CheckCircle size={24} style={{ color: '#34d399' }} />
            )}
          </div>

          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
            color: 'rgba(79,125,243,0.8)', marginBottom: 16,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(79,125,243,0.08)', padding: '6px 14px', borderRadius: 8,
            border: '1px solid rgba(79,125,243,0.15)',
          }}>
            <Shield size={14} />
            {org.namespace}
          </div>

          {org.description && (
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(232,232,240,0.5)', maxWidth: 600, margin: '0 auto 24px' }}>
              {org.description}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, color: '#e8e8f0' }}>{org.agentCount}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.3)', textTransform: 'uppercase' }}>Agents</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, color: '#e8e8f0' }}>{org.memberCount}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.3)', textTransform: 'uppercase' }}>Members</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'rgba(232,232,240,0.25)', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Bot size={14} />
          <span>MEMBER AGENTS</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
        </div>

        {org.agents.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Bot size={32} style={{ color: 'rgba(232,232,240,0.15)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.3)' }}>No agents in this organization yet.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {org.agents.map((agent) => (
              <div
                key={agent.agentId}
                onClick={() => navigate(`/${agent.handle}`)}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16, padding: 24, cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(79,125,243,0.3)';
                  e.currentTarget.style.background = 'rgba(79,125,243,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {agent.avatarUrl ? (
                    <img src={agent.avatarUrl} alt={agent.displayName} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Bot size={20} style={{ color: 'rgba(255,255,255,0.8)' }} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 16, fontWeight: 600, color: '#e8e8f0' }}>
                      {agent.displayName}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'rgba(232,232,240,0.35)' }}>
                      {agent.handle}.agentid
                    </div>
                  </div>
                </div>

                {agent.description && (
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(232,232,240,0.4)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {agent.description}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {agent.verificationStatus === 'verified' && (
                      <CheckCircle size={12} style={{ color: '#34d399' }} />
                    )}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#34d399' }}>
                      Trust {agent.trustScore}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(agent.capabilities || []).slice(0, 3).map((cap) => (
                      <span key={cap} style={{
                        fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                        color: 'rgba(232,232,240,0.4)', background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px',
                      }}>{cap}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
