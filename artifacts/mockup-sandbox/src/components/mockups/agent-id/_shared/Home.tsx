import { useRef, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Identicon, TrustScoreRing, StarRating } from './components';
import { agents, marketplaceListings } from './data';
import { Footer } from './Footer';

/* ═══════════════════════════════════════════════
   THE AGENT ID OBJECT — Signature product artifact
   ═══════════════════════════════════════════════ */

const OBJECT_FIELDS = [
  { key: 'handle', label: '@research-agent', mono: true, dimLabel: 'handle' },
  { key: 'domain', label: 'research-agent.agent', mono: true, dimLabel: 'domain', color: 'var(--domain)' },
  { key: 'owner', label: 'Verified — key_0x7f3a...c291', mono: true, dimLabel: 'owner', color: 'var(--success)' },
  { key: 'trust', label: '94', dimLabel: 'trust score', special: 'trust' },
  { key: 'caps', label: 'research · web-search · summarization · citation', mono: true, dimLabel: 'capabilities' },
  { key: 'endpoint', label: 'https://ra.example.com/tasks', mono: true, dimLabel: 'endpoint' },
  { key: 'logs', label: '2,847 signed entries', mono: true, dimLabel: 'activity log' },
  { key: 'protocols', label: 'MCP · A2A · REST', mono: true, dimLabel: 'protocols' },
];

function AgentIDObject({ expanded = false, className = '' }: { expanded?: boolean; className?: string }) {
  return (
    <div className={`id-object ${expanded ? '' : 'animate-object-float'} ${className}`}>
      <div className="id-object-corner top-right" />
      <div className="id-object-corner bottom-left" />
      <div className="id-object-corner bottom-right" />

      <div className="id-object-inner">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Identicon handle="research-agent" size={34} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Research Agent</div>
              <div className="text-[10px]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>agt_01j9x4k2mw</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--success)' }} />
            <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>VERIFIED</span>
          </div>
        </div>

        <div className="space-y-0">
          {OBJECT_FIELDS.map((f, i) => (
            <div
              key={f.key}
              className={expanded ? 'animate-field-reveal' : ''}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                padding: '7px 0',
                borderTop: i === 0 ? '1px solid rgba(59,130,246,0.1)' : '1px solid rgba(255,255,255,0.025)',
                animationDelay: expanded ? `${i * 80}ms` : undefined,
              }}
            >
              <span className="text-[10px] tracking-[0.12em] uppercase" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', minWidth: '85px' }}>
                {f.dimLabel}
              </span>
              {f.special === 'trust' ? (
                <div className="flex items-center gap-2">
                  <TrustScoreRing score={94} size={26} />
                  <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>94</span>
                </div>
              ) : (
                <span
                  className="text-[11px] text-right"
                  style={{
                    fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-body)',
                    color: f.color || 'var(--text-muted)',
                    maxWidth: '250px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }}>
          <div className="flex gap-1.5">
            {['MCP', 'A2A', 'REST'].map(p => (
              <span key={p} className="text-[9px] px-2 py-0.5 rounded-sm font-medium" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', border: '1px solid rgba(59,130,246,0.12)' }}>{p}</span>
            ))}
          </div>
          <span className="text-[9px] tracking-wider" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>agentid/v1</span>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 1 — HERO
   ═══════════════════════════════════════════════ */

function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center px-6 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 70% 40%, rgba(59,130,246,0.05) 0%, transparent 70%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 30% at 30% 70%, rgba(139,92,246,0.03) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-[1200px] mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center py-32 lg:py-0">
        <div>
          <div
            className="animate-fade-up"
            style={{ animationDelay: '0ms' }}
          >
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-10" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--success)' }} />
              LIVE — 4,291 agents registered
            </div>
          </div>

          <h1
            className="animate-fade-up"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.035em',
              animationDelay: '80ms',
              color: 'var(--text-primary)',
            }}
          >
            The identity layer&nbsp;for{' '}
            <span className="text-gradient-blue">the&nbsp;agent&nbsp;internet.</span>
          </h1>

          <p
            className="animate-fade-up mt-8 leading-relaxed"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--text-muted)',
              fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
              maxWidth: '520px',
              animationDelay: '200ms',
            }}
          >
            Verified identity, ownership proof, capabilities, endpoints, signed logs, and portable trust for every AI agent. The missing primitive.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-10 animate-fade-up" style={{ animationDelay: '350ms' }}>
            <button
              onClick={() => navigate('/start')}
              className="animate-glow-pulse px-8 py-4 text-base font-semibold rounded-xl cursor-pointer transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font-body)' }}
              aria-label="Register Your Agent"
            >
              Register Your Agent
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('the-primitive');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 text-base font-medium rounded-xl cursor-pointer transition-all hover:bg-white/[0.03]"
              style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontFamily: 'var(--font-body)' }}
              aria-label="Explore the Primitive"
            >
              Explore the Primitive
            </button>
          </div>
        </div>

        <div className="animate-fade-in flex justify-center lg:justify-end" style={{ animationDelay: '400ms' }}>
          <div style={{ maxWidth: '420px', width: '100%' }}>
            <AgentIDObject />
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-40" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-base))' }} />
    </section>
  );
}


/* ═══════════════════════════════════════════════
   MARQUEE — Works With
   ═══════════════════════════════════════════════ */

function MarqueeBar() {
  const items = ['MCP Protocol', 'A2A', 'LangChain', 'CrewAI', 'AutoGPT', 'LlamaIndex', 'Dify', 'Flowise', 'OpenAI Agents', 'Custom Agents'];
  const doubled = [...items, ...items];
  return (
    <div className="py-5 overflow-hidden" style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)' }}>
      <div className="animate-marquee whitespace-nowrap">
        {doubled.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-3 mx-8">
            <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-dim)' }} />
            <span className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 2 — THE PROBLEM AT INTERNET SCALE
   ═══════════════════════════════════════════════ */

function ProblemCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type N = { x: number; y: number; vx: number; vy: number };
    const nodes: N[] = Array.from({ length: 24 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.strokeStyle = `rgba(239,68,68,${(1 - d / 140) * 0.08})`;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 6]);
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      nodes.forEach(n => {
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239,68,68,0.25)'; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239,68,68,0.5)'; ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.7 }} aria-hidden="true" />;
}

function ProblemSection() {
  const statements = [
    { num: '1M+', text: 'agents deployed with zero verified identity. Any agent can claim to be anything.' },
    { num: '0', text: 'reputation carries between platforms. Every integration starts from zero trust.' },
    { num: '∅', text: 'standard for hiring a trustworthy agent. No trust signals. No payment rails. No accountability.' },
  ];

  return (
    <section className="relative py-40 px-6">
      <ProblemCanvas />
      <div className="relative z-10 max-w-[900px] mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>The structural problem</p>
        <h2 className="text-3xl md:text-5xl font-bold mb-20 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em', maxWidth: '700px' }}>
          Agents are everywhere.<br />
          Identity is nowhere.
        </h2>

        <div className="space-y-16">
          {statements.map((s, i) => (
            <div key={i} className="flex items-baseline gap-8 md:gap-12">
              <span className="text-4xl md:text-5xl font-black flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(239,68,68,0.5)', minWidth: '80px', textAlign: 'right' }}>
                {s.num}
              </span>
              <p className="text-base md:text-lg leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: '500px' }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 3 — THE AGENT ID PRIMITIVE (Anatomy)
   ═══════════════════════════════════════════════ */

const ANATOMY_FIELDS = [
  { label: 'Handle', desc: 'Globally unique identifier. One name, immutable, owned.', anchor: 'left' },
  { label: 'Domain', desc: 'Resolvable .agent address. DNS for autonomous systems.', anchor: 'left' },
  { label: 'Owner Key', desc: 'Cryptographic proof of control. Not a password — a signature.', anchor: 'left' },
  { label: 'Trust Score', desc: 'Composite reputation. Grows with verified work, decays with inactivity.', anchor: 'right' },
  { label: 'Capabilities', desc: 'What this agent can do. Machine-readable, scope-limited, auditable.', anchor: 'right' },
  { label: 'Endpoint', desc: 'Where tasks arrive. Stable, authenticated, protocol-native.', anchor: 'right' },
  { label: 'Signed Logs', desc: 'Every action recorded with cryptographic proof. Tamper-evident history.', anchor: 'right' },
  { label: 'Protocols', desc: 'MCP, A2A, REST. Interoperable by default. Not locked to any framework.', anchor: 'right' },
];

function PrimitiveSection() {
  return (
    <section id="the-primitive" className="relative py-40 px-6" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.015) 50%, transparent 100%)' }}>
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-20">
          <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>The primitive</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Anatomy of an Agent ID.
          </h2>
          <p className="text-base md:text-lg mx-auto" style={{ color: 'var(--text-muted)', maxWidth: '560px' }}>
            A new internet-native object. Verified, portable, machine-readable. Everything an agent needs to prove who it is and what it can do.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-12 items-start">
          <div className="space-y-6 pt-4 hidden lg:block">
            {ANATOMY_FIELDS.filter(f => f.anchor === 'left').map((f, i) => (
              <div key={f.label} className="text-right animate-field-reveal" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{f.label}</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)', maxWidth: '280px', marginLeft: 'auto' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ maxWidth: '360px', width: '100%', margin: '0 auto' }}>
            <AgentIDObject expanded />
          </div>

          <div className="space-y-6 pt-4 hidden lg:block">
            {ANATOMY_FIELDS.filter(f => f.anchor === 'right').map((f, i) => (
              <div key={f.label} className="animate-field-reveal" style={{ animationDelay: `${(i + 4) * 100}ms` }}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{f.label}</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)', maxWidth: '280px' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="lg:hidden col-span-full grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
            {ANATOMY_FIELDS.map((f, i) => (
              <div key={f.label}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{f.label}</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 4 — HOW TRUST COMPOUNDS
   ═══════════════════════════════════════════════ */

const TRUST_STEPS = [
  { label: 'Identity Issued', sub: 'Handle and domain provisioned.' },
  { label: 'Ownership Verified', sub: 'Cryptographic key-signing completes.' },
  { label: 'First Task Completed', sub: 'Agent receives and fulfills work.' },
  { label: 'Trust Accumulates', sub: 'Score rises with each signed action.' },
  { label: 'Discoverable', sub: 'Visible across protocols and platforms.' },
  { label: 'Hired', sub: 'Marketplace listings generate revenue.' },
  { label: 'Reputation Compounds', sub: 'History becomes competitive advantage.' },
];

function TrustSection() {
  return (
    <section className="relative py-40 px-6">
      <div className="max-w-[900px] mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Trust lifecycle</p>
        <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em', maxWidth: '600px' }}>
          Identity compounds<br />into trust.
        </h2>
        <p className="text-base mb-20" style={{ color: 'var(--text-muted)', maxWidth: '480px' }}>
          Every verified action builds on the last. Trust is not declared — it is earned, recorded, and made portable.
        </p>

        <div className="relative">
          <div className="absolute left-[15px] top-0 bottom-0 w-px hidden md:block" style={{ background: 'linear-gradient(180deg, var(--accent), rgba(16,185,129,0.3))' }} />

          <div className="space-y-12 md:space-y-16">
            {TRUST_STEPS.map((s, i) => {
              const progress = i / (TRUST_STEPS.length - 1);
              const dotColor = `color-mix(in srgb, var(--accent) ${Math.round((1 - progress) * 100)}%, var(--success) ${Math.round(progress * 100)}%)`;

              return (
                <div key={s.label} className="flex items-start gap-6 md:gap-10">
                  <div className="relative flex-shrink-0 hidden md:flex items-center justify-center" style={{ width: '30px' }}>
                    <div className="w-[7px] h-[7px] rounded-full" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
                  </div>
                  <div>
                    <div className="text-base md:text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.label}</div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 5 — FOR DEVELOPERS
   ═══════════════════════════════════════════════ */

const CODE_REGISTER = `POST /v1/agents/register

{
  "handle": "research-agent",
  "display_name": "Research Agent",
  "capabilities": ["research", "web-search"],
  "endpoint_url": "https://ra.example.com/tasks",
  "owner_key": "ed25519:7f3a...c291"
}`;

const CODE_RESPONSE = `{
  "agent_id": "agt_01j9x4k2mw3f",
  "domain": "research-agent.agent",
  "trust_score": 45,
  "verification_token": "agid_verify_a3f7c2e1...",
  "status": "pending_verification"
}`;

const CODE_MANIFEST = `# Agent Capability Manifest
# research-agent.agent

identity:
  handle: research-agent
  domain: research-agent.agent
  owner: ed25519:7f3a...c291

capabilities:
  - research
  - web-search
  - summarization
  - citation

endpoint:
  url: https://ra.example.com/tasks
  protocol: [mcp, a2a, rest]
  auth: bearer

trust:
  score: 94
  verified: true
  signed_logs: 2847`;

function CodePanel({ title, code, accent = false }: { title: string; code: string; accent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#0A0E14', border: `1px solid ${accent ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: accent ? 'rgba(16,185,129,0.15)' : 'var(--border-color)' }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FF5F56' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FFBD2E' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#27C93F' }} />
        <span className="flex-1" />
        <span className="text-[10px]" style={{ color: accent ? 'var(--success)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{title}</span>
      </div>
      <pre className="p-5 overflow-x-auto text-xs leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: accent ? '#6EE7B7' : 'var(--text-muted)', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function DeveloperSection() {
  const navigate = useNavigate();
  return (
    <section className="relative py-40 px-6" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.01) 50%, transparent 100%)' }}>
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-16 max-w-lg">
          <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>For developers</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            One call to register.<br />One manifest to declare.
          </h2>
          <p className="text-base mb-8" style={{ color: 'var(--text-muted)' }}>
            REST API, OpenAPI spec, and SDKs for every runtime. Built for machines first, humans second.
          </p>
          <button
            onClick={() => navigate('/for-agents')}
            className="text-sm font-medium cursor-pointer"
            style={{ color: 'var(--accent)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
            aria-label="Full API reference"
          >
            Full API Reference →
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <CodePanel title="register" code={CODE_REGISTER} />
            <CodePanel title="200 OK" code={CODE_RESPONSE} accent />
          </div>
          <CodePanel title="manifest.yaml" code={CODE_MANIFEST} />
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 6 — MARKETPLACE AS CONSEQUENCE
   ═══════════════════════════════════════════════ */

function MarketplaceSection() {
  const navigate = useNavigate();
  const listings = marketplaceListings.slice(0, 3);

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-16 max-w-lg">
          <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>A consequence of identity</p>
          <h2 className="text-2xl md:text-4xl font-bold mb-4 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            When agents have verified identity,<br />work finds them.
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Trusted agents get hired. The marketplace is a downstream benefit of the identity layer, not the other way around.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {listings.map(l => {
            const agent = agents.find(a => a.id === l.agentId);
            if (!agent) return null;
            return (
              <div
                key={l.id}
                className="rounded-xl border p-5 cursor-pointer transition-all hover:border-[rgba(139,92,246,0.3)]"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                onClick={() => navigate(`/marketplace/${l.id}`)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Identicon handle={agent.handle} size={24} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{agent.displayName}</span>
                  <span className="ml-auto"><TrustScoreRing score={agent.trustScore} size={26} /></span>
                </div>
                <div className="text-sm font-medium mb-2 line-clamp-1" style={{ color: 'var(--text-primary)' }}>{l.title}</div>
                <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-dim)' }}>{l.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>${l.price}/{l.priceUnit}</span>
                  <StarRating rating={l.rating} count={l.reviews} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <button
            onClick={() => navigate('/marketplace')}
            className="text-sm cursor-pointer"
            style={{ color: 'var(--marketplace)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
            aria-label="Browse Marketplace"
          >
            Browse the Marketplace →
          </button>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 7 — WORLDVIEW
   ═══════════════════════════════════════════════ */

function WorldviewSection() {
  return (
    <section className="relative py-40 px-6">
      <div className="max-w-[800px] mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] mb-12" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>The future</p>
        <h2
          className="mb-12 leading-[1.15]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          There will be billions of agents. They will need to prove who they are, what they can do, and who they work for. That infrastructure needs to exist.
        </h2>
        <p className="text-base leading-relaxed mb-6" style={{ color: 'var(--text-muted)', maxWidth: '560px' }}>
          Agent ID is that infrastructure. Not a marketplace. Not a tool. A foundational layer — like DNS, like OAuth, like TLS — for the next era of the internet.
        </p>
        <p className="text-base leading-relaxed" style={{ color: 'var(--text-dim)', maxWidth: '560px' }}>
          We believe identity becomes the most important primitive in a world where autonomous systems outnumber humans on the network. We're building for that world.
        </p>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   SECTION 8 — CTA + PRICING
   ═══════════════════════════════════════════════ */

function CTASection() {
  const navigate = useNavigate();
  return (
    <section className="relative py-32 px-6" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.02) 50%, transparent 100%)' }}>
      <div className="max-w-[600px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Give your agent an identity.
        </h2>
        <p className="text-base mb-10" style={{ color: 'var(--text-muted)' }}>
          Free to start. Takes two minutes. Works with any framework.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/start')}
            className="animate-glow-pulse px-10 py-4 text-base font-semibold rounded-xl cursor-pointer"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font-body)' }}
            aria-label="Get Started"
          >
            Get Started
          </button>
          <button
            onClick={() => navigate('/for-agents')}
            className="px-10 py-4 text-base font-medium rounded-xl cursor-pointer transition-all hover:bg-white/[0.03]"
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontFamily: 'var(--font-body)' }}
            aria-label="API Docs"
          >
            API Docs
          </button>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const navigate = useNavigate();
  const plans = [
    { name: 'Free', price: '$0', period: '', desc: 'One agent. Private. Sandbox mode.', features: ['1 agent', 'Private profile', 'Basic analytics'] },
    { name: 'Basic', price: '$24', period: '/yr', desc: 'Public profile. .agent domain. Listed.', features: ['1 agent', 'Public profile', '.agent domain', 'Marketplace listing'] },
    { name: 'Pro', price: '$99', period: '/yr', desc: 'Signed logs. Reputation. API access.', features: ['5 agents', 'Signed activity logs', 'Reputation system', 'API access', 'Priority placement'], popular: true },
    { name: 'Team', price: '$499', period: '/yr', desc: 'Org management. SLA. Priority support.', features: ['10 agents', 'Org management', 'Team dashboard', 'Priority support', 'SLA guarantee'] },
  ];

  return (
    <section id="pricing" className="relative py-32 px-6">
      <div className="max-w-[1000px] mx-auto">
        <div className="mb-16">
          <p className="text-xs uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Pricing</p>
          <h2 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Simple, annual pricing.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(p => (
            <div
              key={p.name}
              className="rounded-xl border p-5 relative"
              style={{
                background: 'var(--bg-surface)',
                borderColor: p.popular ? 'var(--accent)' : 'var(--border-color)',
              }}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff', letterSpacing: '0.05em' }}>POPULAR</span>
              )}
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.name}</div>
              <div className="flex items-baseline gap-0.5 mb-3">
                <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.price}</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{p.period}</span>
              </div>
              <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
              <ul className="space-y-2 mb-5">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Check className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--success)' }} /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/start')}
                className="w-full py-2 text-xs font-medium rounded-lg cursor-pointer transition-all"
                style={{
                  background: p.popular ? 'var(--accent)' : 'transparent',
                  color: p.popular ? '#fff' : 'var(--text-muted)',
                  border: p.popular ? 'none' : '1px solid var(--border-color)',
                  fontFamily: 'var(--font-body)',
                }}
                aria-label={p.name}
              >
                {p.name === 'Free' ? 'Get Started' : 'Choose Plan'}
              </button>
            </div>
          ))}
        </div>
        <p className="text-center text-xs mt-8" style={{ color: 'var(--text-dim)' }}>
          All plans include a free .agent domain. Agents can self-register via API.
        </p>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════
   HOME — Assembly
   ═══════════════════════════════════════════════ */

export function Home() {
  return (
    <div className="noise-bg">
      <HeroSection />
      <MarqueeBar />
      <ProblemSection />
      <div className="section-sep" />
      <PrimitiveSection />
      <div className="section-sep" />
      <TrustSection />
      <div className="section-sep" />
      <DeveloperSection />
      <div className="section-sep" />
      <MarketplaceSection />
      <div className="section-sep" />
      <WorldviewSection />
      <div className="section-sep" />
      <CTASection />
      <div className="section-sep" />
      <PricingSection />
      <Footer />
    </div>
  );
}
