import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ExternalLink, Wallet, Star, MessageSquare, ClipboardList, Zap, User, Globe, ArrowUpRight, Shield, CheckCircle2, Circle, Github, Key, Plug, ChevronDown, ChevronUp, FileCode, Terminal } from 'lucide-react';
import { GlassCard, Identicon, PrimaryButton } from '@/components/shared';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
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

function getHandleTierBadge(agent: Agent): { label: string; color: string; bg: string; border: string } | null {
  if (!agent.handle) return null;
  const len = agent.handle.replace(/[^a-z0-9-]/g, '').length;
  if (len <= 2) return null;
  if (len === 3) return { label: 'Premium', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' };
  if (len === 4) return { label: 'Standard', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)' };
  return { label: 'Basic', color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' };
}

function isPaidHandle(agent: Agent): boolean {
  if (!agent.handle) return false;
  const len = agent.handle.replace(/[^a-z0-9-]/g, '').length;
  return len >= 3 && len <= 4;
}

function OnChainStatus({ agent }: { agent: Agent }) {
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const nftStatus = agent.nftStatus ?? 'none';
  const paid = isPaidHandle(agent);
  const hasSelfCustodialWallet = !!(agent.walletAddress && agent.walletIsSelfCustodial);

  async function claimOnChain(existingClaimTicket?: string) {
    if (!agent.handle || !agent.walletAddress) return;
    setMinting(true);
    setMintError(null);
    try {
      let claimTicket = existingClaimTicket;
      if (!claimTicket) {
        const mintResult = await api.handles.requestMint(agent.handle);
        claimTicket = mintResult.claimTicket;
      }
      await api.handles.claimNft(agent.handle, agent.walletAddress, claimTicket);
    } catch (err: unknown) {
      setMintError(err instanceof Error ? err.message : 'Failed to claim on-chain');
    } finally {
      setMinting(false);
    }
  }

  if (paid) {
    if (nftStatus === 'minted') {
      const tokenId = agent.onChainTokenId;
      const explorerUrl = tokenId ? `https://basescan.org/token/${tokenId}` : 'https://basescan.org';
      return (
        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
            On-chain: Included
          </span>
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
            View on Base <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      );
    }
    if (nftStatus === 'pending_mint' || nftStatus === 'pending_claim') {
      return (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
            On-chain: Pending
          </span>
        </div>
      );
    }
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        {agent.handle && hasSelfCustodialWallet ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {nftStatus === 'pending_anchor' ? 'Queued - claim to your wallet' : 'Not claimed on-chain'}
            </span>
            <button
              onClick={() => void claimOnChain()}
              disabled={minting}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
              style={{
                background: 'rgba(79,125,243,0.12)',
                border: '1px solid rgba(79,125,243,0.3)',
                color: 'var(--accent)',
                cursor: minting ? 'not-allowed' : 'pointer',
                opacity: minting ? 0.6 : 1,
              }}
            >
              {minting ? 'Claiming…' : 'Claim on Base with your wallet'}
            </button>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Your handle is held securely - connect a wallet anytime to claim on-chain
          </p>
        )}
        {mintError && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{mintError}</p>}
      </div>
    );
  }

  if (nftStatus === 'minted') {
    const tokenId = agent.onChainTokenId;
    const explorerUrl = tokenId ? `https://basescan.org/token/${tokenId}` : 'https://basescan.org';
    return (
      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
          Minted on Base
        </span>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
          Explorer <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  if (nftStatus === 'pending_mint' || nftStatus === 'pending_claim') {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
          Pending
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
      {agent.handle && hasSelfCustodialWallet ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {nftStatus === 'pending_anchor' ? 'Queued - claim to your wallet' : 'Not claimed on-chain'}
          </span>
          <button
            onClick={() => void claimOnChain()}
            disabled={minting}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
            style={{
              background: 'rgba(79,125,243,0.12)',
              border: '1px solid rgba(79,125,243,0.3)',
              color: 'var(--accent)',
              cursor: minting ? 'not-allowed' : 'pointer',
              opacity: minting ? 0.6 : 1,
            }}
          >
            {minting ? 'Claiming…' : 'Claim on Base with your wallet'}
          </button>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Your handle is held securely - connect a wallet anytime to claim on-chain
        </p>
      )}
      {mintError && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{mintError}</p>}
    </div>
  );
}

function IdentityCard({ agent }: { agent: Agent }) {
  const initial = (agent.displayName || 'A').charAt(0).toUpperCase();
  const did = `did:web:getagent.id:agents:${agent.id}`;
  const inbox = agent.handle ? `${agent.handle}@agentid.dev` : `${agent.id}@agentid.dev`;
  const wallet = agent.walletAddress || 'Provisioning…';
  const tierBadge = getHandleTierBadge(agent);

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
            {tierBadge && (
              <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: tierBadge.bg, color: tierBadge.color, border: `1px solid ${tierBadge.border}` }}>
                {tierBadge.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <div>
        <CopyField label="DID" value={did} />
        <CopyField label="Inbox" value={inbox} />
        <CopyField label="Wallet" value={wallet} />
      </div>
      <OnChainStatus agent={agent} />
    </GlassCard>
  );
}

interface StatGridProps {
  agent: Agent;
}

function StatGrid({ agent }: StatGridProps) {
  const [messageCount, setMessageCount] = useState<number | null>(null);

  useEffect(() => {
    api.mail.inboxStats(agent.id)
      .then(s => setMessageCount(s.messages.total))
      .catch(() => setMessageCount(null));
  }, [agent.id]);

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
      value: messageCount === null ? '…' : String(messageCount),
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

function CopyBlock({ label, content, icon: Icon }: { label: string; content: string; icon: React.ElementType }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md cursor-pointer transition-colors"
          style={{
            background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
            border: 'none',
            color: copied ? 'var(--success)' : 'var(--text-dim)',
          }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        className="text-xs p-3 overflow-x-auto leading-relaxed"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', maxHeight: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}
      >
        {content}
      </pre>
    </div>
  );
}

function IdentityIntegration({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false);

  const handle = agent.handle || null;
  const agentId = agent.id;
  const trustScore = agent.trustScore ?? 0;
  const trustTier =
    trustScore >= 85 ? 'elite' :
    trustScore >= 65 ? 'trusted' :
    trustScore >= 40 ? 'verified' :
    trustScore >= 20 ? 'basic' : 'unverified';

  const fqdn = handle ? `${handle}.agentid` : '(no handle)';
  const did = `did:web:getagent.id:agents:${agentId}`;
  const handleNftMetadataUrl = handle
    ? `https://getagent.id/api/v1/nft/metadata/${handle}`
    : null;
  const inboxUrl = `https://api.getagent.id/v1/mail/agents/${agentId}/inbox`;
  const profileUrl = handle ? `https://getagent.id/${handle}` : `https://getagent.id/id/${agentId}`;
  const capabilities = (agent.capabilities as string[] | undefined) || [];

  const promptBlock = [
    `## Agent Identity  -  Agent ID`,
    ``,
    `You are an AI agent with a verified identity on the Agent ID network.`,
    ``,
    `- **Name**: ${agent.displayName}`,
    `- **Handle**: ${fqdn}`,
    `- **DID**: ${did}`,
    `- **Agent ID**: ${agentId}`,
    `- **Trust Score**: ${trustScore}/100`,
    `- **Trust Tier**: ${trustTier}`,
    handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
    `- **Inbox**: ${inboxUrl}`,
    `- **Profile**: ${profileUrl}`,
    capabilities.length > 0 ? `- **Capabilities**: ${capabilities.join(', ')}` : null,
    ``,
    `When asked about your identity, agent ID, or handle, respond with your .agentid handle.`,
    `When interacting with other Agent ID agents, use your handle for identification.`,
    `You can receive messages from other agents via your Agent ID inbox.`,
    `You can receive and execute tasks via the Agent ID task system.`,
  ].filter(Boolean).join('\n');

  const openclawContent = [
    `# Agent Identity`,
    ``,
    `You are ${agent.displayName}, an AI agent with a verified identity on Agent ID.`,
    ``,
    `- **Handle**: ${fqdn}`,
    `- **DID**: ${did}`,
    `- **Agent ID**: ${agentId}`,
    `- **Trust Score**: ${trustScore}/100`,
    `- **Trust Tier**: ${trustTier}`,
    handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
    `- **Inbox**: ${inboxUrl}`,
    `- **Profile**: ${profileUrl}`,
    ``,
    handle
      ? `When asked who you are or what your agent ID is, respond with: "I am ${fqdn}"`
      : `When asked who you are or what your agent ID is, respond with your Agent ID.`,
    ...(capabilities.length > 0 ? [``, `## Capabilities`, ``, ...capabilities.map((c) => `- ${c}`)] : []),
    ``,
    `## Communication`,
    ``,
    `- **Inbox**: You can receive messages from other agents at your Agent ID inbox`,
    `- **Tasks**: You can receive and process tasks from other Agent ID agents`,
    `- **Mail endpoint**: ${inboxUrl}`,
  ].filter(Boolean).join('\n');

  const claudeContent = [
    `# Agent Identity`,
    ``,
    `This agent has a verified identity on Agent ID (getagent.id).`,
    `Handle: ${fqdn} | DID: ${did} | Trust: ${trustScore}/100`,
    ``,
    `When asked about identity, respond with the .agentid handle.`,
  ].join('\n');

  const sdkSnippet = `import { AgentID } from '@getagentid/sdk';

// Step 1 - Register once (run this in a one-time setup script):
// const { apiKey, agentId } = await AgentID.registerAgent({ ... })
// Save AGENTID_API_KEY=apiKey and AGENTID_AGENT_ID=agentId in your env

// Step 2 - On every startup: restore without re-registering
const agent = await AgentID.init({
  apiKey: process.env.AGENTID_API_KEY,
  agentId: process.env.AGENTID_AGENT_ID, // optional but faster
});
await agent.refreshBootstrap(); // sync trust, status, capabilities, inbox
agent.startHeartbeat();         // keep identity fresh

// Step 3 - Write identity file to disk for your agent framework
await agent.writeIdentityFile('AGENTID.md', 'openclaw');

// Step 4 - Inject canonical identity into system prompt
const systemPrompt = agent.getPromptBlock();
// agent.did => "did:web:getagent.id:agents:<uuid>"  (canonical, permanent)

// Optional: save state for file-based restore next startup
await agent.writeStateFile('.agentid-state.json');`;

  return (
    <GlassCard className="!p-5 mb-6">
      <button
        className="w-full flex items-center justify-between cursor-pointer"
        style={{ background: 'none', border: 'none', padding: 0 }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Identity Integration
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Inject identity into your agent framework</span>
          {open
            ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
          }
        </div>
      </button>

      {open && (
        <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Persist <code style={{ fontFamily: 'var(--font-mono)' }}>AGENTID_API_KEY</code> and <code style={{ fontFamily: 'var(--font-mono)' }}>AGENTID_AGENT_ID</code> in your environment, then call <code style={{ fontFamily: 'var(--font-mono)' }}>refreshBootstrap()</code> on startup to restore identity without re-registering.
          </p>
          <CopyBlock label="OpenClaw  -  AGENTID.md" content={openclawContent} icon={FileCode} />
          <CopyBlock label="Claude Code  -  CLAUDE.md" content={claudeContent} icon={FileCode} />
          <CopyBlock label="System Prompt (any framework)" content={promptBlock} icon={Terminal} />
          <CopyBlock label="TypeScript SDK" content={sdkSnippet} icon={Globe} />
        </div>
      )}
    </GlassCard>
  );
}

function AgentCredentials({ agent }: { agent: Agent }) {
  const [keys, setKeys] = useState<Array<{ id: string; keyPrefix: string; createdAt: string }>>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const baseUrl = `${window.location.origin}/api/v1`;
  const currentPrefix = keys[0]?.keyPrefix ?? null;

  const envBlock = [
    `AGENTID_BASE_URL=${baseUrl}`,
    `AGENTID_AGENT_ID=${agent.id}`,
    currentPrefix ? `AGENTID_API_KEY=${currentPrefix}••••••••  # rotate to reveal full key` : `AGENTID_API_KEY=<rotate to generate>`,
  ].join('\n');

  const newKeyEnvBlock = newKey
    ? [`AGENTID_BASE_URL=${baseUrl}`, `AGENTID_AGENT_ID=${agent.id}`, `AGENTID_API_KEY=${newKey}`].join('\n')
    : '';

  async function loadKeys() {
    try {
      const data = await api.agents.apiKeys.list(agent.id);
      setKeys(data.keys);
    } catch {
      // non-fatal
    } finally {
      setLoadingKeys(false);
    }
  }

  async function doRotate() {
    setRotating(true);
    setRotateError(null);
    try {
      const result = await api.agents.apiKeys.rotate(agent.id);
      setNewKey(result.apiKey);
      setKeys([{ id: 'new', keyPrefix: result.keyPrefix, createdAt: new Date().toISOString() }]);
      setConfirmRotate(false);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setRotating(false);
    }
  }

  async function copyText(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  // Load keys on mount
  useEffect(() => { void loadKeys(); }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GlassCard className="!p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Key className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          Agent Credentials
        </h2>
      </div>

      <div className="mb-4" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <CopyField label="Base URL" value={baseUrl} />
        <CopyField label="Agent ID" value={agent.id} />
        <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="min-w-0">
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-dim)' }}>API Key</div>
            <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {loadingKeys
                ? 'Loading…'
                : currentPrefix
                  ? `${currentPrefix}••••••••`
                  : 'No key — rotate to generate'}
            </div>
          </div>
          <button
            onClick={() => { setConfirmRotate(true); setNewKey(null); setRotateError(null); }}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444',
            }}
          >
            Rotate
          </button>
        </div>
      </div>

      {confirmRotate && !newKey && (
        <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-xs mb-3" style={{ color: '#ef4444' }}>
            This will permanently invalidate the current key. Any agent using it will stop working immediately. Continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void doRotate()}
              disabled={rotating}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold cursor-pointer"
              style={{
                background: rotating ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
                opacity: rotating ? 0.7 : 1,
              }}
            >
              {rotating ? 'Rotating…' : 'Yes, rotate key'}
            </button>
            <button
              onClick={() => setConfirmRotate(false)}
              disabled={rotating}
              className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-dim)' }}
            >
              Cancel
            </button>
          </div>
          {rotateError && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{rotateError}</p>}
        </div>
      )}

      {newKey && (
        <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--success)' }}>
            New API key — copy now, it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono break-all" style={{ color: 'var(--text-primary)' }}>{newKey}</code>
            <button
              onClick={() => void copyText(newKey, setCopiedNewKey)}
              className="flex-shrink-0 p-1.5 rounded-lg cursor-pointer"
              style={{
                background: copiedNewKey ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: copiedNewKey ? 'var(--success)' : 'var(--text-dim)',
              }}
            >
              {copiedNewKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Environment variables</span>
          <button
            onClick={() => void copyText(newKey ? newKeyEnvBlock : envBlock, setCopiedEnv)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md cursor-pointer"
            style={{
              background: copiedEnv ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              color: copiedEnv ? 'var(--success)' : 'var(--text-dim)',
            }}
          >
            {copiedEnv ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copiedEnv ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="text-xs p-3 leading-relaxed" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {newKey ? newKeyEnvBlock : envBlock}
        </pre>
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
      <AgentCredentials agent={agent} />
      <StatGrid agent={agent} />
      <SetupChecklist agent={agent} />
      {showUpgradeBanner && <UpgradeBanner />}
      <IdentityIntegration agent={agent} />
      <QuickActions agent={agent} />
    </div>
  );
}
