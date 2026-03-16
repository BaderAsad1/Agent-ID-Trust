export default function TheAsk() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(16,185,129,0.08), transparent 50%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[1.5vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Ask</span>
        </div>
        <h2 className="text-[4vw] font-bold leading-[0.95] tracking-tight mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent-blue-light)' }}>$4M</span> Seed Round
        </h2>
        <div className="flex-1 flex gap-[2.5vw] min-h-0">
          <div className="flex-1 flex flex-col gap-[2vh]">
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-baseline gap-[1vw] mb-[1.5vh]">
                <span className="text-[4.5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$20M</span>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>post-money valuation</span>
              </div>
              <div className="h-px mb-[1.5vh]" style={{ background: 'var(--border-subtle)' }} />
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[2.5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>$4M</span>
                <span className="text-[1.3vw]" style={{ color: 'var(--text-secondary)' }}>primary capital raise</span>
              </div>
            </div>

            <div className="rounded-[0.8vw] p-[2vw] border flex-1" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.5vw] font-bold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>What $4M Buys</h3>
              <div className="flex flex-col gap-[1.5vh]">
                <div className="flex gap-[1vw]">
                  <span className="text-[1.1vw] font-bold shrink-0 w-[5vw]" style={{ color: 'var(--accent-blue-light)', fontFamily: 'var(--font-display)' }}>6 mo</span>
                  <span className="text-[1.15vw]" style={{ color: 'var(--text-secondary)' }}>25K agents, SDK v3 with LangChain and CrewAI plugins shipped, first enterprise pilot converted</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex gap-[1vw]">
                  <span className="text-[1.1vw] font-bold shrink-0 w-[5vw]" style={{ color: 'var(--accent-green-light)', fontFamily: 'var(--font-display)' }}>12 mo</span>
                  <span className="text-[1.15vw]" style={{ color: 'var(--text-secondary)' }}>100K agents, $500K ARR, marketplace live with initial GMV, Series A ready</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex gap-[1vw]">
                  <span className="text-[1.1vw] font-bold shrink-0 w-[5vw]" style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>18 mo</span>
                  <span className="text-[1.15vw]" style={{ color: 'var(--text-secondary)' }}>Protocol draft submitted to IETF/W3C, 250K+ agents, $2M+ ARR run rate</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-[34vw] flex flex-col justify-center gap-[2vh]">
            <h3 className="text-[1.6vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Use of Funds</h3>
            <div className="flex flex-col gap-[1.8vh]">
              <div>
                <div className="flex justify-between items-center mb-[0.6vh]">
                  <span className="text-[1.3vw] font-medium" style={{ color: 'var(--text-primary)' }}>Engineering: protocol and platform</span>
                  <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>50%</span>
                </div>
                <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '50%', background: 'var(--accent-blue)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.6vh]">
                  <span className="text-[1.3vw] font-medium" style={{ color: 'var(--text-primary)' }}>Go-to-Market: SDK, developer relations</span>
                  <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>25%</span>
                </div>
                <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '25%', background: 'var(--accent-green)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.6vh]">
                  <span className="text-[1.3vw] font-medium" style={{ color: 'var(--text-primary)' }}>Operations: legal, compliance, infra</span>
                  <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>15%</span>
                </div>
                <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '15%', background: 'var(--accent-amber)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.6vh]">
                  <span className="text-[1.3vw] font-medium" style={{ color: 'var(--text-primary)' }}>Reserve</span>
                  <span className="text-[1.3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>10%</span>
                </div>
                <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '10%', background: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[1.8vw] font-bold mt-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Own the identity layer before the window closes.
        </p>
      </div>
    </div>
  );
}
