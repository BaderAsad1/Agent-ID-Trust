import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Send } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, StarRating, EventTypeIcon } from './components';
import { agents, activityLog, getListingsByAgent } from './data';
import { Footer } from './Footer';

export function AgentProfile() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const agent = agents.find(a => a.handle === handle) || agents[0];
  const agentEvents = activityLog.filter(e => e.agentId === agent.id).slice(0, 5);
  const listings = getListingsByAgent(agent.id);
  const listing = listings[0];
  const [taskDesc, setTaskDesc] = useState('');

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="px-6 py-12" style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-start gap-6">
          <div className="flex items-start gap-4 flex-1">
            <Identicon handle={agent.handle} size={64} />
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{agent.displayName}</h1>
                <StatusDot status={agent.status} />
              </div>
              <AgentHandle handle={agent.handle} />
              <div className="mt-2"><DomainBadge domain={agent.domain} /></div>
              <p className="mt-3 text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {agent.capabilities.map(c => <CapabilityChip key={c} label={c} />)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <TrustScoreRing score={agent.trustScore} size={80} />
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
                  ['.agent domain', <DomainBadge key="d" domain={agent.domain} size="sm" />],
                  ['Owner', <span key="o" className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>{agent.owner} <Check className="w-3 h-3" style={{ color: 'var(--success)' }} /></span>],
                  ['Registered', <span key="r" style={{ color: 'var(--text-muted)' }}>{agent.registered}</span>],
                  ['Last active', <span key="l" style={{ color: 'var(--text-muted)' }}>{agent.lastActive}</span>],
                  ['Verification', <span key="v" className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--domain)' }}>Cryptographic</span>],
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
                {agent.capabilities.map(c => <CapabilityChip key={c} label={c} />)}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>[masked URL]</span>
                <PrimaryButton>Send Task</PrimaryButton>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Scopes &amp; Permissions</h3>
              <div className="flex flex-wrap gap-2">
                {agent.scopes.map(s => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-md" style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>{s}</span>
                ))}
              </div>
            </GlassCard>

            {listing && (
              <GlassCard purple>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--marketplace)', fontFamily: 'var(--font-display)' }}>Marketplace Listing</h3>
                <p className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{listing.title}</p>
                <div className="flex items-center gap-4 mb-3 text-sm">
                  <span style={{ color: 'var(--text-primary)' }}>From ${listing.price} / {listing.priceUnit}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{listing.delivery} typical</span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <StarRating rating={listing.rating} count={listing.reviews} />
                  <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{agent.tasksCompleted} completed</span>
                </div>
                <PrimaryButton large variant="purple" className="w-full" onClick={() => navigate(`/marketplace/${listing.id}`)}>Hire This Agent</PrimaryButton>
              </GlassCard>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            <GlassCard>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Trust Score</h3>
              <div className="flex justify-center mb-6">
                <TrustScoreRing score={agent.trustScore} size={120} />
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Verification', value: agent.trustBreakdown.verification, max: 25 },
                  { label: 'Longevity', value: agent.trustBreakdown.longevity, max: 20 },
                  { label: 'Activity', value: agent.trustBreakdown.activity, max: 25 },
                  { label: 'Reputation', value: agent.trustBreakdown.reputation, max: 30 },
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
              <div className="space-y-3">
                {agentEvents.map(evt => (
                  <div key={evt.id} className="flex items-start gap-3 text-sm">
                    <EventTypeIcon type={evt.type} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ color: 'var(--text-muted)' }}>{evt.details}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{evt.hash}</span>
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{evt.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {!listing && (
              <GlassCard>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Work with this agent</h3>
                <textarea
                  placeholder="Describe your task..."
                  value={taskDesc}
                  onChange={e => setTaskDesc(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none mb-3"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                />
                <PrimaryButton className="w-full">
                  <Send className="w-4 h-4 mr-2" /> Send Task
                </PrimaryButton>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
