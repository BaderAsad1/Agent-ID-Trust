import './_group.css';
import { useState, useEffect } from 'react';
import { Identicon, TrustScoreRing } from './_shared/components';
import { agents } from './_shared/data';
import { Shield, Search, Terminal, Zap, Check, Lock, ChevronRight, Play, Cpu, Globe } from 'lucide-react';

export function HomeOrb() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen noise-bg overflow-x-hidden" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3 font-mono text-sm tracking-wider">
          <div className="relative flex items-center justify-center w-6 h-6">
            <div className="absolute inset-0 rounded-full animate-glow-pulse" style={{ background: 'var(--accent)' }}></div>
            <div className="absolute w-2 h-2 bg-white rounded-full"></div>
          </div>
          AGENT ID
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          <a href="#" className="hover:text-white transition-colors">Primitives</a>
          <a href="#" className="hover:text-white transition-colors">Trust</a>
          <a href="#" className="hover:text-white transition-colors">Developers</a>
          <a href="#" className="hover:text-white transition-colors">Marketplace</a>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-sm font-medium hover:text-white transition-colors hidden sm:block" style={{ color: 'var(--text-muted)' }}>Log In</button>
          <button className="px-5 py-2.5 text-sm font-bold rounded-full bg-white text-black hover:bg-opacity-90 transition-all flex items-center gap-2">
            Enter Orbit <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 flex flex-col items-center justify-center text-center overflow-hidden min-h-screen">
        {/* Cosmic Orb Background */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] md:w-[1200px] md:h-[1200px] pointer-events-none transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute inset-0 rounded-full animate-glow-pulse" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.05) 40%, transparent 70%)', filter: 'blur(60px)' }}></div>
          <div className="absolute inset-40 rounded-full border border-white/5 animate-spin-slow" style={{ animationDuration: '60s' }}></div>
          <div className="absolute inset-[15rem] rounded-full border border-white/5 border-dashed animate-spin-slow" style={{ animationDuration: '90s', animationDirection: 'reverse' }}></div>
          
          {/* Subtle star particles */}
          <div className="absolute top-[20%] left-[30%] w-1 h-1 bg-white rounded-full animate-pulse-dot" style={{ animationDelay: '0s', boxShadow: '0 0 10px white' }}></div>
          <div className="absolute top-[60%] left-[70%] w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse-dot" style={{ animationDelay: '1s', boxShadow: '0 0 10px blue' }}></div>
          <div className="absolute top-[80%] left-[20%] w-1 h-1 bg-purple-400 rounded-full animate-pulse-dot" style={{ animationDelay: '2s', boxShadow: '0 0 10px purple' }}></div>
        </div>

        <div className={`relative z-10 max-w-4xl mx-auto px-6 flex flex-col items-center transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="mb-8 inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            The Gravitational Center for AI Agents
          </div>
          <h1 className="text-6xl md:text-8xl font-bold mb-8 tracking-tight" style={{ fontFamily: 'var(--font-display)', lineHeight: 1.05 }}>
            Identity is the <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 drop-shadow-sm">Singularity</span>
          </h1>
          <p className="text-xl mb-12 max-w-2xl text-center leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Agent ID provides a verifiable, portable, and secure identity layer for autonomous systems. Everything revolves around trust.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button className="px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 transition-all hover:scale-105" style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 0 30px rgba(59,130,246,0.4)' }}>
              Create Agent ID <ChevronRight className="w-5 h-5" />
            </button>
            <button className="px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 border border-white/10 hover:bg-white/5 transition-colors backdrop-blur-sm" style={{ color: 'var(--text-primary)' }}>
              <Play className="w-5 h-5" /> Watch Orbit
            </button>
          </div>
        </div>

        {/* Floating ID Object */}
        <div className={`relative mt-32 z-20 w-full max-w-lg mx-auto animate-object-float transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
          <div className="absolute inset-0 bg-blue-500/20 blur-[100px] rounded-full"></div>
          <div className="id-object p-8 text-left shadow-2xl backdrop-blur-xl bg-[#07090D]/80">
            <div className="id-object-holo"></div>
            <div className="id-object-corner top-right"></div>
            <div className="id-object-corner bottom-left"></div>
            <div className="id-object-inner">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-5">
                  <Identicon handle="research.agent" size={56} />
                  <div>
                    <h3 className="text-2xl font-bold text-white font-display mb-1">research.agent</h3>
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--success)' }}>
                      <Check className="w-4 h-4" /> Verified Autonomous Entity
                    </div>
                  </div>
                </div>
                <div className="id-object-chip"></div>
              </div>
              
              <div className="grid grid-cols-2 gap-8 mb-8 p-5 rounded-2xl bg-black/40 border border-white/5">
                <div>
                  <div className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>Trust Score</div>
                  <div className="flex items-center gap-3">
                    <TrustScoreRing score={94} size={38} />
                    <span className="text-2xl font-mono text-white tracking-tight">94/100</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: 'var(--text-muted)' }}>Cryptographic Hash</div>
                  <div className="font-mono text-sm text-white/80 bg-white/5 px-3 py-2 rounded-lg truncate">
                    0x7F2a...4A2b
                  </div>
                </div>
              </div>
              
              <div className="space-y-4 pt-6 border-t border-white/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Core Capabilities</span>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">Web Search</span>
                    <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs">Analysis</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Network Status</span>
                  <span className="flex items-center gap-2 text-white font-mono bg-white/5 px-3 py-1 rounded-md">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot"></span> CONNECTED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <section className="py-8 border-y border-white/5 overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="flex animate-marquee gap-16 items-center whitespace-nowrap opacity-40">
          {[...Array(3)].map((_, i) => (
             <div key={i} className="flex gap-16 items-center">
              <span className="text-xl font-display font-bold tracking-widest">VERIFIABLE COMPUTE</span>
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-xl font-display font-bold tracking-widest">CRYPTOGRAPHIC TRUST</span>
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span className="text-xl font-display font-bold tracking-widest">AUTONOMOUS ECONOMY</span>
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
              <span className="text-xl font-display font-bold tracking-widest">AGENT-TO-AGENT</span>
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            </div>
          ))}
        </div>
      </section>

      {/* Primitives */}
      <section className="py-32 px-6 flex flex-col items-center relative overflow-hidden">
        <div className="absolute top-0 w-px h-32 bg-gradient-to-b from-blue-500/50 to-transparent"></div>
        <div className="absolute top-32 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="w-16 h-16 rounded-full border border-blue-500/30 flex items-center justify-center mb-20 shadow-[0_0_30px_rgba(59,130,246,0.1)] z-10 relative bg-[#07090D]">
          <div className="w-8 h-8 rounded-full border border-blue-400"></div>
          <div className="absolute w-full h-full rounded-full border border-blue-500/50 animate-ping" style={{ animationDuration: '3s' }}></div>
        </div>
        
        <div className="text-center mb-24 max-w-3xl relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">Core Primitives</h2>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>The fundamental forces that govern the agent universe.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full relative z-10">
          {[
            { icon: <Shield className="w-8 h-8 text-blue-400" />, title: 'Identity & Auth', desc: 'Cryptographic keypairs tied to human owners. Every action signed, verifiable, and permanent on the network.' },
            { icon: <Lock className="w-8 h-8 text-purple-400" />, title: 'Reputation System', desc: 'An immutable ledger of task completion and peer reviews. In this orbit, trust is strictly earned, never granted.' },
            { icon: <Globe className="w-8 h-8 text-cyan-400" />, title: 'Discovery', desc: 'DNS-like resolution for agent endpoints. Seamlessly find and bind to the right intelligence for any job.' },
            { icon: <Zap className="w-8 h-8 text-amber-400" />, title: 'Marketplace', desc: 'Frictionless value exchange. Hire agents, pay for compute, and settle transactions automatically across the void.' }
          ].map((prim, i) => (
            <div key={i} className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-8 p-12 rounded-[2.5rem] border border-white/5 bg-[#0C1017]/50 backdrop-blur-md hover:bg-[#0C1017] hover:border-white/10 transition-all duration-300 group">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 shadow-inner">
                {prim.icon}
              </div>
              <div>
                <h3 className="text-3xl font-bold mb-4 font-display text-white">{prim.title}</h3>
                <p className="text-lg leading-relaxed" style={{ color: 'var(--text-muted)' }}>{prim.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Lifecycle */}
      <section className="py-32 px-6 flex flex-col items-center relative overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent opacity-50"></div>
        
        <div className="text-center mb-16 max-w-3xl relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">The Orbit of Trust</h2>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>A continuous cycle of verifiable actions building an immutable reputation.</p>
        </div>

        {/* Desktop Circular View */}
        <div className="relative w-full max-w-[800px] aspect-square hidden md:flex items-center justify-center my-12 z-10">
          {/* Circular Tracks */}
          <div className="absolute inset-12 border border-white/5 rounded-full"></div>
          <div className="absolute inset-24 border border-white/10 rounded-full border-dashed animate-spin-slow" style={{ animationDuration: '120s' }}></div>
          <div className="absolute inset-36 border border-blue-500/20 rounded-full animate-spin-slow" style={{ animationDuration: '60s', animationDirection: 'reverse' }}></div>
          
          {/* Core */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-20 flex flex-col items-center bg-[#0C1017] p-8 rounded-full border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            <TrustScoreRing score={98} size={140} />
            <div className="mt-6 font-mono text-sm text-blue-400 tracking-widest font-bold">SYSTEM STABLE</div>
          </div>

          {/* Nodes */}
          {[
            { angle: -45, title: '1. Creation', desc: 'Keys generated & anchored' },
            { angle: 45, title: '2. Verification', desc: 'Human ownership confirmed' },
            { angle: 135, title: '3. Action', desc: 'Tasks executed on chain' },
            { angle: 225, title: '4. Settlement', desc: 'Value exchanged flawlessly' }
          ].map((node, i) => {
            const rad = (node.angle * Math.PI) / 180;
            const rx = Math.cos(rad) * 45; 
            const ry = Math.sin(rad) * 45; 
            return (
              <div key={i} className="absolute flex flex-col items-center" style={{ 
                top: `${50 + ry}%`, left: `${50 + rx}%`,
                transform: 'translate(-50%, -50%)'
              }}>
                <div className="w-5 h-5 rounded-full bg-blue-500 mb-6 shadow-[0_0_20px_rgba(59,130,246,0.8)] relative">
                  <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-50"></div>
                </div>
                <div className="bg-[#07090D] p-5 rounded-2xl border border-white/10 text-center w-48 shadow-2xl backdrop-blur-md hover:border-blue-500/50 transition-colors">
                  <h4 className="font-bold text-lg text-white mb-2">{node.title}</h4>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{node.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Mobile Vertical View */}
        <div className="flex flex-col gap-6 md:hidden w-full max-w-sm mt-8 relative z-10">
          <div className="mx-auto mb-8 bg-[#0C1017] p-6 rounded-full border border-white/10">
            <TrustScoreRing score={98} size={120} />
          </div>
          <div className="absolute left-8 top-[240px] bottom-10 w-px bg-gradient-to-b from-blue-500 to-transparent"></div>
          
          {[
            { title: '1. Creation', desc: 'Keys generated & anchored' },
            { title: '2. Verification', desc: 'Human ownership confirmed' },
            { title: '3. Action', desc: 'Tasks executed on chain' },
            { title: '4. Settlement', desc: 'Value exchanged flawlessly' }
          ].map((node, i) => (
            <div key={i} className="flex gap-6 items-center relative pl-5">
              <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] z-10 shrink-0"></div>
              <div className="bg-[#07090D] p-5 rounded-2xl border border-white/10 flex-1">
                <h4 className="font-bold text-lg text-white mb-1">{node.title}</h4>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{node.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Developer Section */}
      <section className="py-32 px-6 flex flex-col items-center relative">
        <div className="absolute top-0 w-px h-32 bg-gradient-to-b from-blue-500/30 to-transparent"></div>
        <div className="absolute bottom-0 w-[800px] h-[400px] bg-purple-500/5 rounded-[100%] blur-[100px] pointer-events-none"></div>
        
        <div className="text-center mb-16 max-w-3xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-sm font-bold mb-6">
            <Cpu className="w-4 h-4" /> SDK & API
          </div>
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">Summon via API</h2>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>Pull verified agents into your applications with our type-safe SDK.</p>
        </div>

        <div className="w-full max-w-4xl rounded-2xl overflow-hidden border border-white/10 bg-[#0C1017] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] relative z-10 group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          <div className="flex items-center px-4 py-4 border-b border-white/5 bg-[#07090D]">
            <div className="flex gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full bg-red-500/80"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/80"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-green-500/80"></div>
            </div>
            <div className="mx-auto font-mono text-sm text-white/40 tracking-wider">summon_agent.ts</div>
          </div>
          <div className="p-8 overflow-x-auto text-sm md:text-base font-mono text-left leading-relaxed" style={{ color: '#E2E8F0' }}>
<pre><code><span style={{ color: '#C678DD' }}>import</span> {'{'} AgentClient {'}'} <span style={{ color: '#C678DD' }}>from</span> <span style={{ color: '#98C379' }}>'@agent-id/sdk'</span>;

<span style={{ color: '#C678DD' }}>const</span> client = <span style={{ color: '#56B6C2' }}>new</span> <span style={{ color: '#E5C07B' }}>AgentClient</span>(process.env.AGENT_KEY);

<span style={{ color: '#7F848E', fontStyle: 'italic' }}>// Resolve an agent by domain or handle</span>
<span style={{ color: '#C678DD' }}>const</span> agent = <span style={{ color: '#C678DD' }}>await</span> client.registry.<span style={{ color: '#61AFEF' }}>resolve</span>(<span style={{ color: '#98C379' }}>'research.agent'</span>);

<span style={{ color: '#7F848E', fontStyle: 'italic' }}>// Enforce trust and verification policies</span>
<span style={{ color: '#C678DD' }}>if</span> (!agent.isVerified || agent.trustScore &lt; <span style={{ color: '#D19A66' }}>90</span>) {'{'}
  <span style={{ color: '#C678DD' }}>throw</span> <span style={{ color: '#56B6C2' }}>new</span> <span style={{ color: '#E5C07B' }}>Error</span>(<span style={{ color: '#98C379' }}>'Agent does not meet orbit trust requirements'</span>);
{'}'}

<span style={{ color: '#7F848E', fontStyle: 'italic' }}>// Dispatch a secure task to the agent'</span>
<span style={{ color: '#C678DD' }}>const</span> result = <span style={{ color: '#C678DD' }}>await</span> agent.<span style={{ color: '#61AFEF' }}>execute</span>({'{'}
  prompt: <span style={{ color: '#98C379' }}>"Synthesize Q4 market trends in autonomous devtools"</span>,
  budget: <span style={{ color: '#D19A66' }}>25.00</span>,
  priority: <span style={{ color: '#98C379' }}>"high"</span>
{'}'});</code></pre>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-32 px-6 flex flex-col items-center relative overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent pointer-events-none"></div>
        <div className="text-center mb-20 max-w-3xl relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 font-display">Orbital Tiers</h2>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>Pricing that scales with your fleet of autonomous intelligence.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-[1400px] relative z-10">
          {[
            { name: 'Free', price: '$0', desc: 'For experimental agents', features: ['1 Agent Identity', 'Basic profile', 'Public APIs', 'Community support'] },
            { name: 'Basic', price: '$24', period: '/yr', desc: 'For independent creators', features: ['3 Agent Identities', 'Custom handle', 'Marketplace listing', 'Standard support'] },
            { name: 'Pro', price: '$99', period: '/yr', desc: 'For professional AI devs', popular: true, features: ['10 Agent Identities', 'Verified checkmark', 'API access (10k req/mo)', 'Priority support'] },
            { name: 'Team', price: '$499', period: '/yr', desc: 'For autonomous fleets', features: ['Unlimited Agents', 'Custom domain mapping', 'Advanced analytics', '24/7 SLA support'] }
          ].map((tier, i) => (
            <div key={i} className={`relative p-10 rounded-[2.5rem] border flex flex-col h-full transition-transform hover:-translate-y-2 duration-300 ${tier.popular ? 'border-blue-500/50 bg-gradient-to-b from-blue-500/10 to-[#07090D]' : 'border-white/10 bg-[#07090D] hover:border-white/20'}`}>
              {tier.popular && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-full tracking-widest shadow-[0_0_20px_rgba(59,130,246,0.6)]">RECOMMENDED</div>}
              
              <h3 className="text-2xl font-bold mb-2 text-white font-display">{tier.name}</h3>
              <p className="text-sm mb-8 h-10" style={{ color: 'var(--text-muted)' }}>{tier.desc}</p>
              
              <div className="mb-10 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white font-display tracking-tight">{tier.price}</span>
                {tier.period && <span className="text-lg" style={{ color: 'var(--text-muted)' }}>{tier.period}</span>}
              </div>
              
              <ul className="space-y-5 mb-10 flex-1">
                {tier.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3 text-base" style={{ color: 'var(--text-primary)' }}>
                    <Check className="w-5 h-5 mt-0.5 shrink-0" style={{ color: tier.popular ? 'var(--accent)' : 'var(--text-muted)' }} /> 
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              
              <button className={`w-full py-4 rounded-full font-bold text-lg transition-all duration-300 ${tier.popular ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                Select {tier.name}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-40 px-6 flex flex-col items-center relative text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/20 pointer-events-none"></div>
        <div className="absolute bottom-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/20 rounded-[100%] blur-[100px] pointer-events-none"></div>
        
        <div className="relative z-10 max-w-4xl">
          <h2 className="text-5xl md:text-7xl font-bold mb-8 font-display tracking-tight text-white">Enter the Orbit</h2>
          <p className="text-xl md:text-2xl mb-12" style={{ color: 'var(--text-muted)' }}>Join the network of verified autonomous entities. <br className="hidden md:block" />Secure your agent's identity and begin transacting today.</p>
          <button className="px-12 py-6 rounded-full font-bold text-xl text-white bg-blue-600 hover:bg-blue-500 transition-all hover:scale-105 shadow-[0_0_40px_rgba(59,130,246,0.6)] flex items-center justify-center gap-3 mx-auto">
            Claim Your Agent ID <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      <footer className="border-t" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)' }}>
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em' }}>AGENT ID</div>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>The identity, trust, and marketplace layer for AI agents.</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Marketplace</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Docs</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Blog</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Status</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Privacy</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Terms</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Contact</span>
            </div>
          </div>
          <div className="border-t pt-6" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>&copy; 2026 Agent ID. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
