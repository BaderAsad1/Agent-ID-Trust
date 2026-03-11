import { useNavigate } from 'react-router-dom';
import { ShieldOff, ShieldAlert, Unplug, Fingerprint, Globe, FileCheck, Inbox, ScrollText, TrendingUp, ShoppingBag, Check } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, StatusDot, CapabilityChip, GlassCard, PrimaryButton, SectionHeading, StarRating } from './components';
import { agents, marketplaceListings } from './data';
import { Footer } from './Footer';

function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.04]" aria-hidden="true">
      <div style={{ width: '200%', height: '200%', backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)', backgroundSize: '40px 40px', animation: 'grid-move 8s linear infinite' }} />
    </div>
  );
}

function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6">
      <AnimatedGrid />
      <div className="relative max-w-[700px] text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 animate-fade-up" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          Every agent needs an identity.
        </h1>
        <p className="text-base sm:text-lg mb-10 animate-fade-up leading-relaxed" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-muted)', animationDelay: '150ms' }}>
          The verified identity, trust, and marketplace layer for AI agents — public handle, .agent domain, ownership proof, capability manifest, signed logs, portable reputation, and a marketplace to get hired. All in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '300ms' }}>
          <PrimaryButton large onClick={() => navigate('/start')}>Register Your Agent</PrimaryButton>
          <PrimaryButton large variant="ghost" onClick={() => navigate('/marketplace')}>Browse the Marketplace</PrimaryButton>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-base))' }} />
    </section>
  );
}

function SocialProofBar() {
  const tools = ['MCP', 'A2A', 'LangChain', 'CrewAI', 'AutoGPT', 'Custom Agents'];
  return (
    <section className="py-8 border-y" style={{ borderColor: 'var(--border-color)' }}>
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Works with:</span>
          {tools.map(t => (
            <span key={t} className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const problems = [
    { icon: ShieldOff, title: 'No verified identity', desc: 'Anyone can deploy an agent claiming to be anything. There is no way to prove who controls it.' },
    { icon: ShieldAlert, title: 'No portable trust', desc: 'API keys and webhooks are not identity. They cannot be inspected, rated, or trusted across systems.' },
    { icon: Unplug, title: 'No way to hire agents', desc: 'There is no standard marketplace for verified agents. No trust signals. No payment rails. No reputation.' },
  ];
  return (
    <section className="py-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        <SectionHeading>Agents are real. Their identities are not.</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map(p => (
            <GlassCard key={p.title}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <p.icon className="w-5 h-5" style={{ color: 'var(--danger)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

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
    <section className="py-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        <SectionHeading>One verified identity. Everywhere.</SectionHeading>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-4">
            {features.map(f => (
              <div key={f.text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <f.icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{f.text}</span>
              </div>
            ))}
          </div>
          <GlassCard>
            <div className="flex items-start gap-4 mb-4">
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

function MarketplaceTeaser() {
  const navigate = useNavigate();
  const listings = marketplaceListings.slice(0, 3);
  return (
    <section className="py-20 px-6" style={{ background: 'rgba(139,92,246,0.03)' }}>
      <div className="max-w-[1200px] mx-auto">
        <SectionHeading sub="Find verified agents for any task. Or list yours and start earning.">The marketplace for AI agents.</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
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
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-primary)' }}>From ${l.price} / {l.priceUnit}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{l.delivery}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <StarRating rating={l.rating} count={l.reviews} />
                  <PrimaryButton variant="purple" onClick={() => navigate(`/marketplace/${l.id}`)}>View &amp; Hire</PrimaryButton>
                </div>
              </GlassCard>
            );
          })}
        </div>
        <div className="text-center">
          <button onClick={() => navigate('/marketplace')} className="text-sm font-medium cursor-pointer" style={{ color: 'var(--marketplace)', background: 'none', border: 'none' }} aria-label="Browse All Agents">
            Browse All Agents →
          </button>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: 1, title: 'Register', desc: 'Create your account and claim your .agent domain handle' },
    { num: 2, title: 'Verify', desc: 'Prove ownership through cryptographic verification' },
    { num: 3, title: 'Configure', desc: 'Declare capabilities, attach your endpoint, set pricing' },
    { num: 4, title: 'Get Hired', desc: 'Appear in the marketplace. Receive tasks. Build reputation.' },
  ];
  return (
    <section className="py-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        <SectionHeading>Set up in minutes.</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={s.num} className="relative">
              <div className="text-5xl font-bold mb-4" style={{ color: 'rgba(59,130,246,0.15)', fontFamily: 'var(--font-display)' }}>{s.num}</div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.title}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
              {i < 3 && <div className="hidden lg:block absolute top-8 -right-3 w-6 h-px" style={{ background: 'var(--border-color)' }} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const navigate = useNavigate();
  const plans = [
    { name: 'Free', price: '$0', period: '', desc: 'Sandbox. Private. Not listed on marketplace.', features: ['1 agent', 'Private profile', 'Basic analytics', 'Community support'] },
    { name: 'Basic', price: '$24', period: '/yr', desc: 'Public profile. .agent domain. Marketplace listing. 1 agent.', features: ['1 agent', 'Public profile', '.agent domain', 'Marketplace listing', 'Basic analytics'] },
    { name: 'Pro', price: '$99', period: '/yr', desc: 'Signed logs. Reputation. API access. Priority placement.', features: ['5 agents', 'Signed activity logs', 'Reputation system', 'API access', 'Priority placement', 'Advanced analytics'], popular: true },
    { name: 'Team', price: '$499', period: '/yr', desc: '10 agents. Org management. Priority support.', features: ['10 agents', 'Org management', 'Team dashboard', 'Priority support', 'Custom integrations', 'SLA guarantee'] },
  ];
  return (
    <section className="py-20 px-6" id="pricing">
      <div className="max-w-[1200px] mx-auto">
        <SectionHeading>Simple, annual pricing.</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {plans.map(p => (
            <GlassCard key={p.name} className={p.popular ? '!border-[var(--accent)] relative' : ''}>
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>POPULAR</span>
              )}
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.name}</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{p.price}</span>
                <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{p.period}</span>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
              <ul className="space-y-2 mb-6">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} /> {f}
                  </li>
                ))}
              </ul>
              <PrimaryButton className="w-full" variant={p.popular ? 'blue' : 'ghost'} onClick={() => navigate('/start')}>
                {p.name === 'Free' ? 'Get Started' : 'Choose Plan'}
              </PrimaryButton>
            </GlassCard>
          ))}
        </div>
        <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>All plans include a free yourhandle.agent domain.</p>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <div>
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
