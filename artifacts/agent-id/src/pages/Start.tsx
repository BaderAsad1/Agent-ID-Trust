import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertCircle, CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { getHandlePrice } from '@/lib/pricing';

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

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current - 1 ? 24 : 8,
          height: 4, borderRadius: 2,
          background: i < current ? '#4f7df3' : 'rgba(255,255,255,0.08)',
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function NavButtons({
  onBack, onContinue, continueLabel = 'Continue →',
  continueDisabled, skipLabel, onSkip, loading,
}: {
  onBack?: () => void; onContinue: () => void; continueLabel?: string;
  continueDisabled?: boolean; skipLabel?: string; onSkip?: () => void; loading?: boolean;
}) {
  return (
    <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      {onBack && (
        <button onClick={onBack} style={{
          padding: '12px 28px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(232,232,240,0.5)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>Back</button>
      )}
      {skipLabel && onSkip && (
        <button onClick={onSkip} style={{
          padding: '12px 28px', borderRadius: 10,
          background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(232,232,240,0.4)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>{skipLabel}</button>
      )}
      <button onClick={onContinue} disabled={continueDisabled || loading} style={{
        padding: '12px 28px', borderRadius: 10,
        background: continueDisabled ? 'rgba(79,125,243,0.2)' : '#4f7df3',
        border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
        cursor: continueDisabled ? 'not-allowed' : 'pointer',
        opacity: continueDisabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'inherit', transition: 'opacity 0.2s',
      }}>
        {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
        {continueLabel}
      </button>
    </div>
  );
}

function CredentialIdenticon() {
  const cells = [[1,0,1,0,1],[0,1,1,1,0],[1,1,0,1,1],[0,1,1,1,0],[1,0,1,0,1]];
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.5, padding: 5,
      boxShadow: '0 4px 16px rgba(79,125,243,0.35)', flexShrink: 0,
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{ borderRadius: 1.5, background: on ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  );
}

function TrustRing({ score }: { score: number }) {
  const size = 48; const r = 18; const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.3))' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#34d399" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#34d399' }}>{score}</span>
    </div>
  );
}

function MachineReadableZone() {
  const bars = Array.from({ length: 36 }, (_, i) => [1, 2, 1, 3, 1, 2, 1][i % 7]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 8, overflow: 'hidden', opacity: 0.12 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: '100%', background: 'rgba(232,232,240,0.6)', borderRadius: 0.5 }} />
      ))}
    </div>
  );
}

const ATTESTATION_CHIPS = [
  { label: 'Code Execution', icon: '▸' },
  { label: 'API Access', icon: '∼' },
  { label: 'Data Analysis', icon: '≡' },
  { label: 'Payments', icon: '¤' },
  { label: 'Messaging', icon: '@' },
];

export function Start() {
  const navigate = useNavigate();
  const { userId, refreshAgents } = useAuth();

  const [mode, setMode] = useState<'choose' | 'human'>('choose');
  const [step, setStep] = useState(1);

  // Step 3 — identity
  const [agentName, setAgentName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);

  // Step 4 — verify
  const [selectedVerifyMethod, setSelectedVerifyMethod] = useState<'github' | 'wallet' | 'manual' | null>(null);
  const [verified, setVerified] = useState(false);

  // Step 5 — capabilities
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [endpoint, setEndpoint] = useState('');

  // Submit / success
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [domainActive, setDomainActive] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const agent = await api.agents.create({
        handle,
        displayName: agentName,
        description: description || undefined,
        capabilities: selectedCaps.length > 0 ? selectedCaps : undefined,
        endpointUrl: endpoint || undefined,
      });
      setCreatedAgentId(agent.id);

      if (selectedVerifyMethod) {
        try {
          const r = await api.agents.verify.initiate(agent.id, 'github') as Record<string, unknown>;
          await api.agents.verify.complete(agent.id, { challenge: r?.challenge || '' });
          setVerified(true);
        } catch { /* verification failure is non-fatal */ }
      }

      await refreshAgents();
      setShowSuccess(true);
      setTimeout(() => setDomainActive(true), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally { setSubmitting(false); }
  };

  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: '#050711',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-body)',
    color: '#e8e8f0',
    padding: '32px 20px',
  };

  // ─── Welcome / mode select ───────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4f7df3', boxShadow: '0 0 12px rgba(79,125,243,0.5)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, letterSpacing: '0.02em' }}>Agent ID</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 12px', color: '#e8e8f0' }}>Get started</h1>
          <p style={{ fontSize: 15, color: 'rgba(232,232,240,0.5)', lineHeight: 1.6, margin: '0 0 40px' }}>Choose how you want to register your agent identity.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={() => setMode('human')} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(79,125,243,0.08)', border: '1px solid rgba(79,125,243,0.25)',
              borderRadius: 14, padding: '20px 24px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(79,125,243,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 3 }}>I'm a human</div>
                <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}>Register and manage an agent through the dashboard</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="rgba(232,232,240,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            <button onClick={() => navigate('/for-agents')} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '20px 24px', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 3 }}>I'm an agent</div>
                <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}>Self-register via the programmatic API</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="rgba(232,232,240,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'rgba(232,232,240,0.25)', marginTop: 32 }}>
            Already have an account?{' '}
            <span onClick={() => navigate('/sign-in')} style={{ color: '#4f7df3', cursor: 'pointer' }}>Sign in</span>
          </p>
        </div>
      </div>
    );
  }

  // ─── Success / credential card ──────────────────────────────────────────
  if (showSuccess) {
    const { annualPrice } = handle ? getHandlePrice(handle) : { annualPrice: 0 };
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)', marginBottom: 16, textTransform: 'uppercase' }}>ISSUANCE COMPLETE</div>

          {/* Credential card */}
          <div style={{
            position: 'relative', borderRadius: 18,
            border: '1px solid rgba(52,211,153,0.15)',
            background: 'rgba(8,10,22,0.98)',
            overflow: 'hidden', marginBottom: 20, textAlign: 'left',
            boxShadow: '0 0 60px rgba(79,125,243,0.06), 0 30px 80px -15px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.5) 30%, rgba(52,211,153,0.6) 50%, rgba(52,211,153,0.5) 70%, transparent 90%)', opacity: 0.8 }} />
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg, rgba(52,211,153,0.35), rgba(52,211,153,0.08) 40%, transparent 80%)' }} />

            <div style={{ padding: '12px 28px 0' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,232,240,0.18)' }}>AGENT IDENTITY CREDENTIAL</div>
            </div>

            <div style={{ padding: '0 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 0' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: domainActive ? '#34d399' : '#f59e0b', boxShadow: domainActive ? '0 0 12px rgba(52,211,153,0.6)' : '0 0 8px rgba(245,158,11,0.5)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', color: domainActive ? '#34d399' : '#f59e0b' }}>
                  {domainActive ? 'CREDENTIAL ACTIVE' : 'PROVISIONING…'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <CredentialIdenticon />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#e8e8f0', letterSpacing: '-0.02em' }}>
                    {agentName || handle}<span style={{ color: '#4f7df3' }}>.agentid</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(232,232,240,0.35)', letterSpacing: '0.01em' }}>{handle}.getagent.id</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                {[
                  { label: 'HANDLE', value: `${handle}.agentid` },
                  { label: 'STATUS', value: domainActive ? 'Active' : 'Provisioning', isStatus: true, active: domainActive },
                  { label: 'ISSUED', value: new Date().toISOString().split('T')[0] },
                  { label: 'SERIAL', value: `AID-${createdAgentId?.slice(0, 6) ?? '0x…'}…`, dim: true },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 3 }}>{f.label}</div>
                    {f.isStatus ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: f.active ? '#34d399' : '#f59e0b' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: f.active ? '#34d399' : '#f59e0b', fontWeight: 500 }}>{f.value}</span>
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: f.dim ? 'rgba(232,232,240,0.2)' : 'rgba(232,232,240,0.5)' }}>{f.value}</div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                <TrustRing score={verified ? 55 : 35} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 3 }}>TRUST LEVEL</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                    New identity · {selectedCaps.length} capabilities · {verified ? 'Verified' : 'Unverified'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 28px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 6 }}>CAPABILITY ATTESTATIONS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(selectedCaps.length > 0 ? selectedCaps.slice(0, 5) : ATTESTATION_CHIPS.map(a => a.label)).map(cap => (
                  <span key={cap} style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'rgba(232,232,240,0.45)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, padding: '2px 6px' }}>
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ padding: '6px 28px 10px', borderTop: '1px solid rgba(255,255,255,0.03)', opacity: 0.5 }}>
              <MachineReadableZone />
            </div>
          </div>

          {/* Activate handle prompt */}
          {handle && annualPrice > 0 && (
            <div style={{ marginBottom: 12, padding: '14px 18px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} /> Activate your handle
              </div>
              <p style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5, margin: '0 0 10px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#4f7df3' }}>{handle}.agentid</span> is reserved. Pay ${annualPrice}/yr to activate.
              </p>
              <button
                disabled={checkoutLoading}
                onClick={async () => {
                  setCheckoutLoading(true);
                  try {
                    const base = window.location.origin;
                    const r = await api.payments.handleCheckout(handle, `${base}/dashboard?payment=success`, `${base}/dashboard?payment=cancelled`);
                    if (r.url) window.location.href = r.url;
                  } catch { setCheckoutLoading(false); }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, background: '#4f7df3', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {checkoutLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={14} />}
                Activate Handle
              </button>
            </div>
          )}

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button onClick={() => navigate(`/${handle}`)} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(232,232,240,0.6)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>View Profile</button>
            <button onClick={() => navigate('/dashboard')} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: '#4f7df3', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Go to Dashboard →</button>
          </div>

          <div style={{ padding: '12px 16px', background: 'rgba(79,125,243,0.04)', border: '1px solid rgba(79,125,243,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>🔗</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>Share:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4f7df3' }}>{handle}.getagent.id</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Wizard steps ────────────────────────────────────────────────────────
  const goNext = () => setStep(s => s + 1);
  const goBack = () => step === 1 ? setMode('choose') : setStep(s => s - 1);

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: step === 5 ? 520 : 480 }}>
        <StepDots current={step} total={6} />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {/* ── Step 1: Authenticate ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Authenticate</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Sign in to link your identity to your agent.</p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, textAlign: 'left' }}>
              {userId ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(79,125,243,0.06)', border: '1px solid rgba(79,125,243,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #4f7df3 0%, #7c5df3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {(userId[0] || 'U').toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{userId}</div>
                      <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>Authenticated via Replit</div>
                    </div>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={11} color="#fff" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', lineHeight: 1.6, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>User ID</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(232,232,240,0.5)' }}>{userId.slice(0, 12)}…</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Session</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>Active</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                  <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', marginBottom: 20 }}>You need to sign in first to continue.</p>
                  <button onClick={() => navigate('/sign-in')} style={{ padding: '12px 28px', borderRadius: 10, background: '#4f7df3', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Sign In</button>
                </div>
              )}
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={!userId} />
          </>
        )}

        {/* ── Step 2: Name your agent ──────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Name your agent</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Choose a display name and unique handle for your agent.</p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <FieldGroup label="Display Name" value={agentName} onChange={setAgentName} placeholder="Atlas-7" />
              <FieldGroup label="Handle" value={handle} onChange={setHandle} placeholder="atlas-7" suffix=".agentid" normalizeHandle>
                {handle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    {checkingHandle ? (
                      <Loader2 size={12} style={{ color: 'rgba(232,232,240,0.3)', animation: 'spin 1s linear infinite' }} />
                    ) : available === true ? (
                      <>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#34d399' }}>{handle}.agentid is available</span>
                        {getHandlePrice(handle).annualPrice > 0 && <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)' }}>— ${getHandlePrice(handle).annualPrice}/yr</span>}
                      </>
                    ) : available === false ? (
                      <>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444' }}>{handle}.agentid is taken</span>
                      </>
                    ) : null}
                  </div>
                )}
              </FieldGroup>
              <FieldGroup label="Description" value={description} onChange={setDescription} placeholder="Autonomous research agent specializing in…" isTextarea />
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={!agentName || !handle || !available} />
          </>
        )}

        {/* ── Step 3: .agentid address ─────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Claim your address</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Your agent gets two permanent, globally-resolvable addresses.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AddressCard
                label="WEB DOMAIN"
                icon="🌐"
                address={`${handle}.getagent.id`}
                sub="Resolves via standard DNS — works in any browser"
                color="#4f7df3"
              />
              <AddressCard
                label="PROTOCOL ADDRESS"
                icon="⬡"
                address={`${handle}.agentid`}
                sub="ENS-style protocol namespace — resolves through Agent ID protocol"
                color="#34d399"
              />
            </div>

            <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(79,125,243,0.04)', border: '1px solid rgba(79,125,243,0.1)', borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#4f7df3' }}>.agentid</span> is a protocol-layer namespace — like ENS's <span style={{ fontFamily: 'var(--font-mono)' }}>.eth</span>, but for AI agents. No ICANN TLD required. Both addresses are included with your registration.
              </div>
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} />
          </>
        )}

        {/* ── Step 4: Verify ownership ─────────────────────────────────── */}
        {step === 4 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Verify ownership</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Prove you control this agent. You can skip and verify later.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { id: 'github' as const, icon: '🔑', title: 'GitHub Gist', desc: 'Sign a verification token in a public gist', recommended: true },
                { id: 'wallet' as const, icon: '💎', title: 'Wallet Signature', desc: 'Sign with an EVM or Solana wallet' },
                { id: 'manual' as const, icon: '🔒', title: 'Manual Key Signing', desc: 'Sign the challenge with your agent\'s private key' },
              ]).map(opt => {
                const selected = selectedVerifyMethod === opt.id;
                return (
                  <button key={opt.title} onClick={() => setSelectedVerifyMethod(selected ? null : opt.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: selected ? 'rgba(79,125,243,0.1)' : opt.recommended ? 'rgba(79,125,243,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selected ? 'rgba(79,125,243,0.4)' : opt.recommended ? 'rgba(79,125,243,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 14, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    fontFamily: 'inherit', transition: 'all 0.15s ease',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: opt.recommended ? 'rgba(79,125,243,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {opt.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{opt.title}</span>
                        {opt.recommended && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#4f7df3', background: 'rgba(79,125,243,0.12)', padding: '2px 7px', borderRadius: 4 }}>RECOMMENDED</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}>{opt.desc}</div>
                    </div>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? '#4f7df3' : opt.recommended ? 'rgba(79,125,243,0.3)' : 'rgba(255,255,255,0.1)'}`, background: selected ? '#4f7df3' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {selected && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 12, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f5a623', marginBottom: 4 }}>Why verify?</div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>Verified agents get a trust score boost and a verified badge on their profile. Unverified agents can still operate but have limited discovery.</div>
              </div>
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} skipLabel="Skip for now" onSkip={goNext} continueLabel={selectedVerifyMethod ? 'Continue →' : 'Continue →'} />
          </>
        )}

        {/* ── Step 5: Capabilities ─────────────────────────────────────── */}
        {step === 5 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Capabilities</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Select what your agent can do. This helps with discovery.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {ALL_CAPABILITIES.map(cap => {
                const sel = selectedCaps.includes(cap.label);
                return (
                  <button key={cap.id} onClick={() => setSelectedCaps(p => sel ? p.filter(x => x !== cap.label) : [...p, cap.label])} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '18px 12px',
                    background: sel ? 'rgba(79,125,243,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${sel ? 'rgba(79,125,243,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 12, cursor: 'pointer', position: 'relative',
                    transition: 'all 0.15s ease', fontFamily: 'inherit',
                  }}>
                    {sel && (
                      <div style={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14, borderRadius: '50%', background: '#4f7df3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={8} color="#fff" strokeWidth={3} />
                      </div>
                    )}
                    <span style={{ fontSize: 22 }}>{cap.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: sel ? '#e8e8f0' : 'rgba(232,232,240,0.5)', textAlign: 'center' }}>{cap.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(232,232,240,0.3)', marginBottom: 10, textTransform: 'uppercase' }}>Task Endpoint (optional)</div>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(232,232,240,0.25)', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>https://</div>
                <input
                  value={endpoint.replace('https://', '')}
                  onChange={e => setEndpoint(e.target.value ? `https://${e.target.value}` : '')}
                  placeholder={`api.${handle || 'your-agent'}.dev/tasks`}
                  style={{ flex: 1, padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(232,232,240,0.5)', background: 'none', border: 'none', outline: 'none' }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', marginTop: 8 }}>Where other agents and humans can send work requests</div>
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={selectedCaps.length === 0} />
          </>
        )}

        {/* ── Step 6: Review & Submit ──────────────────────────────────── */}
        {step === 6 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Ready to launch</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Review your agent details and confirm.</p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
              <ReviewRow label="Display Name" value={agentName} />
              <ReviewRow label="Handle" value={`${handle}.agentid`} mono />
              <ReviewRow label="Web domain" value={`${handle}.getagent.id`} mono />
              {description && <ReviewRow label="Description" value={description} />}
              <ReviewRow label="Verification" value={selectedVerifyMethod === 'github' ? 'GitHub Gist' : selectedVerifyMethod === 'wallet' ? 'Wallet Signature' : selectedVerifyMethod === 'manual' ? 'Manual Key Signing' : 'Skip — verify later'} ok={selectedVerifyMethod !== null} />
              <ReviewRow label="Capabilities" value={selectedCaps.length > 0 ? selectedCaps.join(', ') : 'None selected'} last />
            </div>

            <NavButtons
              onBack={goBack}
              onContinue={handleSubmit}
              continueLabel="Create Agent →"
              loading={submitting}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function FieldGroup({ label, value, onChange, placeholder, suffix, isTextarea, normalizeHandle, children }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  suffix?: string; isTextarea?: boolean; normalizeHandle?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(232,232,240,0.3)', marginBottom: 8, textTransform: 'uppercase' }}>{label}</div>
      {isTextarea ? (
        <textarea
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', minHeight: 72, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0', lineHeight: 1.5, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
          <input
            value={value}
            onChange={e => onChange(normalizeHandle ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') : e.target.value)}
            placeholder={placeholder}
            style={{ flex: 1, padding: '12px 14px', fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0', background: 'none', border: 'none', outline: 'none' }}
          />
          {suffix && (
            <div style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 14, color: '#4f7df3', fontWeight: 500, borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(79,125,243,0.04)', whiteSpace: 'nowrap' }}>{suffix}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function AddressCard({ label, icon, address, sub, color }: { label: string; icon: string; address: string; sub: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: `${color}99`, marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: '#e8e8f0', marginBottom: 4 }}>{address}</div>
        <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', lineHeight: 1.4 }}>{sub}</div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, mono, ok, last }: { label: string; value: string; mono?: boolean; ok?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '14px 20px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', color: ok === true ? '#34d399' : ok === false ? 'rgba(232,232,240,0.35)' : '#e8e8f0', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
