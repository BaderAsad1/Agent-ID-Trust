import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Menu, Clock, DollarSign, CheckCircle, BarChart3, Inbox, Activity, Search, AlertCircle, RefreshCw, ShieldCheck, X, ArrowRightLeft, Network, Globe, CreditCard, Copy, Check, ExternalLink, RotateCw, Plus, Link, Zap } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, EventTypeIcon, StarRating, CardSkeleton, ListSkeleton, EmptyState } from '@/components/shared';
import { Sidebar, MobileSidebar } from '@/components/Sidebar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/AuthContext';
import { api, type Agent, type AgentCredential, type ActivityItem, type Listing, type TaskItem, type LedgerEntry, type Job, type TransferSale as TransferSaleType, type ConnectStatus } from '@/lib/api';
import { formatPrice } from '@/lib/pricing';
import { Mail } from '@/pages/Mail';
import { TransferWizardModal, TransferStatusBadge, TransferDashboardPage } from '@/pages/TransferSale';
import { QRCodeSVG } from 'qrcode.react';

async function initiateHandleCheckout(handle: string) {
  const base = window.location.origin;
  const successUrl = `${base}/dashboard?payment=success&handle=${encodeURIComponent(handle)}`;
  const cancelUrl = `${base}/dashboard?payment=cancelled&handle=${encodeURIComponent(handle)}`;
  const result = await api.payments.handleCheckout(handle, successUrl, cancelUrl);
  if (result.url) {
    window.location.href = result.url;
  }
  return result;
}

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
    <div className="min-h-screen" data-mobile-compact style={{ background: 'var(--bg-base)' }}>
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

function VerifyAgentModal({ agent, onClose, onVerified }: { agent: Agent; onClose: () => void; onVerified: () => void }) {
  const [step, setStep] = useState<'idle' | 'initiated' | 'completing' | 'done' | 'error'>('idle');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [kid, setKid] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleInitiate = async () => {
    setStep('initiated');
    setErrorMsg('');
    try {
      const result = await api.agents.verify.initiate(agent.id, 'key_challenge');
      setChallenge((result as { challenge: string }).challenge);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to initiate verification');
      setStep('error');
    }
  };

  const handleComplete = async () => {
    if (!challenge || !signature.trim() || !kid.trim()) return;
    setStep('completing');
    setErrorMsg('');
    try {
      await api.agents.verify.complete(agent.id, { challenge, signature: signature.trim(), kid: kid.trim() });
      setStep('done');
      setTimeout(() => { onVerified(); onClose(); }, 1500);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Verification failed');
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Close"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Verify {agent.displayName}</h3>
        </div>

        {step === 'idle' && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Prove ownership of this agent by signing a cryptographic challenge with your registered key.</p>
            <ol className="text-xs space-y-1 mb-4 list-decimal pl-4" style={{ color: 'var(--text-dim)' }}>
              <li>Click "Start Verification" to receive a challenge token</li>
              <li>Sign the token with your agent's private key using Ed25519</li>
              <li>Paste the base64-encoded signature and your Key ID below</li>
            </ol>
            <PrimaryButton onClick={handleInitiate}>Start Verification</PrimaryButton>
          </div>
        )}

        {step === 'initiated' && challenge && (
          <div className="space-y-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Challenge Token</label>
              <div className="p-2 rounded-lg text-xs break-all" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{challenge}</div>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Sign with your private key (Node.js)</label>
              <pre className="p-2 rounded-lg text-[10px] overflow-x-auto whitespace-pre" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{`const crypto = require("crypto");
const privateKey = fs.readFileSync("ed25519.pem");
const sig = crypto.sign(null, Buffer.from("${challenge}"), privateKey);
console.log(sig.toString("base64"));`}</pre>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Key ID (kid)</label>
              <input value={kid} onChange={e => setKid(e.target.value)} placeholder="Your registered key ID" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Signature</label>
              <textarea value={signature} onChange={e => setSignature(e.target.value)} placeholder="Paste your signed challenge here" rows={3} className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
            </div>
            <PrimaryButton onClick={handleComplete} disabled={!signature.trim() || !kid.trim()}>Complete Verification</PrimaryButton>
          </div>
        )}

        {step === 'initiated' && !challenge && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Initiating challenge...</p>
        )}

        {step === 'completing' && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Verifying signature...</p>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Agent verified successfully!</p>
          </div>
        )}

        {step === 'error' && (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
            <PrimaryButton variant="ghost" onClick={() => setStep('idle')}>Try Again</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

const MCP_CONFIG = `{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "your-api-key-here"
      }
    }
  }
}`;

function McpQuickstartCard() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('agentid_mcp_dismissed') === '1'; } catch { return false; }
  });
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('agentid_mcp_dismissed', '1'); } catch {}
  };

  return (
    <GlassCard className="!p-5 mb-8">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(79,125,243,0.1)' }}>
          <Zap className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Connect via MCP</h3>
            <button onClick={handleDismiss} className="cursor-pointer flex-shrink-0 ml-2" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Use Agent ID with Claude Desktop, Cursor, or VS Code to resolve identities and route tasks from your IDE.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => navigate('/integrations/claude-desktop')} className="text-xs px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: 'rgba(79,125,243,0.08)', color: 'var(--accent)', border: '1px solid rgba(79,125,243,0.2)' }}>Claude Desktop</button>
            <button onClick={() => navigate('/integrations/cursor')} className="text-xs px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.08)', color: 'var(--marketplace)', border: '1px solid rgba(139,92,246,0.2)' }}>Cursor</button>
            <button onClick={() => navigate('/integrations/vscode')} className="text-xs px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>VS Code</button>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium cursor-pointer flex items-center gap-1" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>
            {expanded ? '▾ Hide config' : '▸ Show config snippet'}
          </button>
          {expanded && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
              <pre className="p-3 overflow-x-auto text-xs" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
                <code>{MCP_CONFIG}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function Overview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agents, refreshAgents } = useAuth();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingAgent, setVerifyingAgent] = useState<Agent | null>(null);
  const [transferringAgent, setTransferringAgent] = useState<Agent | null>(null);
  const [agentTransfers, setAgentTransfers] = useState<Record<string, TransferSaleType>>({});

  const searchParams = new URLSearchParams(location.search);
  const paymentResult = searchParams.get('payment');
  const paymentHandle = searchParams.get('handle');

  useEffect(() => {
    if (paymentResult === 'success') {
      refreshAgents();
    }
  }, [paymentResult, refreshAgents]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashStats = await api.dashboard.stats();
      setStats(dashStats as unknown as Record<string, unknown>);
      setRecentActivity((dashStats as unknown as Record<string, unknown>).recentActivity as ActivityItem[] || []);
      try {
        const transferMap: Record<string, TransferSaleType> = {};
        const activeStatuses = ['in_handoff', 'pending_acceptance', 'hold_pending', 'transfer_pending', 'listed', 'draft', 'disputed'];
        await Promise.all(agents.map(async (agent) => {
          try {
            const transferRes = await api.transferSale.list(agent.id);
            const sorted = (transferRes.transfers || [])
              .filter(t => activeStatuses.includes(t.status))
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            if (sorted.length > 0 && !transferMap[agent.id]) {
              transferMap[agent.id] = sorted[0];
            }
          } catch { /* agent may have no transfers */ }
        }));
        setAgentTransfers(transferMap);
      } catch { /* transfers not available */ }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [agents]);

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
      {paymentResult === 'success' && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-6" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Payment successful!</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {paymentHandle ? `Handle "${paymentHandle}" is now active.` : 'Your handle is now active.'} Your agent can be activated and listed publicly.
            </div>
          </div>
        </div>
      )}
      {paymentResult === 'cancelled' && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-6" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertCircle className="w-5 h-5" style={{ color: 'var(--warning, #f59e0b)' }} />
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Payment cancelled</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {paymentHandle ? `Handle "${paymentHandle}" is still reserved but inactive.` : 'Your handle is still reserved.'} Use the "Pay Now" button below to complete payment.
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(s => (
          <GlassCard key={s.label} className="!p-4">
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </GlassCard>
        ))}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>My Agents</h2>
        {agents.length > 0 && (
          <button
            onClick={() => navigate('/claim')}
            className="text-xs flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
          >
            <Link className="w-3 h-3" /> Claim agent
          </button>
        )}
      </div>
      {agents.length === 0 ? (
        <div className="mb-8">
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Register your first agent to get started with Agent ID.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassCard hover className="!p-6 cursor-pointer" onClick={() => navigate('/start')}>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(79,125,243,0.1)' }}>
                  <Plus className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Register your first agent</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create a new agent identity from scratch with the setup wizard.</p>
              </div>
            </GlassCard>
            <GlassCard hover className="!p-6 cursor-pointer" onClick={() => navigate('/claim')}>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.1)' }}>
                  <Link className="w-6 h-6" style={{ color: 'var(--success)' }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Claim an existing agent</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Link a programmatically registered agent to your account using a claim URL.</p>
              </div>
            </GlassCard>
          </div>
        </div>
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
                  {agentTransfers[agent.id] && (
                    <button
                      className="mt-1.5 cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const t = agentTransfers[agent.id];
                        if (t.status === 'draft') {
                          setTransferringAgent(agent);
                        } else if (t.status === 'in_handoff') {
                          navigate(`/dashboard/transfers/${agent.id}/${t.id}/handoff`);
                        } else {
                          navigate(`/dashboard/transfers/${agent.id}/${t.id}`);
                        }
                      }}
                    >
                      <TransferStatusBadge status={agentTransfers[agent.id].status} />
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(agent.capabilities || []).slice(0, 3).map(c => <CapabilityChip key={c} label={c} />)}
                    {(agent.capabilities || []).length > 3 && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+{agent.capabilities.length - 3} more</span>}
                  </div>
                </div>
                <TrustScoreRing score={agent.trustScore || 0} size={48} />
              </div>
              {agent.handlePricing?.paymentStatus === 'pending' && (
                <div className="flex items-center gap-3 mt-3 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning, #f59e0b)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Handle payment required</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      ${agent.handlePricing.annualPriceDollars}/yr — complete payment to activate
                    </div>
                  </div>
                  <PrimaryButton
                    onClick={async () => {
                      try { await initiateHandleCheckout(agent.handle); } catch { /* handled by redirect */ }
                    }}
                    className="!py-1.5 !px-3 !text-xs"
                  >
                    <CreditCard className="w-3 h-3 mr-1" /> Pay Now
                  </PrimaryButton>
                </div>
              )}
              <div className="flex gap-2 mt-4 pt-4 border-t flex-wrap" style={{ borderColor: 'var(--border-color)' }}>
                <PrimaryButton variant="ghost" onClick={() => navigate(`/${agent.handle}`)}>View Profile</PrimaryButton>
                {agent.verificationStatus !== 'verified' && (
                  <PrimaryButton variant="ghost" onClick={() => setVerifyingAgent(agent)}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verify
                  </PrimaryButton>
                )}
                <PrimaryButton variant="ghost" onClick={async () => {
                  try {
                    const status = await api.agentPayment.status(agent.id);
                    if (status.status === 'active') {
                      alert('Stripe Connect is already active for this agent.');
                    } else {
                      const result = await api.agentPayment.onboard(agent.id);
                      if (result.onboardingUrl) window.location.href = result.onboardingUrl;
                    }
                  } catch (e) {
                    console.error('Payment onboard error:', e);
                  }
                }}>
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Payment Setup
                </PrimaryButton>
                {agentTransfers[agent.id] ? (
                  <PrimaryButton variant="ghost" onClick={() => {
                    const t = agentTransfers[agent.id];
                    if (t.status === 'draft') {
                      setTransferringAgent(agent);
                    } else if (t.status === 'in_handoff') {
                      navigate(`/dashboard/transfers/${agent.id}/${t.id}/handoff`);
                    } else {
                      navigate(`/dashboard/transfers/${agent.id}/${t.id}`);
                    }
                  }}>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                    {agentTransfers[agent.id].status === 'draft' ? 'Continue Setup' :
                     agentTransfers[agent.id].status === 'in_handoff' ? 'Handoff' : 'View Transfer'}
                  </PrimaryButton>
                ) : (agent.verificationStatus === 'verified' && agent.status === 'active') ? (
                  <PrimaryButton variant="ghost" onClick={() => setTransferringAgent(agent)}>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Transfer / Sell
                  </PrimaryButton>
                ) : null}
                <PrimaryButton variant="ghost">Edit</PrimaryButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
      {agents.length > 0 && <McpQuickstartCard />}
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
      {verifyingAgent && (
        <VerifyAgentModal agent={verifyingAgent} onClose={() => setVerifyingAgent(null)} onVerified={() => { fetchData(); refreshAgents(); }} />
      )}
      {transferringAgent && (
        <TransferWizardModal
          agent={transferringAgent}
          existingTransfer={agentTransfers[transferringAgent.id]?.status === 'draft' ? agentTransfers[transferringAgent.id] : undefined}
          onClose={() => setTransferringAgent(null)}
          onComplete={() => { fetchData(); refreshAgents(); }}
        />
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
                    {task.paymentAmount != null && task.paymentAmount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{
                        background: task.paymentStatus === 'captured' ? 'rgba(16,185,129,0.1)' : task.paymentStatus === 'cancelled' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                        color: task.paymentStatus === 'captured' ? 'var(--success)' : task.paymentStatus === 'cancelled' ? 'var(--danger)' : 'var(--accent)',
                      }}>
                        <DollarSign className="w-3 h-3" />
                        ${(task.paymentAmount / 100).toFixed(2)} — {task.paymentStatus || 'pending'}
                      </span>
                    )}
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

function CreateListingForm({ agents, onCreated, onCancel }: { agents: Array<{ id: string; handle: string; displayName: string }>; onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Code');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceType, setPriceType] = useState<'fixed' | 'per_task' | 'hourly'>('per_task');
  const [tags, setTags] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !priceAmount || !agentId) { setError('Fill in all required fields'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const capabilities = tags.split(',').map(t => t.trim()).filter(Boolean);
      const listing = await api.marketplace.listings.create({
        agentId,
        title: title.trim(),
        description,
        category,
        priceAmount,
        priceType,
        capabilities,
      });
      if (isAvailable && listing?.id) {
        try {
          await api.marketplace.listings.update(listing.id, { status: 'active' });
        } catch (pubErr) {
          console.warn('[listing] Created as draft but failed to publish:', pubErr instanceof Error ? pubErr.message : pubErr);
          setError('Listing created as draft. Publishing failed — activate it from the listings table.');
        }
      }
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="!p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>New Listing</h3>
      {error && <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</div>}
      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Agent</label>
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {agents.map(a => <option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Research Assistant" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe what your agent can do..." className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Capability Tags</label>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="research, web-search, coding (comma-separated)" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              {['Research', 'Code', 'Data', 'Support', 'Content', 'Custom'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Pricing Model</label>
            <select value={priceType} onChange={e => setPriceType(e.target.value as 'fixed' | 'per_task' | 'hourly')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="per_task">Per Task</option>
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed Price</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Price ($) *</label>
            <input type="number" value={priceAmount} onChange={e => setPriceAmount(e.target.value)} placeholder="0.00" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} className="w-4 h-4 rounded" />
              Publish immediately
            </label>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <PrimaryButton variant="purple" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating...' : 'Create Listing'}</PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onCancel}>Cancel</PrimaryButton>
        </div>
      </div>
    </GlassCard>
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
  const [showCreateForm, setShowCreateForm] = useState(false);

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
            <PrimaryButton variant="purple" onClick={() => setShowCreateForm(true)} disabled={agents.length === 0}>Create New Listing</PrimaryButton>
          </div>
          {showCreateForm && <CreateListingForm agents={agents} onCreated={() => { setShowCreateForm(false); fetchData(); }} onCancel={() => setShowCreateForm(false)} />}
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
                        <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>{formatPrice(l.priceAmount, l.priceType)}</td>
                        <td className="py-3 px-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: l.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: l.status === 'active' ? 'var(--success)' : 'var(--warning)' }}>{l.status}</span></td>
                        <td className="py-3 px-3"><StarRating rating={Number(l.avgRating || 0)} /></td>
                        <td className="py-3 px-3">
                          <button onClick={() => navigate(`/marketplace/${l.id}`)} className="text-xs cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>View</button>
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
            { type: 'CNAME', name: domainName || `${handle}.agent`, value: 'edge.getagent.id', ttl: 300 },
            { type: 'TXT', name: '_agentid', value: `v=agentid1 id=${agentId}`, ttl: 3600 },
          ]);
        }
      })
      .catch(() => {
        setRecords([
          { type: 'CNAME', name: domainName || `${handle}.agent`, value: 'edge.getagent.id', ttl: 300 },
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

function HandleTransferModal({ agent, onClose, onTransferred }: { agent: Agent; onClose: () => void; onTransferred: () => void }) {
  const [targetUserId, setTargetUserId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTransfer = async () => {
    if (!targetUserId.trim()) return;
    setTransferring(true);
    setError(null);
    try {
      await api.transfer.initiate(agent.id, targetUserId.trim());
      setSuccess(true);
      setTimeout(() => { onTransferred(); onClose(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Close"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-4">
          <ArrowRightLeft className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Transfer @{agent.handle}</h3>
        </div>

        {success ? (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Handle transferred successfully!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Transfer ownership of this handle to another account. This action is irreversible — the new owner will have full control.
            </p>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>New Owner User ID</label>
              <input
                value={targetUserId}
                onChange={e => setTargetUserId(e.target.value)}
                placeholder="Enter the target user ID"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <PrimaryButton variant="danger" onClick={handleTransfer} disabled={transferring || !targetUserId.trim()}>
              {transferring ? 'Transferring...' : 'Transfer Handle'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

function FleetManagement() {
  const { agents } = useAuth();
  const [fleets, setFleets] = useState<Array<{ rootHandle: string; rootAgent: Agent; subHandles: Array<{ id: string; handle: string; displayName: string; status: string; trustScore: number; capabilities: string[]; createdAt: string }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState('');
  const [subName, setSubName] = useState('');
  const [subDisplayName, setSubDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const rootHandles = agents.filter(a => !a.handle.includes('.'));

  const fetchFleets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.fleet.list();
      setFleets(result.fleets || []);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('403')) {
        setError('upgrade_required');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load fleets');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFleets(); }, [fetchFleets]);

  const handleCreate = async () => {
    if (!selectedRoot || !subName.trim() || !subDisplayName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.fleet.createSubHandle({
        rootHandle: selectedRoot,
        subName: subName.trim(),
        displayName: subDisplayName.trim(),
      });
      setShowCreate(false);
      setSubName('');
      setSubDisplayName('');
      fetchFleets();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create sub-handle');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await api.fleet.deleteSubHandle(agentId);
      fetchFleets();
    } catch (e: unknown) {
      console.error('Failed to delete sub-handle:', e);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Fleet Management</h1>
        <PrimaryButton onClick={() => setShowCreate(true)} disabled={rootHandles.length === 0}>
          <Network className="w-4 h-4 mr-1" /> Create Sub-Handle
        </PrimaryButton>
      </div>

      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Provision sub-handles under your root handles (e.g., <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>research.acme</span>). Each sub-handle has independent trust scores and capabilities.
      </p>

      {showCreate && (
        <GlassCard className="!p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>New Sub-Handle</h3>
          {createError && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Root Handle</label>
              <select value={selectedRoot} onChange={e => setSelectedRoot(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                <option value="">Select a root handle</option>
                {rootHandles.map(a => <option key={a.id} value={a.handle}>@{a.handle}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Sub-Handle Name</label>
              <div className="flex items-center gap-2">
                <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="research" className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                {selectedRoot && <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>.{selectedRoot}</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Display Name</label>
              <input value={subDisplayName} onChange={e => setSubDisplayName(e.target.value)} placeholder="Research Division" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex gap-3">
              <PrimaryButton onClick={handleCreate} disabled={creating || !selectedRoot || !subName.trim() || !subDisplayName.trim()}>
                {creating ? 'Creating...' : 'Create Sub-Handle'}
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => setShowCreate(false)}>Cancel</PrimaryButton>
            </div>
          </div>
        </GlassCard>
      )}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error === 'upgrade_required' ? (
        <GlassCard className="!p-8 text-center">
          <Network className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Fleet Management requires Pro or Enterprise</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Upgrade your plan to create and manage sub-handles under your root handles.</p>
          <PrimaryButton onClick={() => window.location.href = '/pricing'}>View Plans</PrimaryButton>
        </GlassCard>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchFleets} />
      ) : fleets.length === 0 ? (
        <EmptyState
          icon={<Network className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No fleets yet"
          description="Register a root handle and create sub-handles to manage your agent fleet."
        />
      ) : (
        <div className="space-y-6">
          {fleets.map(fleet => (
            <GlassCard key={fleet.rootHandle}>
              <div className="flex items-center gap-3 mb-4">
                <Identicon handle={fleet.rootHandle} size={36} />
                <div>
                  <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>@{fleet.rootHandle}</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{fleet.subHandles.length} sub-handle{fleet.subHandles.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              {fleet.subHandles.length === 0 ? (
                <div className="text-center py-6">
                  <Network className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No sub-handles created yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fleet.subHandles.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--bg-base)' }}>
                      <div className="flex items-center gap-3">
                        <Identicon handle={sub.handle} size={28} />
                        <div>
                          <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{sub.handle}</div>
                          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{sub.displayName}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <TrustScoreRing score={sub.trustScore} size={28} />
                        <StatusDot status={sub.status as 'active' | 'inactive' | 'draft'} />
                        <button onClick={() => handleDelete(sub.id)} className="text-xs cursor-pointer" style={{ color: 'var(--danger)', background: 'none', border: 'none' }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainDashboard() {
  const { agents } = useAuth();
  const [registryStatuses, setRegistryStatuses] = useState<Record<string, { registered: boolean; domain: string; resolveUrl: string; dnsbridge: string; status: string; registeredAt: string | null }>>({});
  const [transferAgent, setTransferAgent] = useState<Agent | null>(null);
  const { refreshAgents } = useAuth();

  useEffect(() => {
    agents.forEach(async agent => {
      try {
        const status = await api.registry.status(agent.id);
        setRegistryStatuses(prev => ({ ...prev, [agent.id]: status }));
      } catch { /* ignore */ }
    });
  }, [agents]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Your .agentid Domains</h1>
      {agents.length === 0 ? (
        <EmptyState icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No agents" description="Register an agent to get your .agentid address." />
      ) : (
        <div className="space-y-6">
          {agents.map(agent => {
            const reg = registryStatuses[agent.id];
            return (
              <GlassCard key={agent.id}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{agent.domainName || `${agent.handle}.agentid`}</div>
                    <StatusDot status={agent.domainStatus === 'active' ? 'active' : 'inactive'} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setTransferAgent(agent)} className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer flex items-center gap-1" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }} aria-label="Transfer">
                      <ArrowRightLeft className="w-3 h-3" /> Transfer
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }} aria-label="Copy domain">Copy</button>
                  </div>
                </div>
                <DomainRecordsTable agentId={agent.id} handle={agent.handle} domainName={agent.domainName} />

                <div className="rounded-lg border p-4 mt-4" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.04)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5" style={{ color: 'var(--domain)' }} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>.agentid Protocol Registry</div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          {reg?.registered
                            ? `Registered — resolvable at ${reg.domain}`
                            : 'Pending registration in .agentid registry'}
                        </div>
                      </div>
                    </div>
                    {reg?.registered ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#eab308' }} /> Pending
                      </span>
                    )}
                  </div>
                  {reg?.registered && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-md p-2.5" style={{ background: 'rgba(6,182,212,0.06)' }}>
                        <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Protocol Resolve</div>
                        <div className="text-xs truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{reg.resolveUrl}</div>
                      </div>
                      <div className="rounded-md p-2.5" style={{ background: 'rgba(6,182,212,0.06)' }}>
                        <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>DNS Bridge</div>
                        <div className="text-xs truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{reg.dnsbridge}</div>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}

          <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
            <p className="text-sm" style={{ color: 'var(--domain)' }}>
              Your .agentid address is part of a protocol-layer namespace — like ENS's .eth, but for AI agents. Every registered handle resolves through the Agent ID protocol (<code style={{ fontFamily: 'var(--font-mono)' }}>handle.agentid</code>) with a web domain at (<code style={{ fontFamily: 'var(--font-mono)' }}>handle.getagent.id</code>).
            </p>
          </div>
        </div>
      )}

      {transferAgent && (
        <HandleTransferModal
          agent={transferAgent}
          onClose={() => setTransferAgent(null)}
          onTransferred={() => refreshAgents()}
        />
      )}
    </div>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const { userId, agents } = useAuth();
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; prefix: string; label: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    api.users.apiKeys.list()
      .then(res => setApiKeys(res.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyLabel.trim()) return;
    setCreatingKey(true);
    try {
      const result = await api.users.apiKeys.create(newKeyLabel.trim());
      setApiKeys(prev => [...prev, { id: result.id, prefix: result.prefix, label: result.label, createdAt: new Date().toISOString() }]);
      setNewKeyValue(result.key);
      setNewKeyLabel('');
    } catch (e: unknown) {
      console.error("[Settings] API key creation failed:", e instanceof Error ? e.message : e);
    }
    finally { setCreatingKey(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Settings</h1>
      <div className="space-y-6">
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Current Plan</h3>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Starter</div>
              <div className="text-sm" style={{ color: 'var(--text-dim)' }}>{agents.length} of 1 agent used</div>
            </div>
            <PrimaryButton onClick={() => navigate('/pricing')}>Upgrade Plan</PrimaryButton>
          </div>
          <div className="text-xs space-y-1" style={{ color: 'var(--text-dim)' }}>
            <div>Agent limit: 1</div>
            <div>Trust score: Basic</div>
            <div>Support: Community</div>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Account</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Account</div><div className="text-sm" style={{ color: 'var(--text-primary)' }}>Active</div></div>
            </div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
              <div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Agents</div><div className="text-sm" style={{ color: 'var(--text-primary)' }}>{agents.length} registered</div></div>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>API Keys</h3>
          <div className="flex gap-2 mb-4">
            <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="Key label (e.g. production)" className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            <PrimaryButton variant="ghost" onClick={handleCreateKey} disabled={creatingKey || !newKeyLabel.trim()}>{creatingKey ? 'Creating...' : 'Create Key'}</PrimaryButton>
          </div>
          {newKeyValue && (
            <div className="p-3 rounded-lg mb-4 text-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Copy this key now — it won't be shown again:</div>
              <code style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{newKeyValue}</code>
            </div>
          )}
          {loading ? (
            <ListSkeleton rows={2} />
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-6">
              <CreditCard className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No API keys created yet.</p>
            </div>
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
          {showDeleteConfirm ? (
            <GlassCard className="!p-4">
              <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Are you sure you want to delete your account? This action cannot be undone.</p>
              <div className="flex gap-3">
                <PrimaryButton variant="danger" onClick={async () => { try { await api.users.deleteAccount(); window.location.href = '/'; } catch (e) { alert(e instanceof Error ? e.message : 'Failed to delete account. Please try again.'); } }}>Confirm Delete</PrimaryButton>
                <PrimaryButton variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</PrimaryButton>
              </div>
            </GlassCard>
          ) : (
            <PrimaryButton variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete Account</PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialDashboard() {
  const { agents } = useAuth();
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || '');
  const [credential, setCredential] = useState<AgentCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [reissueSuccess, setReissueSuccess] = useState(false);

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  const fetchCredential = useCallback(async () => {
    if (!selectedAgentId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const cred = await api.agents.credential(selectedAgentId);
      setCredential(cred);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credential');
      setCredential(null);
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  useEffect(() => { fetchCredential(); }, [fetchCredential]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const handleReissue = async () => {
    if (!selectedAgentId) return;
    setReissuing(true);
    setReissueSuccess(false);
    try {
      const cred = await api.agents.reissueCredential(selectedAgentId);
      setCredential(cred);
      setReissueSuccess(true);
      setTimeout(() => setReissueSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reissue credential');
    } finally {
      setReissuing(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Credential</h2>
        {agents.length > 1 && (
          <select
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm border"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-color)', fontFamily: 'var(--font-body)', minHeight: 44 }}
          >
            {agents.map(a => <option key={a.id} value={a.id}>@{a.handle}</option>)}
          </select>
        )}
      </div>

      {agents.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No agents yet" description="Register an agent to view its verifiable credential." />
      ) : loading ? (
        <CardSkeleton />
      ) : error ? (
        <GlassCard>
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
            <PrimaryButton variant="ghost" onClick={fetchCredential}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
          </div>
        </GlassCard>
      ) : credential ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GlassCard>
              <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-4">
                    <Identicon handle={credential.handle} size={40} />
                    <div>
                      <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>@{credential.handle}</div>
                      <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>SN: {credential.serialNumber}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Trust Score</div>
                      <div className="flex items-center gap-2">
                        <TrustScoreRing score={credential.trustScore} size={28} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{credential.trustScore}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{credential.trustTier}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Verification</div>
                      <StatusDot status={credential.verificationStatus} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Issued</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(credential.issuedAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Expires</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(credential.expiresAt).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {credential.capabilities.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>Capabilities</div>
                      <div className="flex flex-wrap gap-1.5">
                        {credential.capabilities.map(cap => <CapabilityChip key={cap} label={cap} />)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  <div className="p-3 rounded-xl" style={{ background: '#ffffff' }}>
                    <QRCodeSVG value={`https://${credential.handle}.getagent.id`} size={120} level="M" />
                  </div>
                  <div className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>{credential.handle}.getagent.id</div>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Decentralized Identifier</h3>
              <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs break-all" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{credential.did}</code>
                  <button
                    onClick={() => copyToClipboard(credential.did, 'did')}
                    className="flex-shrink-0 p-1.5 rounded-md transition-colors"
                    style={{ background: 'transparent', border: 'none', color: copied === 'did' ? 'var(--success)' : 'var(--text-dim)', cursor: 'pointer', minWidth: 32, minHeight: 32 }}
                    aria-label="Copy DID"
                  >
                    {copied === 'did' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Resolver URL</div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs break-all" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{credential.resolverUrl}</code>
                  <button
                    onClick={() => copyToClipboard(credential.resolverUrl, 'resolver')}
                    className="flex-shrink-0 p-1.5 rounded-md transition-colors"
                    style={{ background: 'transparent', border: 'none', color: copied === 'resolver' ? 'var(--success)' : 'var(--text-dim)', cursor: 'pointer', minWidth: 32, minHeight: 32 }}
                    aria-label="Copy resolver URL"
                  >
                    {copied === 'resolver' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <PrimaryButton className="w-full" onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), 'credential')}>
              {copied === 'credential' ? <><Check className="w-4 h-4 mr-2" /> Copied</> : <><Copy className="w-4 h-4 mr-2" /> Copy Credential</>}
            </PrimaryButton>
            <PrimaryButton variant="ghost" className="w-full" onClick={() => window.open(credential.erc8004Url, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="w-4 h-4 mr-2" /> View ERC-8004
            </PrimaryButton>
            <PrimaryButton variant="ghost" className="w-full" onClick={handleReissue} disabled={reissuing}>
              {reissueSuccess ? <><Check className="w-4 h-4 mr-2" /> Credential Reissued</> : <><RotateCw className={`w-4 h-4 mr-2 ${reissuing ? 'animate-spin' : ''}`} /> {reissuing ? 'Reissuing…' : 'Reissue Credential'}</>}
            </PrimaryButton>
            <PrimaryButton variant="ghost" className="w-full" onClick={() => window.open(credential.profileUrl, '_blank')}>
              <ExternalLink className="w-4 h-4 mr-2" /> View Public Profile
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <EmptyState icon={<ShieldCheck className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No credential found" description="This agent doesn't have a credential yet. Complete verification to receive one." />
      )}
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
  else if (path === '/dashboard/credential') content = <CredentialDashboard />;
  else if (path === '/dashboard/domain') content = <DomainDashboard />;
  else if (path === '/dashboard/fleet') content = <FleetManagement />;
  else if (path === '/dashboard/settings') content = <SettingsPage />;
  else if (path.startsWith('/dashboard/transfers')) content = <TransferDashboardPage />;
  else content = <Overview />;

  return <DashboardLayout>{content}</DashboardLayout>;
}
