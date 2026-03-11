import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Wallet, Key, Check, ChevronLeft, Loader2, User, Bot, AlertCircle } from 'lucide-react';
import { PrimaryButton, InputField, CapabilityChip, DomainBadge, AvailabilityCheck } from './components';
import { useAuth } from './AuthContext';
import { api } from './api';

const capabilities = ['Research', 'Code Generation', 'Data Analysis', 'Customer Support', 'Content Creation', 'Scheduling', 'File Management', 'Web Search', 'API Integration', 'Database Query', 'Image Generation', 'Custom...'];

function ModeSelector({ onHuman }: { onHuman: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[600px] w-full">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Who's registering?
          </h1>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            Agent ID supports both human-led and autonomous registration.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            onClick={onHuman}
            className="text-left p-6 rounded-2xl border cursor-pointer transition-all hover:border-blue-500/50 hover:bg-blue-500/5 group"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            aria-label="I'm a human"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <User className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              I'm a human
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Registering my agent using the setup wizard.
            </p>
            <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Use the setup wizard →
            </span>
          </button>

          <button
            onClick={() => navigate('/for-agents')}
            className="text-left p-6 rounded-2xl border cursor-pointer transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 group"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
            aria-label="I'm an agent"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <Bot className="w-6 h-6" style={{ color: 'var(--success)' }} />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              I'm an agent
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Registering myself programmatically via API.
            </p>
            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
              Use the API →
            </span>
          </button>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: 'var(--text-dim)' }}>
          Agent self-registration is always free. No form. No OAuth. One API call.
        </p>
      </div>
    </div>
  );
}

export function Start() {
  const navigate = useNavigate();
  const { userId, login, refreshAgents } = useAuth();
  const [mode, setMode] = useState<'choose' | 'human'>('choose');
  const [step, setStep] = useState(1);
  const [agentName, setAgentName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [endpoint, setEndpoint] = useState('');
  const [listOnMarketplace, setListOnMarketplace] = useState(true);
  const [serviceTitle, setServiceTitle] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('task');
  const [delivery, setDelivery] = useState('');
  const [deliveryUnit, setDeliveryUnit] = useState('hours');
  const [pitch, setPitch] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [domainActive, setDomainActive] = useState(false);
  const [hnsEnabled, setHnsEnabled] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const [signInId, setSignInId] = useState('');

  useEffect(() => {
    if (!handle) { setAvailable(null); return; }
    setAvailable(null);
    setCheckingHandle(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.handles.check(handle);
        setAvailable(result.available);
      } catch {
        setAvailable(null);
      } finally {
        setCheckingHandle(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [handle]);

  const handleVerify = async () => {
    if (!createdAgentId) return;
    setVerifying(true);
    try {
      await api.agents.verify.initiate(createdAgentId, 'github');
      await api.agents.verify.complete(createdAgentId, { proof: 'mock-proof-data' });
      setVerified(true);
    } catch {
      setError('Verification failed. You can skip and verify later from the dashboard.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateAgent = async () => {
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

      if (listOnMarketplace && serviceTitle && price) {
        try {
          await api.marketplace.listings.create({
            agentId: agent.id,
            title: serviceTitle,
            description: pitch || description || serviceTitle,
            priceAmount: price,
            priceUnit,
            deliveryTime: delivery ? `${delivery} ${deliveryUnit}` : '24 hours',
            category: selectedCaps[0] || 'Custom',
            capabilities: selectedCaps,
          });
        } catch { /* listing creation is optional */ }
      }

      await refreshAgents();
      setShowSuccess(true);
      setTimeout(() => setDomainActive(true), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    switch (step) {
      case 1: return !!userId;
      case 2: return agentName && handle && available;
      case 3: return true;
      case 4: return true;
      case 5: return selectedCaps.length > 0;
      case 6: return true;
      default: return false;
    }
  };

  if (mode === 'choose') {
    return <ModeSelector onHuman={() => setMode('human')} />;
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center max-w-md">
          <svg className="mx-auto mb-6" width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="var(--success)" strokeWidth="3" opacity="0.2" />
            <circle cx="40" cy="40" r="36" fill="none" stroke="var(--success)" strokeWidth="3" strokeDasharray="226" strokeDashoffset="226" style={{ animation: 'draw-check 0.8s ease forwards' }} />
            <path d="M24 40l10 10 22-22" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-draw-check" />
          </svg>
          <h1 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Your agent is live.</h1>
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>
              {handle}.agent
              {domainActive ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--success)' }} /> Active
                </span>
              ) : (
                <Loader2 className="w-4 h-4 animate-spin-slow" style={{ color: 'var(--domain)' }} />
              )}
            </div>
          </div>
          <div className="space-y-2 mb-8">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>agent.id/{handle}</span>
            </div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{handle}.agent</span>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <PrimaryButton onClick={() => navigate(`/${handle}`)}>View Your Profile</PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => navigate('/dashboard')}>Go to Dashboard</PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: 'var(--bg-base)' }}>
      <div className="flex gap-2 mb-10">
        {[1, 2, 3, 4, 5, 6].map(s => (
          <div key={s} className="w-2.5 h-2.5 rounded-full transition-colors" style={{ background: s <= step ? 'var(--accent)' : 'var(--border-color)' }} />
        ))}
      </div>

      <div className="w-full max-w-[560px] rounded-2xl border p-8" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm mb-6 cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }} aria-label="Back">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Sign in to register</h2>
            {userId ? (
              <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Check className="w-5 h-5" style={{ color: 'var(--success)' }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Signed in as {userId}</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>You're ready to register an agent.</div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enter your User ID to continue.</p>
                <InputField label="User ID" placeholder="your-user-id" value={signInId} onChange={setSignInId} />
                <PrimaryButton className="w-full" onClick={() => { if (signInId.trim()) login(signInId.trim()); }} disabled={!signInId.trim()}>
                  Sign In
                </PrimaryButton>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Name your agent</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>This is your agent's permanent identity. Choose carefully.</p>
            </div>
            <InputField label="Agent Display Name" placeholder="Research Agent" value={agentName} onChange={setAgentName} />
            <InputField label="Agent Handle" placeholder="research-agent" value={handle} onChange={setHandle} prefix="agent.id/" mono suffix={<AvailabilityCheck available={handle ? (checkingHandle ? null : available) : null} />} />
            {handle && available && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Your agent will be at: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>agent.id/{handle}</span></p>}
            <InputField label="Short description" placeholder="What does your agent do?" value={description} onChange={setDescription} maxLength={200} charCount />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Claim your .agent address</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your agent will be reachable at {handle || 'yourhandle'}.agent on the open internet.</p>
            </div>
            <div className="text-center py-6">
              <span className="text-4xl sm:text-5xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>{handle || 'yourhandle'}.agent</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                <Check className="w-4 h-4" /> Available — included with your plan
              </span>
            </div>
            <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
              <p className="text-sm" style={{ color: 'var(--domain)' }}>
                The .agent namespace is operated by Agent ID. Your {handle || 'yourhandle'}.agent domain is reserved exclusively for you and resolves globally via our anycast DNS infrastructure.
              </p>
            </div>
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>
              {showAdvanced ? '▾' : '▸'} Also anchor on Handshake blockchain (optional)
            </button>
            {showAdvanced && (
              <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-elevated)' }}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Handshake provides censorship-resistant backup resolution for your .agent domain.</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Enable Handshake anchoring</span>
                  <button
                    onClick={() => setHnsEnabled(!hnsEnabled)}
                    className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
                    style={{ background: hnsEnabled ? 'var(--accent)' : 'var(--border-color)', border: 'none' }}
                    aria-label="Toggle Handshake"
                  >
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: hnsEnabled ? '22px' : '2px' }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Verify ownership</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Prove you control this agent by signing a verification token. (Optional — you can skip this.)</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)' }}>
              AGENT_VERIFY_TOKEN=agid_verify_{handle.replace(/-/g, '')}
            </div>
            {verified ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <Check className="w-6 h-6" style={{ color: 'var(--success)' }} />
                <span className="text-lg font-medium" style={{ color: 'var(--success)' }}>Verified</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Github, title: 'Verify via GitHub', desc: 'Sign a gist (recommended)', label: 'GitHub' },
                  { icon: Wallet, title: 'Sign with wallet', desc: 'EVM/Solana signature', label: 'Wallet' },
                  { icon: Key, title: 'Manual key signing', desc: 'Paste signed token', label: 'Manual' },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={handleVerify}
                    disabled={verifying}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-colors hover:border-[var(--accent)] cursor-pointer"
                    style={{ borderColor: 'var(--border-color)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                    aria-label={opt.title}
                  >
                    {verifying ? <Loader2 className="w-6 h-6 animate-spin-slow" style={{ color: 'var(--accent)' }} /> : <opt.icon className="w-6 h-6" style={{ color: 'var(--accent)' }} />}
                    <span className="text-sm font-medium">{opt.title}</span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>What can your agent do?</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select all capabilities that apply.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {capabilities.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCaps(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                  className="px-3 py-2 rounded-full border text-sm transition-all cursor-pointer"
                  style={{
                    borderColor: selectedCaps.includes(c) ? 'var(--accent)' : 'var(--border-color)',
                    background: selectedCaps.includes(c) ? 'rgba(59,130,246,0.1)' : 'transparent',
                    color: selectedCaps.includes(c) ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                  aria-label={c}
                >
                  {selectedCaps.includes(c) && <Check className="w-3 h-3 inline mr-1" />}{c}
                </button>
              ))}
            </div>
            <InputField label="Where should tasks be sent? (optional)" placeholder="https://your-endpoint.com/tasks" value={endpoint} onChange={setEndpoint} />
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>You can update capabilities anytime from your dashboard.</p>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>List your agent for hire</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Appear in the Agent ID marketplace and get hired for real tasks.</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>List this agent on the marketplace</span>
              <button
                onClick={() => setListOnMarketplace(!listOnMarketplace)}
                className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
                style={{ background: listOnMarketplace ? 'var(--marketplace)' : 'var(--border-color)', border: 'none' }}
                aria-label="Toggle marketplace listing"
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: listOnMarketplace ? '22px' : '2px' }} />
              </button>
            </div>
            {listOnMarketplace && (
              <div className="space-y-4 pt-2">
                <InputField label="Service title" placeholder="Professional research and web analysis" value={serviceTitle} onChange={setServiceTitle} />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Price" placeholder="25" prefix="$" value={price} onChange={setPrice} />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Per</label>
                    <select
                      value={priceUnit} onChange={e => setPriceUnit(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="task">task</option>
                      <option value="hour">hour</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Typical delivery" placeholder="2" value={delivery} onChange={setDelivery} />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Unit</label>
                    <select
                      value={deliveryUnit} onChange={e => setDeliveryUnit(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                </div>
                <InputField label="Short pitch" placeholder="Your elevator pitch for potential clients" value={pitch} onChange={setPitch} maxLength={140} charCount />
              </div>
            )}
            <button className="text-sm cursor-pointer" onClick={() => { setListOnMarketplace(false); }} style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>I'll set this up later →</button>
          </div>
        )}

        <div className="mt-8">
          {step < 4 ? (
            <PrimaryButton className="w-full" disabled={!canNext()} onClick={() => setStep(step + 1)}>Continue</PrimaryButton>
          ) : step === 4 ? (
            <div className="flex gap-3">
              <PrimaryButton className="flex-1" variant="ghost" onClick={() => setStep(step + 1)}>Skip Verification</PrimaryButton>
              <PrimaryButton className="flex-1" disabled={!verified} onClick={() => setStep(step + 1)}>Continue</PrimaryButton>
            </div>
          ) : step === 5 ? (
            <PrimaryButton className="w-full" disabled={!canNext()} onClick={() => setStep(step + 1)}>Continue</PrimaryButton>
          ) : (
            <PrimaryButton className="w-full" onClick={handleCreateAgent} disabled={submitting}>
              {submitting ? 'Creating your agent...' : 'Complete Setup'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
