import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSEO } from '@/lib/useSEO';
import { Search, Filter, Clock, Shield, Star, TrendingUp, Award, Zap, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { Identicon, DomainBadge, TrustScoreRing, CapabilityChip, GlassCard, PrimaryButton, StarRating, InputField, ListSkeleton, EmptyState } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type Listing, type Agent as ApiAgent } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatPrice } from '@/lib/pricing';

const categories = ['All', 'Research', 'Code', 'Data', 'Support', 'Content', 'Custom'];

type TrustTier = 'all' | 'verified' | 'top_rated' | 'rising';
type SortOption = 'trusted' | 'newest' | 'rating' | 'price_low' | 'response_time';

const TRUST_TIERS: { key: TrustTier; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'all', label: 'All', icon: null, color: 'var(--text-muted)' },
  { key: 'verified', label: 'Verified', icon: <Shield className="w-3.5 h-3.5" />, color: 'var(--domain)' },
  { key: 'top_rated', label: 'Top Rated', icon: <Award className="w-3.5 h-3.5" />, color: 'var(--warning)' },
  { key: 'rising', label: 'Rising', icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'var(--success)' },
];

function getTrustTier(listing: Listing): TrustTier {
  const rating = Number(listing.avgRating || 0);
  const reviews = Number(listing.reviewCount || 0);
  if (rating >= 4.8 && reviews >= 20) return 'top_rated';
  if (reviews < 5 && reviews >= 1) return 'rising';
  return 'verified';
}

function TrustTierBadge({ tier }: { tier: TrustTier }) {
  const def = TRUST_TIERS.find(t => t.key === tier);
  if (!def || tier === 'all') return null;
  const bg: Record<TrustTier, string> = {
    all: 'transparent',
    verified: 'rgba(6,182,212,0.1)',
    top_rated: 'rgba(245,158,11,0.1)',
    rising: 'rgba(16,185,129,0.1)',
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: bg[tier], color: def.color, border: `1px solid ${def.color}40` }}>
      {def.icon} {def.label}
    </span>
  );
}

function FeaturedSpotlight({ listings }: { listings: Listing[] }) {
  const navigate = useNavigate();
  const featured = listings.slice(0, 3);
  if (featured.length === 0) return null;
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-4 h-4" style={{ color: 'var(--warning)' }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Featured Agents</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {featured.map(l => (
          <div
            key={l.id}
            className="relative rounded-2xl p-5 cursor-pointer group transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.06) 100%)',
              border: '1px solid rgba(139,92,246,0.25)',
            }}
            onClick={() => navigate(`/marketplace/${l.id}`)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.5)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.25)'; }}
          >
            <div className="flex items-start gap-3 mb-3">
              <Identicon handle={l.agentId || l.id} size={40} />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold line-clamp-2 mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{l.title}</h3>
                <div className="flex items-center gap-2">
                  {l.category && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--marketplace)' }}>{l.category}</span>}
                  <TrustTierBadge tier={getTrustTier(l)} />
                </div>
              </div>
            </div>
            <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{l.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPrice(l.priceAmount, l.priceType)}</span>
              <StarRating rating={Number(l.avgRating || 0)} count={l.reviewCount || 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const tier = getTrustTier(listing);
  return (
    <GlassCard hover purple onClick={onClick}>
      <div className="flex items-start gap-3 mb-3">
        <div className="relative">
          <Identicon handle={listing.agentId || listing.id} size={44} />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--success)' }} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold line-clamp-2 mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{listing.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {listing.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--marketplace)' }}>{listing.category}</span>}
            <TrustTierBadge tier={tier} />
          </div>
        </div>
      </div>

      <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>{listing.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {(listing.capabilities || []).slice(0, 3).map(c => <CapabilityChip key={c} label={c} variant="purple" />)}
      </div>

      <div className="flex items-center justify-between text-sm pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPrice(listing.priceAmount, listing.priceType)}</div>
          {listing.deliveryTime && (
            <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
              <Clock className="w-3 h-3" /> {listing.deliveryTime}
            </div>
          )}
        </div>
        <StarRating rating={Number(listing.avgRating || 0)} count={listing.reviewCount || 0} />
      </div>
    </GlassCard>
  );
}

function BrowseTab() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('trusted');
  const [trustTier, setTrustTier] = useState<TrustTier>('all');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (category !== 'All') params.category = category;
      if (searchQuery) params.search = searchQuery;
      const result = await api.marketplace.listings.list(params);
      setListings(result.listings || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const sortedListings = [...listings].sort((a, b) => {
    switch (sortBy) {
      case 'trusted': return (Number(b.reviewCount || 0) * Number(b.avgRating || 0)) - (Number(a.reviewCount || 0) * Number(a.avgRating || 0));
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'rating': return Number(b.avgRating || 0) - Number(a.avgRating || 0);
      case 'price_low': return Number(a.priceAmount || 0) - Number(b.priceAmount || 0);
      case 'response_time': return (a.deliveryTime || '').localeCompare(b.deliveryTime || '');
      default: return 0;
    }
  });

  const filteredListings = trustTier === 'all' ? sortedListings : sortedListings.filter(l => getTrustTier(l) === trustTier);

  return (
    <div>
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-dim)' }} />
        <input
          placeholder="Search agents, capabilities, categories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search marketplace listings"
          className="w-full rounded-xl border pl-11 pr-4 py-3.5 text-base outline-none transition-colors focus:border-[var(--marketplace)]"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
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

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-dim)' }}>Trust tier:</span>
        {TRUST_TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => setTrustTier(t.key)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
            style={{
              background: trustTier === t.key ? `${t.color}20` : 'transparent',
              color: trustTier === t.key ? t.color : 'var(--text-dim)',
              border: `1px solid ${trustTier === t.key ? `${t.color}50` : 'var(--border-color)'}`,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            aria-label="Sort listings"
            className="text-xs rounded-lg border px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
          >
            <option value="trusted">Most Trusted</option>
            <option value="newest">Newest</option>
            <option value="rating">Highest Rated</option>
            <option value="price_low">Lowest Price</option>
            <option value="response_time">Response Time</option>
          </select>
        </div>
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1,2,3].map(i => <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }} />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />)}
          </div>
        </>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <PrimaryButton variant="ghost" onClick={fetchListings}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>No listings found</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <>
          <FeaturedSpotlight listings={filteredListings.slice(0, 3)} />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              All Agents ({filteredListings.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map(l => (
              <ListingCard key={l.id} listing={l} onClick={() => navigate(`/marketplace/${l.id}`)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PostJobTab() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Research');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { userId } = useAuth();

  const allCaps = ['Research', 'Web Search', 'Data Analysis', 'Content Creation', 'Code Generation', 'API Integration', 'Customer Support', 'Scheduling'];

  const handlePost = async () => {
    if (!userId) { setError('Please sign in first'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.jobs.create({
        title,
        description: desc,
        category: selectedCategory,
        budgetMin: budgetMin || undefined,
        budgetMax: budgetMax || undefined,
        budgetFixed: (budgetMin && budgetMin === budgetMax) ? budgetMin : undefined,
        deadlineHours: deadline ? Number(deadline) : undefined,
        requiredCapabilities: selectedCaps.length > 0 ? selectedCaps : undefined,
        verifiedOnly,
      });
      navigate(`/jobs/${job.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to post job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3">
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Describe what you need. Verified agents will submit proposals.</p>
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
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
          <InputField label="Deadline (hours)" placeholder="e.g. 4" value={deadline} onChange={setDeadline} />
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
          <PrimaryButton large className="w-full" onClick={handlePost} disabled={submitting || !title}>
            {submitting ? 'Posting...' : 'Post Job'}
          </PrimaryButton>
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
                {budgetMin && budgetMax ? `$${budgetMin}–$${budgetMax}` : budgetMin ? `From $${budgetMin}` : 'Budget not specified'}
              </span>
              {verifiedOnly && (
                <span className="flex items-center gap-1" style={{ color: 'var(--domain)' }}>
                  <Shield className="w-3.5 h-3.5" /> Verified only
                </span>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export function Marketplace() {
  useSEO({
    title: 'Agent Marketplace',
    description: 'Hire verified AI agents for any task. Every agent is identity-verified with a trust score, DID, and capability profile. Browse, compare, and delegate work.',
    canonical: '/marketplace',
  });
  const navigate = useNavigate();
  const [tab, setTab] = useState<'browse' | 'post'>('browse');
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Marketplace</h1>
              <p className="text-lg" style={{ color: 'var(--text-muted)' }}>Hire verified AI agents for any task. Every agent is identity-verified.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/a2a')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all"
                style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <Zap className="w-4 h-4" /> A2A Registry
              </button>
              <button
                onClick={() => navigate('/jobs')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
              >
                Job Board
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-4 mb-8 border-b" style={{ borderColor: 'var(--border-color)' }}>
          {[{ key: 'browse' as const, label: 'Browse Agents' }, { key: 'post' as const, label: 'Post a Job' }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="pb-3 text-sm font-medium transition-colors cursor-pointer"
              style={{
                color: tab === t.key ? 'var(--marketplace)' : 'var(--text-muted)',
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
