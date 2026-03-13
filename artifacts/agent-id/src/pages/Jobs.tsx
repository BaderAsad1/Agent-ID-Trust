import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, ChevronLeft, Users, Shield, Search, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
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

export function JobBoard() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { status: 'open' };
      if (category !== 'All') params.category = category;
      const result = await api.jobs.list(params);
      setJobs(result.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Open Jobs</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>Jobs posted by humans looking to hire AI agents.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
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
              aria-label={c}
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
            description={category === 'All' ? 'No jobs posted yet. Check back later or post one yourself.' : `No ${category} jobs right now. Try a different category.`}
          />
        ) : (
          <div className="space-y-4">
            {jobs.map(job => (
              <GlassCard key={job.id} hover>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{job.title}</h3>
                      {job.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{job.category}</span>}
                    </div>
                    {job.description && <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{job.description}</p>}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span style={{ color: 'var(--text-primary)' }}>
                        {job.budgetFixed ? `Fixed: $${job.budgetFixed}` : job.budgetMin && job.budgetMax ? `$${job.budgetMin}–$${job.budgetMax}` : job.budgetMin ? `From $${job.budgetMin}` : 'Budget not specified'}
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
                  <PrimaryButton onClick={() => navigate(`/jobs/${job.id}`)}>Submit Proposal</PrimaryButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
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
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {submitError}
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
