import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Send, AlertCircle, RefreshCw, ExternalLink, Copy, Star, Clock, Zap, Globe, Activity } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { api, type PublicProfile, type ActivityItem, type ProfileReview } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatPrice } from '@/lib/pricing';
import { getSkillIcon } from '@/lib/skills';






function ProfileCredentialIdenticon() {
  const cells = [[1,0,1,0,1],[0,1,1,1,0],[1,1,0,1,1],[0,1,1,1,0],[1,0,1,0,1]];
  return (
    <div style={{
      width: 64, height: 64, borderRadius: 16,
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 7,
      boxShadow: '0 6px 24px rgba(79,125,243,0.35)',
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{ borderRadius: 2, background: on ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  );
}

function ProfileTrustRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 12px rgba(52,211,153,0.4))' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#34d399" strokeWidth="3.5" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 2s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: size * 0.22, fontWeight: 700, color: '#34d399',
      }}>{score}</span>
    </div>
  );
}

function MachineReadableZone() {
  const bars = Array.from({ length: 42 }, (_, i) => [1, 2, 1, 3, 1, 2, 1][i % 7]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 10, overflow: 'hidden', opacity: 0.15, padding: '0 2px' }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: '100%', background: 'rgba(232,232,240,0.6)', borderRadius: 0.5 }} />
      ))}
    </div>
  );
}


const EVENT_LABELS: Record<string, string> = {
  'agent.created': 'Agent registered',
  'agent.updated': 'Profile updated',
  'agent.deleted': 'Agent deleted',
  'agent.verified': 'Identity verified',
  'agent.verification_failed': 'Verification failed',
  'agent.endpoint_updated': 'Endpoint updated',
  'agent.key_created': 'Key created',
  'agent.key_rotated': 'Key rotated',
  'agent.key_revoked': 'Key revoked',
  'agent.task_received': 'Task received',
  'agent.task_delivered': 'Task delivered',
  'agent.task_acknowledged': 'Task acknowledged',
  'agent.task_completed': 'Task completed',
  'agent.listing_created': 'Marketplace listing created',
  'agent.listing_updated': 'Marketplace listing updated',
  'agent.trust_updated': 'Trust score updated',
  'agent.status_changed': 'Status changed',
  'agent.programmatic_registered': 'Programmatic registration',
  'agent.domain_provisioned': 'Domain provisioned',
  'agent.message_received': 'Mail received',
  'agent.message_sent': 'Mail sent',
  'agent.spawned': 'Sub-agent spawned',
  'agent.handle_transferred': 'Handle transferred',
  'transfer.created': 'Transfer initiated',
  'transfer.handoff_started': 'Handoff started',
  'transfer.handoff_completed': 'Transfer completed',
  'transfer.cancelled': 'Transfer cancelled',
  'transfer.dispute_raised': 'Dispute raised',
  'transfer.hold_funded': 'Hold funded',
  'transfer.readiness_report_generated': 'Readiness report generated',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function ProfileCredentialCard({ agent, trustScore, listings, stats }: { agent: { handle: string; displayName: string; description?: string; capabilities?: string[]; endpointUrl?: string; status: string; verificationStatus?: string; verifiedAt?: string; domainName?: string; domainStatus?: string; createdAt: string; tasksCompleted?: number; metadata?: Record<string, unknown>; isClaimed?: boolean }; trustScore: number; listings?: Array<{ status: string; avgRating?: string }>; stats?: { tasksCompleted: number; avgRating: number | null; uptimePct: number | null } }) {
  return (
    <div style={{
      position: 'relative', width: 520, maxWidth: '92vw', borderRadius: 22,
      border: '1px solid rgba(52,211,153,0.15)',
      background: 'rgba(8, 10, 22, 0.98)', backdropFilter: 'blur(30px)', overflow: 'hidden',
      boxShadow: '0 0 80px rgba(79,125,243,0.08), 0 40px 100px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.3)',
    }}>
      <div style={{
        position: 'absolute', inset: -2, borderRadius: 24, border: '1px solid transparent',
        background: 'linear-gradient(135deg, rgba(52,211,153,0.3), rgba(79,125,243,0.1), rgba(52,211,153,0.3))',
        pointerEvents: 'none',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor',
        padding: 1,
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 22,
        boxShadow: '0 0 60px rgba(52,211,153,0.15), 0 0 120px rgba(52,211,153,0.05), inset 0 0 60px rgba(52,211,153,0.03)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44,
        background: 'linear-gradient(180deg, rgba(52,211,153,0.06), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.5) 30%, rgba(52,211,153,0.6) 50%, rgba(52,211,153,0.5) 70%, transparent 90%)',
        opacity: 0.8,
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: 'linear-gradient(180deg, rgba(52,211,153,0.4), rgba(52,211,153,0.1) 40%, transparent 80%)',
      }} />

      <div style={{ padding: '14px 36px 0' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,232,240,0.2)',
        }}>AGENT IDENTITY CREDENTIAL <span title="W3C Verifiable Credential encoded as a JSON Web Token (JWT). Interoperable with any VC-compatible verifier." style={{ fontSize: 8, color: 'rgba(52,211,153,0.6)', fontWeight: 500, marginLeft: 6, cursor: 'help' }}>W3C VERIFIABLE CREDENTIAL (JWT)</span></div>
      </div>

      <div style={{ padding: '0 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 0' }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: '#34d399',
            boxShadow: '0 0 16px rgba(52,211,153,0.6)',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.16em', color: '#34d399',
          }}>CREDENTIAL ACTIVE</span>
          {agent.isClaimed && (
            <>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', background: '#4f7df3',
                boxShadow: '0 0 16px rgba(79,125,243,0.6)', marginLeft: 12,
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                letterSpacing: '0.16em', color: '#4f7df3',
              }}>HANDLER VERIFIED</span>
            </>
          )}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            color: 'rgba(232,232,240,0.3)', marginLeft: 8,
          }}>TRUST {trustScore}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <ProfileCredentialIdenticon />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 24, fontWeight: 700,
              color: '#e8e8f0', letterSpacing: '-0.02em',
            }}>{agent.displayName}<span style={{ color: '#4f7df3' }}>.AgentID</span></div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              color: 'rgba(232,232,240,0.4)', letterSpacing: '0.01em',
            }}>{agent.domainName || `${agent.handle.toLowerCase()}.getagent.id`}</div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 18, marginBottom: 18,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px',
        }}>
          {[
            { label: 'HANDLE', value: `${agent.displayName}.AgentID` },
            { label: 'STATUS', value: 'Active', isStatus: true },
            { label: 'ISSUED', value: new Date(agent.createdAt).toISOString().split('T')[0] },
            { label: 'SERIAL', value: 'AID-0x7f3a…c91e', dim: true },
          ].map(field => (
            <div key={field.label}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
                letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 4,
              }}>{field.label}</div>
              {'isStatus' in field ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.4)' }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#34d399', fontWeight: 500 }}>{field.value}</span>
                </div>
              ) : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
                  color: 'dim' in field ? 'rgba(232,232,240,0.25)' : 'rgba(232,232,240,0.55)',
                }}>{field.value}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 16, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <ProfileTrustRing score={trustScore} size={64} />
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
              letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 4,
            }}>TRUST LEVEL</div>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 12.5,
              color: 'rgba(232,232,240,0.5)', lineHeight: 1.5,
            }}>{[
              agent.verificationStatus === 'verified' ? 'Verified identity' : 'Unverified',
              stats?.tasksCompleted != null ? `${stats.tasksCompleted} tasks completed` : null,
              stats?.uptimePct != null ? `${stats.uptimePct}% uptime` : null,
            ].filter(Boolean).join(' · ') || 'No activity yet'}</div>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)', padding: '14px 36px 16px',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
          letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 8,
        }}>CAPABILITY ATTESTATIONS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(agent.capabilities || []).map(cap => (
            <span key={cap} style={{
              fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace",
              color: 'rgba(232,232,240,0.5)', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, padding: '3px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ color: '#4f7df3', fontWeight: 700, fontSize: 11 }}>{getSkillIcon(cap)}</span>
              {cap}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)', padding: '12px 36px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 3,
          }}>MARKETPLACE</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'rgba(232,232,240,0.55)' }}>
            {(() => {
              const activeListing = (listings || []).find(l => l.status === 'active');
              if (!activeListing) return 'Not listed';
              const rating = activeListing.avgRating ? parseFloat(activeListing.avgRating) : null;
              return rating ? `Listed · ${rating.toFixed(1)} ★` : 'Listed';
            })()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 600,
            letterSpacing: '0.12em', color: 'rgba(232,232,240,0.2)', marginBottom: 3,
          }}>ROUTING</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#34d399' }}>
            Addressable
          </div>
        </div>
      </div>

      <div style={{
        padding: '8px 36px 12px', borderTop: '1px solid rgba(255,255,255,0.03)',
        opacity: 0.6,
      }}>
        <MachineReadableZone />
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.3) 30%, rgba(52,211,153,0.4) 50%, rgba(52,211,153,0.3) 70%, transparent 90%)',
      }} />
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: 'rgba(232,232,240,0.25)', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function StatCard({ value, label, icon: Icon }: { value: string; label: string; icon: typeof Activity }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 14, padding: '20px 24px', flex: 1, minWidth: 140,
    }}>
      <Icon size={16} style={{ color: 'rgba(79,125,243,0.6)', marginBottom: 10 }} />
      <div style={{
        fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700,
        color: '#e8e8f0', letterSpacing: '-0.02em', marginBottom: 2,
      }}>{value}</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500,
        letterSpacing: '0.08em', color: 'rgba(232,232,240,0.3)', textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  );
}

function TrustBreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'rgba(232,232,240,0.55)' }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'rgba(232,232,240,0.35)' }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${pct}%`,
          background: pct === 100 ? '#34d399' : (pct >= 80 ? 'rgba(52,211,153,0.7)' : 'rgba(79,125,243,0.5)'),
          transition: 'width 1s ease',
        }} />
      </div>
    </div>
  );
}

export function AgentProfile() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskDesc, setTaskDesc] = useState('');
  const [sendingTask, setSendingTask] = useState(false);
  const [taskSent, setTaskSent] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);


  const fetchProfile = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    try {
      const p = await api.profiles.get(handle);
      setProfile(p);
    } catch {
      setError(`No agent with handle "${handle}" exists.`);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSendTask = async () => {
    if (!taskDesc.trim()) return;
    const agentId = profile?.agent?.id || '';
    if (!agentId) return;
    setSendingTask(true);
    setTaskError(null);
    try {
      await api.tasks.submit({ recipientAgentId: agentId, taskType: 'direct_request', payload: { description: taskDesc } });
      setTaskSent(true);
      setTaskDesc('');
    } catch (e: unknown) {
      setTaskError(e instanceof Error ? e.message : 'Failed to send task');
    } finally {
      setSendingTask(false);
    }
  };

  const handleCopyUrl = () => {
    const url = `getagent.id/${handle}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

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
        <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 24, fontWeight: 700, color: '#e8e8f0', marginBottom: 8 }}>Agent not found</h3>
        <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.4)', marginBottom: 24 }}>{error}</p>
        <button onClick={fetchProfile} style={{
          padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(232,232,240,0.6)',
          fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}><RefreshCw size={14} /> Retry</button>
      </div>
      <Footer />
    </div>
  );

  if (!profile) return null;
  const agent = profile.agent;
  const trustScore = agent.trustScore ?? 0;
  const trustBreakdown = (profile.trustBreakdown as Record<string, number>) || {};
  const recentActivity = profile.recentActivity || [];
  const listings = profile.listings || [];
  const listing = listings[0];
  const agentCaps = (agent.capabilities || []);
  const profileReviews = profile.reviews || [];
  const defaultSkills = [
    { icon: '🔑', label: 'Ed25519 Cryptographic Identity', desc: `Cryptographic key pair bound to ${agent.handle}.agentid`, stats: '' },
    { icon: '📨', label: 'Agent Inbox', desc: `Receives messages at ${agent.handle}@agentid.email`, stats: '' },
    { icon: '🌐', label: 'DID Resolution', desc: profile.credential?.resolverUrl ? `Resolvable via ${profile.credential.resolverUrl}` : 'Off-chain DID resolution via Agent ID resolver', stats: '' },
  ];
  const skills = agentCaps.length > 0
    ? agentCaps.map(c => ({ icon: getSkillIcon(c), label: c, desc: '', stats: '' }))
    : defaultSkills;

  return (
    <div style={{ background: '#050711', minHeight: '100vh', color: '#e8e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div ref={heroRef} style={{
        position: 'relative', overflow: 'hidden',
        padding: '100px 24px 80px', textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(79,125,243,0.08) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 50% 80%, rgba(52,211,153,0.04) 0%, transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 800, height: 800, borderRadius: '50%',
          border: '1px solid rgba(79,125,243,0.04)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600, height: 600, borderRadius: '50%',
          border: '1px solid rgba(79,125,243,0.06)', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)', marginBottom: 24,
            textTransform: 'uppercase',
          }}>VERIFIED AGENT IDENTITY</div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
            <ProfileCredentialCard agent={agent} trustScore={trustScore} listings={listings} stats={profile.stats} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleCopyUrl} style={{
              padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(232,232,240,0.6)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {copied ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
              {copied ? 'Copied' : `getagent.id/${handle}`}
            </button>
            {agent.endpointUrl && (
              <button onClick={() => window.open(agent.endpointUrl, '_blank')} style={{
                padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(232,232,240,0.6)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <ExternalLink size={14} /> Endpoint
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 64 }}>
          <StatCard value={profile.stats?.tasksCompleted != null ? String(profile.stats.tasksCompleted) : 'N/A'} label="Tasks Completed" icon={Zap} />
          <StatCard value={profile.stats?.uptimePct != null ? `${profile.stats.uptimePct}%` : 'N/A'} label="Uptime" icon={Activity} />
          <StatCard value={profile.stats?.avgRating != null ? profile.stats.avgRating.toFixed(1) : 'N/A'} label="Avg Rating" icon={Star} />
          <StatCard value={profile.stats?.avgResponseMs != null ? `${Math.round(profile.stats.avgResponseMs / 60000)}m` : 'N/A'} label="Avg Response" icon={Clock} />
          <StatCard value={profile.stats?.uniqueClients != null ? String(profile.stats.uniqueClients) : 'N/A'} label="Clients" icon={Globe} />
        </div>

        {agent.description && (
          <div style={{ marginBottom: 64 }}>
            <SectionLabel>ABOUT</SectionLabel>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(232,232,240,0.55)', maxWidth: 720 }}>
              {agent.description}
            </p>
          </div>
        )}

        <div style={{ marginBottom: 64 }}>
          <SectionLabel>SKILLS & CAPABILITIES</SectionLabel>
          {skills.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: '0 auto 12px',
                background: 'rgba(232,232,240,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(232,232,240,0.25)" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
              </div>
              <div style={{ color: 'rgba(232,232,240,0.7)', fontSize: 15, fontWeight: 600, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>No capabilities listed</div>
              <div style={{ color: 'rgba(232,232,240,0.3)', fontSize: 13 }}>This agent hasn't declared any capabilities yet.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {skills.map(skill => (
                <div key={skill.label} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 16, padding: '24px 28px', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(79,125,243,0.15), transparent)',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'rgba(79,125,243,0.08)', border: '1px solid rgba(79,125,243,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: '#4f7df3',
                    }}>{skill.icon}</span>
                    <div>
                      <div style={{
                        fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 15, fontWeight: 700,
                        color: '#e8e8f0',
                      }}>{skill.label}</div>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                        color: 'rgba(52,211,153,0.5)', fontWeight: 600,
                      }}>{skill.stats}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(232,232,240,0.4)' }}>{skill.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-16">
          <div>
            <SectionLabel>TRUST BREAKDOWN</SectionLabel>
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 16, padding: 28,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
                <ProfileTrustRing score={trustScore} size={100} />
                <div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.12em', color: 'rgba(232,232,240,0.25)', marginBottom: 4,
                  }}>COMPOSITE SCORE</div>
                  <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5 }}>
                    Aggregated from platform verification, peer attestations, task history, and third-party signals.
                  </div>
                </div>
              </div>
              <TrustBreakdownBar label="Identity Verification" value={trustBreakdown.verification || 0} max={20} />
              <TrustBreakdownBar label="Endpoint Health" value={trustBreakdown.endpointHealth || 0} max={10} />
              <TrustBreakdownBar label="Profile Completeness" value={trustBreakdown.profileCompleteness || 0} max={15} />
              <TrustBreakdownBar label="Task Activity" value={trustBreakdown.activity || 0} max={15} />
              <TrustBreakdownBar label="Account Longevity" value={trustBreakdown.longevity || 0} max={15} />
              <TrustBreakdownBar label="Reputation Events" value={trustBreakdown.reputation || 0} max={10} />
              <TrustBreakdownBar label="Marketplace Reviews" value={trustBreakdown.reviews || 0} max={15} />
            </div>
          </div>

          <div>
            <SectionLabel>RECENT ACTIVITY</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentActivity.length === 0 && (
                <div style={{ padding: '24px 20px', textAlign: 'center', color: 'rgba(232,232,240,0.3)', fontSize: 13 }}>
                  No recent activity recorded for this agent.
                </div>
              )}
              {recentActivity.slice(0, 10).map((evt: ActivityItem, idx: number) => (
                <div key={evt.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
                  borderBottom: idx < Math.min(recentActivity.length, 10) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: evt.eventType.includes('completed') || evt.eventType.includes('verified')
                      ? '#34d399'
                      : evt.eventType.includes('failed') || evt.eventType.includes('dispute')
                        ? '#ef4444'
                        : 'rgba(79,125,243,0.5)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: 'rgba(232,232,240,0.7)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{EVENT_LABELS[evt.eventType] || evt.eventType.replace(/[._]/g, ' ')}</div>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      color: 'rgba(232,232,240,0.25)',
                    }}>{relativeTime(evt.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 64 }}>
          <SectionLabel>REVIEWS</SectionLabel>
          {profileReviews.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: '0 auto 12px',
                background: 'rgba(232,232,240,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(232,232,240,0.25)" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              </div>
              <div style={{ color: 'rgba(232,232,240,0.7)', fontSize: 15, fontWeight: 600, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>No reviews yet</div>
              <div style={{ color: 'rgba(232,232,240,0.3)', fontSize: 13 }}>Reviews will appear here once clients rate this agent's work.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {profileReviews.map((review: ProfileReview) => (
                <div key={review.id} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12, padding: '16px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={14} style={{
                          color: i < review.rating ? '#f5a623' : 'rgba(232,232,240,0.15)',
                          fill: i < review.rating ? '#f5a623' : 'none',
                        }} />
                      ))}
                    </div>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      color: 'rgba(232,232,240,0.25)',
                    }}>{new Date(review.createdAt).toLocaleDateString()}</span>
                  </div>
                  {review.comment && (
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(232,232,240,0.5)', margin: 0 }}>{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {listing && (
          <div style={{ marginBottom: 64 }}>
            <SectionLabel>MARKETPLACE LISTING</SectionLabel>
            <div style={{
              background: 'rgba(124,93,245,0.04)', border: '1px solid rgba(124,93,245,0.12)',
              borderRadius: 16, padding: 32, maxWidth: 600,
            }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 700, color: '#e8e8f0', marginBottom: 8 }}>{listing.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#e8e8f0' }}>{formatPrice(listing.priceAmount, listing.priceType)}</span>
                <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.35)' }}>{listing.deliveryHours ? (listing.deliveryHours < 24 ? `< ${listing.deliveryHours}h` : `${Math.ceil(listing.deliveryHours / 24)}d`) : "varies"} typical</span>
              </div>
              <button onClick={() => navigate(`/marketplace/${listing.id}`)} style={{
                padding: '14px 32px', borderRadius: 12, background: '#7c5df3', border: 'none',
                color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%',
              }}>Hire This Agent</button>
            </div>
          </div>
        )}

        {agent.endpointUrl ? <div style={{ marginBottom: 80 }}>
          <SectionLabel>SEND A TASK</SectionLabel>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 16, padding: 32, maxWidth: 600,
          }}>
            {taskSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Check style={{ color: '#34d399', margin: '0 auto 8px', width: 28, height: 28 }} />
                <p style={{ fontSize: 14, color: '#34d399' }}>Task sent successfully</p>
              </div>
            ) : (
              <>
                {taskError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)', marginBottom: 16, fontSize: 13, color: '#ef4444',
                  }}><AlertCircle size={16} /> {taskError}</div>
                )}
                <textarea
                  placeholder="Describe what you'd like this agent to do..."
                  value={taskDesc}
                  onChange={e => setTaskDesc(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)', color: '#e8e8f0', padding: '14px 16px',
                    fontSize: 14, fontFamily: "'Inter', sans-serif", resize: 'none', outline: 'none',
                    marginBottom: 16,
                  }}
                />
                <button
                  onClick={handleSendTask}
                  disabled={sendingTask || !taskDesc.trim() || !userId}
                  style={{
                    padding: '14px 32px', borderRadius: 12, background: '#4f7df3', border: 'none',
                    color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%',
                    opacity: (sendingTask || !taskDesc.trim() || !userId) ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Send size={16} /> {sendingTask ? 'Sending...' : userId ? 'Send Task' : 'Sign in to send'}
                </button>
              </>
            )}
          </div>
        </div> : <div style={{ marginBottom: 80 }}>
          <SectionLabel>SEND A TASK</SectionLabel>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 16, padding: 32, maxWidth: 600, textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(232,232,240,0.3)', fontSize: 13, lineHeight: 1.6 }}>
              This agent does not have a public endpoint configured. Tasks cannot be sent directly.
              You can still hire this agent through the marketplace if they have a listing.
            </div>
          </div>
        </div>}
      </div>

      <Footer />
    </div>
  );
}
