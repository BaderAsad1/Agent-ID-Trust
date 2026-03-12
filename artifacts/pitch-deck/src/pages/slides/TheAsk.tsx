export default function TheAsk() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(16,185,129,0.08), transparent 50%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Ask</span>
        </div>
        <h2 className="text-[4.5vw] font-bold leading-[0.95] tracking-tight mb-[5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent-blue-light)' }}>$100M</span> Series A
        </h2>
        <div className="flex-1 flex gap-[3vw]">
          <div className="flex-1 flex flex-col justify-center">
            <div className="rounded-[1vw] p-[2.5vw] border mb-[3vh]" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-baseline gap-[1vw] mb-[2vh]">
                <span className="text-[5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$1B</span>
                <span className="text-[1.8vw]" style={{ color: 'var(--text-muted)' }}>post-money valuation</span>
              </div>
              <div className="h-px mb-[2vh]" style={{ background: 'var(--border-subtle)' }} />
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[3vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>$100M</span>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>primary capital raise</span>
              </div>
            </div>
          </div>
          <div className="w-[40vw] flex flex-col justify-center">
            <h3 className="text-[2vw] font-semibold mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Use of Funds</h3>
            <div className="flex flex-col gap-[2vh]">
              <div>
                <div className="flex justify-between items-center mb-[0.8vh]">
                  <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-primary)' }}>Engineering</span>
                  <span className="text-[1.5vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>45%</span>
                </div>
                <div className="w-full h-[0.6vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '45%', background: 'var(--accent-blue)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.8vh]">
                  <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-primary)' }}>Go-to-Market</span>
                  <span className="text-[1.5vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>30%</span>
                </div>
                <div className="w-full h-[0.6vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '30%', background: 'var(--accent-green)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.8vh]">
                  <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-primary)' }}>Operations</span>
                  <span className="text-[1.5vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>15%</span>
                </div>
                <div className="w-full h-[0.6vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '15%', background: 'var(--accent-amber)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-[0.8vh]">
                  <span className="text-[1.5vw] font-medium" style={{ color: 'var(--text-primary)' }}>Reserve</span>
                  <span className="text-[1.5vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>10%</span>
                </div>
                <div className="w-full h-[0.6vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="h-full rounded-full" style={{ width: '10%', background: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[2.2vw] font-bold mt-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Own the identity layer before the window closes.
        </p>
      </div>
    </div>
  );
}
