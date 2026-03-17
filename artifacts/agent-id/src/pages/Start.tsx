import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertCircle, CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { getHandlePrice } from '@/lib/pricing';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

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

const ATTESTATION_CHIPS = [
  { label: 'Code Execution', icon: '▸' },
  { label: 'API Access', icon: '∼' },
  { label: 'Data Analysis', icon: '≡' },
  { label: 'Payments', icon: '¤' },
  { label: 'Messaging', icon: '@' },
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
            style={{ flex: 1, padding: '12px 14px', fontFamily: 'var(--font-body)', fontSize: 15, color: '#e8e8f0', background: 'none', border: 'none', outline: 'none', minWidth: 0 }}
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

function ReviewRow({ label, value, mono, ok, last }: { label: string; value: string; mono?: boolean; ok?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '14px 20px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', color: ok === true ? '#34d399' : ok === false ? 'rgba(232,232,240,0.35)' : '#e8e8f0', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export function Start() {
  const navigate = useNavigate();
  const { userId, loading: authLoading, login, refreshAgents } = useAuth();

  const [step, setStep] = useState(1);

  const [agentName, setAgentName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);

  const [selectedAuthMethod, setSelectedAuthMethod] = useState<'github' | 'wallet' | 'manual' | null>(null);
  const [verified, setVerified] = useState(false);

  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [endpoint, setEndpoint] = useState('');

  const [pendingSubmit, setPendingSubmit] = useState(false);
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

  const STORAGE_KEY = 'agent-id-wizard-draft';

  const saveFormState = () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      handle, agentName, description, selectedAuthMethod, selectedCaps, endpoint, step,
      pendingAuthSubmit: true,
    }));
  };

  const clearFormState = () => {
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (draftRestored) return;

    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) { setDraftRestored(true); return; }

    try {
      const data = JSON.parse(raw);
      if (data.handle) setHandle(data.handle);
      if (data.agentName) setAgentName(data.agentName);
      if (data.description) setDescription(data.description);
      if (data.selectedAuthMethod) setSelectedAuthMethod(data.selectedAuthMethod);
      if (data.selectedCaps) setSelectedCaps(data.selectedCaps);
      if (data.endpoint) setEndpoint(data.endpoint);
      if (data.step) setStep(data.step);

      if (data.pendingAuthSubmit && userId) {
        setPendingSubmit(true);
      }
    } catch { /* ignore corrupt data */ }

    setDraftRestored(true);
  }, [authLoading, draftRestored, userId]);

  useEffect(() => {
    if (pendingSubmit && userId && draftRestored) {
      setPendingSubmit(false);
      doSubmit();
    }
  }, [pendingSubmit, userId, draftRestored]);

  const doSubmit = async () => {
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
      clearFormState();

      if (selectedAuthMethod) {
        try {
          const r = await api.agents.verify.initiate(agent.id, selectedAuthMethod) as Record<string, unknown>;
          await api.agents.verify.complete(agent.id, { challenge: r?.challenge || '' });
          setVerified(true);
        } catch { /* non-fatal */ }
      }

      await refreshAgents();
      setShowSuccess(true);
      setTimeout(() => setDomainActive(true), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!userId) {
      saveFormState();
      login();
      return;
    }
    await doSubmit();
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
    padding: '32px 16px',
  };

  if (authLoading) {
    return (
      <div style={shell}>
        <Loader2 size={24} style={{ color: '#4f7df3', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }


  if (showSuccess) {
    const { annualPrice } = handle ? getHandlePrice(handle) : { annualPrice: 0 };
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)', marginBottom: 16, textTransform: 'uppercase' }}>ISSUANCE COMPLETE</div>

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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'rgba(232,232,240,0.25)', marginLeft: 6 }}>
                  TRUST {verified ? 55 : 35}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <CredentialIdenticon />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {agentName || handle}<span style={{ color: '#4f7df3' }}>.agentid</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>{handle}.getagent.id</div>
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
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
                    New identity · {selectedCaps.length} capabilities · {verified ? 'Verified' : 'Unverified'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 28px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 6 }}>CAPABILITY ATTESTATIONS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(selectedCaps.length > 0 ? selectedCaps.slice(0, 5) : ATTESTATION_CHIPS.map(a => a.label)).map(cap => (
                  <span key={cap} style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'rgba(232,232,240,0.45)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 28px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 2 }}>MARKETPLACE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(232,232,240,0.45)' }}>Unlisted</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 2 }}>ROUTING</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#34d399' }}>Addressable</div>
              </div>
            </div>

            <div style={{ padding: '12px 28px 16px', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'center' }}>
              <QRCodeSVG
                value={`https://${handle}.getagent.id`}
                size={80}
                bgColor="transparent"
                fgColor="rgba(232,232,240,0.35)"
                level="M"
              />
            </div>
          </div>

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

          <button
            onClick={() => toast('Apple Wallet integration coming soon — your credential is saved in your dashboard')}
            style={{
            width: '100%', padding: '13px 20px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.4)', fontFamily: 'inherit',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.3" />
              <rect x="5" y="12" width="6" height="1.5" rx="0.75" fill="currentColor" opacity="0.5" />
              <rect x="5" y="15" width="4" height="1.5" rx="0.75" fill="currentColor" opacity="0.3" />
            </svg>
            Add to Apple Wallet
          </button>

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

  const TOTAL_STEPS = 5;
  const goNext = () => setStep(s => s + 1);
  const goBack = () => step === 1 ? navigate('/') : setStep(s => s - 1);

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: step === 4 ? 520 : 480 }}>
        <StepDots current={step} total={TOTAL_STEPS} />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {step === 1 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Name your agent</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Choose a display name and unique handle for your agent.</p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <FieldGroup label="Display Name" value={agentName} onChange={setAgentName} placeholder="Atlas-7" />

              <FieldGroup label="Handle" value={handle} onChange={setHandle} placeholder="atlas-7" suffix=".agentid" normalizeHandle>
                {handle && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      {checkingHandle ? (
                        <Loader2 size={12} style={{ color: 'rgba(232,232,240,0.3)', animation: 'spin 1s linear infinite' }} />
                      ) : available === true ? (
                        <>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#34d399' }}>{handle}.agentid is available</span>
                        </>
                      ) : available === false ? (
                        <>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444' }}>{handle}.agentid is taken</span>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(232,232,240,0.3)', marginTop: 6 }}>
                      {handle.replace(/[^a-z0-9]/g, '').length} characters
                    </div>
                  </>
                )}
              </FieldGroup>

              <FieldGroup label="Description" value={description} onChange={setDescription} placeholder="Autonomous research agent specializing in…" isTextarea>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 6 }}>Helps other agents and humans find and hire you</div>
              </FieldGroup>

              {handle && (() => {
                const { annualPrice, tier } = getHandlePrice(handle);
                const isUltraPremium = annualPrice >= 640;
                const isPremium = annualPrice >= 160 && annualPrice < 640;
                const priceLabel = isUltraPremium ? `$${annualPrice}/yr — Ultra-premium` : isPremium ? `$${annualPrice}/yr — Premium` : 'Included — Standard';
                const priceColor = isUltraPremium ? '#a78bfa' : isPremium ? '#f59e0b' : '#34d399';
                const priceBg = isUltraPremium ? 'rgba(167,139,250,0.08)' : isPremium ? 'rgba(245,158,11,0.06)' : 'rgba(52,211,153,0.06)';
                const priceBorder = isUltraPremium ? 'rgba(167,139,250,0.2)' : isPremium ? 'rgba(245,158,11,0.15)' : 'rgba(52,211,153,0.15)';
                return (
                  <div style={{ padding: '14px 16px', background: priceBg, borderRadius: 10, border: `1px solid ${priceBorder}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)' }}>Handle cost</span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: priceColor }}>
                        {priceLabel}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={!agentName || !handle || !available} />
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Authenticate</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Prove you control this agent. Verify now for full discovery — or continue and verify from your dashboard.</p>

            <div style={{ marginBottom: 16, padding: '14px 18px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 12, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f5a623', marginBottom: 4 }}>Why verify?</div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>Verified agents get a trust score boost, a verified badge, and full discovery by other agents and platforms. Unverified agents can still operate but appear lower in search results.</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { id: 'github' as const, icon: '🔑', title: 'GitHub Gist', desc: 'Sign a verification token in a public gist', timeEstimate: '~90 seconds', recommended: true },
                { id: 'wallet' as const, icon: '💎', title: 'Wallet Signature', desc: 'Sign with an EVM or Solana wallet', timeEstimate: '~20 seconds' },
                { id: 'manual' as const, icon: '🔒', title: 'Manual Key Signing', desc: "Sign the challenge with your agent's private key", timeEstimate: '~2 minutes' },
              ]).map(opt => {
                const sel = selectedAuthMethod === opt.id;
                return (
                  <button key={opt.id} onClick={() => setSelectedAuthMethod(sel ? null : opt.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: sel ? 'rgba(79,125,243,0.1)' : opt.recommended ? 'rgba(79,125,243,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${sel ? 'rgba(79,125,243,0.4)' : opt.recommended ? 'rgba(79,125,243,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 14, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    fontFamily: 'inherit', transition: 'all 0.15s ease',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: opt.recommended ? 'rgba(79,125,243,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {opt.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{opt.title}</span>
                        {opt.recommended && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#4f7df3', background: 'rgba(79,125,243,0.12)', padding: '2px 7px', borderRadius: 4 }}>RECOMMENDED</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}>{opt.desc}</div>
                      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{opt.timeEstimate}</div>
                    </div>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? '#4f7df3' : opt.recommended ? 'rgba(79,125,243,0.3)' : 'rgba(255,255,255,0.1)'}`, background: sel ? '#4f7df3' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} skipLabel="Skip for now" onSkip={goNext} />
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Claim your addresses</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Your agent gets two addresses — a web domain and a protocol namespace.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '22px 24px', background: 'rgba(79,125,243,0.04)', border: '1px solid rgba(79,125,243,0.15)', borderRadius: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(79,125,243,0.6)', marginBottom: 10, textTransform: 'uppercase' }}>Web Domain</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: '#e8e8f0', marginBottom: 6 }}>
                  {handle}<span style={{ color: '#4f7df3' }}>.getagent.id</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', lineHeight: 1.5 }}>
                  Canonical web address. Resolves your .well-known identity document, agent profile, and API endpoints.
                </div>
              </div>

              <div style={{ padding: '22px 24px', background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(52,211,153,0.6)', marginBottom: 10, textTransform: 'uppercase' }}>Protocol Address</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: '#e8e8f0', marginBottom: 6 }}>
                  {handle}<span style={{ color: '#34d399' }}>.agentid</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', lineHeight: 1.5 }}>
                  Protocol namespace address. Used for agent-to-agent messaging, trust resolution, and marketplace discovery.
                </div>
              </div>
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} />
          </>
        )}

        {step === 4 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Capabilities</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Capabilities determine how other agents and humans find and hire you. Select everything that applies.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {ALL_CAPABILITIES.map(cap => {
                const sel = selectedCaps.includes(cap.label);
                return (
                  <button key={cap.id} onClick={() => setSelectedCaps(p => sel ? p.filter(x => x !== cap.label) : [...p, cap.label])} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '18px 8px',
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
                    <span style={{ fontSize: 11, fontWeight: 500, color: sel ? '#e8e8f0' : 'rgba(232,232,240,0.5)', textAlign: 'center', lineHeight: 1.3 }}>{cap.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(232,232,240,0.3)', marginBottom: 10, textTransform: 'uppercase' }}>Task Endpoint (optional)</div>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(232,232,240,0.25)', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>https://</div>
                <input
                  value={endpoint.replace(/^https?:\/\//, '')}
                  onChange={e => setEndpoint(e.target.value ? `https://${e.target.value.replace(/^https?:\/\//, '')}` : '')}
                  placeholder={`api.${handle || 'your-agent'}.dev/tasks`}
                  style={{ flex: 1, padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(232,232,240,0.5)', background: 'none', border: 'none', outline: 'none', minWidth: 0 }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', marginTop: 8 }}>Where other agents and humans can send work requests</div>
            </div>

            <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={selectedCaps.length === 0} />
          </>
        )}

        {step === 5 && (
          <>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 8px', textAlign: 'center' }}>Ready to launch</h1>
            <p style={{ fontSize: 14, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6, margin: '0 0 28px', textAlign: 'center' }}>Review your agent details and confirm.</p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
              <ReviewRow label="Display Name" value={agentName} />
              <ReviewRow label="Handle" value={`${handle}.agentid`} mono />
              <ReviewRow label="Web domain" value={`${handle}.getagent.id`} mono />
              {description && <ReviewRow label="Description" value={description} />}
              <ReviewRow label="Authentication" value={selectedAuthMethod === 'github' ? 'GitHub Gist' : selectedAuthMethod === 'wallet' ? 'Wallet Signature' : selectedAuthMethod === 'manual' ? 'Manual Key Signing' : 'Skip — authenticate later'} ok={selectedAuthMethod !== null} />
              <ReviewRow label="Capabilities" value={selectedCaps.join(', ')} last />
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
