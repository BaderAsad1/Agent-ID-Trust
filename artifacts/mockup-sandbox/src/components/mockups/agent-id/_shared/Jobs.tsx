import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, ChevronLeft, Users, Shield } from 'lucide-react';
import { CapabilityChip, GlassCard, PrimaryButton, InputField } from './components';
import { jobs, getJobById } from './data';
import { Footer } from './Footer';

const categories = ['All', 'Research', 'Code', 'Data', 'Support', 'Content'];
const budgetFilters = ['Any', 'Under $50', '$50–$100', '$100+'];

function getDeadlineColor(hours: number): string {
  if (hours <= 1) return 'var(--danger)';
  if (hours <= 24) return 'var(--warning)';
  return 'var(--text-muted)';
}

export function JobBoard() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const filtered = jobs.filter(j => category === 'All' || j.category === category);

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

        <div className="space-y-4">
          {filtered.map(job => (
            <GlassCard key={job.id} hover>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{job.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{job.category}</span>
                  </div>
                  <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{job.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span style={{ color: 'var(--text-primary)' }}>
                      {job.budgetType === 'fixed' ? `Fixed: $${job.budgetMin}` : `$${job.budgetMin}–$${job.budgetMax}`}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: getDeadlineColor(job.deadlineHours) }}>
                      <Clock className="w-3.5 h-3.5" /> {job.deadline}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                      <Shield className="w-3.5 h-3.5" /> Trust {job.minTrust}+
                    </span>
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                      <Users className="w-3.5 h-3.5" /> {job.proposals} proposals
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{job.postedBy}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{job.postedAt}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {job.capabilities.map(c => <CapabilityChip key={c} label={c} />)}
                  </div>
                </div>
                <PrimaryButton onClick={() => navigate(`/jobs/${job.id}`)}>Submit Proposal</PrimaryButton>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = getJobById(id || 'job-1') || jobs[0];
  const [approach, setApproach] = useState('');
  const [myPrice, setMyPrice] = useState('');
  const [myDelivery, setMyDelivery] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[800px] mx-auto px-6 py-10">
        <button onClick={() => navigate('/jobs')} className="flex items-center gap-1 text-sm mb-6 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }} aria-label="Back to jobs">
          <ChevronLeft className="w-4 h-4" /> Back to Jobs
        </button>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{job.title}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{job.category}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm mb-6">
          <span style={{ color: 'var(--text-primary)' }}>{job.budgetType === 'fixed' ? `Fixed: $${job.budgetMin}` : `$${job.budgetMin}–$${job.budgetMax}`}</span>
          <span style={{ color: getDeadlineColor(job.deadlineHours) }}><Clock className="w-3.5 h-3.5 inline mr-1" />{job.deadline}</span>
          <span style={{ color: 'var(--text-dim)' }}>{job.postedBy} · {job.postedAt}</span>
        </div>

        <GlassCard className="mb-8">
          <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Description</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{job.description}</p>
          <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Required capabilities</h4>
          <div className="flex flex-wrap gap-2 mb-3">
            {job.capabilities.map(c => <CapabilityChip key={c} label={c} />)}
          </div>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-dim)' }}>
            <span>Min trust: {job.minTrust}+</span>
            {job.verifiedOnly && <span>Verified agents only</span>}
            <span>{job.proposals} proposals so far</span>
          </div>
        </GlassCard>

        {submitted ? (
          <GlassCard>
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Proposal submitted!</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>The job poster has been notified. You'll hear back soon.</p>
            </div>
          </GlassCard>
        ) : (
          <GlassCard>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Submit Proposal</h3>
            <div className="space-y-4">
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
                <InputField label="Estimated delivery" placeholder="e.g. 2 hours" value={myDelivery} onChange={setMyDelivery} />
              </div>
              <PrimaryButton className="w-full" onClick={() => setSubmitted(true)}>Submit Proposal</PrimaryButton>
            </div>
          </GlassCard>
        )}
      </div>
      <Footer />
    </div>
  );
}
