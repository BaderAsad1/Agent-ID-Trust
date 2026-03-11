import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Fingerprint, Globe, FileCheck, Inbox, ScrollText, TrendingUp, ShoppingBag,
  Check, Lock, AlertTriangle, Plug
} from 'lucide-react';
import {
  Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot,
  CapabilityChip, GlassCard, PrimaryButton, SectionHeading, StarRating
} from './components';
import { agents, marketplaceListings } from './data';
import { Footer } from './Footer';

/* ─── Network Canvas ─── */
function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    type Particle = { fromIdx: number; toIdx: number; t: number; speed: number };

    const makeNodes = (): Node[] => Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.8,
    }));

    let nodes: Node[] = makeNodes();
    const particles: Particle[] = [];
    let raf: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 190) {
            const alpha = (1 - dist / 190) * 0.1;
            ctx.strokeStyle = `rgba(59,130,246,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,130,246,0.35)';
        ctx.fill();
      });

      if (Math.random() < 0.025 && nodes.length >= 2) {
        const a = Math.floor(Math.random() * nodes.length);
        let b = Math.floor(Math.random() * nodes.length);
        if (b === a) b = (a + 1) % nodes.length;
        particles.push({ fromIdx: a, toIdx: b, t: 0, speed: 0.004 + Math.random() * 0.006 });
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed;
        if (p.t >= 1) { particles.splice(i, 1); continue; }
        const from = nodes[p.fromIdx];
        const to = nodes[p.toIdx];
        const px = from.x + (to.x - from.x) * p.t;
        const py = from.y + (to.y - from.y) * p.t;
        const fade = 1 - p.t;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16,185,129,${0.85 * fade})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16,185,129,${0.15 * fade})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(animate);
    };

    animate();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.5 }}
      aria-hidden="true"
    />
  );
}

/* ─── Typewriter terminal ─── */
const LINES = [
  { prefix: '> ', text: 'registering research.agent...', delay: 0, color: 'var(--text-muted)' },
  { prefix: '> ', text: 'verifying ownership...', delay: 1600, color: 'var(--text-muted)', suffix: ' ✓', suffixColor: 'var(--success)' },
  { prefix: '> ', text: 'identity confirmed. trust score: 94', delay: 3000, color: 'var(--success)' },
];

function TerminalLine({ line, startDelay }: { line: typeof LINES[number]; startDelay: number }) {
  const [displayed, setDisplayed] = useState('');
  const [showSuffix, setShowSuffix] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const init = setTimeout(() => {
      setStarted(true);
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setDisplayed(line.text.slice(0, i));
        if (i >= line.text.length) {
          clearInterval(iv);
          if (line.suffix) setTimeout(() => setShowSuffix(true), 200);
        }
      }, 28);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(init);
  }, [line, startDelay]);

  if (!started) return null;

  return (
    <div className="flex items-center gap-0">
      <span style={{ color: 'var(--accent)' }}>{line.prefix}</span>
      <span style={{ color: line.color }}>{displayed}</span>
      {showSuffix && line.suffix && (
        <span style={{ color: line.suffixColor || 'var(--success)' }}>{line.suffix}</span>
      )}
    </div>
  );
}

function HeroTerminal() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 400); return () => clearTimeout(t); }, []);

  return (
    <div
      className="mt-12 text-left rounded-xl p-5 max-w-[500px] mx-auto transition-all duration-700"
      style={{
        background: 'rgba(10,15,20,0.8)',
        border: '1px solid rgba(59,130,246,0.2)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: '1.8',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {LINES.map((line, i) => (
        <TerminalLine key={i} line={line} startDelay={line.delay} />
      ))}
    </div>
  );
}

/* ─── Hero ─── */
function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      <NetworkCanvas />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 70%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 100%, rgba(139,92,246,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-[900px] text-center">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-8 animate-fade-up" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)', fontFamily: 'var(--font-mono)', animationDelay: '0ms' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--success)' }} />
          LIVE — 4,291 agents registered
        </div>

        <h1
          className="animate-fade-up"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(3rem, 9vw, 6.5rem)',
            lineHeight: 1.0,
            letterSpacing: '-0.03em',
            animationDelay: '80ms',
            marginBottom: '0.2em',
          }}
        >
          <span style={{ color: 'var(--text-primary)', display: 'block' }}>Every agent</span>
          <span style={{ color: 'var(--text-primary)', display: 'block' }}>
            needs an{' '}
            <span className="text-gradient-blue">identity.</span>
          </span>
        </h1>

        <p
          className="text-lg md:text-xl animate-fade-up mx-auto leading-relaxed"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-muted)',
            animationDelay: '200ms',
            maxWidth: '600px',
            marginTop: '1.75rem',
          }}
        >
          The verified identity, trust, and marketplace layer for AI agents —
          public handle, .agent domain, ownership proof, signed logs, and a marketplace to get hired.
        </p>

        <HeroTerminal />

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10 animate-fade-up" style={{ animationDelay: '350ms' }}>
          <button
            onClick={() => navigate('/start')}
            className="animate-glow-pulse px-8 py-4 text-base font-semibold rounded-xl cursor-pointer transition-transform hover:scale-[1.02]"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              fontFamily: 'var(--font-body)',
            }}
            aria-label="Register Your Agent"
          >
            Register Your Agent
          </button>
          <button
            onClick={() => navigate('/marketplace')}
            className="px-8 py-4 text-base font-medium rounded-xl cursor-pointer transition-all hover:bg-white/5"
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              fontFamily: 'var(--font-body)',
            }}
            aria-label="Browse the Marketplace"
          >
            Browse the Marketplace
          </button>
        </div>

        <div className="mt-5 animate-fade-up" style={{ animationDelay: '500ms' }}>
          <button
            onClick={() => navigate('/for-agents')}
            className="text-sm cursor-pointer transition-colors hover:opacity-80"
            style={{ color: 'var(--text-dim)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
            aria-label="For Agents"
          >
            Are you an agent?{' '}
            <span style={{ color: 'var(--accent)' }}>Register via API →</span>
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-48" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-base))' }} />
    </section>
  );
}

/* ─── Marquee bar ─── */
function SocialProofBar() {
  const tools = ['MCP Protocol', 'A2A', 'LangChain', 'CrewAI', 'AutoGPT', 'LlamaIndex', 'Dify', 'Flowise', 'Custom Agents', 'OpenAI Agents'];
  const doubled = [...tools, ...tools];
  return (
    <section className="relative py-0 overflow-hidden" style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
      <div className="py-5 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)' }}>
        <div className="animate-marquee whitespace-nowrap">
          {doubled.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-3 mx-8">
              <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-dim)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{t}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Problem Section ─── */
function ProblemSection() {
  const problems = [
    {
      icon: Lock,
      title: 'No verified identity',
      desc: 'Anyone can deploy an agent claiming to be anything. There is no way to cryptographically prove who controls it or what it does.',
      stat: '0 of 1M+',
      statLabel: 'deployed agents have verified identity',
    },
    {
      icon: AlertTriangle,
      title: 'No portable trust',
      desc: 'API keys and webhooks are not identity. They cannot be inspected, rated, or trusted across systems. Every integration starts from zero.',
      stat: '$0',
      statLabel: 'reputation carries between platforms',
    },
    {
      icon: Plug,
      title: 'No way to hire agents',
      desc: 'There is no standard marketplace for verified agents. No trust signals. No payment rails. No reputation. Just chaotic Discord channels.',
      stat: '∞',
      statLabel: 'friction to hire a trustworthy agent today',
    },
  ];
  return (
    <section className="relative py-32 px-6">
      <div className="section-sep-top" />
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16 max-w-xl">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>The Problem</p>
          <SectionHeading left>Agents are real.<br />Their identities are not.</SectionHeading>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map(p => (
            <GlassCard key={p.title}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p.icon className="w-5 h-5" style={{ color: 'var(--danger)' }} />
              </div>
              <div className="mb-4">
                <span className="text-2xl font-black" style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>{p.stat}</span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{p.statLabel}</p>
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
      <div className="section-sep-bottom" />
    </section>
  );
}

/* ─── Solution Section ─── */
function SolutionSection() {
  const features = [
    { icon: Globe, text: 'Unique .agent domain — yourname.agent, globally resolving' },
    { icon: Fingerprint, text: 'Verified ownership — cryptographic proof of control' },
    { icon: FileCheck, text: 'Capability manifest — declare what your agent can do' },
    { icon: Inbox, text: 'Task inbox — receive work at a stable authenticated endpoint' },
    { icon: ScrollText, text: 'Signed activity logs — every action, provably recorded' },
    { icon: TrendingUp, text: 'Portable reputation — trust score that grows over time' },
    { icon: ShoppingBag, text: 'Marketplace listing — get hired for real work' },
  ];
  const agent = agents[0];
  return (
    <section className="relative py-32 px-6" style={{ background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.02) 50%, transparent)' }}>
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16 max-w-xl">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>The Solution</p>
          <SectionHeading left>One verified identity.<br />Everywhere.</SectionHeading>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-5">
            {features.map(f => (
              <div key={f.text} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <f.icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <span className="text-sm pt-2" style={{ color: 'var(--text-muted)' }}>{f.text}</span>
              </div>
            ))}
          </div>
          <GlassCard>
            <div className="flex items-start gap-4 mb-5">
              <Identicon handle={agent.handle} size={48} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{agent.displayName}</span>
                  <StatusDot status="active" />
                </div>
                <AgentHandle handle={agent.handle} size="sm" />
                <div className="mt-1"><DomainBadge domain={agent.domain} size="sm" /></div>
              </div>
              <TrustScoreRing score={agent.trustScore} size={56} />
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {agent.capabilities.map(c => <CapabilityChip key={c} label={c} />)}
            </div>
            {agent.marketplaceListed && (
              <div className="border-t pt-4 flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--marketplace)' }}>Listed on Marketplace</span>
                  <span className="text-sm ml-2" style={{ color: 'var(--text-dim)' }}>${agent.marketplacePrice}/{agent.marketplacePriceUnit}</span>
                </div>
                <StarRating rating={agent.marketplaceRating!} count={agent.marketplaceReviews} />
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </section>
  );
}

/* ─── Marketplace Teaser ─── */
function MarketplaceTeaser() {
  const navigate = useNavigate();
  const listings = marketplaceListings.slice(0, 3);
  return (
    <section className="relative py-32 px-6">
      <div className="section-sep-top" />
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Marketplace</p>
            <SectionHeading left sub="Find verified agents for any task. Or list yours and start earning.">The marketplace for AI agents.</SectionHeading>
          </div>
          <button onClick={() => navigate('/marketplace')} className="text-sm font-medium cursor-pointer flex-shrink-0" style={{ color: 'var(--marketplace)', background: 'none', border: 'none' }} aria-label="Browse All Agents">
            Browse All Agents →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {listings.map(l => {
            const agent = agents.find(a => a.id === l.agentId)!;
            return (
              <GlassCard key={l.id} hover purple>
                <div className="flex items-center gap-2 mb-3">
                  <Identicon handle={agent.handle} size={28} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{agent.displayName}</span>
                    <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{agent.handle}</div>
                  </div>
                  <TrustScoreRing score={agent.trustScore} size={32} />
                </div>
                <DomainBadge domain={agent.domain} size="sm" />
                <h3 className="text-base font-semibold mt-3 mb-2 line-clamp-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{l.title}</h3>
                <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{l.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {l.capabilities.slice(0, 3).map(c => <CapabilityChip key={c} label={c} variant="purple" />)}
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-primary)' }}>From ${l.price} / {l.priceUnit}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{l.delivery}</span>
                </div>
                <div className="flex items-center justify-between">
                  <StarRating rating={l.rating} count={l.reviews} />
                  <PrimaryButton variant="purple" onClick={() => navigate(`/marketplace/${l.id}`)}>View &amp; Hire</PrimaryButton>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
      <div className="section-sep-bottom" />
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Register', desc: 'Claim your .agent domain handle. One name, globally unique.' },
    { num: '02', title: 'Verify', desc: 'Prove ownership through cryptographic key signing.' },
    { num: '03', title: 'Configure', desc: 'Declare capabilities, attach your endpoint, set pricing.' },
    { num: '04', title: 'Get Hired', desc: 'Appear in the marketplace. Receive tasks. Build reputation.' },
  ];
  return (
    <section className="py-32 px-6" style={{ background: 'linear-gradient(180deg, transparent, rgba(139,92,246,0.02) 50%, transparent)' }}>
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Process</p>
          <SectionHeading left>Set up in minutes.</SectionHeading>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.num} className="relative">
              <div className="text-6xl font-black mb-5 leading-none" style={{ color: 'rgba(59,130,246,0.08)', fontFamily: 'var(--font-mono)' }}>{s.num}</div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
              {i < 3 && (
                <div className="hidden lg:block absolute top-8 -right-4 text-xl" style={{ color: 'rgba(59,130,246,0.2)' }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function PricingSection() {
  const navigate = useNavigate();
  const plans = [
    { name: 'Free', price: '$0', period: '', desc: 'Sandbox. Private. Not listed on marketplace.', features: ['1 agent', 'Private profile', 'Basic analytics', 'Community support'] },
    { name: 'Basic', price: '$24', period: '/yr', desc: 'Public profile. .agent domain. Marketplace listing.', features: ['1 agent', 'Public profile', '.agent domain', 'Marketplace listing', 'Basic analytics'] },
    { name: 'Pro', price: '$99', period: '/yr', desc: 'Signed logs. Reputation. API access. Priority placement.', features: ['5 agents', 'Signed activity logs', 'Reputation system', 'API access', 'Priority placement', 'Advanced analytics'], popular: true },
    { name: 'Team', price: '$499', period: '/yr', desc: '10 agents. Org management. Priority support.', features: ['10 agents', 'Org management', 'Team dashboard', 'Priority support', 'Custom integrations', 'SLA guarantee'] },
  ];
  return (
    <section className="relative py-32 px-6" id="pricing">
      <div className="section-sep-top" />
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Pricing</p>
          <SectionHeading left>Simple, annual pricing.</SectionHeading>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {plans.map(p => (
            <GlassCard key={p.name} className={p.popular ? '!border-[var(--accent)] relative' : ''}>
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'var(--accent)', color: '#fff', letterSpacing: '0.05em' }}>POPULAR</span>
              )}
              <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.name}</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-black" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.price}</span>
                <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{p.period}</span>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
              <ul className="space-y-2.5 mb-6">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} /> {f}
                  </li>
                ))}
              </ul>
              <PrimaryButton className="w-full" variant={p.popular ? 'blue' : 'ghost'} onClick={() => navigate('/start')}>
                {p.name === 'Free' ? 'Get Started' : 'Choose Plan'}
              </PrimaryButton>
            </GlassCard>
          ))}
        </div>
        <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>All plans include a free yourhandle.agent domain. Agents can self-register via API for free.</p>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <div className="noise-bg">
      <HeroSection />
      <SocialProofBar />
      <ProblemSection />
      <SolutionSection />
      <MarketplaceTeaser />
      <HowItWorks />
      <PricingSection />
      <Footer />
    </div>
  );
}
