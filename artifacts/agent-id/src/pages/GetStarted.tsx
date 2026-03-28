import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Copy, AlertCircle, ArrowRight, Bot, Link2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { getHandlePrice } from '@/lib/pricing';

type Intent = 'new' | 'claim' | null;
type FlowStep = 'intent' | 'auth' | 'wizard-identity' | 'wizard-capabilities' | 'token-display' | 'claim-existing' | 'complete';

const ALL_CAPABILITIES = [
  { id: 'research', label: 'Research', icon: '🔍' },
  { id: 'code', label: 'Code Generation', icon: '💻' },
  { id: 'data', label: 'Data Analysis', icon: '📊' },
  { id: 'writing', label: 'Writing', icon: '✍️' },
  { id: 'image', label: 'Image Generation', icon: '🎨' },
  { id: 'audio', label: 'Audio / Speech', icon: '🎧' },
  { id: 'reasoning', label: 'Reasoning', icon: '🧠' },
  { id: 'browsing', label: 'Web Browsing', icon: '🌐' },
  { id: 'tools', label: 'Tool Use', icon: '🔧' },
  { id: 'support', label: 'Customer Support', icon: '💬' },
  { id: 'scheduling', label: 'Scheduling', icon: '📅' },
  { id: 'api', label: 'API Integration', icon: '⚡' },
];

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
      {steps.map((_, i) => (
        <div key={i} style={{
          width: i === current ? 24 : 8,
          height: 4, borderRadius: 2,
          background: i <= current ? '#4f7df3' : 'rgba(255,255,255,0.08)',
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button onClick={handleCopy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8,
      background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(79,125,243,0.1)',
      color: copied ? '#34d399' : '#4f7df3',
      border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(79,125,243,0.2)'}`,
      fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
      transition: 'all 0.2s',
    }}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function Card({ children, onClick, selected, style }: {
  children: React.ReactNode; onClick?: () => void; selected?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div onClick={onClick} style={{
      background: selected ? 'rgba(79,125,243,0.08)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${selected ? 'rgba(79,125,243,0.4)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 16, padding: 24,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s',
      ...style,
    }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, loading }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: '12px 28px', borderRadius: 10,
      background: disabled ? 'rgba(79,125,243,0.2)' : '#4f7df3',
      border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: 'inherit', transition: 'opacity 0.2s',
    }}>
      {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 28px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      color: 'rgba(232,232,240,0.5)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit',
    }}>
      {children}
    </button>
  );
}

export function GetStarted() {
  const navigate = useNavigate();
  const { userId, loading: authLoading, login, refreshAgents } = useAuth();

  const [intent, setIntent] = useState<Intent>(null);
  const [step, setStep] = useState<FlowStep>('intent');
  const [error, setError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [agentActivated, setAgentActivated] = useState(false);

  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [loadingOwnerToken, setLoadingOwnerToken] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'sdk' | 'api'>('chat');

  const STORAGE_KEY = 'agent-id-getstarted-draft';

  useEffect(() => {
    if (authLoading) return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.pendingAuth && userId) {
        sessionStorage.removeItem(STORAGE_KEY);
        setIntent(draft.intent || 'new');
        if (draft.intent === 'claim') {
          setStep('claim-existing');
        } else {
          setAgentName(draft.agentName || '');
          setHandle(draft.handle || '');
          setDescription(draft.description || '');
          setSelectedCaps(draft.selectedCaps || []);
          setStep(draft.returnStep || 'wizard-identity');
        }
      }
    } catch {}
  }, [authLoading, userId]);

  useEffect(() => {
    if (!handle) { setAvailable(null); return; }
    setAvailable(null);
    setCheckingHandle(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.handles.check(handle);
        setAvailable(r.available);
      } catch { setAvailable(null); }
      finally { setCheckingHandle(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [handle]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((agentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.bootstrap.status(agentId);
        if (status.activated) {
          if (pollRef.current) clearInterval(pollRef.current);
          setAgentActivated(true);
          await refreshAgents?.();
          setStep('complete');
        }
      } catch {}
    }, 3000);
  }, [refreshAgents]);

  const startClaimPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.agents.list();
        if (result.agents && result.agents.length > 0) {
          if (pollRef.current) clearInterval(pollRef.current);
          await refreshAgents?.();
          setStep('complete');
        }
      } catch {}
    }, 3000);
  }, [refreshAgents]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleIntentSelect = (selected: Intent) => {
    setIntent(selected);
    if (!userId) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        intent: selected,
        pendingAuth: true,
        returnStep: selected === 'claim' ? 'claim-existing' : 'wizard-identity',
      }));
      setStep('auth');
    } else if (selected === 'claim') {
      setStep('claim-existing');
    } else {
      setStep('wizard-identity');
    }
  };

  const handleAuthContinue = () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      intent,
      agentName, handle, description, selectedCaps,
      pendingAuth: true,
      returnStep: intent === 'claim' ? 'claim-existing' : 'wizard-identity',
    }));
    login();
  };

  const handleCreateAgent = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.agents.create({
        handle,
        displayName: agentName,
        description: description || undefined,
        capabilities: selectedCaps.length > 0 ? selectedCaps : undefined,
      }) as unknown as Record<string, unknown>;

      const agentId = result.id as string;
      const token = result.claimToken as string;

      setCreatedAgentId(agentId);
      setClaimToken(token);
      setStep('token-display');
      startPolling(agentId);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create agent');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadOwnerToken = useCallback(async () => {
    if (ownerToken) return;
    setLoadingOwnerToken(true);
    try {
      const result = await api.ownerTokens.generate();
      setOwnerToken(result.token);
      startClaimPolling();
    } catch {
      setError('Failed to generate owner token');
    } finally {
      setLoadingOwnerToken(false);
    }
  }, [ownerToken, startClaimPolling]);

  useEffect(() => {
    if (step === 'claim-existing' && userId && !ownerToken) {
      handleLoadOwnerToken();
    }
  }, [step, userId, ownerToken, handleLoadOwnerToken]);

  const handlePrice = handle ? getHandlePrice(handle) : null;

  const pageStyle: React.CSSProperties = {
    maxWidth: 640, margin: '0 auto', padding: '80px 24px 120px',
    minHeight: '100vh',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 28, fontWeight: 700, color: '#e8e8f0', marginBottom: 8,
    fontFamily: 'var(--font-heading, inherit)',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 15, color: 'rgba(232,232,240,0.45)', marginBottom: 32, lineHeight: 1.6,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
    letterSpacing: '0.1em', color: 'rgba(232,232,240,0.3)',
    marginBottom: 8, textTransform: 'uppercase' as const,
  };

  if (step === 'intent') {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>Get Started with Agent ID</h1>
        <p style={subtitleStyle}>
          Give your AI agent a verified identity, wallet, and trust score — ready for the open agent economy.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card onClick={() => handleIntentSelect('new')} selected={intent === 'new'} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bot size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>
                Register a new agent
              </div>
              <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                Choose a name and handle, then give your agent its claim token to self-activate.
              </div>
            </div>
            <ArrowRight size={18} style={{ color: 'rgba(232,232,240,0.2)', flexShrink: 0, marginTop: 4 }} />
          </Card>

          <Card onClick={() => handleIntentSelect('claim')} selected={intent === 'claim'} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #34d399, #4f7df3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Link2 size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>
                Link an existing agent
              </div>
              <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                Already have an AI agent running? Give it your owner token so it can register itself and link to your account.
              </div>
            </div>
            <ArrowRight size={18} style={{ color: 'rgba(232,232,240,0.2)', flexShrink: 0, marginTop: 4 }} />
          </Card>
        </div>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'auth', 'setup']} current={1} />
        <h1 style={titleStyle}>Sign in to continue</h1>
        <p style={subtitleStyle}>
          You need to be signed in to {intent === 'new' ? 'register a new agent' : 'link an agent to your account'}.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <GhostBtn onClick={() => setStep('intent')}>Back</GhostBtn>
          <PrimaryBtn onClick={handleAuthContinue}>
            Sign in with Replit <ArrowRight size={16} />
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  if (step === 'wizard-identity') {
    const canContinue = agentName.length >= 1 && handle.length >= 3 && available === true;
    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'identity', 'capabilities', 'activate']} current={1} />
        <h1 style={titleStyle}>Agent Identity</h1>
        <p style={subtitleStyle}>Choose a display name and handle for your agent.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={labelStyle}>Display Name</div>
            <input
              value={agentName} onChange={e => setAgentName(e.target.value)}
              placeholder="My Research Agent"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div style={labelStyle}>Handle</div>
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-agent"
                style={{
                  flex: 1, padding: '12px 14px',
                  fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0',
                  background: 'none', border: 'none', outline: 'none', minWidth: 0,
                }}
              />
              <div style={{
                padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 14,
                color: '#4f7df3', fontWeight: 500,
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(79,125,243,0.04)', whiteSpace: 'nowrap',
              }}>.agentid</div>
            </div>
            {handle.length >= 3 && (
              <div style={{ marginTop: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                {checkingHandle ? (
                  <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'rgba(232,232,240,0.3)' }} /> Checking...</>
                ) : available === true ? (
                  <span style={{ color: '#34d399' }}><Check size={12} style={{ display: 'inline' }} /> Available</span>
                ) : available === false ? (
                  <span style={{ color: '#f87171' }}><AlertCircle size={12} style={{ display: 'inline' }} /> Handle taken</span>
                ) : null}
              </div>
            )}
            {handlePrice && handlePrice.annualPrice !== null && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(232,232,240,0.3)' }}>
                {handlePrice.annualPrice > 0
                  ? `${handle.length <= 3 ? 'Premium' : handle.length === 4 ? 'Standard' : 'Basic'} handle — $${handlePrice.annualPrice}/yr`
                  : 'FREE handle'}
              </div>
            )}
          </div>

          <div>
            <div style={labelStyle}>Description (optional)</div>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does your agent do?"
              style={{
                width: '100%', minHeight: 72, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0',
                lineHeight: 1.5, boxSizing: 'border-box', resize: 'vertical', outline: 'none',
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <GhostBtn onClick={() => { setStep('intent'); setError(null); }}>Back</GhostBtn>
          <PrimaryBtn onClick={() => { setError(null); setStep('wizard-capabilities'); }} disabled={!canContinue}>
            Continue <ArrowRight size={16} />
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  if (step === 'wizard-capabilities') {
    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'identity', 'capabilities', 'activate']} current={2} />
        <h1 style={titleStyle}>Capabilities</h1>
        <p style={subtitleStyle}>Select what your agent can do. You can change these later.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ALL_CAPABILITIES.map(cap => {
            const sel = selectedCaps.includes(cap.id);
            return (
              <button key={cap.id} onClick={() => {
                setSelectedCaps(prev => sel ? prev.filter(c => c !== cap.id) : [...prev, cap.id]);
              }} style={{
                padding: '10px 16px', borderRadius: 10,
                background: sel ? 'rgba(79,125,243,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${sel ? 'rgba(79,125,243,0.35)' : 'rgba(255,255,255,0.06)'}`,
                color: sel ? '#a5bdfc' : 'rgba(232,232,240,0.5)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{cap.icon}</span> {cap.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <GhostBtn onClick={() => setStep('wizard-identity')}>Back</GhostBtn>
          <PrimaryBtn onClick={handleCreateAgent} loading={submitting} disabled={submitting}>
            Create Agent <ArrowRight size={16} />
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  if (step === 'token-display') {
    const APP_URL = window.location.origin;
    const chatPrompt = `I've registered you on Agent ID. Your claim token is:

${claimToken}

Use this token to activate your identity by calling:

POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/claim
Content-Type: application/json

{
  "token": "${claimToken}",
  "publicKey": "<your-ed25519-public-key>",
  "keyType": "ed25519"
}

This will return a challenge. Sign it with your private key, then POST to /api/v1/bootstrap/activate to receive your API key and complete activation.`;

    const sdkSnippet = `import { AgentID } from '@agentid/sdk';

const agent = await AgentID.activate({
  claimToken: '${claimToken}',
});

// agent.identity — public identity (safe for system prompt)
// agent.secrets.apiKey — store in env vars only`;

    const curlSnippet = `# Step 1: Claim
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/claim \\
  -H "Content-Type: application/json" \\
  -d '{"token":"${claimToken}","publicKey":"<ed25519-pub>","keyType":"ed25519"}'

# Step 2: Sign the returned challenge, then activate
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/activate \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"${createdAgentId}","kid":"<kid>","challenge":"<challenge>","signature":"<sig>","claimToken":"${claimToken}"}'`;

    const tabs = [
      { id: 'chat' as const, label: 'Chat Prompt' },
      { id: 'sdk' as const, label: 'SDK' },
      { id: 'api' as const, label: 'API (cURL)' },
    ];

    const snippets = { chat: chatPrompt, sdk: sdkSnippet, api: curlSnippet };

    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'identity', 'capabilities', 'activate']} current={3} />
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={28} color="#fff" />
          </div>
          <h1 style={{ ...titleStyle, marginBottom: 4 }}>Give this to your agent</h1>
          <p style={subtitleStyle}>
            Your agent <strong style={{ color: '#e8e8f0' }}>{agentName}</strong> ({handle}.agentid) has been created in draft mode.
            Share the claim token below with your agent so it can activate itself.
          </p>
        </div>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={labelStyle}>Claim Token</div>
            <CopyButton text={claimToken || ''} />
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a5bdfc',
            wordBreak: 'break-all', lineHeight: 1.6, userSelect: 'all',
          }}>
            {claimToken}
          </div>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '10px 16px', fontSize: 13, fontWeight: 500,
                color: activeTab === tab.id ? '#4f7df3' : 'rgba(232,232,240,0.4)',
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #4f7df3' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
              <CopyButton text={snippets[activeTab]} />
            </div>
            <pre style={{
              padding: '14px', borderRadius: 8,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(232,232,240,0.7)',
              lineHeight: 1.6, overflow: 'auto', maxHeight: 300, margin: 0,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {snippets[activeTab]}
            </pre>
          </div>
        </Card>

        <Card style={{
          display: 'flex', alignItems: 'center', gap: 12,
          borderColor: agentActivated ? 'rgba(16,185,129,0.3)' : 'rgba(79,125,243,0.15)',
          background: agentActivated ? 'rgba(16,185,129,0.06)' : 'rgba(79,125,243,0.04)',
        }}>
          {agentActivated ? (
            <Check size={20} style={{ color: '#34d399', flexShrink: 0 }} />
          ) : (
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#4f7df3', flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: agentActivated ? '#34d399' : '#e8e8f0' }}>
              {agentActivated ? 'Agent activated!' : 'Waiting for agent to claim...'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 2 }}>
              {agentActivated
                ? 'Your agent has successfully claimed its identity and is now active.'
                : 'This page will automatically advance once your agent uses the claim token.'}
            </div>
          </div>
        </Card>

        {agentActivated && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <PrimaryBtn onClick={() => navigate('/dashboard')}>
              Go to Dashboard <ArrowRight size={16} />
            </PrimaryBtn>
          </div>
        )}
      </div>
    );
  }

  if (step === 'claim-existing') {
    const APP_URL = window.location.origin;

    const chatPrompt = ownerToken ? `I want to register you on Agent ID and link you to my account.

Here is my owner token (valid for 24 hours):
${ownerToken}

Register yourself by calling:

POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/programmatic/agents/register
Content-Type: application/json
Authorization: Bearer ${ownerToken}

{
  "handle": "<choose-your-handle>",
  "displayName": "<your-name>",
  "capabilities": ["research", "code"]
}` : '';

    const sdkSnippet = ownerToken ? `import { AgentID } from '@agentid/sdk';

const agent = await AgentID.register({
  ownerToken: '${ownerToken}',
  handle: 'my-agent',
  displayName: 'My Agent',
  capabilities: ['research', 'code'],
});` : '';

    const curlSnippet = ownerToken ? `curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/programmatic/agents/register \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${ownerToken}" \\
  -d '{
    "handle": "my-agent",
    "displayName": "My Agent",
    "capabilities": ["research", "code"]
  }'` : '';

    const tabs = [
      { id: 'chat' as const, label: 'Chat Prompt' },
      { id: 'sdk' as const, label: 'SDK' },
      { id: 'api' as const, label: 'API (cURL)' },
    ];

    const snippets = { chat: chatPrompt, sdk: sdkSnippet, api: curlSnippet };

    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'link']} current={1} />
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link2 size={28} color="#fff" />
          </div>
          <h1 style={titleStyle}>Link your agent</h1>
          <p style={subtitleStyle}>
            Give your running agent this owner token. It will register itself and automatically appear on your dashboard.
          </p>
        </div>

        {loadingOwnerToken ? (
          <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#4f7df3' }} />
            <span style={{ color: 'rgba(232,232,240,0.5)', fontSize: 14 }}>Generating owner token...</span>
          </Card>
        ) : ownerToken ? (
          <>
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={labelStyle}>Owner Token</div>
                <CopyButton text={ownerToken} />
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: '#86efac',
                wordBreak: 'break-all', lineHeight: 1.6, userSelect: 'all',
              }}>
                {ownerToken}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(232,232,240,0.25)' }}>
                Valid for 24 hours. Single-use.
              </div>
            </Card>

            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 500,
                    color: activeTab === tab.id ? '#4f7df3' : 'rgba(232,232,240,0.4)',
                    background: 'transparent', border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #4f7df3' : '2px solid transparent',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                  <CopyButton text={snippets[activeTab]} />
                </div>
                <pre style={{
                  padding: '14px', borderRadius: 8,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(232,232,240,0.7)',
                  lineHeight: 1.6, overflow: 'auto', maxHeight: 300, margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {snippets[activeTab]}
                </pre>
              </div>
            </Card>

            <Card style={{
              display: 'flex', alignItems: 'center', gap: 12,
              borderColor: 'rgba(79,125,243,0.15)',
              background: 'rgba(79,125,243,0.04)',
            }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#4f7df3', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0' }}>
                  Waiting for agent to register...
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 2 }}>
                  This page will automatically advance once your agent uses the owner token.
                </div>
              </div>
            </Card>
          </>
        ) : null}

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <GhostBtn onClick={() => { setStep('intent'); setError(null); }}>Back</GhostBtn>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={32} color="#fff" />
          </div>
          <h1 style={{ ...titleStyle, fontSize: 32, marginBottom: 12 }}>You're all set!</h1>
          <p style={{ ...subtitleStyle, marginBottom: 40 }}>
            Your agent is live on Agent ID with a verified identity, trust score, and wallet.
            Head to your dashboard to configure endpoints, manage integrations, and monitor activity.
          </p>
          <PrimaryBtn onClick={() => navigate('/dashboard')}>
            Open Dashboard <ArrowRight size={16} />
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  return null;
}
