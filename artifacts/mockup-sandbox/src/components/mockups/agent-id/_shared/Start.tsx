import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Wallet, Key, Check, ChevronLeft, Loader2 } from 'lucide-react';
import { PrimaryButton, InputField, CapabilityChip, DomainBadge, AvailabilityCheck } from './components';

const capabilities = ['Research', 'Code Generation', 'Data Analysis', 'Customer Support', 'Content Creation', 'Scheduling', 'File Management', 'Web Search', 'API Integration', 'Database Query', 'Image Generation', 'Custom...'];

export function Start() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
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

  useEffect(() => {
    if (!handle) { setAvailable(null); return; }
    setAvailable(null);
    const timer = setTimeout(() => setAvailable(true), 600);
    return () => clearTimeout(timer);
  }, [handle]);

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => { setVerifying(false); setVerified(true); }, 1500);
  };

  const handleComplete = () => {
    setShowSuccess(true);
    setTimeout(() => setDomainActive(true), 2000);
  };

  const canNext = () => {
    switch (step) {
      case 1: return email && password && password === confirmPassword;
      case 2: return agentName && handle && available;
      case 3: return true;
      case 4: return verified;
      case 5: return selectedCaps.length > 0;
      case 6: return true;
      default: return false;
    }
  };

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

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Create your account</h2>
            <InputField label="Email" placeholder="you@example.com" type="email" value={email} onChange={setEmail} />
            <InputField label="Password" placeholder="Choose a password" type="password" value={password} onChange={setPassword} />
            <InputField label="Confirm Password" placeholder="Confirm your password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
            <div className="relative flex items-center justify-center my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: 'var(--border-color)' }} /></div>
              <span className="relative px-3 text-xs" style={{ background: 'var(--bg-surface)', color: 'var(--text-dim)' }}>OR</span>
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'transparent' }} aria-label="Continue with GitHub">
              <Github className="w-4 h-4" /> Continue with GitHub
            </button>
            <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              Already have an account? <button onClick={() => navigate('/sign-in')} className="cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>Sign in</button>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Name your agent</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>This is your agent's permanent identity. Choose carefully.</p>
            </div>
            <InputField label="Agent Display Name" placeholder="Research Agent" value={agentName} onChange={setAgentName} />
            <InputField label="Agent Handle" placeholder="research-agent" value={handle} onChange={setHandle} prefix="agent.id/" mono suffix={<AvailabilityCheck available={handle ? available : null} />} />
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
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Prove you control this agent by signing a verification token.</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)' }}>
              AGENT_VERIFY_TOKEN=agid_verify_a3f7c2e1b8d4f912c1e5a7b3d9f2c8e4
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
            <button className="text-sm cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>I'll set this up later →</button>
          </div>
        )}

        <div className="mt-8">
          {step < 6 ? (
            <PrimaryButton className="w-full" disabled={!canNext()} onClick={() => setStep(step + 1)}>Continue</PrimaryButton>
          ) : (
            <PrimaryButton className="w-full" onClick={handleComplete}>Complete Setup</PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
