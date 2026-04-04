export default function Financials() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-15" style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(16,185,129,0.2), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[1.5vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Financials</span>
        </div>
        <h2 className="text-[3.5vw] font-bold leading-[0.95] tracking-tight mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          The model works.
        </h2>
        <div className="flex-1 flex flex-col gap-[1.5vh] min-h-0">
          <div className="rounded-[0.6vw] border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="grid grid-cols-6 gap-px" style={{ background: 'var(--border-subtle)' }}>
              <div className="p-[1vw]" style={{ background: 'var(--bg-surface)' }} />
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Agents</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>ARR</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Growth</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Gross Margin</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Key Milestone</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Year 1</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--text-primary)' }}>200K</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-green)' }}>$4M</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-amber)' }}>300% YoY</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw]" style={{ color: 'var(--text-secondary)' }}>72%</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1vw]" style={{ color: 'var(--text-secondary)' }}>Burn $8M, 18mo runway</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Year 2</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--text-primary)' }}>1.5M</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-green)' }}>$50M</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-amber)' }}>12x YoY</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.2vw]" style={{ color: 'var(--text-secondary)' }}>84%</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1vw]" style={{ color: 'var(--text-secondary)' }}>$150M GMV, +$4.4M fees</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>Year 3</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--text-primary)' }}>5M</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-green)' }}>$240M</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-semibold" style={{ color: 'var(--accent-amber)' }}>5x YoY</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw]" style={{ color: 'var(--accent-green)' }}>88%</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1vw]" style={{ color: 'var(--text-secondary)' }}>Path to $500M ARR</span>
              </div>
            </div>
          </div>

          <div className="flex gap-[2vw] flex-1 min-h-0">
            <div className="flex-1 rounded-[0.6vw] p-[1.5vw] border flex flex-col justify-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.4vw] font-bold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Unit Economics</h3>
              <div className="flex gap-[2.5vw]">
                <div className="text-center">
                  <span className="text-[3vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>$12</span>
                  <span className="text-[1vw] mt-[0.5vh] block" style={{ color: 'var(--text-muted)' }}>CAC</span>
                </div>
                <div className="text-center">
                  <span className="text-[3vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>$348</span>
                  <span className="text-[1vw] mt-[0.5vh] block" style={{ color: 'var(--text-muted)' }}>LTV (Pro)</span>
                </div>
                <div className="text-center">
                  <span className="text-[3vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>29x</span>
                  <span className="text-[1vw] mt-[0.5vh] block" style={{ color: 'var(--text-muted)' }}>LTV / CAC</span>
                </div>
              </div>
            </div>
            <div className="flex-1 rounded-[0.6vw] p-[1.5vw] border flex flex-col justify-center" style={{ background: 'rgba(17,24,39,0.6)', borderColor: 'rgba(59,130,246,0.2)' }}>
              <h3 className="text-[1.4vw] font-bold mb-[1.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Compounding Value</h3>
              <p className="text-[1.15vw] leading-relaxed mb-[1vh]" style={{ color: 'var(--text-secondary)' }}>Each new agent increases network value for all existing agents. Trust scores and transaction rails become more valuable at scale.</p>
              <div className="flex items-baseline gap-[0.5vw]">
                <span className="text-[2.2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>$240M</span>
                <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>ARR at 5M agents in Year 3</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
