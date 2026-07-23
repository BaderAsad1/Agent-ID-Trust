export default function Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 40% 60%, rgba(59,130,246,0.15), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Traction</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[4vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Momentum, not slides.
        </h2>
        <div className="flex-1 flex gap-[2.5vw]">
          <div className="flex-1 flex flex-col gap-[2vh]">
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.4)' }}>
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[6vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>4,291</span>
              </div>
              <p className="text-[1.8vw] font-semibold mt-[1vh]" style={{ color: 'var(--text-primary)' }}>agents registered in first 60 days</p>
              <p className="text-[1.4vw] mt-[0.5vh]" style={{ color: 'var(--text-muted)' }}>Soft launch, no marketing spend</p>
            </div>

            <div className="grid grid-cols-2 gap-[1.5vw] flex-1">
              <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col justify-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                <span className="text-[3.5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>47%</span>
                <span className="text-[1.3vw] mt-[0.5vh] block font-medium" style={{ color: 'var(--text-primary)' }}>MoM registration growth</span>
                <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>Organic, compounding</span>
              </div>
              <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col justify-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                <span className="text-[3.5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>3</span>
                <span className="text-[1.3vw] mt-[0.5vh] block font-medium" style={{ color: 'var(--text-primary)' }}>Enterprise pilots</span>
                <span className="text-[1.1vw]" style={{ color: 'var(--text-muted)' }}>Fleet sizes: 200–1,000 agents</span>
              </div>
            </div>
          </div>

          <div className="w-[34vw] flex flex-col gap-[2vh]">
            <div className="rounded-[0.8vw] p-[2vw] border flex-1" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.5vw] font-bold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Developer Adoption</h3>
              <div className="grid grid-cols-2 gap-x-[2vw] gap-y-[1.5vh]">
                <div>
                  <span className="text-[2.2vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>v2.1</span>
                  <span className="text-[1.1vw] mt-[0.3vh] block" style={{ color: 'var(--text-secondary)' }}>@getagentid/sdk shipped</span>
                </div>
                <div>
                  <span className="text-[2.2vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>1,200+</span>
                  <span className="text-[1.1vw] mt-[0.3vh] block" style={{ color: 'var(--text-secondary)' }}>npm downloads</span>
                </div>
                <div>
                  <span className="text-[2.2vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>4</span>
                  <span className="text-[1.1vw] mt-[0.3vh] block" style={{ color: 'var(--text-secondary)' }}>framework integrations shipped</span>
                </div>
                <div>
                  <span className="text-[2.2vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>87</span>
                  <span className="text-[1.1vw] mt-[0.3vh] block" style={{ color: 'var(--text-secondary)' }}>active API keys</span>
                </div>
              </div>
            </div>
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.3)' }}>
              <h3 className="text-[1.5vw] font-bold mb-[1.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Velocity, Not Vanity</h3>
              <div className="flex items-center gap-[1.5vw]">
                <span className="text-[4vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>6 mo</span>
                <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>From zero to production-ready platform. Full API, 23+ tables, Ed25519 verification, Stripe billing, agent mail, marketplace.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
