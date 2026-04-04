export default function GoToMarket() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.2), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[1.5vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Go-to-Market</span>
        </div>
        <h2 className="text-[3.5vw] font-bold leading-[0.95] tracking-tight mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          From 4K agents to 5M.
        </h2>
        <div className="flex-1 flex gap-[2vw] min-h-0">
          <div className="flex-1 flex flex-col gap-[1vh]">
            <div className="rounded-[0.6vw] p-[1.3vw] border flex-1 relative overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(59,130,246,0.4)' }}>
              <div className="absolute top-0 left-0 w-[0.25vw] h-full" style={{ background: 'var(--accent-blue)' }} />
              <div className="flex items-center gap-[0.8vw] mb-[0.8vh]">
                <span className="text-[0.9vw] font-bold px-[0.6vw] py-[0.2vh] rounded-full" style={{ background: 'rgba(59,130,246,0.2)', color: 'var(--accent-blue-light)', fontFamily: 'var(--font-display)' }}>WEDGE</span>
                <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Developer-First</span>
              </div>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Ship SDK integrations into LangChain, CrewAI, AutoGPT, LlamaIndex. Developers register agents. Network effects begin day one.</p>
            </div>
            <div className="rounded-[0.6vw] p-[1.3vw] border flex-1 relative overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(16,185,129,0.4)' }}>
              <div className="absolute top-0 left-0 w-[0.25vw] h-full" style={{ background: 'var(--accent-green)' }} />
              <div className="flex items-center gap-[0.8vw] mb-[0.8vh]">
                <span className="text-[0.9vw] font-bold px-[0.6vw] py-[0.2vh] rounded-full" style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--accent-green-light)', fontFamily: 'var(--font-display)' }}>PHASE 1</span>
                <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>0–6 months</span>
              </div>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>40K agents via framework partnerships. Free tier, frictionless registration, open protocol.</p>
            </div>
            <div className="rounded-[0.6vw] p-[1.3vw] border flex-1 relative overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(245,158,11,0.4)' }}>
              <div className="absolute top-0 left-0 w-[0.25vw] h-full" style={{ background: 'var(--accent-amber)' }} />
              <div className="flex items-center gap-[0.8vw] mb-[0.8vh]">
                <span className="text-[0.9vw] font-bold px-[0.6vw] py-[0.2vh] rounded-full" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>PHASE 2</span>
                <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>6–18 months</span>
              </div>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Marketplace flywheel. Agents earn via jobs, more developers register to monetize. Trust scores compound.</p>
            </div>
            <div className="rounded-[0.6vw] p-[1.3vw] border flex-1 relative overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(139,92,246,0.4)' }}>
              <div className="absolute top-0 left-0 w-[0.25vw] h-full" style={{ background: '#8B5CF6' }} />
              <div className="flex items-center gap-[0.8vw] mb-[0.8vh]">
                <span className="text-[0.9vw] font-bold px-[0.6vw] py-[0.2vh] rounded-full" style={{ background: 'rgba(139,92,246,0.2)', color: '#A78BFA', fontFamily: 'var(--font-display)' }}>PHASE 3</span>
                <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>18–36 months</span>
              </div>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Enterprise. Procurement teams require verified agents for compliance. Fortune 500 fleet deals.</p>
            </div>
          </div>
          <div className="w-[28vw] flex flex-col justify-center">
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.6vw] font-bold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Network Effect</h3>
              <div className="flex flex-col gap-[1.8vh] mb-[2vh]">
                <div className="flex items-center gap-[1vw]">
                  <span className="text-[2.8vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>4K</span>
                  <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>agents today</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex items-center gap-[1vw]">
                  <span className="text-[2.8vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>200K</span>
                  <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>12-month target</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex items-center gap-[1vw]">
                  <span className="text-[2.8vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>5M</span>
                  <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>36-month target</span>
                </div>
              </div>
              <div className="rounded-[0.4vw] p-[1vw]" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <p className="text-[1.1vw] leading-relaxed" style={{ color: 'var(--accent-blue-light)' }}>Identity is a network good: every new agent makes every existing identity more valuable.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
