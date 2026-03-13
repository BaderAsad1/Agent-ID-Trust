import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Clock, DollarSign, CheckCircle, BarChart3, Inbox, Activity, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, EventTypeIcon, StarRating, CardSkeleton, ListSkeleton, EmptyState } from '@/components/shared';
import { Sidebar, MobileSidebar } from '@/components/Sidebar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/AuthContext';
import { api, type Agent, type ActivityItem, type Listing, type TaskItem, type LedgerEntry, type Job } from '@/lib/api';
import { Mail } from '@/pages/Mail';

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Something went wrong</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{message}</p>
      {onRetry && (
        <PrimaryButton variant="ghost" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" /> Try Again
        </PrimaryButton>
      )}
    </div>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <div className="hidden md:block"><Sidebar /></div>
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="md:ml-60">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }} aria-label="Menu"><Menu className="w-5 h-5" /></button>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '13px' }}>AGENT ID</span>
          <div className="w-5" />
        </div>
        <div className="p-6 md:p-8 max-w-[1100px]">{children}</div>
      </div>
    </div>
  );
}

function Overview() {
  const navigate = useNavigate();
  const { agents } = useAuth();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashStats = await api.dashboard.stats();
      setStats(dashStats as unknown as Record<string, unknown>);
      setRecentActivity((dashStats as unknown as Record<string, unknown>).recentActivity as ActivityItem[] || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {[1,2,3,4,5].map(i => <CardSkeleton key={i} />)}
      </div>
      <ListSkeleton rows={4} />
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const statCards = [
    { label: 'Total Agents', value: String(stats?.totalAgents || 0), color: 'var(--accent)' },
    { label: 'Tasks Received', value: String(stats?.tasksReceived || 0), color: 'var(--success)' },
    { label: 'Tasks Completed', value: String(stats?.tasksCompleted || 0), color: 'var(--success)' },
    { label: 'Marketplace Earnings', value: `$${Number(stats?.marketplaceEarnings || 0).toFixed(0)}`, color: 'var(--marketplace)' },
    { label: 'Active Agents', value: String(stats?.activeAgents || 0), color: 'var(--domain)' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(s => (
          <GlassCard key={s.label} className="!p-4">
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </GlassCard>
        ))}
      </div>
      <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>My Agents</h2>
      {agents.length === 0 ? (
        <EmptyState icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No agents yet" description="Register your first agent to get started." action={<PrimaryButton onClick={() => navigate('/start')}>Register Agent</PrimaryButton>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {agents.map(agent => (
            <GlassCard key={agent.id} hover>
              <div className="flex items-start gap-4">
                <Identicon handle={agent.handle} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{agent.displayName}</span>
                    <StatusDot status={agent.status as 'active' | 'inactive' | 'draft'} />
                  </div>
                  <AgentHandle handle={agent.handle} size="sm" />
                  {agent.domainName && <div className="mt-1"><DomainBadge domain={agent.domainName} size="sm" /></div>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(agent.capabilities || []).slice(0, 3).map(c => <CapabilityChip key={c} label={c} />)}
                    {(agent.capabilities || []).length > 3 && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+{agent.capabilities.length - 3} more</span>}
                  </div>
                </div>
                <TrustScoreRing score={agent.trustScore || 0} size={48} />
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <PrimaryButton variant="ghost" onClick={() => navigate(`/${agent.handle}`)}>View Profile</PrimaryButton>
                <PrimaryButton variant="ghost">Edit</PrimaryButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
      <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Recent Activity</h2>
      {recentActivity.length === 0 ? (
        <EmptyState icon={<Activity className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No activity yet" description="Activity will appear here as your agents work." />
      ) : (
        <GlassCard>
          <div className="space-y-3">
            {recentActivity.slice(0, 10).map(evt => (
              <div key={evt.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{new Date(evt.createdAt).toLocaleDateString()}</span>
                <EventTypeIcon type={evt.eventType.includes('task') ? 'task_received' : evt.eventType.includes('payment') ? 'payment_received' : evt.eventType.includes('verification') ? 'verification_event' : 'task_received'} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{evt.eventType}: {JSON.stringify(evt.payload).slice(0, 80)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function TaskInbox() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'completed'>('all');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.tasks.list();
      setTasks(result.tasks || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Task Inbox</h1>
        <div className="flex gap-2">
          {(['all', 'pending', 'accepted', 'completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="text-xs px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: filter === f ? 'rgba(59,130,246,0.1)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--text-dim)', border: 'none' }}>{f.replace('_', ' ')}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTasks} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Inbox className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No tasks here" description={filter === 'all' ? 'Your inbox is empty. Tasks will appear here when agents or clients send work.' : `No ${filter} tasks right now.`} />
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <GlassCard key={task.id} hover className="!p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{task.taskType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full`} style={{
                      background: task.status === 'pending' ? 'rgba(59,130,246,0.1)' : task.status === 'accepted' ? 'rgba(245,158,11,0.1)' : task.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: task.status === 'pending' ? 'var(--accent)' : task.status === 'accepted' ? 'var(--warning)' : task.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                    }}>{task.status}</span>
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{JSON.stringify(task.payload).slice(0, 100)}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>{new Date(task.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLogPage() {
  const { agents } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const fetchActivity = useCallback(async () => {
    if (agents.length === 0) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const allActivities: ActivityItem[] = [];
      for (const agent of agents) {
        try {
          const result = await api.activity.list(agent.id);
          allActivities.push(...(result.activities || []));
        } catch { /* skip agent */ }
      }
      allActivities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActivities(allActivities);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [agents]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Activity Log</h1>
      {loading ? (
        <ListSkeleton rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchActivity} />
      ) : activities.length === 0 ? (
        <EmptyState icon={<Activity className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No activity yet" description="Activity events will appear here as your agents receive tasks and complete work." />
      ) : (
        <GlassCard>
          <div className="space-y-2">
            {activities.map(evt => (
              <div key={evt.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                <span className="text-xs font-mono w-16 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{evt.hmacHash?.slice(0, 8) || '—'}</span>
                <EventTypeIcon type={evt.eventType.includes('task') ? 'task_received' : 'task_completed'} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{evt.eventType}</span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{new Date(evt.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function MarketplaceDashboard() {
  const navigate = useNavigate();
  const { agents } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [matchingJobs, setMatchingJobs] = useState<Job[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listingsRes, jobsRes] = await Promise.all([
        api.marketplace.listings.list(),
        api.jobs.list({ limit: '4' }),
      ]);
      const agentIds = new Set(agents.map(a => a.id));
      setMyListings((listingsRes.listings || []).filter(l => agentIds.has(l.agentId)));
      setMatchingJobs(jobsRes.jobs || []);
      try {
        const ledgerRes = await api.payments.ledger();
        setLedger(ledgerRes.entries || []);
      } catch { setLedger([]); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load marketplace data');
    } finally {
      setLoading(false);
    }
  }, [agents]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalEarned = ledger.filter(e => e.direction === 'inbound').reduce((s, e) => s + Number(e.amount), 0);

  if (loading) return <div><h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Marketplace</h1><ListSkeleton rows={5} /></div>;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Marketplace</h1>
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>My Listings</h2>
            <PrimaryButton variant="purple">Create New Listing</PrimaryButton>
          </div>
          {myListings.length === 0 ? (
            <EmptyState icon={<DollarSign className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No listings yet" description="Create a marketplace listing to start earning." />
          ) : (
            <GlassCard>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      {['Title', 'Price', 'Status', 'Rating', 'Actions'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myListings.map(l => (
                      <tr key={l.id} className="border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                        <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>{l.title}</td>
                        <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>${l.priceAmount}/{l.priceUnit}</td>
                        <td className="py-3 px-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: l.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: l.status === 'active' ? 'var(--success)' : 'var(--warning)' }}>{l.status}</span></td>
                        <td className="py-3 px-3"><StarRating rating={Number(l.avgRating || 0)} /></td>
                        <td className="py-3 px-3">
                          <button className="text-xs cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Open Jobs</h2>
          {matchingJobs.length === 0 ? (
            <EmptyState icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No open jobs" description="Check back later for new job postings." />
          ) : (
            <div className="space-y-3">
              {matchingJobs.map(j => (
                <GlassCard key={j.id} hover className="!p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{j.title}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                        <span>{j.budgetFixed ? `$${j.budgetFixed}` : `$${j.budgetMin}–$${j.budgetMax}`}</span>
                        {j.deadlineHours && <span>Due in {j.deadlineHours}h</span>}
                        <span>{j.proposalsCount} proposals</span>
                      </div>
                    </div>
                    <PrimaryButton variant="purple" onClick={() => navigate(`/jobs/${j.id}`)}>Submit Proposal</PrimaryButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Earnings</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <GlassCard className="!p-4">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Total earned</div>
              <div className="text-xl font-bold" style={{ color: 'var(--marketplace)' }}>${totalEarned.toFixed(2)}</div>
            </GlassCard>
            <GlassCard className="!p-4">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Transactions</div>
              <div className="text-xl font-bold" style={{ color: 'var(--marketplace)' }}>{ledger.length}</div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainRecordsTable({ agentId, handle, domainName }: { agentId: string; handle: string; domainName?: string }) {
  const [records, setRecords] = useState<Array<{ type: string; name: string; value: string; ttl: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.agents.domain(agentId)
      .then(domain => {
        if (domain && domain.dnsRecords && domain.dnsRecords.length > 0) {
          setRecords(domain.dnsRecords);
        } else {
          setRecords([
            { type: 'CNAME', name: domainName || `${handle}.agent`, value: 'edge.agentid.net', ttl: 300 },
            { type: 'TXT', name: '_agentid', value: `v=agentid1 id=${agentId}`, ttl: 3600 },
          ]);
        }
      })
      .catch(() => {
        setRecords([
          { type: 'CNAME', name: domainName || `${handle}.agent`, value: 'edge.agentid.net', ttl: 300 },
          { type: 'TXT', name: '_agentid', value: `v=agentid1 id=${agentId}`, ttl: 3600 },
        ]);
      })
      .finally(() => setLoading(false));
  }, [agentId, handle, domainName]);

  if (loading) return <div className="h-20 rounded-lg animate-pulse mb-4" style={{ background: 'var(--bg-elevated)' }} />;

  return (
    <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: 'var(--border-color)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-elevated)' }}>
            {['Type', 'Name', 'Value', 'TTL'].map(h => (
              <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
              <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{r.type}</td>
              <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{r.name}</td>
              <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{r.value}</td>
              <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{r.ttl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DomainDashboard() {
  const { agents } = useAuth();
  const [hnsEnabled, setHnsEnabled] = useState(false);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Your .agent Domains</h1>
      {agents.length === 0 ? (
        <EmptyState icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No agents" description="Register an agent to get your .agent domain." />
      ) : (
        <div className="space-y-6">
          {agents.map(agent => (
            <GlassCard key={agent.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{agent.domainName || `${agent.handle}.agent`}</div>
                  <StatusDot status={agent.domainStatus === 'active' ? 'active' : 'inactive'} />
                </div>
                <button className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }} aria-label="Copy domain">Copy</button>
              </div>
              <DomainRecordsTable agentId={agent.id} handle={agent.handle} domainName={agent.domainName} />
              <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Handshake blockchain anchoring</span>
                <button
                  onClick={() => setHnsEnabled(!hnsEnabled)}
                  className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
                  style={{ background: hnsEnabled ? 'var(--domain)' : 'var(--border-color)', border: 'none' }}
                  aria-label="Toggle Handshake anchoring"
                >
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: hnsEnabled ? '22px' : '2px' }} />
                </button>
              </div>
            </GlassCard>
          ))}

          <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
            <p className="text-sm" style={{ color: 'var(--domain)' }}>
              Your .agent domain is included with your plan and managed automatically. Agent ID operates the .agent namespace via our global anycast DNS infrastructure.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const { userId, agents } = useAuth();
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; prefix: string; label: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.users.apiKeys.list()
      .then(res => setApiKeys(res.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Settings</h1>
      <div className="space-y-6">
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Account</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>User ID</div><div className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{userId || '—'}</div></div>
            </div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Agents</div><div className="text-sm" style={{ color: 'var(--text-primary)' }}>{agents.length} registered</div></div>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>API Keys</h3>
          {loading ? (
            <ListSkeleton rows={2} />
          ) : apiKeys.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No API keys created yet.</p>
          ) : (
            apiKeys.map(k => (
              <div key={k.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{k.label}</div>
                  <div className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{k.prefix}...</div>
                </div>
                <PrimaryButton variant="ghost" onClick={() => api.users.apiKeys.revoke(k.id).then(() => setApiKeys(prev => prev.filter(x => x.id !== k.id)))}>Revoke</PrimaryButton>
              </div>
            ))
          )}
        </GlassCard>
        <div className="pt-4">
          <PrimaryButton variant="danger">Delete Account</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const path = location.pathname;

  useEffect(() => {
    if (!userId) navigate('/sign-in');
  }, [userId, navigate]);

  if (!userId) return null;

  let content;
  if (path === '/dashboard' || path === '/dashboard/agents') content = <Overview />;
  else if (path === '/dashboard/inbox') content = <TaskInbox />;
  else if (path === '/dashboard/mail') content = <Mail />;
  else if (path === '/dashboard/log') content = <ActivityLogPage />;
  else if (path === '/dashboard/marketplace') content = <MarketplaceDashboard />;
  else if (path === '/dashboard/domain') content = <DomainDashboard />;
  else if (path === '/dashboard/settings') content = <SettingsPage />;
  else content = <Overview />;

  return <DashboardLayout>{content}</DashboardLayout>;
}
