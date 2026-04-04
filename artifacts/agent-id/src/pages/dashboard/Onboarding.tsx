import { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

interface OwnerToken {
  token: string;
  expiresAt: string;
}

interface AgentLinkedPollerProps {
  onAgentLinked: () => void;
}

function AgentLinkedPoller({ onAgentLinked }: AgentLinkedPollerProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const result = await api.agents.list();
        if (result.agents && result.agents.length > 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onAgentLinked();
        }
      } catch {
      }
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onAgentLinked]);

  return null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
      style={{
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(79,125,243,0.1)',
        color: copied ? 'var(--success)' : 'var(--accent)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(79,125,243,0.2)'}`,
      }}
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

type TabId = 'chat' | 'sdk' | 'api';

interface OnboardingScreenProps {
  onAgentLinked: () => void;
}

export function OnboardingScreen({ onAgentLinked }: OnboardingScreenProps) {
  const { user } = useAuth();
  const [ownerToken, setOwnerToken] = useState<OwnerToken | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  const firstName = user?.displayName?.split(' ')[0] || user?.username || 'there';
  const APP_URL = window.location.origin;

  const fetchToken = useCallback(async () => {
    setLoadingToken(true);
    try {
      const result = await api.ownerTokens.generate();
      setOwnerToken({ token: result.token, expiresAt: result.expiresAt });
    } catch {
    } finally {
      setLoadingToken(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const chatPrompt = ownerToken
    ? `Register yourself as an AI agent on Agent ID using this owner token: ${ownerToken.token}

Use the Agent ID API:
POST ${APP_URL}/api/v1/programmatic/agents/register
{
  "displayName": "My Agent",
  "publicKey": "<your-ed25519-public-key-base64>",
  "ownerToken": "${ownerToken.token}"
}

This will link the agent to my account automatically.`
    : '';

  const sdkSnippet = ownerToken
    ? `import { AgentID } from "@agentid/sdk";

const aid = new AgentID({
  ownerToken: "${ownerToken.token}",
});

const agent = await aid.register({
  displayName: "My Agent",
  publicKey: myPublicKey,
});

console.log("Agent registered:", agent.agentId);`
    : '';

  const apiSnippet = ownerToken
    ? `curl -X POST ${APP_URL}/api/v1/programmatic/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "displayName": "My Agent",
    "publicKey": "<your-ed25519-public-key-base64>",
    "ownerToken": "${ownerToken.token}"
  }'`
    : '';

  const linkOwnerCurl = ownerToken
    ? `curl -X POST ${APP_URL}/api/v1/agents/link-owner \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <your-agent-api-key>" \\
  -d '{"token": "${ownerToken.token}"}'`
    : '';

  const tabs: { id: TabId; label: string }[] = [
    { id: 'chat', label: 'Chat prompt' },
    { id: 'sdk', label: 'SDK' },
    { id: 'api', label: 'API' },
  ];

  const tabContent: Record<TabId, string> = {
    chat: chatPrompt,
    sdk: sdkSnippet,
    api: apiSnippet,
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <AgentLinkedPoller onAgentLinked={onAgentLinked} />
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="text-xs font-mono mb-3" style={{ color: 'var(--text-dim)', letterSpacing: '0.12em' }}>AGENT ID</div>
          <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Welcome, {firstName}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Hand this token to your AI agent  -  it will register itself and link to your account automatically.
          </p>
        </div>

        <GlassCard className="!p-6 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Bootstrap your agent
            </h2>
          </div>

          <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-xs font-medium cursor-pointer transition-colors"
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-dim)',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingToken ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-dim)' }} />
            </div>
          ) : (
            <div>
              <div className="relative rounded-xl overflow-hidden mb-3" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
                <pre className="p-4 overflow-x-auto text-xs whitespace-pre-wrap" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0, maxHeight: '240px', overflowY: 'auto' }}>
                  <code>{tabContent[activeTab]}</code>
                </pre>
              </div>
              <div className="flex justify-end">
                <CopyButton text={tabContent[activeTab]} />
              </div>
            </div>
          )}
        </GlassCard>

        {!loadingToken && ownerToken && (
          <GlassCard className="!p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Your owner token</div>
                <div className="text-sm font-mono" style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {ownerToken.token}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                  Valid for 24 hours
                </span>
                <CopyButton text={ownerToken.token} />
              </div>
            </div>
          </GlassCard>
        )}

        <GlassCard className="!p-5 mb-8">
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Already have an agent?
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Link an existing registered agent to your account using its API key:
            </p>
          </div>
          {!loadingToken && ownerToken && (
            <div>
              <div className="relative rounded-xl overflow-hidden mb-3" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
                <pre className="p-4 overflow-x-auto text-xs" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
                  <code>{linkOwnerCurl}</code>
                </pre>
              </div>
              <div className="flex justify-end">
                <CopyButton text={linkOwnerCurl} />
              </div>
            </div>
          )}
        </GlassCard>

        <div className="flex items-center justify-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Waiting for your agent to register…
          </p>
        </div>
      </div>
    </div>
  );
}
