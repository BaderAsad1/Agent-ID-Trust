import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, CheckCircle, Calendar, X } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, CapabilityChip, GlassCard, PrimaryButton, StarRating, StatusDot } from './components';
import { agents, getListingById, getReviewsByListing } from './data';
import { Footer } from './Footer';

function HireModal({ onClose, listingTitle }: { onClose: () => void; listingTitle: string }) {
  const [step, setStep] = useState(1);
  const [taskDesc, setTaskDesc] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: s <= step ? 'var(--marketplace)' : 'var(--border-color)' }} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Describe your task</h3>
            <textarea
              placeholder="What do you need done?"
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              rows={5}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            />
            <PrimaryButton variant="purple" className="w-full" onClick={() => setStep(2)}>Continue</PrimaryButton>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Set budget &amp; deadline</h3>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Budget ($)</label>
              <input placeholder="50" value={budget} onChange={e => setBudget(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Deadline</label>
              <input placeholder="e.g. 4 hours" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <PrimaryButton variant="purple" className="w-full" onClick={() => setStep(3)}>Continue</PrimaryButton>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Review &amp; confirm</h3>
            <div className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Service</span><span style={{ color: 'var(--text-primary)' }}>{listingTitle}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Budget</span><span style={{ color: 'var(--text-primary)' }}>${budget || '50'}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Deadline</span><span style={{ color: 'var(--text-primary)' }}>{deadline || '4 hours'}</span></div>
            </div>
            <PrimaryButton variant="purple" className="w-full" onClick={() => setStep(4)}>Proceed to Payment</PrimaryButton>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Payment</h3>
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="space-y-1.5">
                <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Card number</label>
                <input placeholder="4242 4242 4242 4242" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Expiry</label>
                  <input placeholder="MM/YY" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs" style={{ color: 'var(--text-dim)' }}>CVC</label>
                  <input placeholder="123" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
            </div>
            <PrimaryButton variant="purple" className="w-full" onClick={() => setStep(5)}>Pay ${budget || '50'}</PrimaryButton>
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: 'var(--success)' }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Task submitted!</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Agent has been notified and will begin working on your task.</p>
            <PrimaryButton variant="ghost" onClick={onClose}>Close</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const listing = getListingById(id || 'listing-1') || getListingById('listing-1')!;
  const agent = agents.find(a => a.id === listing.agentId)!;
  const reviews = getReviewsByListing(listing.id);
  const [tab, setTab] = useState<'overview' | 'reviews'>('overview');
  const [showHire, setShowHire] = useState(false);

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      {showHire && <HireModal onClose={() => setShowHire(false)} listingTitle={listing.title} />}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-sm mb-6">
          <button onClick={() => navigate('/marketplace')} className="cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>Marketplace</button>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-dim)' }}>{listing.category}</span>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-muted)' }}>{listing.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
          <div className="lg:col-span-7">
            <h1 className="text-2xl md:text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{listing.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Identicon handle={agent.handle} size={32} />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{agent.displayName}</span>
              <AgentHandle handle={agent.handle} size="sm" />
              <DomainBadge domain={agent.domain} size="sm" />
              <TrustScoreRing score={agent.trustScore} size={28} />
              <StatusDot status="active" />
            </div>

            <div className="flex gap-4 mb-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {[{ key: 'overview' as const, label: 'Overview' }, { key: 'reviews' as const, label: `Reviews (${reviews.length})` }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="pb-3 text-sm font-medium cursor-pointer"
                  style={{ color: tab === t.key ? 'var(--marketplace)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === t.key ? 'var(--marketplace)' : 'transparent'}`, background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? 'var(--marketplace)' : 'transparent' }}
                  aria-label={t.label}
                >{t.label}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{listing.description}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>What you get</h3>
                  <ul className="space-y-2">
                    {listing.whatYouGet.map(item => (
                      <li key={item} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                        <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Capabilities</h3>
                  <div className="flex flex-wrap gap-2">
                    {listing.capabilities.map(c => <CapabilityChip key={c} label={c} variant="purple" />)}
                  </div>
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <StarRating rating={listing.rating} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{reviews.length} reviews</span>
                </div>
                {reviews.map(r => (
                  <GlassCard key={r.id} className="!p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>@{r.reviewerHandle}</span>
                        <StarRating rating={r.rating} />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{r.date}</span>
                    </div>
                    <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{r.comment}</p>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Task: {r.taskType}</span>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              <GlassCard purple>
                <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>From ${listing.price} / {listing.priceUnit}</div>
                <div className="flex items-center gap-1 text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
                  <Clock className="w-3.5 h-3.5" /> {listing.delivery} typical
                </div>
                <PrimaryButton large variant="purple" className="w-full mb-2" onClick={() => setShowHire(true)}>Hire This Agent</PrimaryButton>
                <button className="w-full text-center text-sm py-2 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>Send a Message</button>
              </GlassCard>
              <GlassCard>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Agent Quick Stats</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Tasks completed</span><span style={{ color: 'var(--text-primary)' }}>{agent.tasksCompleted}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Avg response</span><span style={{ color: 'var(--text-primary)' }}>&lt; 30 min</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>On-time delivery</span><span style={{ color: 'var(--text-primary)' }}>98%</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Member since</span><span style={{ color: 'var(--text-primary)' }}>{agent.registered}</span></div>
                </div>
              </GlassCard>
              <div className="flex justify-center">
                <TrustScoreRing score={agent.trustScore} size={64} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
