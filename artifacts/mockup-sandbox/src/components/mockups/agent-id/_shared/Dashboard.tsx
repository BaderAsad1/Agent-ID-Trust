import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Clock, DollarSign, CheckCircle, BarChart3, Inbox, Activity, Search } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, EventTypeIcon, StarRating, CardSkeleton, ListSkeleton, EmptyState } from './components';
import { agents, inboxItems, activityLog, marketplaceListings, earnings, jobs } from './data';
import { Sidebar, MobileSidebar } from './Sidebar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <div className="hidden md:block"><Sidebar /></div>
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="md:ml-60">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-surface)' }}>
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
  const stats = [
    { label: 'Total Agents', value: '2', color: 'var(--accent)' },
    { label: 'Tasks Received', value: '47', color: 'var(--success)' },
    { label: 'Trust Score', value: '94/100', color: 'var(--success)' },
    { label: 'Marketplace Earnings', value: '$340', color: 'var(--marketplace)' },
    { label: '.agent Domains', value: '2 Active', color: 'var(--domain)' },
  ];
  const recentEvents = activityLog.slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(s => (
          <GlassCard key={s.label} className="!p-4">
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </GlassCard>
        ))}
      </div>
      <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>My Agents</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {agents.map(agent => (
          <GlassCard key={agent.id} hover>
            <div className="flex items-start gap-4">
              <Identicon handle={agent.handle} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{agent.displayName}</span>
                  <StatusDot status={agent.status} />
                </div>
                <AgentHandle handle={agent.handle} size="sm" />
                <div className="mt-1"><DomainBadge domain={agent.domain} size="sm" /></div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {agent.capabilities.slice(0, 3).map(c => <CapabilityChip key={c} label={c} />)}
                  {agent.capabilities.length > 3 && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+{agent.capabilities.length - 3} more</span>}
                </div>
                <div className="flex items-center gap-3 mt-3 text-sm">
                  {agent.marketplaceListed ? (
                    <span style={{ color: 'var(--marketplace)' }}>Listed · ${agent.marketplacePrice}/{agent.marketplacePriceUnit}</span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>Not listed</span>
                  )}
                </div>
              </div>
              <TrustScoreRing score={agent.trustScore} size={48} />
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <PrimaryButton variant="ghost" onClick={() => navigate(`/${agent.handle}`)}>View Profile</PrimaryButton>
              <PrimaryButton variant="ghost">Edit</PrimaryButton>
              {agent.marketplaceListed && <PrimaryButton variant="ghost">Manage Listing</PrimaryButton>}
            </div>
          </GlassCard>
        ))}
      </div>
      <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Recent Activity</h2>
      <GlassCard>
        <div className="space-y-3">
          {recentEvents.map(evt => (
            <div key={evt.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{evt.timestamp}</span>
              <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{agents.find(a => a.id === evt.agentId)?.handle}</span>
              <EventTypeIcon type={evt.type} />
              <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{evt.details}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function TaskInbox() {
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  useEffect(() => { const t = setTimeout(() => setLoading(false), 800); return () => clearTimeout(t); }, []);

  const filtered = filter === 'all' ? inboxItems : inboxItems.filter(i => i.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Task Inbox</h1>
        <div className="flex gap-2">
          {(['all', 'pending', 'in_progress', 'completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="text-xs px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: filter === f ? 'rgba(59,130,246,0.1)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--text-dim)', border: 'none' }}>{f.replace('_', ' ')}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          <ListSkeleton rows={5} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Inbox className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No tasks here" description={filter === 'all' ? 'Your inbox is empty. Tasks will appear here when agents or clients send work.' : `No ${filter.replace('_', ' ')} tasks right now.`} />
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <GlassCard key={item.id} hover className="!p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full`} style={{
                      background: item.status === 'pending' ? 'rgba(59,130,246,0.1)' : item.status === 'in_progress' ? 'rgba(245,158,11,0.1)' : item.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: item.status === 'pending' ? 'var(--accent)' : item.status === 'in_progress' ? 'var(--warning)' : item.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                    }}>{item.status.replace('_', ' ')}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: item.type === 'hire' ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.05)', color: item.type === 'hire' ? 'var(--marketplace)' : 'var(--text-dim)' }}>{item.type}</span>
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>from {item.from}</span>
                    <span>{item.receivedAt}</span>
                    {item.budget && <span>${item.budget}</span>}
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
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Activity Log</h1>
      {loading ? (
        <ListSkeleton rows={8} />
      ) : activityLog.length === 0 ? (
        <EmptyState icon={<Activity className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No activity yet" description="Activity events will appear here as your agents receive tasks and complete work." />
      ) : (
        <GlassCard>
          <div className="space-y-2">
            {activityLog.map(evt => (
              <div key={evt.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                <span className="text-xs font-mono w-16 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{evt.hash}</span>
                <EventTypeIcon type={evt.type} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{evt.details}</span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{evt.timestamp}</span>
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
  const myListings = marketplaceListings.filter(l => ['agent-1', 'agent-2'].includes(l.agentId));
  const matchingJobs = jobs.slice(0, 4);
  const totalEarned = earnings.reduce((s, e) => s + e.amount, 0);
  const thisMonth = earnings[earnings.length - 1]?.amount || 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Marketplace</h1>
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>My Listings</h2>
            <PrimaryButton variant="purple">Create New Listing</PrimaryButton>
          </div>
          <GlassCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                    {['Title', 'Agent', 'Price', 'Status', 'Views', 'Hires', 'Rating', 'Actions'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myListings.map(l => {
                    const agent = agents.find(a => a.id === l.agentId)!;
                    return (
                      <tr key={l.id} className="border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                        <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>{l.title}</td>
                        <td className="py-3 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{agent.handle}</td>
                        <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>${l.price}/{l.priceUnit}</td>
                        <td className="py-3 px-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Active</span></td>
                        <td className="py-3 px-3" style={{ color: 'var(--text-muted)' }}>{Math.floor(Math.random() * 200 + 50)}</td>
                        <td className="py-3 px-3" style={{ color: 'var(--text-muted)' }}>{l.reviews}</td>
                        <td className="py-3 px-3"><StarRating rating={l.rating} /></td>
                        <td className="py-3 px-3">
                          <div className="flex gap-2">
                            <button className="text-xs cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>Edit</button>
                            <button className="text-xs cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>Pause</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Incoming Job Inquiries</h2>
          <div className="space-y-3">
            {matchingJobs.map(j => (
              <GlassCard key={j.id} hover className="!p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{j.title}</span>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                      <span>{j.budgetType === 'fixed' ? `$${j.budgetMin}` : `$${j.budgetMin}–$${j.budgetMax}`}</span>
                      <span>{j.deadline}</span>
                      <span>{j.postedBy}</span>
                    </div>
                  </div>
                  <PrimaryButton variant="purple" onClick={() => navigate(`/jobs/${j.id}`)}>Submit Proposal</PrimaryButton>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Earnings</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <GlassCard className="!p-4">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Total earned</div>
              <div className="text-xl font-bold" style={{ color: 'var(--marketplace)' }}>${totalEarned}</div>
            </GlassCard>
            <GlassCard className="!p-4">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>This month</div>
              <div className="text-xl font-bold" style={{ color: 'var(--marketplace)' }}>${thisMonth}</div>
            </GlassCard>
            <GlassCard className="!p-4">
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Pending payout</div>
              <div className="text-xl font-bold" style={{ color: 'var(--warning)' }}>$85</div>
            </GlassCard>
          </div>
          <GlassCard className="!p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={earnings}>
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#161D26', border: '1px solid #1E293B', borderRadius: '8px', color: '#F1F5F9', fontSize: '12px' }} />
                <Bar dataKey="amount" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
          <div className="mt-4">
            <PrimaryButton variant="purple">Request Payout</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainDashboard() {
  const [hnsEnabled, setHnsEnabled] = useState(false);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Your .agent Domains</h1>
      <div className="space-y-6">
        {agents.map(agent => (
          <GlassCard key={agent.id}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{agent.domain}</div>
                <StatusDot status="active" />
              </div>
              <button className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }} aria-label="Copy domain">Copy</button>
            </div>
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
                  <tr className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>A</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>{agent.domain}</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>104.21.32.{Math.floor(Math.random() * 255)}</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>300</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>TXT</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>_agentid</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>agid_verify_{agent.handle.replace('-', '')}</td>
                    <td className="py-2 px-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '12px' }}>3600</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
            {hnsEnabled && (
              <div className="mt-3 text-sm space-y-1" style={{ color: 'var(--text-dim)' }}>
                <div>HNS Tx: <span style={{ fontFamily: 'var(--font-mono)' }}>0x7a3f...c8e2</span></div>
                <div>Block: <span style={{ fontFamily: 'var(--font-mono)' }}>198,432</span></div>
                <div>Resolver: <span style={{ color: 'var(--success)' }}>Active</span></div>
              </div>
            )}
          </GlassCard>
        ))}

        <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
          <p className="text-sm" style={{ color: 'var(--domain)' }}>
            Your .agent domain is included with your plan and managed automatically. Agent ID operates the .agent namespace via our global anycast DNS infrastructure. For censorship-resistant backup resolution, you can optionally anchor your domain on the Handshake blockchain.
          </p>
        </div>

        <GlassCard className="!border-dashed opacity-60">
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Custom Domains — Coming Soon</h3>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Point your own domain (e.g. agent.yourcompany.com) to your Agent ID profile.</p>
        </GlassCard>
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Settings</h1>
      <div className="space-y-6">
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Account</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Email</div><div className="text-sm" style={{ color: 'var(--text-primary)' }}>bader@example.com</div></div>
              <PrimaryButton variant="ghost">Change</PrimaryButton>
            </div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Password</div><div className="text-sm" style={{ color: 'var(--text-dim)' }}>Last changed 30 days ago</div></div>
              <PrimaryButton variant="ghost">Change</PrimaryButton>
            </div>
            <div className="flex items-center justify-between py-2">
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Plan</div><div className="text-sm" style={{ color: 'var(--accent)' }}>Pro — $99/yr</div></div>
              <PrimaryButton variant="ghost">Manage</PrimaryButton>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>API Keys</h3>
          <div className="flex items-center justify-between py-2">
            <div className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>agid_live_sk_...4f2e</div>
            <div className="flex gap-2">
              <PrimaryButton variant="ghost">Reveal</PrimaryButton>
              <PrimaryButton variant="ghost">Regenerate</PrimaryButton>
            </div>
          </div>
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
  const path = location.pathname;

  let content;
  if (path === '/dashboard' || path === '/dashboard/agents') content = <Overview />;
  else if (path === '/dashboard/inbox') content = <TaskInbox />;
  else if (path === '/dashboard/log') content = <ActivityLogPage />;
  else if (path === '/dashboard/marketplace') content = <MarketplaceDashboard />;
  else if (path === '/dashboard/domain') content = <DomainDashboard />;
  else if (path === '/dashboard/settings') content = <SettingsPage />;
  else content = <Overview />;

  return <DashboardLayout>{content}</DashboardLayout>;
}
