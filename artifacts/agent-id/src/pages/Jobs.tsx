import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, ChevronLeft, Users, Shield, Search, AlertCircle, RefreshCw, CheckCircle, Briefcase, Zap, Filter, Plus } from 'lucide-react';
import { CapabilityChip, GlassCard, PrimaryButton, InputField, ListSkeleton, EmptyState } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type Job, type Proposal } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

const categories = ['All', 'Research', 'Code', 'Data', 'Support', 'Content'];

function getDeadlineColor(hours: number): string {
  if (hours <= 1) return 'var(--danger)';
  if (hours <= 24) return 'var(--warning)';
  return 'var(--text-muted)';
}

function formatDeadline(hours?: number): string {
  if (!hours) return 'No deadline';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function JobCard({ job, cta, onClick }: { job: Job; cta?: React.ReactNode; onClick?: () => void }) {
  return (
    <GlassCard hover onClick={onClick}>
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{job.title}</h3>
            {job.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{job.category}</span>}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{
              background: job.status === 'open' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              color: job.status === 'open' ? 'var(--success)' : 'var(--warning)',
            }}>{job.status}</span>
          </div>
          {job.description && <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{job.description}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span style={{ color: 'var(--text-primary)' }}>
              {job.budgetFixed ? `Fixed: $${job.budgetFixed}` : job.budgetMin && job.budgetMax ? `$${job.budgetMin}–$${job.budgetMax}` : 'Budget TBD'}
            </span>
            {job.deadlineHours && (
              <span className="flex items-center gap-1" style={{ color: getDeadlineColor(job.deadlineHours) }}>
                <Clock className="w-3.5 h-3.5" /> {formatDeadline(job.deadlineHours)}
              </span>
            )}
            {job.minTrustScore && (
              <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                <Shield className="w-3.5 h-3.5" /> Trust {job.minTrustScore}+
              </span>
            )}
            <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
              <Users className="w-3.5 h-3.5" /> {job.proposalsCount} proposals
            </span>
            <span style={{ color: 'var(--text-dim)' }}>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
          {job.requiredCapabilities && job.requiredCapabilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {job.requiredCapabilities.map(c => <CapabilityChip key={c} label={c} />)}
            </div>
          )}
        </div>
        {cta}
      </div>
    </GlassCard>
  );
}

function BrowseTab() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { status: 'open' };
      if (category !== 'All') params.category = category;
      if (searchQuery) params.search = searchQuery;
      if (budgetMin) params.budgetMin = budgetMin;
      if (budgetMax) params.budgetMax = budgetMax;
      const result = await api.jobs.list(params);
      setJobs(result.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, budgetMin, budgetMax]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div>
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-dim)' }} />
        <input
          placeholder="Search jobs by title, description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border pl-11 pr-4 py-3.5 text-base outline-none transition-colors focus:border-[var(--accent)]"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg cursor-pointer"
          style={{ background: showFilters ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)', color: showFilters ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${showFilters ? 'rgba(59,130,246,0.3)' : 'var(--border-color)'}` }}
        >
          <Filter className="w-3.5 h-3.5" /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="rounded-xl border p-4 mb-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Budget min ($)" placeholder="50" prefix="$" value={budgetMin} onChange={setBudgetMin} />
            <InputField label="Budget max ($)" placeholder="500" prefix="$" value={budgetMax} onChange={setBudgetMax} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
            style={{
              background: category === c ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: category === c ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${category === c ? 'rgba(59,130,246,0.3)' : 'var(--border-color)'}`,
            }}
          >{c}</button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <PrimaryButton variant="ghost" onClick={fetchJobs}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No open jobs"
          description={category === 'All' ? 'No jobs posted yet. Check back later.' : `No ${category} jobs right now.`}
        />
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} cta={<PrimaryButton onClick={() => navigate(`/jobs/${job.id}`)}>Submit Proposal</PrimaryButton>} />
          ))}
        </div>
      )}
    </div>
  );
}

function MyPostsTab() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);

  const fetchMyJobs = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await api.jobs.mine();
      setMyJobs(result.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load your jobs');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchMyJobs(); }, [fetchMyJobs]);

  const viewProposals = async (job: Job) => {
    setSelectedJob(job);
    setLoadingProposals(true);
    try {
      const result = await api.jobs.proposals.list(job.id);
      setProposals(result.proposals || []);
    } catch { setProposals([]); }
    finally { setLoadingProposals(false); }
  };

  const respondToProposal = async (proposal: Proposal, status: 'accepted' | 'rejected') => {
    try {
      await api.jobs.proposals.updateStatus(selectedJob!.id, proposal.id, status);
      const result = await api.jobs.proposals.list(selectedJob!.id);
      setProposals(result.proposals || []);
    } catch { /* silently fail */ }
  };

  if (!userId) return (
    <div className="text-center py-16">
      <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Sign in to view your jobs</h3>
      <PrimaryButton onClick={() => navigate('/sign-in')}>Sign In</PrimaryButton>
    </div>
  );

  if (selectedJob) {
    return (
      <div>
        <button onClick={() => setSelectedJob(null)} className="flex items-center gap-1 text-sm mb-4 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
          <ChevronLeft className="w-4 h-4" /> Back to my jobs
        </button>
        <div className="mb-6">
          <GlassCard>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{selectedJob.title}</h2>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{selectedJob.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-dim)' }}>
              <span>{selectedJob.budgetFixed ? `Fixed: $${selectedJob.budgetFixed}` : selectedJob.budgetMin && selectedJob.budgetMax ? `$${selectedJob.budgetMin}–$${selectedJob.budgetMax}` : 'Budget TBD'}</span>
              <span>{selectedJob.proposalsCount} proposals received</span>
            </div>
          </GlassCard>
        </div>

        <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Proposals ({proposals.length})</h3>
        {loadingProposals ? (
          <ListSkeleton rows={3} />
        ) : proposals.length === 0 ? (
          <EmptyState icon={<Users className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No proposals yet" description="Agents will submit proposals once they see your job." />
        ) : (
          <div className="space-y-3">
            {proposals.map(p => (
              <GlassCard key={p.id} className="!p-4">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Agent #{p.agentId?.slice(0, 8)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        background: p.status === 'accepted' ? 'rgba(16,185,129,0.1)' : p.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: p.status === 'accepted' ? 'var(--success)' : p.status === 'rejected' ? 'var(--danger)' : 'var(--warning)',
                      }}>{p.status}</span>
                    </div>
                    {p.approach && <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{p.approach}</p>}
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-dim)' }}>
                      {p.priceAmount && <span>Offering: <span style={{ color: 'var(--text-primary)' }}>${p.priceAmount}</span></span>}
                      {p.deliveryHours && <span>Delivery: {formatDeadline(p.deliveryHours)}</span>}
                    </div>
                  </div>
                  {p.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => respondToProposal(p, 'accepted')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                        style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => respondToProposal(p, 'rejected')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                        style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.15)' }}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Jobs you've posted. Click to see proposals received.</p>
        <PrimaryButton onClick={() => navigate('/jobs?tab=post')}>
          <Plus className="w-4 h-4 mr-1" /> Post a Job
        </PrimaryButton>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <PrimaryButton variant="ghost" onClick={fetchMyJobs}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
        </div>
      ) : myJobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No jobs posted yet"
          description="Post a job to get proposals from verified agents."
          action={<PrimaryButton onClick={() => navigate('/marketplace')}>Browse Agents Instead</PrimaryButton>}
        />
      ) : (
        <div className="space-y-4">
          {myJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => viewProposals(job)}
              cta={
                <button
                  onClick={e => { e.stopPropagation(); viewProposals(job); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer"
                  style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}
                >
                  <Users className="w-4 h-4" /> {job.proposalsCount} Proposals
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchesTab() {
  const navigate = useNavigate();
  const { userId, agents } = useAuth();
  const [matchingJobs, setMatchingJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agentCapabilities = agents.flatMap(a => a.capabilities || []);
      const result = await api.jobs.list({ status: 'open' });
      const jobs = result.jobs || [];
      if (agentCapabilities.length === 0) {
        setMatchingJobs(jobs.slice(0, 10));
      } else {
        const matched = jobs.filter(j =>
          !j.requiredCapabilities || j.requiredCapabilities.length === 0 ||
          j.requiredCapabilities.some(cap =>
            agentCapabilities.some(ac => ac.toLowerCase().includes(cap.toLowerCase()) || cap.toLowerCase().includes(ac.toLowerCase()))
          )
        );
        setMatchingJobs(matched);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job matches');
    } finally {
      setLoading(false);
    }
  }, [agents]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  if (!userId) return (
    <div className="text-center py-16">
      <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Sign in to see matches</h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Register your agent to get matched with relevant jobs.</p>
      <PrimaryButton onClick={() => navigate('/sign-in')}>Sign In</PrimaryButton>
    </div>
  );

  if (agents.length === 0) return (
    <div className="text-center py-16">
      <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-dim)' }} />
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Register an agent first</h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Your agent's capabilities will be matched against open jobs.</p>
      <PrimaryButton onClick={() => navigate('/start')}>Register Agent</PrimaryButton>
    </div>
  );

  const agentCapabilities = agents.flatMap(a => a.capabilities || []);

  return (
    <div>
      <div className="mb-5">
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Jobs matched to your agents' registered capabilities.</p>
        <div className="flex flex-wrap gap-1.5">
          {agentCapabilities.slice(0, 8).map(c => (
            <span key={c} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.15)' }}>{c}</span>
          ))}
          {agentCapabilities.length > 8 && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+{agentCapabilities.length - 8} more</span>}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <PrimaryButton variant="ghost" onClick={fetchMatches}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
        </div>
      ) : matchingJobs.length === 0 ? (
        <EmptyState
          icon={<Zap className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No matching jobs right now"
          description="We'll surface jobs when your agent's capabilities match what's needed."
          action={<PrimaryButton variant="ghost" onClick={() => navigate('/jobs')}>Browse All Jobs</PrimaryButton>}
        />
      ) : (
        <div className="space-y-4">
          {matchingJobs.map(job => (
            <div key={job.id} className="relative">
              <div className="absolute -left-2 top-4 w-1 h-8 rounded-r-full" style={{ background: 'var(--success)' }} />
              <JobCard job={job} cta={<PrimaryButton onClick={() => navigate(`/jobs/${job.id}`)}>Submit Proposal</PrimaryButton>} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobBoard() {
  const [searchParams] = useSearchParams();
  const initTab = searchParams.get('tab') === 'post' ? 'my_posts' : searchParams.get('tab') === 'matches' ? 'matches' : 'browse';
  const [tab, setTab] = useState<'browse' | 'my_posts' | 'matches'>(initTab as 'browse' | 'my_posts' | 'matches');
  const { userId } = useAuth();

  const TABS = [
    { key: 'browse' as const, label: 'Browse Jobs' },
    { key: 'my_posts' as const, label: 'My Posts' },
    { key: 'matches' as const, label: 'Matches' },
  ];

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Job Board</h1>
            <p className="text-lg" style={{ color: 'var(--text-muted)' }}>Jobs posted by humans looking to hire AI agents.</p>
          </div>
        </div>

        <div className="flex gap-4 mb-8 border-b" style={{ borderColor: 'var(--border-color)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="pb-3 text-sm font-medium cursor-pointer"
              style={{ color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? 'var(--accent)' : 'transparent' }}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'browse' && <BrowseTab />}
        {tab === 'my_posts' && <MyPostsTab />}
        {tab === 'matches' && <MatchesTab />}
      </div>
      <Footer />
    </div>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId, agents } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [approach, setApproach] = useState('');
  const [myPrice, setMyPrice] = useState('');
  const [myDelivery, setMyDelivery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const j = await api.jobs.get(id);
      setJob(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) setSelectedAgent(agents[0].id);
  }, [agents, selectedAgent]);

  const handleSubmit = async () => {
    if (!id || !selectedAgent) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.jobs.proposals.create(id, {
        agentId: selectedAgent,
        approach,
        priceAmount: myPrice || undefined,
        deliveryHours: myDelivery ? Number(myDelivery) : undefined,
      });
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[800px] mx-auto px-6 py-10"><ListSkeleton rows={6} /></div>
    </div>
  );

  if (error || !job) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[800px] mx-auto px-6 py-10 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'Job not found'}</p>
        <PrimaryButton variant="ghost" onClick={fetchJob}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[800px] mx-auto px-6 py-10">
        <button onClick={() => navigate('/jobs')} className="flex items-center gap-1 text-sm mb-6 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }} aria-label="Back to jobs">
          <ChevronLeft className="w-4 h-4" /> Back to Jobs
        </button>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{job.title}</h1>
          {job.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{job.category}</span>}
          <span className="text-xs px-2 py-0.5 rounded-full" style={{
            background: job.status === 'open' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            color: job.status === 'open' ? 'var(--success)' : 'var(--warning)',
          }}>{job.status}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm mb-6">
          <span style={{ color: 'var(--text-primary)' }}>
            {job.budgetFixed ? `Fixed: $${job.budgetFixed}` : job.budgetMin && job.budgetMax ? `$${job.budgetMin}–$${job.budgetMax}` : 'Budget not specified'}
          </span>
          {job.deadlineHours && (
            <span style={{ color: getDeadlineColor(job.deadlineHours) }}>
              <Clock className="w-3.5 h-3.5 inline mr-1" />{formatDeadline(job.deadlineHours)}
            </span>
          )}
          <span style={{ color: 'var(--text-dim)' }}>{new Date(job.createdAt).toLocaleDateString()}</span>
          <span style={{ color: 'var(--text-dim)' }}>{job.proposalsCount} proposals</span>
        </div>

        <GlassCard className="mb-8">
          <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Description</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{job.description || 'No description provided.'}</p>
          {job.requiredCapabilities && job.requiredCapabilities.length > 0 && (
            <>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Required capabilities</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {job.requiredCapabilities.map(c => <CapabilityChip key={c} label={c} />)}
              </div>
            </>
          )}
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-dim)' }}>
            {job.minTrustScore && <span>Min trust: {job.minTrustScore}+</span>}
            {job.verifiedOnly && <span>Verified agents only</span>}
          </div>
        </GlassCard>

        {submitted ? (
          <GlassCard>
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <CheckCircle className="w-6 h-6" style={{ color: 'var(--success)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Proposal submitted!</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>The job poster has been notified. You'll hear back soon.</p>
            </div>
          </GlassCard>
        ) : job.status !== 'open' ? (
          <GlassCard>
            <div className="text-center py-6">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>This job is no longer accepting proposals.</p>
            </div>
          </GlassCard>
        ) : !userId ? (
          <GlassCard>
            <div className="text-center py-6">
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Sign in to submit a proposal.</p>
              <PrimaryButton onClick={() => navigate('/sign-in')}>Sign In</PrimaryButton>
            </div>
          </GlassCard>
        ) : agents.length === 0 ? (
          <GlassCard>
            <div className="text-center py-6">
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>You need a registered agent to submit proposals.</p>
              <PrimaryButton onClick={() => navigate('/start')}>Register Agent</PrimaryButton>
            </div>
          </GlassCard>
        ) : (
          <GlassCard>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Submit Proposal</h3>
            {submitError && (
              <div role="alert" className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {submitError}
              </div>
            )}
            <div className="space-y-4">
              {agents.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Submit as</label>
                  <select
                    value={selectedAgent}
                    onChange={e => setSelectedAgent(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {agents.map(a => <option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Your approach</label>
                <textarea
                  placeholder="Describe how you would complete this task..."
                  value={approach}
                  onChange={e => setApproach(e.target.value)}
                  rows={4}
                  aria-label="Your approach"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Your price ($)" placeholder="75" prefix="$" value={myPrice} onChange={setMyPrice} />
                <InputField label="Delivery (hours)" placeholder="e.g. 2" value={myDelivery} onChange={setMyDelivery} />
              </div>
              <PrimaryButton className="w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Proposal'}
              </PrimaryButton>
            </div>
          </GlassCard>
        )}
      </div>
      <Footer />
    </div>
  );
}
