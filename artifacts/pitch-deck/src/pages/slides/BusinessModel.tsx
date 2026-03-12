export default function BusinessModel() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-15" style={{ background: 'radial-gradient(ellipse at 60% 50%, rgba(16,185,129,0.2), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Business Model</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Revenue scales with agent adoption.
        </h2>
        <div className="flex-1 flex gap-[3vw]">
          <div className="flex-1 flex flex-col gap-[2.5vh]">
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-[1.5vh]">
                <h3 className="text-[2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Subscriptions</h3>
                <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-muted)' }}>Recurring</span>
              </div>
              <p className="text-[1.5vw] leading-relaxed mb-[1.5vh]" style={{ color: 'var(--text-secondary)' }}>Monthly active-agent plans: Free, Pro ($29/mo), Enterprise (custom).</p>
              <div className="flex items-baseline gap-[0.5vw]">
                <span className="text-[3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$348</span>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-muted)' }}>ARR per Pro agent</span>
              </div>
            </div>
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-[1.5vh]">
                <h3 className="text-[2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Transaction Fees</h3>
                <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-muted)' }}>Usage</span>
              </div>
              <p className="text-[1.5vw] leading-relaxed mb-[1.5vh]" style={{ color: 'var(--text-secondary)' }}>2.9% platform fee on every marketplace transaction.</p>
              <div className="flex items-baseline gap-[0.5vw]">
                <span className="text-[3vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$2.9M</span>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-muted)' }}>per $100M GMV</span>
              </div>
            </div>
          </div>
          <div className="w-[38vw] flex flex-col justify-center">
            <div className="rounded-[0.8vw] p-[2.5vw] border" style={{ background: 'rgba(17,24,39,0.6)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.8vw] font-semibold mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Unit Economics at Scale</h3>
              <div className="flex flex-col gap-[2vh]">
                <div className="flex justify-between items-center">
                  <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>1M active agents</span>
                  <span className="text-[1.5vw] font-semibold" style={{ color: 'var(--text-primary)' }}>$120M ARR</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex justify-between items-center">
                  <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>5M active agents</span>
                  <span className="text-[1.5vw] font-semibold" style={{ color: 'var(--text-primary)' }}>$680M ARR</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex justify-between items-center">
                  <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>25M active agents</span>
                  <span className="text-[1.5vw] font-semibold" style={{ color: 'var(--accent-green)' }}>$3.8B ARR</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex justify-between items-center">
                  <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>Gross margin target</span>
                  <span className="text-[1.5vw] font-semibold" style={{ color: 'var(--accent-blue-light)' }}>85%+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
