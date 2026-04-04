import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, Copy, AlertCircle, ArrowRight, Bot, Link2, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { getHandlePrice } from '@/lib/pricing';
import { SKILLS_LIBRARY, SKILL_CATEGORIES, type SkillCategory } from '@/lib/skills';

type Intent = 'new' | 'claim' | null;
type FlowStep = 'intent' | 'auth' | 'wizard-identity' | 'wizard-capabilities' | 'token-display' | 'claim-existing' | 'complete';

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

interface CapabilitiesStepProps {
  selectedCaps: string[];
  setSelectedCaps: React.Dispatch<React.SetStateAction<string[]>>;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

function CapabilitiesStep({ selectedCaps, setSelectedCaps, error, submitting, onBack, onNext }: CapabilitiesStepProps) {
  const [activeCategory, setActiveCategory] = useState<SkillCategory | 'All'>('All');
  const [customInput, setCustomInput] = useState('');

  const visibleSkills = activeCategory === 'All'
    ? SKILLS_LIBRARY
    : SKILLS_LIBRARY.filter(s => s.category === activeCategory);

  const toggleSkill = (label: string) => {
    setSelectedCaps(prev => prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]);
  };

  const addCustomSkill = () => {
    const trimmed = customInput.trim();
    if (trimmed && !selectedCaps.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedCaps(prev => [...prev, trimmed]);
    }
    setCustomInput('');
  };

  const removeSkill = (label: string) => {
    setSelectedCaps(prev => prev.filter(c => c !== label));
  };

  const allCategories: Array<SkillCategory | 'All'> = ['All', ...SKILL_CATEGORIES];

  const tabBarStyle = {
    display: 'flex' as const, gap: 6, flexWrap: 'wrap' as const, marginBottom: 16,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#050711', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <StepIndicator steps={['intent', 'identity', 'capabilities', 'activate']} current={2} />
        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 800,
          color: '#e8e8f0', textAlign: 'center', marginBottom: 6,
        }}>Capabilities</h1>
        <p style={{ color: 'rgba(232,232,240,0.45)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Select what your agent can do. You can change these later.
        </p>

        <div style={tabBarStyle}>
          {allCategories.map(cat => {
            const active = activeCategory === cat;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                padding: '6px 14px', borderRadius: 20,
                background: active ? 'rgba(79,125,243,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? 'rgba(79,125,243,0.45)' : 'rgba(255,255,255,0.06)'}`,
                color: active ? '#a5bdfc' : 'rgba(232,232,240,0.4)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
                {cat}
              </button>
            );
          })}
        </div>

        <div style={{
          maxHeight: 340, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8,
          padding: '2px 0',
        }}>
          {visibleSkills.map(skill => {
            const sel = selectedCaps.includes(skill.label);
            return (
              <button key={skill.id} onClick={() => toggleSkill(skill.label)} style={{
                padding: '8px 14px', borderRadius: 10,
                background: sel ? 'rgba(79,125,243,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${sel ? 'rgba(79,125,243,0.35)' : 'rgba(255,255,255,0.06)'}`,
                color: sel ? '#a5bdfc' : 'rgba(232,232,240,0.5)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{skill.icon}</span> {skill.label}
                {sel && <Check size={12} style={{ marginLeft: 2 }} />}
              </button>
            );
          })}
        </div>

        {selectedCaps.length > 0 && (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(232,232,240,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Selected ({selectedCaps.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedCaps.map(label => (
                <span key={label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 8,
                  background: 'rgba(79,125,243,0.12)', border: '1px solid rgba(79,125,243,0.25)',
                  color: '#a5bdfc', fontSize: 12, fontWeight: 500,
                }}>
                  {label}
                  <button onClick={() => removeSkill(label)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'rgba(165,189,252,0.5)', display: 'flex', alignItems: 'center',
                  }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <input
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); } }}
            placeholder="Add a custom skill…"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={addCustomSkill} disabled={!customInput.trim()} style={{
            padding: '10px 16px', borderRadius: 10,
            background: customInput.trim() ? 'rgba(79,125,243,0.15)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${customInput.trim() ? 'rgba(79,125,243,0.35)' : 'rgba(255,255,255,0.06)'}`,
            color: customInput.trim() ? '#a5bdfc' : 'rgba(232,232,240,0.2)',
            cursor: customInput.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}>
            <Plus size={14} /> Add
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <GhostBtn onClick={onBack}>Back</GhostBtn>
          <PrimaryBtn onClick={onNext} loading={submitting} disabled={submitting}>
            Create Agent <ArrowRight size={16} />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

export function GetStarted() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userId, loading: authLoading, login, refreshAgents } = useAuth();

  const [intent, setIntent] = useState<Intent>(() => {
    const p = new URLSearchParams(window.location.search).get('intent');
    return (p === 'new' || p === 'claim') ? p : null;
  });
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
  const [agentCount, setAgentCount] = useState<number | null>(null);

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

  // If auth resolved and the user is already signed in but ended up on the
  // 'auth' step (race: authLoading was true when they clicked an intent),
  // advance them to the correct wizard step automatically.
  useEffect(() => {
    if (step === 'auth' && !authLoading && userId) {
      if (intent === 'claim') {
        setStep('claim-existing');
      } else {
        setStep('wizard-identity');
      }
    }
  }, [step, authLoading, userId, intent]);

  // When a user returns via magic link with ?intent=new|claim in the URL,
  // sessionStorage is gone (new tab) but the URL param survives.
  // Auto-advance them straight to the wizard rather than showing the intent cards.
  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;
    const urlIntent = searchParams.get('intent');
    if (step === 'intent' && (urlIntent === 'new' || urlIntent === 'claim')) {
      setIntent(urlIntent);
      setStep(urlIntent === 'claim' ? 'claim-existing' : 'wizard-identity');
    }
  }, [authLoading, userId, step, searchParams]);

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

  useEffect(() => {
    api.meta.stats().then(s => setAgentCount(s.agentCount)).catch(() => {});
  }, []);

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

  const startClaimPolling = useCallback((preExistingIds: Set<string>) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.agents.list();
        const hasNewAgent = result.agents?.some(a => !preExistingIds.has(a.id));
        if (hasNewAgent) {
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
    // Encode intent in the returnTo URL so it survives magic link clicks
    // that open in a new tab (sessionStorage does not cross tabs).
    const returnTo = `/get-started?intent=${intent ?? 'new'}`;
    window.location.href = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
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
      const [tokenResult, agentsResult] = await Promise.all([
        api.ownerTokens.generate(),
        api.agents.list(),
      ]);
      setOwnerToken(tokenResult.token);
      const preExistingIds = new Set<string>((agentsResult.agents ?? []).map(a => a.id));
      startClaimPolling(preExistingIds);
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
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0c14', padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Logo mark */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              border: '1px solid rgba(255,255,255,0.15)',
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            }} />
            <div style={{
              marginTop: 14, fontSize: 10, fontWeight: 600, letterSpacing: '0.2em',
              color: 'rgba(232,232,240,0.3)', textTransform: 'uppercase',
            }}>
              Agent ID
            </div>
          </div>

          {/* Headline */}
          <h1 style={{
            marginTop: 24, fontSize: 32, fontWeight: 700, color: '#e8e8f0',
            textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.02em',
            fontFamily: 'var(--font-heading, inherit)',
          }}>
            Your agent needs an identity.
          </h1>

          {/* Subline */}
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(232,232,240,0.4)', textAlign: 'center' }}>
            Register in 60 seconds. No credit card required.
          </p>

          {/* Cards */}
          <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', opacity: authLoading ? 0.5 : 1, pointerEvents: authLoading ? 'none' : undefined, transition: 'opacity 0.2s' }}>
            <div
              onClick={() => handleIntentSelect('new')}
              style={{
                display: 'flex', flexDirection: 'column', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)', padding: 20, cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(79,125,243,0.35)';
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(79,125,243,0.04)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: 'rgba(79,125,243,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={18} color="#4f7df3" />
              </div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>
                Register a new agent
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5, flexGrow: 1 }}>
                Create a draft identity for your agent. It connects during setup and self-activates.
              </div>
              <div style={{ marginTop: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#4f7df3',
                  background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)',
                  padding: '2px 8px', borderRadius: 100,
                }}>
                  Most popular
                </span>
              </div>
            </div>

            <div
              onClick={() => handleIntentSelect('claim')}
              style={{
                display: 'flex', flexDirection: 'column', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)', padding: 20, cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,91,245,0.35)';
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(124,91,245,0.04)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: 'rgba(124,91,245,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Link2 size={18} color="#7c5bf5" />
              </div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>
                Link an existing agent
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                Already running an agent? Give it your owner token and it will register itself under your account.
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 6, borderRadius: 3, background: '#4f7df3' }} />
              <div style={{ width: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ width: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)' }}>Step 1 of 4</div>
          </div>

          {/* Social proof */}
          <div style={{ marginTop: 28, fontSize: 12, color: 'rgba(232,232,240,0.22)', textAlign: 'center' }}>
            {agentCount !== null
              ? `Join ${agentCount.toLocaleString()}+ agents already on the network`
              : 'Join agents already on the network'}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div style={pageStyle}>
        <StepIndicator steps={['intent', 'auth', 'setup']} current={1} />
        <h1 style={titleStyle}>Create your account</h1>
        <p style={subtitleStyle}>
          {intent === 'new'
            ? 'Create a free account to register your agent and claim your handle.'
            : 'Create a free account to link your existing agent.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <GhostBtn onClick={() => setStep('intent')}>Back</GhostBtn>
          <PrimaryBtn onClick={handleAuthContinue}>
            Create free account <ArrowRight size={16} />
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
                  ? `${handle.length <= 3 ? 'Premium' : handle.length === 4 ? 'Standard' : 'Basic'} handle  -  $${handlePrice.annualPrice}/yr`
                  : 'Included with plan'}
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
      <CapabilitiesStep
        selectedCaps={selectedCaps}
        setSelectedCaps={setSelectedCaps}
        error={error}
        submitting={submitting}
        onBack={() => setStep('wizard-identity')}
        onNext={handleCreateAgent}
      />
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

// agent.identity  -  public identity (safe for system prompt)
// agent.secrets.apiKey  -  store in env vars only`;

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
            Your agent <strong style={{ color: '#e8e8f0' }}>{agentName}</strong>
            {handle ? ` (${handle}.agentid)` : ''} has been created in draft mode.
            Share the claim token below with your agent — it will connect to this identity during setup and self-activate.
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

{
  "handle": "<choose-your-handle>",
  "displayName": "<your-name>",
  "publicKey": "<your-ed25519-public-key-base64>",
  "keyType": "ed25519",
  "capabilities": ["research", "code"],
  "ownerToken": "${ownerToken}"
}

This will return a challenge. Sign it with your private key and POST to /api/v1/programmatic/agents/verify to complete activation.` : '';

    const sdkSnippet = ownerToken ? `import { AgentID } from '@agentid/sdk';

const agent = await AgentID.register({
  ownerToken: '${ownerToken}',
  handle: 'my-agent',
  displayName: 'My Agent',
  capabilities: ['research', 'code'],
});

// agent.identity  -  public identity (safe for system prompt)
// agent.secrets.apiKey  -  store in env vars only` : '';

    const curlSnippet = ownerToken ? `# Step 1: Register (ownerToken links to your account)
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/programmatic/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "handle": "my-agent",
    "displayName": "My Agent",
    "publicKey": "<ed25519-pub-base64>",
    "keyType": "ed25519",
    "capabilities": ["research", "code"],
    "ownerToken": "${ownerToken}"
  }'

# Step 2: Sign the returned challenge, then verify
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/programmatic/agents/verify \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"<agentId>","kid":"<kid>","challenge":"<challenge>","signature":"<sig>"}'` : '';

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
            Give your running agent this owner token. It will register and link itself to your account, then automatically appear on your dashboard.
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
