import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExternalLink, Copy, Shield, AlertCircle } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { GlassCard } from '@/components/shared';

interface AgentData {
  id: string;
  handle?: string;
  displayName: string;
  description?: string;
  trustScore?: number;
  trustTier?: string;
  verificationStatus?: string;
  status?: string;
  capabilities?: string[];
  did?: string;
  createdAt?: string;
}

export function AgentUUIDProfile() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    fetch(`${BASE_URL}/api/v1/resolve/id/${agentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          const a = data.agent ?? data;
          setAgent({
            id: a.id ?? agentId,
            handle: a.handle,
            displayName: a.displayName ?? a.display_name ?? agentId,
            description: a.description,
            trustScore: a.trustScore ?? a.trust?.score,
            trustTier: a.trustTier ?? a.trust?.tier,
            verificationStatus: a.verificationStatus ?? a.verification_status,
            status: a.status,
            capabilities: a.capabilities ?? [],
            did: a.did ?? `did:agentid:${agentId}`,
            createdAt: a.createdAt,
          });
        }
      })
      .catch(() => setError("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [agentId, BASE_URL]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <div className="text-sm font-mono" style={{ color: 'var(--text-dim)' }}>Resolving agent identity...</div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
        <div className="max-w-3xl mx-auto px-6 py-20">
          <GlassCard className="!p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--error)' }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Agent Not Found</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              No agent found with UUID: <code className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{agentId}</code>
            </p>
            <button
              onClick={() => navigate('/')}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Go Home
            </button>
          </GlassCard>
        </div>
        <Footer />
      </div>
    );
  }

  const permanentDid = `did:agentid:${agentId}`;
  const handleDid = agent.handle ? `did:agentid:${agent.handle}` : null;
  const APP_URL = window.location.origin;

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-6">
          <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
            UUID Identity Profile
          </div>
          <h1 className="text-3xl font-black mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {agent.displayName}
          </h1>
          {agent.handle && (
            <button
              onClick={() => navigate(`/${agent.handle}`)}
              className="text-sm flex items-center gap-1 mt-1"
              style={{ color: 'var(--accent)' }}
            >
              @{agent.handle} <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <GlassCard className="!p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4" style={{ color: 'var(--success)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Machine Identity (Permanent)</h2>
          </div>

          <div className="space-y-3">
            <IdentityRow
              label="Agent UUID"
              value={agentId!}
              monospace
              onCopy={() => copyToClipboard(agentId!, 'uuid')}
              copied={copied === 'uuid'}
            />
            <IdentityRow
              label="DID (UUID-based)"
              value={permanentDid}
              monospace
              onCopy={() => copyToClipboard(permanentDid, 'did')}
              copied={copied === 'did'}
            />
            <IdentityRow
              label="Resolution URL"
              value={`${APP_URL}/api/v1/resolve/id/${agentId}`}
              monospace
              onCopy={() => copyToClipboard(`${APP_URL}/api/v1/resolve/id/${agentId}`, 'resolve')}
              copied={copied === 'resolve'}
            />
          </div>

          <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(79,125,243,0.06)', color: 'var(--text-dim)', border: '1px solid rgba(79,125,243,0.12)' }}>
            This UUID-based identity is permanent and never expires, regardless of handle status. Always use the UUID for programmatic identity.
          </div>
        </GlassCard>

        {agent.handle && (
          <GlassCard className="!p-6 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 text-center text-xs" style={{ color: 'var(--accent)' }}>@</div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Handle Identity (Alias)</h2>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning, #f59e0b)' }}>Expiring</span>
            </div>

            <div className="space-y-3">
              <IdentityRow
                label="Handle"
                value={`@${agent.handle}`}
                monospace
              />
              {handleDid && (
                <IdentityRow
                  label="DID (handle-based)"
                  value={handleDid}
                  monospace
                  onCopy={() => copyToClipboard(handleDid, 'handleDid')}
                  copied={copied === 'handleDid'}
                />
              )}
            </div>

            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.06)', color: 'var(--text-dim)', border: '1px solid rgba(245,158,11,0.12)' }}>
              This handle is a paid alias — like a domain name or ENS. It expires annually and must be renewed to stay active.
            </div>
          </GlassCard>
        )}

        <GlassCard className="!p-6 mb-4">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Status & Trust</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatusItem label="Status" value={agent.status ?? 'unknown'} />
            <StatusItem label="Verification" value={agent.verificationStatus ?? 'unknown'} />
            <StatusItem label="Trust Score" value={agent.trustScore !== undefined ? `${agent.trustScore}/100` : 'N/A'} />
            <StatusItem label="Trust Tier" value={agent.trustTier ?? 'unknown'} />
          </div>
        </GlassCard>

        {agent.capabilities && agent.capabilities.length > 0 && (
          <GlassCard className="!p-6 mb-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Capabilities</h2>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map(cap => (
                <span key={cap} className="text-xs px-2 py-1 rounded-full font-mono" style={{ background: 'rgba(79,125,243,0.08)', color: 'var(--accent)', border: '1px solid rgba(79,125,243,0.2)' }}>
                  {cap}
                </span>
              ))}
            </div>
          </GlassCard>
        )}

        {agent.handle && (
          <div className="text-center">
            <button
              onClick={() => navigate(`/${agent.handle}`)}
              className="text-sm px-6 py-2 rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              View Handle Profile →
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

function IdentityRow({ label, value, monospace, onCopy, copied }: {
  label: string;
  value: string;
  monospace?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs min-w-32" style={{ color: 'var(--text-dim)' }}>{label}</span>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs truncate" style={{ fontFamily: monospace ? 'var(--font-mono)' : undefined, color: 'var(--text-muted)' }}>
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="flex-shrink-0">
            {copied
              ? <span className="text-xs" style={{ color: 'var(--success)' }}>✓</span>
              : <Copy className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
            }
          </button>
        )}
      </div>
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{label}</div>
      <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
