export default function TheInsight() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(59,130,246,0.25), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[3vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Insight</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[1] tracking-tight max-w-[55vw] mb-[6vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Every internet era gets its identity primitive.
        </h2>
        <div className="flex-1 flex items-center">
          <div className="w-full flex flex-col gap-[3vh]">
            <div className="flex items-center gap-[2vw]">
              <div className="w-[14vw] shrink-0 text-right">
                <span className="text-[1.8vw] font-medium" style={{ color: 'var(--text-muted)' }}>1983</span>
              </div>
              <div className="w-[0.25vw] h-[6vh] rounded-full" style={{ background: 'var(--text-muted)' }} />
              <div>
                <h3 className="text-[2.4vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>DNS</h3>
                <p className="text-[1.6vw]" style={{ color: 'var(--text-muted)' }}>Named the websites. Made the web navigable.</p>
              </div>
            </div>
            <div className="flex items-center gap-[2vw]">
              <div className="w-[14vw] shrink-0 text-right">
                <span className="text-[1.8vw] font-medium" style={{ color: 'var(--text-muted)' }}>2006</span>
              </div>
              <div className="w-[0.25vw] h-[6vh] rounded-full" style={{ background: 'var(--text-muted)' }} />
              <div>
                <h3 className="text-[2.4vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>OAuth</h3>
                <p className="text-[1.6vw]" style={{ color: 'var(--text-muted)' }}>Identified the users. Made the social web possible.</p>
              </div>
            </div>
            <div className="flex items-center gap-[2vw]">
              <div className="w-[14vw] shrink-0 text-right">
                <span className="text-[1.8vw] font-bold" style={{ color: 'var(--accent-blue-light)' }}>2026</span>
              </div>
              <div className="w-[0.25vw] h-[6vh] rounded-full" style={{ background: 'var(--accent-blue)' }} />
              <div>
                <h3 className="text-[2.4vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Agent ID</h3>
                <p className="text-[1.6vw]" style={{ color: 'var(--text-secondary)' }}>The identity and trust layer for the agentic internet: a protocol-layer namespace that lets every agent be discovered, verified, and trusted.</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[2vw] font-medium mt-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          This isn't optional infrastructure. It's historically inevitable.
        </p>
      </div>
    </div>
  );
}
