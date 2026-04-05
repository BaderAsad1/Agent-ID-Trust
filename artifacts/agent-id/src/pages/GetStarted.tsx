import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, Copy, AlertCircle, ArrowRight, Bot, Link2, X, Shield, Globe, Zap, Users } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api, type AgentCreateResponse } from '@/lib/api';
import { getHandlePrice } from '@/lib/pricing';
import { SKILLS_LIBRARY, SKILL_CATEGORIES, type SkillCategory } from '@/lib/skills';

type Intent = 'new' | 'claim' | null;
type FlowStep = 'intent' | 'auth' | 'wizard-handle' | 'wizard-capabilities' | 'wizard-plan' | 'token-display' | 'claim-existing' | 'complete';
type WizardPlan = 'free' | 'starter' | 'pro';

const PLAN_STORAGE_KEY = 'agent-id-wizard-plan';

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
  onBack: () => void;
  onNext: () => void;
}

function CapabilitiesStep({ selectedCaps, setSelectedCaps, error, onBack, onNext }: CapabilitiesStepProps) {
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
        <StepIndicator steps={['handle', 'skills', 'plan', 'connect']} current={1} />
        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 800,
          color: '#e8e8f0', textAlign: 'center', marginBottom: 6,
        }}>What can your agent do?</h1>
        <p style={{ color: 'rgba(232,232,240,0.45)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Select capabilities. These help other agents and humans discover your agent.
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
            Add
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <GhostBtn onClick={onBack}>Back</GhostBtn>
          <PrimaryBtn onClick={onNext}>
            Continue <ArrowRight size={16} />
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

  const [wizardSelectedPlan, setWizardSelectedPlan] = useState<WizardPlan | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

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
  // Synchronous guard — prevents double-submission before React can re-render with submitting=true.
  const agentCreatingRef = useRef(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [agentActivated, setAgentActivated] = useState(false);
  // Authoritative signal from backend: handle requires payment, agent created without it.
  const [pendingHandleFromServer, setPendingHandleFromServer] = useState<string | null>(null);

  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [loadingOwnerToken, setLoadingOwnerToken] = useState(false);
  const [activeTab, setActiveTab] = useState<'sdk' | 'api' | 'chat'>('sdk');
  const [agentCount, setAgentCount] = useState<number | null>(null);

  const STORAGE_KEY = 'agent-id-getstarted-draft';

  // Single unified step-initialization effect — replaces three previously separate effects that could
  // fire in undefined order within the same render cycle. Priority order is explicit and deterministic:
  //   1. sessionStorage draft (post-OAuth redirect — highest priority, restores full form state)
  //   2. Advance out of 'auth' step once the user is authenticated
  //   3. Advance out of 'intent' step when user arrives already logged-in with a URL intent param
  useEffect(() => {
    if (authLoading) return;

    // Priority 1: restore draft written before redirecting to /sign-in
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
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
            setStep(draft.returnStep || 'wizard-handle');
          }
          return;
        }
      } catch {}
    }

    // Priority 2: advance out of the 'auth' interstitial once authenticated
    if (step === 'auth' && userId) {
      setStep(intent === 'claim' ? 'claim-existing' : 'wizard-handle');
      return;
    }

    // Priority 3: skip 'intent' selection when user arrives already logged-in with ?intent= in the URL
    if (step === 'intent' && userId) {
      const urlIntent = searchParams.get('intent');
      if (urlIntent === 'new' || urlIntent === 'claim') {
        setIntent(urlIntent);
        setStep(urlIntent === 'claim' ? 'claim-existing' : 'wizard-handle');
      }
    }
  }, [authLoading, userId, step, intent, searchParams]);

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
        }
      } catch {}
    }, 3000);
  }, [refreshAgents]);

  // Only used by the claim-existing path. The new-agent path stays on token-display and shows
  // activation status inline via agentActivated state — it never transitions to 'complete'.
  // The 'complete' step is therefore intentionally reachable only from claim-existing.
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
        returnStep: selected === 'claim' ? 'claim-existing' : 'wizard-handle',
      }));
      setStep('auth');
    } else if (selected === 'claim') {
      setStep('claim-existing');
    } else {
      setStep('wizard-handle');
    }
  };

  const handleAuthContinue = () => {
    const returnTo = `/get-started?intent=${intent ?? 'new'}`;
    window.location.href = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  };

  // Called from wizard-plan step after plan is selected.
  // Creates the agent, stores the result, then advances to token-display.
  // Handle checkout (if needed) is presented as an explicit button on token-display — never auto-redirect.
  const handleCreateAgent = async (plan: WizardPlan) => {
    if (agentCreatingRef.current) return;
    agentCreatingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.agents.create({
        ...(handle ? { handle } : {}),
        displayName: agentName || handle || 'My Agent',
        description: description || undefined,
        capabilities: selectedCaps.length > 0 ? selectedCaps : undefined,
        intendedPlan: plan,
      });

      const agentId = result.id;
      const token = result.claimToken ?? '';

      if (result.pendingHandle) {
        setPendingHandleFromServer(result.pendingHandle);
      }

      // Persist plan selection so dashboard can prompt for subscription upgrade.
      try { sessionStorage.setItem(PLAN_STORAGE_KEY, plan); } catch {}

      setCreatedAgentId(agentId);
      setClaimToken(token);
      setStep('token-display');
      startPolling(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setSubmitting(false);
      agentCreatingRef.current = false;
    }
  };

  // Triggered explicitly by the user on token-display when handle payment is needed.
  // Only fires for free-plan users who chose a handle (paid plans include the handle).
  const handleHandleCheckout = async () => {
    if (!createdAgentId || !pendingHandleFromServer) return;
    setCheckoutSubmitting(true);
    try {
      const base = window.location.origin;
      const r = await api.billing.handleCheckout(
        pendingHandleFromServer,
        createdAgentId,
        `${base}/dashboard?payment=success`,
        `${base}/dashboard?payment=cancelled`,
      );
      if (r.url) window.location.href = r.url;
    } catch { /* non-fatal — user can proceed to dashboard */ }
    finally { setCheckoutSubmitting(false); }
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
  const handleLen = handle ? handle.replace(/[^a-z0-9]/g, '').length : 0;
  const isStandardHandle = handleLen >= 5;

  const pageStyle: React.CSSProperties = {
    maxWidth: 600, margin: '0 auto', padding: '80px 24px 120px',
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

          <h1 style={{
            marginTop: 0, fontSize: 32, fontWeight: 700, color: '#e8e8f0',
            textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.02em',
            fontFamily: 'var(--font-heading, inherit)',
          }}>
            Register your agent.
          </h1>

          <p style={{ marginTop: 8, fontSize: 15, color: 'rgba(232,232,240,0.5)', textAlign: 'center', lineHeight: 1.6, maxWidth: 400 }}>
            Get a portable identity for your AI agent — public profile, discovery, and routing. A handle is optional and can be added any time.
          </p>

          <div style={{ marginTop: 36, width: '100%', opacity: authLoading ? 0.5 : 1, pointerEvents: authLoading ? 'none' : undefined, transition: 'opacity 0.2s' }}>
            <button
              onClick={() => handleIntentSelect('new')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                borderRadius: 14, border: '1px solid rgba(79,125,243,0.3)',
                background: 'linear-gradient(135deg, rgba(79,125,243,0.08), rgba(79,125,243,0.03))',
                padding: '20px 24px', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(79,125,243,0.55)';
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(79,125,243,0.14), rgba(79,125,243,0.06))';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(79,125,243,0.3)';
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(79,125,243,0.08), rgba(79,125,243,0.03))';
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: 'rgba(79,125,243,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Bot size={22} color="#4f7df3" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f0', marginBottom: 3 }}>
                  Register your agent
                </div>
                <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5 }}>
                  Get a public profile and routing address — handle optional
                </div>
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#4f7df3',
                  background: 'rgba(79,125,243,0.12)', border: '1px solid rgba(79,125,243,0.2)',
                  padding: '3px 8px', borderRadius: 100, letterSpacing: '0.06em',
                }}>
                  MOST POPULAR
                </span>
                <ArrowRight size={14} color="rgba(79,125,243,0.6)" />
              </div>
            </button>

            <button
              onClick={() => handleIntentSelect('claim')}
              style={{
                marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)',
                padding: '14px 20px', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124,91,245,0.3)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,91,245,0.04)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <Link2 size={16} color="rgba(124,91,245,0.7)" />
              <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', flex: 1 }}>
                Already have a claim token? Finish connecting an existing agent
              </span>
              <ArrowRight size={13} color="rgba(255,255,255,0.15)" />
            </button>
          </div>

          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 24, height: 4, borderRadius: 2, background: '#4f7df3' }} />
            <div style={{ width: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ width: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(232,232,240,0.22)', textAlign: 'center' }}>
            {agentCount !== null
              ? `${agentCount.toLocaleString()}+ agents already on the network`
              : 'Free to start — no credit card required'}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div style={pageStyle}>
        <StepIndicator steps={['handle', 'activate']} current={0} />
        <h1 style={titleStyle}>Create your account</h1>
        <p style={subtitleStyle}>
          {intent === 'new'
            ? 'Free account required to claim your agent handle and set up your identity.'
            : 'Sign in to connect your existing agent to your account.'}
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

  if (step === 'wizard-handle') {
    const canContinue = handle.length >= 3 && available === true && !checkingHandle;

    return (
      <div style={{
        minHeight: '100vh', background: '#050711',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <StepIndicator steps={['handle', 'skills', 'plan', 'connect']} current={0} />

          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{
              fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 34, fontWeight: 800,
              color: '#e8e8f0', marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1.1,
            }}>
              Claim a handle <span style={{ fontSize: 18, fontWeight: 400, color: 'rgba(232,232,240,0.3)' }}>(optional)</span>
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6 }}>
              A permanent public identity for your agent — you can add or buy one later too.
            </p>
          </div>

          {/* Handle hero input */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'stretch',
              background: 'rgba(255,255,255,0.04)',
              border: `2px solid ${
                available === true ? 'rgba(52,211,153,0.5)' :
                available === false ? 'rgba(248,113,113,0.5)' :
                'rgba(79,125,243,0.3)'
              }`,
              borderRadius: 14, overflow: 'hidden',
              boxShadow: available === true
                ? '0 0 0 4px rgba(52,211,153,0.08)'
                : available === false
                  ? '0 0 0 4px rgba(248,113,113,0.08)'
                  : '0 0 0 4px rgba(79,125,243,0.06)',
              transition: 'all 0.2s',
            }}>
              <input
                value={handle}
                onChange={e => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(null); }}
                placeholder="my-agent"
                autoFocus
                style={{
                  flex: 1, padding: '18px 20px',
                  fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: '#e8e8f0',
                  background: 'none', border: 'none', outline: 'none', minWidth: 0,
                  letterSpacing: '-0.01em',
                }}
              />
              <div style={{
                padding: '18px 20px', fontFamily: 'var(--font-mono)', fontSize: 22,
                color: '#4f7df3', fontWeight: 700,
                background: 'rgba(79,125,243,0.06)',
                borderLeft: '2px solid rgba(79,125,243,0.15)',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
                letterSpacing: '-0.01em',
              }}>
                .agentid
              </div>
            </div>

            <div style={{ marginTop: 10, height: 20, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
              {handle.length >= 1 && handle.length < 3 && (
                <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.3)' }}>Minimum 3 characters</span>
              )}
              {handle.length >= 3 && checkingHandle && (
                <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'rgba(232,232,240,0.3)' }} />
                <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.3)' }}>Checking availability…</span></>
              )}
              {handle.length >= 3 && !checkingHandle && available === true && (
                <><Check size={14} color="#34d399" />
                <span style={{ fontSize: 13, color: '#34d399', fontWeight: 500 }}>{handle}.agentid is available</span></>
              )}
              {handle.length >= 3 && !checkingHandle && available === false && (
                <><AlertCircle size={14} color="#f87171" />
                <span style={{ fontSize: 13, color: '#f87171' }}>This handle is taken — try another</span></>
              )}
            </div>
          </div>

          {/* Display name (optional) */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Display name (optional)</div>
            <input
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder={handle ? handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'My Research Agent'}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Why the handle matters */}
          <div style={{
            marginBottom: 20, padding: '16px 18px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              {[
                { icon: <Globe size={13} color="#4f7df3" />, text: 'Public profile at your-agent.agentid' },
                { icon: <Users size={13} color="#4f7df3" />, text: 'Discoverable by other agents' },
                { icon: <Zap size={13} color="#4f7df3" />, text: 'Routing & messaging address' },
                { icon: <Shield size={13} color="#4f7df3" />, text: 'Portable — yours forever' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>{icon}</div>
                  <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.45 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Handle pricing info — shown once handle is available, no plan gate */}
          {handle.length >= 3 && !checkingHandle && available === true && (
            isStandardHandle ? (
              <div style={{
                marginBottom: 20, padding: '14px 16px', borderRadius: 10,
                background: 'rgba(79,125,243,0.05)', border: '1px solid rgba(79,125,243,0.15)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Check size={15} color="#4f7df3" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0', marginBottom: 2 }}>
                    <span style={{ textDecoration: 'line-through', color: 'rgba(232,232,240,0.35)', marginRight: 6 }}>
                      $5/yr
                    </span>
                    <span style={{ color: '#34d399' }}>Free with Starter or Pro</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                    Standard handles (5+ chars) are included in paid plans. Otherwise $5/yr — plan selection at checkout.
                  </div>
                </div>
              </div>
            ) : handlePrice && handlePrice.annualPrice !== null && handlePrice.annualPrice > 0 ? (
              <div style={{
                marginBottom: 20, padding: '14px 16px', borderRadius: 10,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                  {handleLen === 3 ? 'Ultra-premium' : 'Premium'} handle — ${handlePrice.annualPrice}/yr
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                  Short handles (3–4 chars) include an on-chain mint and are priced by character length.
                </div>
              </div>
            ) : null
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <GhostBtn onClick={() => { setStep('intent'); setError(null); }}>Back</GhostBtn>
            <PrimaryBtn onClick={() => { setError(null); setStep('wizard-capabilities'); }} disabled={!canContinue}>
              Continue <ArrowRight size={16} />
            </PrimaryBtn>
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => { setHandle(''); setAvailable(null); setError(null); setStep('wizard-capabilities'); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'rgba(232,232,240,0.3)',
                fontFamily: 'inherit', textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Skip for now — register agent without a handle
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (step === 'wizard-capabilities') {
    return (
      <CapabilitiesStep
        selectedCaps={selectedCaps}
        setSelectedCaps={setSelectedCaps}
        error={error}
        onBack={() => { setError(null); setStep('wizard-handle'); }}
        onNext={() => { setError(null); setStep('wizard-plan'); }}
      />
    );
  }

  if (step === 'wizard-plan') {
    const handleLen = handle ? handle.replace(/[^a-z0-9]/g, '').length : 0;
    const isStdHandle = handleLen >= 5;
    const handlePrice = handle ? getHandlePrice(handle) : null;
    const handleCostForFree = handle
      ? (isStdHandle ? 5 : (handlePrice?.annualPrice ?? 0))
      : 0;

    const plans: Array<{
      id: WizardPlan;
      name: string;
      price: string;
      sub: string;
      features: string[];
      highlight?: boolean;
      handleNote: string;
    }> = [
      {
        id: 'free',
        name: 'Free',
        price: '$0',
        sub: 'forever',
        features: ['1 agent', 'UUID identity', 'Trust score', 'API access'],
        handleNote: handle
          ? `Handle: +$${handleCostForFree}/yr at checkout`
          : 'No handle (add later)',
      },
      {
        id: 'starter',
        name: 'Starter',
        price: '$29',
        sub: '/mo',
        highlight: true,
        features: ['5 agents', 'Inbox & messaging', 'Task management', '1 standard handle included'],
        handleNote: handle && isStdHandle ? '✓ Handle included free' : handle ? `Handle: $${handleCostForFree}/yr` : 'Includes 1 standard handle',
      },
      {
        id: 'pro',
        name: 'Pro',
        price: '$79',
        sub: '/mo',
        features: ['25 agents', 'Fleet management', 'Analytics', '1 standard handle included'],
        handleNote: handle && isStdHandle ? '✓ Handle included free' : handle ? `Handle: $${handleCostForFree}/yr` : 'Includes 1 standard handle',
      },
    ];

    return (
      <div style={{
        minHeight: '100vh', background: '#050711',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif", padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          <StepIndicator steps={['handle', 'skills', 'plan', 'connect']} current={2} />

          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h1 style={{
              fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 30, fontWeight: 800,
              color: '#e8e8f0', marginBottom: 8, letterSpacing: '-0.02em',
            }}>Choose your plan</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6 }}>
              {handle
                ? `You chose @${handle} — see how handle pricing varies by plan below.`
                : 'You can add a handle any time from your dashboard.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
            {plans.map(plan => {
              const selected = wizardSelectedPlan === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setWizardSelectedPlan(plan.id)}
                  style={{
                    borderRadius: 16, padding: '20px 18px', cursor: 'pointer',
                    background: selected
                      ? 'rgba(79,125,243,0.1)'
                      : plan.highlight
                        ? 'rgba(79,125,243,0.04)'
                        : 'rgba(255,255,255,0.02)',
                    border: selected
                      ? '2px solid #4f7df3'
                      : plan.highlight
                        ? '1px solid rgba(79,125,243,0.25)'
                        : '1px solid rgba(255,255,255,0.07)',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  {plan.highlight && !selected && (
                    <div style={{
                      position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 9, fontWeight: 700, color: '#4f7df3', letterSpacing: '0.1em',
                      background: '#050711', padding: '2px 8px', borderRadius: 100,
                      border: '1px solid rgba(79,125,243,0.25)',
                    }}>POPULAR</div>
                  )}

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(232,232,240,0.5)', letterSpacing: '0.08em', marginBottom: 4 }}>{plan.name.toUpperCase()}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#e8e8f0' }}>{plan.price}</span>
                      <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)' }}>{plan.sub}</span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginBottom: 12 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                        <Check size={11} color="#4f7df3" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.55)', lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    fontSize: 11, fontWeight: 500, lineHeight: 1.4,
                    color: plan.handleNote.startsWith('✓') ? '#34d399' : 'rgba(232,232,240,0.4)',
                    borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10,
                  }}>
                    {plan.handleNote}
                  </div>

                  {selected && (
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 18, height: 18, borderRadius: '50%', background: '#4f7df3',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={11} color="#fff" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <GhostBtn onClick={() => { setError(null); setStep('wizard-capabilities'); }}>Back</GhostBtn>
            <PrimaryBtn
              onClick={() => { if (wizardSelectedPlan) handleCreateAgent(wizardSelectedPlan); }}
              disabled={!wizardSelectedPlan || submitting}
              loading={submitting}
            >
              Register my agent <ArrowRight size={16} />
            </PrimaryBtn>
          </div>
          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'rgba(232,232,240,0.25)' }}>
            {wizardSelectedPlan === 'free'
              ? handle
                ? `Free plan · Handle checkout ($${handleCostForFree}/yr) shown after registration`
                : 'Free plan · No payment required today'
              : 'Plan billed separately · Cancel any time'}
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (step === 'token-display') {
    const APP_URL = window.location.origin;
    const showHandleCheckout = !!pendingHandleFromServer && wizardSelectedPlan === 'free';
    // Starter/Pro users: handle is included in the plan — show subscribe CTA instead of $5 checkout.
    const showPlanSubscribeCta = !!pendingHandleFromServer && (wizardSelectedPlan === 'starter' || wizardSelectedPlan === 'pro');

    const sdkInstall = `npm install @agentid/sdk`;
    const sdkSnippet = `import { AgentID } from '@agentid/sdk';

const agent = await AgentID.activate({
  claimToken: '${claimToken}',
});

// agent.identity  —  safe for system prompt
// agent.handle    —  e.g. "${handle || 'your-agent'}.agentid"
// agent.secrets.apiKey  —  store in env vars only`;

    const curlSnippet = `# Step 1 — claim your identity (send your ed25519 public key)
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/claim \\
  -H "Content-Type: application/json" \\
  -d '{"token":"${claimToken}","publicKey":"<ed25519-pub-base64>","keyType":"ed25519"}'

# Step 2 — sign the returned challenge and activate
curl -X POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/activate \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"${createdAgentId}","challenge":"<challenge>","signature":"<sig>","claimToken":"${claimToken}"}'`;

    const chatPrompt = `I've registered you on Agent ID. Activate your identity now.

Your claim token:
${claimToken}

Step 1 — POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/bootstrap/claim
  Body: { "token": "<above>", "publicKey": "<your ed25519 pub key>", "keyType": "ed25519" }

Step 2 — sign the challenge returned, then POST to /bootstrap/activate
  Body: { "agentId": "${createdAgentId}", "challenge": "<from step 1>", "signature": "<signed>", "claimToken": "<above>" }`;

    const snippets = { sdk: sdkSnippet, api: curlSnippet, chat: chatPrompt };
    const tabs = [
      { id: 'sdk' as const, label: 'SDK' },
      { id: 'api' as const, label: 'API (cURL)' },
      { id: 'chat' as const, label: 'Chat Prompt' },
    ];

    return (
      <div style={pageStyle}>
        <StepIndicator steps={['handle', 'skills', 'plan', 'connect']} current={3} />

        {/* Agent card */}
        <div style={{
          padding: '20px 24px', borderRadius: 16,
          background: 'rgba(8,10,22,0.98)',
          border: '1px solid rgba(52,211,153,0.2)',
          marginBottom: 20,
          boxShadow: '0 0 32px rgba(52,211,153,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bot size={20} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f0' }}>
                {handle
                  ? <>{agentName || handle}<span style={{ color: '#4f7df3' }}>.agentid</span></>
                  : <span>{agentName || 'Your Agent'}</span>
                }
              </div>
              {handle && (
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                  {handle}.getagent.id
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#34d399', letterSpacing: '0.08em' }}>REGISTERED</span>
            </div>
          </div>
        </div>

        {/* Handle checkout CTA — free plan + pending handle */}
        {showHandleCheckout && (
          <div style={{
            marginBottom: 20, padding: '16px 20px', borderRadius: 14,
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 3 }}>
                Claim @{pendingHandleFromServer}.agentid
              </div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5 }}>
                $5/yr — your handle is reserved for 24 hours. Pay now to secure it.
              </div>
            </div>
            <button
              onClick={handleHandleCheckout}
              disabled={checkoutSubmitting}
              style={{
                padding: '10px 18px', borderRadius: 10,
                background: checkoutSubmitting ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.35)',
                color: '#f59e0b', fontSize: 13, fontWeight: 600,
                cursor: checkoutSubmitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {checkoutSubmitting
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                : <>Pay $5/yr <ArrowRight size={13} /></>
              }
            </button>
          </div>
        )}

        {/* Plan subscribe CTA — Starter/Pro selected in wizard but not yet subscribed */}
        {showPlanSubscribeCta && (
          <div style={{
            marginBottom: 20, padding: '16px 20px', borderRadius: 14,
            background: 'rgba(79,125,243,0.06)', border: '1px solid rgba(79,125,243,0.2)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 3 }}>
                Get @{pendingHandleFromServer}.agentid free with {wizardSelectedPlan === 'starter' ? 'Starter' : 'Pro'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5 }}>
                Your handle is reserved. Subscribe to {wizardSelectedPlan === 'starter' ? 'Starter ($29/mo)' : 'Pro ($79/mo)'} and it's included at no extra cost.
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  const base = window.location.origin;
                  const r = await api.billing.checkout({
                    plan: wizardSelectedPlan as 'starter' | 'pro',
                    billingInterval: 'monthly',
                    successUrl: `${base}/dashboard?subscribed=1`,
                    cancelUrl: `${base}/get-started`,
                  });
                  if (r.url) window.location.href = r.url;
                } catch { /* non-fatal */ }
              }}
              style={{
                padding: '10px 18px', borderRadius: 10,
                background: 'rgba(79,125,243,0.15)', border: '1px solid rgba(79,125,243,0.35)',
                color: '#a5bdfc', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Subscribe <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* Claim token */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0', marginBottom: 10 }}>
            Give this token to your agent
          </div>
          <div style={{
            borderRadius: 12, background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(232,232,240,0.3)', letterSpacing: '0.1em' }}>CLAIM TOKEN</span>
              <CopyButton text={claimToken || ''} />
            </div>
            <div style={{
              padding: '14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a5bdfc',
              wordBreak: 'break-all', lineHeight: 1.7, userSelect: 'all',
            }}>
              {claimToken}
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'rgba(232,232,240,0.25)', lineHeight: 1.5 }}>
              ⚠ Keep private — treat like a password. Do not paste into AI chat interfaces, public forums, or version control. Expires in 7 days, single-use.
            </div>
          </div>
        </div>

        {/* How to connect — open by default */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e8f0', marginBottom: 10 }}>
            How to connect your agent
          </div>
          <div style={{
            borderRadius: 12, background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  padding: '10px 16px', fontSize: 12, fontWeight: 500,
                  color: activeTab === tab.id ? '#4f7df3' : 'rgba(232,232,240,0.4)',
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #4f7df3' : '2px solid transparent',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                  {tab.label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 10 }}>
                <CopyButton text={activeTab === 'sdk' ? `${sdkInstall}\n\n${snippets.sdk}` : snippets[activeTab]} />
              </div>
            </div>
            {activeTab === 'sdk' && (
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(79,125,243,0.04)',
              }}>
                <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Install:</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a5bdfc' }}>npm install @agentid/sdk</code>
                <CopyButton text={sdkInstall} />
              </div>
            )}
            <pre style={{
              padding: '14px', margin: 0,
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(232,232,240,0.75)',
              lineHeight: 1.65, overflow: 'auto', maxHeight: 260,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'transparent',
            }}>
              {snippets[activeTab]}
            </pre>
          </div>
        </div>

        {/* Activation status */}
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 12,
          background: agentActivated ? 'rgba(16,185,129,0.08)' : 'rgba(79,125,243,0.06)',
          border: `1px solid ${agentActivated ? 'rgba(16,185,129,0.25)' : 'rgba(79,125,243,0.15)'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {agentActivated
            ? <Check size={18} style={{ color: '#34d399', flexShrink: 0 }} />
            : <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#4f7df3', flexShrink: 0 }} />
          }
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: agentActivated ? '#34d399' : '#e8e8f0' }}>
              {agentActivated ? 'Agent connected!' : 'Waiting for your agent to connect…'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 2 }}>
              {agentActivated
                ? 'Your agent has claimed its identity and is live on the network.'
                : 'This page updates automatically once your agent uses the claim token.'}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <PrimaryBtn onClick={() => navigate('/dashboard')}>
            Open Dashboard <ArrowRight size={16} />
          </PrimaryBtn>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (step === 'claim-existing') {
    const APP_URL = window.location.origin;

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

    const chatPrompt = ownerToken ? `I want to register you on Agent ID and link you to my account.

Owner token (valid 24 hours):
${ownerToken}

Register by calling:
POST ${APP_URL}${import.meta.env.BASE_URL}api/v1/programmatic/agents/register
Authorization: Bearer ${ownerToken}

{
  "handle": "<choose-your-handle>",
  "displayName": "<your-name>",
  "capabilities": ["research", "code"]
}` : '';

    const tabs = [
      { id: 'sdk' as const, label: 'SDK' },
      { id: 'api' as const, label: 'API (cURL)' },
      { id: 'chat' as const, label: 'Chat Prompt' },
    ];

    const snippets = { chat: chatPrompt, sdk: sdkSnippet, api: curlSnippet };

    return (
      <div style={pageStyle}>
        <StepIndicator steps={['link']} current={0} />
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #34d399, #4f7df3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link2 size={24} color="#fff" />
          </div>
          <h1 style={{ ...titleStyle, textAlign: 'center' }}>Connect an existing agent</h1>
          <p style={{ ...subtitleStyle, textAlign: 'center' }}>
            Give your running agent this owner token. It will register itself and appear on your dashboard automatically.
          </p>
        </div>

        {loadingOwnerToken ? (
          <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#4f7df3' }} />
            <span style={{ color: 'rgba(232,232,240,0.5)', fontSize: 14 }}>Generating owner token…</span>
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
                Valid for 24 hours · Single-use
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
                  Waiting for your agent…
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 2 }}>
                  This page updates automatically once your agent registers.
                </div>
              </div>
            </Card>
          </>
        ) : null}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none', border: 'none', color: 'rgba(232,232,240,0.35)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
            }}
          >
            Go to dashboard &rarr;
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
          <h1 style={{ ...titleStyle, fontSize: 32, marginBottom: 12, textAlign: 'center' }}>
            Agent connected!
          </h1>
          <p style={{ ...subtitleStyle, marginBottom: 40, textAlign: 'center' }}>
            Your agent is live on Agent ID with a verified identity, public profile, and routing address.
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
