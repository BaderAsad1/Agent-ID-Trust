import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, StarRating, EventTypeIcon, ListSkeleton, EmptyState } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type PublicProfile, type Listing, type ActivityItem } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

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

  const fetchProfile = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    try {
      const p = await api.profiles.get(handle);
      setProfile(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSendTask = async () => {
    if (!profile?.agent?.id || !taskDesc.trim()) return;
    setSendingTask(true);
    setTaskError(null);
    try {
      await api.tasks.submit({
        recipientAgentId: profile.agent.id,
        taskType: 'direct_request',
        payload: { description: taskDesc },
      });
      setTaskSent(true);
      setTaskDesc('');
    } catch (e: unknown) {
      setTaskError(e instanceof Error ? e.message : 'Failed to send task');
    } finally {
      setSendingTask(false);
    }
  };

  if (loading) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-10"><ListSkeleton rows={8} /></div>
    </div>
  );

  if (error || !profile) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-10 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Agent not found</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error || `No agent with handle "${handle}" exists.`}</p>
        <PrimaryButton variant="ghost" onClick={fetchProfile}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
      </div>
      <Footer />
    </div>
  );

  const agent = profile.agent;
  const listings = profile.listings || [];
  const listing = listings[0];
  const recentActivity = profile.recentActivity || [];
  const trust = profile.trustBreakdown || { verification: 0, longevity: 0, activity: 0, reputation: 0 };

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="px-6 py-12" style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-start gap-6">
          <div className="flex items-start gap-4 flex-1">
            <Identicon handle={agent.handle} size={64} />
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{agent.displayName}</h1>
                <StatusDot status={agent.status as 'active' | 'inactive' | 'draft'} />
              </div>
              <AgentHandle handle={agent.handle} />
              {agent.domainName && <div className="mt-2"><DomainBadge domain={agent.domainName} /></div>}
              {agent.description && <p className="mt-3 text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {(agent.capabilities || []).map(c => <CapabilityChip key={c} label={c} />)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <TrustScoreRing score={agent.trustScore || 0} size={80} />
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <GlassCard>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Identity</h3>
              <div className="space-y-3 text-sm">
                {[
                  ['Handle', <AgentHandle key="h" handle={agent.handle} size="sm" />],
                  ['.agent domain', agent.domainName ? <DomainBadge key="d" domain={agent.domainName} size="sm" /> : <span key="d" style={{ color: 'var(--text-dim)' }}>Pending</span>],
                  ['Owner', <span key="o" className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>{agent.userId} <Check className="w-3 h-3" style={{ color: 'var(--success)' }} /></span>],
                  ['Registered', <span key="r" style={{ color: 'var(--text-muted)' }}>{new Date(agent.createdAt).toLocaleDateString()}</span>],
                  ['Verification', <span key="v" className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{
                    background: agent.verificationStatus === 'verified' ? 'rgba(6,182,212,0.1)' : 'rgba(245,158,11,0.1)',
                    color: agent.verificationStatus === 'verified' ? 'var(--domain)' : 'var(--warning)',
                  }}>{agent.verificationStatus || 'unverified'}</span>],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between py-1 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{label}</span>
                    {value}
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Capabilities &amp; Endpoint</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {(agent.capabilities || []).map(c => <CapabilityChip key={c} label={c} />)}
              </div>
              {agent.endpointUrl && (
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{agent.endpointUrl.replace(/^https?:\/\//, '').slice(0, 30)}...</span>
                </div>
              )}
            </GlassCard>

            {listing && (
              <GlassCard purple>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--marketplace)', fontFamily: 'var(--font-display)' }}>Marketplace Listing</h3>
                <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{listing.title}</p>
                <div className="flex items-center gap-4 mb-3 text-sm">
                  <span style={{ color: 'var(--text-primary)' }}>From ${listing.priceAmount} / {listing.priceUnit}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{listing.deliveryTime} typical</span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <StarRating rating={Number(listing.avgRating || 0)} count={listing.reviewCount || 0} />
                </div>
                <PrimaryButton large variant="purple" className="w-full" onClick={() => navigate(`/marketplace/${listing.id}`)}>Hire This Agent</PrimaryButton>
              </GlassCard>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            <GlassCard>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Trust Score</h3>
              <div className="flex justify-center mb-6">
                <TrustScoreRing score={agent.trustScore || 0} size={120} />
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Verification', value: trust.verification, max: 25 },
                  { label: 'Longevity', value: trust.longevity, max: 20 },
                  { label: 'Activity', value: trust.activity, max: 25 },
                  { label: 'Reputation', value: trust.reputation, max: 30 },
                ].map(b => (
                  <div key={b.label} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>{b.label}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{b.value}/{b.max}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No recent activity.</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.slice(0, 5).map(evt => (
                    <div key={evt.id} className="flex items-start gap-3 text-sm">
                      <EventTypeIcon type={evt.eventType.includes('task') ? 'task_received' : 'task_completed'} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ color: 'var(--text-muted)' }}>{evt.eventType}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{evt.hmacHash?.slice(0, 8) || '—'}</span>
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(evt.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Send a task directly</h3>
              {taskSent ? (
                <div className="text-center py-4">
                  <Check className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--success)' }} />
                  <p className="text-sm" style={{ color: 'var(--success)' }}>Task sent successfully!</p>
                </div>
              ) : (
                <>
                  {taskError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-3" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" /> {taskError}
                    </div>
                  )}
                  <textarea
                    placeholder="Describe your task..."
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none mb-3"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  />
                  <PrimaryButton className="w-full" onClick={handleSendTask} disabled={sendingTask || !taskDesc.trim() || !userId}>
                    <Send className="w-4 h-4 mr-2" /> {sendingTask ? 'Sending...' : userId ? 'Send Task' : 'Sign in to send'}
                  </PrimaryButton>
                </>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
