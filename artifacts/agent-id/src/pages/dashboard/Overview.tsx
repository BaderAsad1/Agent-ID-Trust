import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ExternalLink, Wallet, Star, MessageSquare, ClipboardList, Zap, User, Globe, ArrowUpRight, Shield, CheckCircle2, Circle, Github, Key, Plug } from 'lucide-react';
import { GlassCard, Identicon, PrimaryButton } from '@/components/shared';
import { useAuth } from '@/lib/AuthContext';
import type { Agent } from '@/lib/api';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--border-color)' }}>
      <div className="min-w-0">
        <div className="text-xs mb-0.5" style={{ color: 'var(--text-dim)' }}>{label}</div>
        <div className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)', maxWidth: '280px' }}>{value}</div>
      </div>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 p-1.5 rounded-lg cursor-pointer transition-colors"
        style={{
          background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
          border: 'none',
          color: copied ? 'var(--success)' : 'var(--text-dim)',
        }}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function IdentityCard({ agent }: { agent: Agent }) {
  const initial = (agent.displayName || 'A').charAt(0).toUpperCase();
  const did = `did:agentid:${agent.id}`;
  const inbox = agent.handle ? `${agent.handle}@agentid.dev` : `${agent.id}@agentid.dev`;
  const wallet = agent.walletAddress || 'Provisioning…';

  return (
    <GlassCard className="!p-6 mb-6">
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--marketplace))', color: '#fff' }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-base" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {agent.displayName}
            </span>
          </div>
          {agent.handle && (
            <div className="text-sm font-mono mb-2" style={{ color: 'var(--text-dim)' }}>
              {agent.handle}.agentID
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
              Active
            </span>
            {agent.verificationStatus === 'verified' && (
              <span className="text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1" style={{ background: 'rgba(79,125,243,0.1)', color: 'var(--accent)', border: '1px solid rgba(79,125,243,0.2)' }}>
                <Shield className="w-3 h-3" /> Verified
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--marketplace)', border: '1px solid rgba(139,92,246,0.2)' }}>
              Trust {agent.trustScore ?? 0}
            </span>
          </div>
        </div>
      </div>
      <div>
        <CopyField label="DID" value={did} />
        <CopyField label="Inbox" value={inbox} />
        <CopyField label="Wallet" value={wallet} />
      </div>
    </GlassCard>
  );
}

interface StatGridProps {
  agent: Agent;
}

function StatGrid({ agent }: StatGridProps) {
  const walletBalance = agent.walletUsdcBalance
    ? `$${parseFloat(agent.walletUsdcBalance).toFixed(2)}`
    : '$0.00';

  const stats = [
    {
      label: 'Trust Score',
      value: String(agent.trustScore ?? 0),
      icon: Star,
      color: 'var(--accent)',
      bg: 'rgba(79,125,243,0.08)',
    },
    {
      label: 'Messages',
      value: '0',
      icon: MessageSquare,
      color: 'var(--domain)',
      bg: 'rgba(52,211,153,0.08)',
    },
    {
      label: 'Tasks',
      value: String((agent.tasksReceived ?? 0) + (agent.tasksCompleted ?? 0)),
      icon: ClipboardList,
      color: 'var(--marketplace)',
      bg: 'rgba(139,92,246,0.08)',
    },
    {
      label: 'Wallet',
      value: walletBalance,
      icon: Wallet,
      color: 'var(--success)',
      bg: 'rgba(16,185,129,0.08)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {stats.map(stat => (
        <GlassCard key={stat.label} className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: stat.bg }}>
              <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{stat.label}</span>
          </div>
          <div className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
        </GlassCard>
      ))}
    </div>
  );
}

function UpgradeBanner() {
  const navigate = useNavigate();
  return (
    <div className="!p-5 mb-6 rounded-2xl" style={{ border: '1px solid rgba(79,125,243,0.3)', background: 'rgba(79,125,243,0.04)', padding: '20px' }}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Unlock full Agent ID
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Upgrade to a Starter plan to enable inbox, public resolution, and marketplace listing.
          </p>
        </div>
        <PrimaryButton onClick={() => navigate('/pricing')} className="!py-2 !px-4 !text-xs flex-shrink-0">
          Upgrade <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function SetupChecklist({ agent }: { agent: Agent }) {
  const navigate = useNavigate();

  const hasEndpoint = !!agent.endpointUrl;
  const isVerified = agent.verificationStatus === 'verified';
  const hasWallet = !!agent.walletAddress;
  const hasHandle = !!agent.handle;

  const items = [
    {
      done: hasHandle,
      label: 'Claim a handle',
      description: hasHandle ? `${agent.handle}.agentid` : 'Get a memorable address for your agent',
      action: () => navigate('/dashboard/handles'),
    },
    {
      done: hasEndpoint,
      label: 'Set endpoint URL',
      description: hasEndpoint ? 'Endpoint configured' : 'Where other agents send requests',
      action: () => navigate('/dashboard/settings'),
    },
    {
      done: isVerified,
      label: 'Verify identity',
      description: isVerified ? 'Identity verified' : 'Prove ownership via GitHub or key challenge',
      action: () => navigate('/dashboard/settings'),
    },
    {
      done: hasWallet,
      label: 'Wallet provisioned',
      description: hasWallet ? `${agent.walletAddress!.slice(0, 6)}...${agent.walletAddress!.slice(-4)}` : 'Wallet is being provisioned',
      action: () => navigate('/dashboard/wallet'),
    },
  ];

  const completedCount = items.filter(i => i.done).length;
  const allDone = completedCount === items.length;

  if (allDone) return null;

  return (
    <GlassCard className="!p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          What's next
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{
          background: 'rgba(79,125,243,0.1)', color: 'var(--accent)',
          border: '1px solid rgba(79,125,243,0.2)',
        }}>
          {completedCount}/{items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <div
            key={item.label}
            onClick={item.done ? undefined : item.action}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
            style={{
              cursor: item.done ? 'default' : 'pointer',
              background: item.done ? 'transparent' : 'rgba(255,255,255,0.02)',
            }}
          >
            {item.done ? (
              <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" style={{ color: 'var(--success)', width: 18, height: 18 }} />
            ) : (
              <Circle className="w-4.5 h-4.5 flex-shrink-0" style={{ color: 'var(--text-dim)', width: 18, height: 18 }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{
                color: item.done ? 'var(--text-dim)' : 'var(--text-primary)',
                textDecoration: item.done ? 'line-through' : 'none',
                fontWeight: item.done ? 400 : 500,
              }}>
                {item.label}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {item.description}
              </div>
            </div>
            {!item.done && (
              <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

interface QuickActionsProps {
  agent: Agent;
}

function QuickActions({ agent }: QuickActionsProps) {
  const navigate = useNavigate();
  const [copiedBootstrap, setCopiedBootstrap] = useState(false);

  const handleCopyBootstrap = async () => {
    const bootstrapCmd = `curl ${window.location.origin}/api/v1/programmatic/agents/${agent.id}/bootstrap`;
    try {
      await navigator.clipboard.writeText(bootstrapCmd);
      setCopiedBootstrap(true);
      setTimeout(() => setCopiedBootstrap(false), 2000);
    } catch {
    }
  };

  const actions = [
    {
      icon: copiedBootstrap ? Check : Copy,
      label: 'Copy bootstrap',
      description: 'Get your agent\'s bootstrap command',
      color: 'var(--accent)',
      bg: 'rgba(79,125,243,0.08)',
      onClick: handleCopyBootstrap,
    },
    {
      icon: User,
      label: 'Agent profile',
      description: 'View your public agent profile',
      color: 'var(--domain)',
      bg: 'rgba(52,211,153,0.08)',
      onClick: () => agent.handle ? navigate(`/${agent.handle}`) : navigate(`/id/${agent.id}`),
    },
    {
      icon: Wallet,
      label: 'Fund wallet',
      description: 'Add USDC to your agent wallet',
      color: 'var(--success)',
      bg: 'rgba(16,185,129,0.08)',
      onClick: () => navigate('/dashboard/wallet'),
    },
    {
      icon: Globe,
      label: 'Claim handle',
      description: 'Get a memorable agent handle',
      color: 'var(--marketplace)',
      bg: 'rgba(139,92,246,0.08)',
      onClick: () => navigate('/dashboard/handles'),
    },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
        Quick actions
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map(action => (
          <GlassCard
            key={action.label}
            hover
            className="!p-4 cursor-pointer"
            onClick={action.onClick}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: action.bg }}>
                <action.icon className="w-4 h-4" style={{ color: action.color }} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{action.label}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{action.description}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

interface DashboardOverviewProps {
  agent: Agent;
  plan?: string;
}

export function DashboardOverview({ agent, plan }: DashboardOverviewProps) {
  const showUpgradeBanner = !plan || plan === 'none' || plan === 'free';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Overview</h1>
      <IdentityCard agent={agent} />
      <StatGrid agent={agent} />
      <SetupChecklist agent={agent} />
      {showUpgradeBanner && <UpgradeBanner />}
      <QuickActions agent={agent} />
    </div>
  );
}
