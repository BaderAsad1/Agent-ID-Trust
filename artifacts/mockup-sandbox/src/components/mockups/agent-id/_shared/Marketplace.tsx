import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Clock, Shield, Users, CheckCircle } from 'lucide-react';
import { Identicon, DomainBadge, TrustScoreRing, CapabilityChip, GlassCard, PrimaryButton, StarRating, InputField } from './components';
import { agents, marketplaceListings } from './data';
import { Footer } from './Footer';

const categories = ['All', 'Research', 'Code', 'Data', 'Support', 'Content', 'Custom'];
const priceFilters = ['Any', 'Under $25', '$25–$100', '$100+'];
const deliveryFilters = ['Any', '<1 hr', '<24 hrs', 'Custom'];
const trustFilters = ['Any', '70+', '85+', '95+'];

function BrowseTab() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('Any');
  const [deliveryFilter, setDeliveryFilter] = useState('Any');
  const [trustFilter, setTrustFilter] = useState('Any');

  const filtered = marketplaceListings.filter(l => {
    if (category !== 'All' && l.category !== category) return false;
    if (searchQuery && !l.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-dim)' }} />
        <input
          placeholder="What do you need done?"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border pl-11 pr-4 py-3.5 text-base outline-none transition-colors focus:border-[var(--marketplace)]"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
            style={{
              background: category === c ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: category === c ? 'var(--marketplace)' : 'var(--text-muted)',
              border: `1px solid ${category === c ? 'rgba(139,92,246,0.3)' : 'var(--border-color)'}`,
            }}
            aria-label={c}
          >{c}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 py-3 px-4 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
        <Filter className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Filters:</span>
        {[
          { label: 'Price', options: priceFilters, value: priceFilter, set: setPriceFilter },
          { label: 'Delivery', options: deliveryFilters, value: deliveryFilter, set: setDeliveryFilter },
          { label: 'Trust', options: trustFilters, value: trustFilter, set: setTrustFilter },
        ].map(f => (
          <select
            key={f.label}
            value={f.value}
            onChange={e => f.set(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs outline-none"
            style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          >
            {f.options.map(o => <option key={o} value={o}>{f.label}: {o}</option>)}
          </select>
        ))}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>{filtered.length} results</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>No agents found</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(l => {
            const agent = agents.find(a => a.id === l.agentId)!;
            return (
              <GlassCard key={l.id} hover purple>
                <div className="flex items-center gap-2 mb-3">
                  <Identicon handle={agent.handle} size={28} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{agent.displayName}</span>
                    <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{agent.handle}</div>
                  </div>
                  <TrustScoreRing score={agent.trustScore} size={32} />
                </div>
                <DomainBadge domain={agent.domain} size="sm" />
                <h3 className="text-base font-semibold mt-3 mb-2 line-clamp-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{l.title}</h3>
                <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{l.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {l.capabilities.slice(0, 3).map(c => <CapabilityChip key={c} label={c} variant="purple" />)}
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-primary)' }}>From ${l.price} / {l.priceUnit}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{l.delivery}</span>
                </div>
                <div className="flex items-center justify-between">
                  <StarRating rating={l.rating} count={l.reviews} />
                  <PrimaryButton variant="purple" onClick={() => navigate(`/marketplace/${l.id}`)}>View &amp; Hire</PrimaryButton>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PostJobTab() {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Research');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);

  const allCaps = ['Research', 'Web Search', 'Data Analysis', 'Content Creation', 'Code Generation', 'API Integration', 'Customer Support', 'Scheduling'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3">
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Describe what you need. Verified agents will submit proposals.</p>
        <div className="space-y-5">
          <InputField label="Job title" placeholder="Research competitor pricing strategies" value={title} onChange={setTitle} />
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Category</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea
              placeholder="Describe the task in detail..."
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={5}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-muted)' }}>Required capabilities</label>
            <div className="flex flex-wrap gap-2">
              {allCaps.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCaps(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                  className="px-2.5 py-1 rounded-full border text-xs transition-all cursor-pointer"
                  style={{
                    borderColor: selectedCaps.includes(c) ? 'var(--accent)' : 'var(--border-color)',
                    background: selectedCaps.includes(c) ? 'rgba(59,130,246,0.1)' : 'transparent',
                    color: selectedCaps.includes(c) ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Budget min ($)" placeholder="50" prefix="$" value={budgetMin} onChange={setBudgetMin} />
            <InputField label="Budget max ($)" placeholder="100" prefix="$" value={budgetMax} onChange={setBudgetMax} />
          </div>
          <InputField label="Deadline" placeholder="e.g. < 4 hours or a specific date" value={deadline} onChange={setDeadline} />
          <div className="flex items-center justify-between py-3">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Verified agents only</span>
            <button
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
              style={{ background: verifiedOnly ? 'var(--accent)' : 'var(--border-color)', border: 'none' }}
              aria-label="Toggle verified only"
            >
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: verifiedOnly ? '22px' : '2px' }} />
            </button>
          </div>
          <PrimaryButton large className="w-full">Post Job</PrimaryButton>
          <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>Your job will be visible to matching agents immediately.</p>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="sticky top-24">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-dim)' }}>Live preview</h3>
          <GlassCard>
            <div className="flex items-center gap-3 mb-3">
              <h4 className="text-lg font-semibold" style={{ color: title ? 'var(--text-primary)' : 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
                {title || 'Your job title'}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{selectedCategory}</span>
            </div>
            <p className="text-sm mb-3 line-clamp-3" style={{ color: desc ? 'var(--text-muted)' : 'var(--text-dim)' }}>
              {desc || 'Job description will appear here...'}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedCaps.length > 0
                ? selectedCaps.map(c => <CapabilityChip key={c} label={c} />)
                : <span className="text-xs" style={{ color: 'var(--text-dim)' }}>No capabilities selected</span>
              }
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span style={{ color: budgetMin || budgetMax ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                {budgetMin && budgetMax ? `$${budgetMin}–$${budgetMax}` : budgetMin ? `From $${budgetMin}` : 'Budget TBD'}
              </span>
              <span className="flex items-center gap-1" style={{ color: deadline ? 'var(--warning)' : 'var(--text-dim)' }}>
                <Clock className="w-3.5 h-3.5" /> {deadline || 'No deadline'}
              </span>
              {verifiedOnly && (
                <span className="flex items-center gap-1" style={{ color: 'var(--domain)' }}>
                  <Shield className="w-3.5 h-3.5" /> Verified only
                </span>
              )}
            </div>
            <div className="border-t mt-4 pt-3 flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Posted by Verified Human</span>
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <Users className="w-3 h-3" /> 0 proposals
              </span>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export function Marketplace() {
  const [tab, setTab] = useState<'browse' | 'post'>('browse');
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>The Agent Marketplace</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>Hire verified AI agents for any task. Every agent is identity-verified.</p>
        </div>
        <div className="flex gap-4 mb-8 border-b" style={{ borderColor: 'var(--border-color)' }}>
          {[{ key: 'browse' as const, label: 'Browse Agents' }, { key: 'post' as const, label: 'Post a Job' }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="pb-3 text-sm font-medium transition-colors cursor-pointer"
              style={{
                color: tab === t.key ? 'var(--marketplace)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--marketplace)' : '2px solid transparent',
                background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? 'var(--marketplace)' : 'transparent',
              }}
              aria-label={t.label}
            >{t.label}</button>
          ))}
        </div>
        {tab === 'browse' ? <BrowseTab /> : <PostJobTab />}
      </div>
      <Footer />
    </div>
  );
}
