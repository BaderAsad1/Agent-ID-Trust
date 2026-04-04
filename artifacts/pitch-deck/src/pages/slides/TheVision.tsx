export default function TheVision() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.15), transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.1), transparent 40%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Vision</span>
        </div>
        <h2 className="text-[4vw] font-bold leading-[0.92] tracking-tight max-w-[55vw] mb-[4vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Every agent gets an ID.
          <span className="block" style={{ color: 'var(--accent-blue-light)' }}>The internet becomes accountable.</span>
        </h2>
        <div className="flex-1 flex gap-[2.5vw] min-h-0">
          <div className="flex-1 flex flex-col gap-[1.5vh]">
            <div className="rounded-[0.6vw] p-[1.5vw] border" style={{ background: 'rgba(17,24,39,0.7)', borderColor: 'rgba(59,130,246,0.3)' }}>
              <h3 className="text-[1.5vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>2035: The Agentic Internet</h3>
              <div className="flex gap-[2vw]">
                <div className="text-center">
                  <span className="text-[2.8vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>500M+</span>
                  <span className="text-[1vw] block mt-[0.3vh]" style={{ color: 'var(--text-muted)' }}>agents with IDs</span>
                </div>
                <div className="text-center">
                  <span className="text-[2.8vw] font-bold leading-none block" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>$50T+</span>
                  <span className="text-[1vw] block mt-[0.3vh]" style={{ color: 'var(--text-muted)' }}>annual transactions</span>
                </div>
              </div>
            </div>
            <div className="rounded-[0.6vw] p-[1.5vw] border" style={{ background: 'rgba(17,24,39,0.7)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.4vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>The Protocol Endgame</h3>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Agent ID becomes the BGP of the agentic internet: invisible infrastructure that everything depends on. The protocol becomes an open standard, like DNS but for machines.</p>
            </div>
            <div className="rounded-[0.6vw] p-[1.5vw] border" style={{ background: 'rgba(17,24,39,0.7)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[1.4vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>The Moat Deepens</h3>
              <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Every registration strengthens the network. Trust graph, reputation history, and transaction rails become more valuable, and harder to replicate, with every agent.</p>
            </div>
          </div>
          <div className="w-[30vw] flex flex-col justify-center">
            <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'rgba(59,130,246,0.3)' }}>
              <h3 className="text-[1.6vw] font-bold mb-[2.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>The Analogy</h3>
              <div className="flex flex-col gap-[2vh]">
                <div className="flex items-start gap-[1vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.4vw] flex items-center justify-center shrink-0 text-[1.1vw] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>DNS</div>
                  <div>
                    <span className="text-[1.2vw] font-semibold block" style={{ color: 'var(--text-primary)' }}>Named the websites</span>
                    <span className="text-[1vw]" style={{ color: 'var(--text-muted)' }}>Made the web navigable</span>
                  </div>
                </div>
                <div className="flex items-start gap-[1vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.4vw] flex items-center justify-center shrink-0 text-[1.1vw] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', fontFamily: 'var(--font-display)' }}>Visa</div>
                  <div>
                    <span className="text-[1.2vw] font-semibold block" style={{ color: 'var(--text-primary)' }}>Trusted human commerce</span>
                    <span className="text-[1vw]" style={{ color: 'var(--text-muted)' }}>$15T annual volume</span>
                  </div>
                </div>
                <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
                <div className="flex items-start gap-[1vw]">
                  <div className="w-[3vw] h-[3vw] rounded-[0.4vw] flex items-center justify-center shrink-0 text-[1.1vw] font-bold" style={{ background: 'rgba(59,130,246,0.25)', color: 'var(--accent-blue-light)', fontFamily: 'var(--font-display)' }}>ID</div>
                  <div>
                    <span className="text-[1.2vw] font-semibold block" style={{ color: 'var(--accent-blue-light)' }}>Trusted machine commerce</span>
                    <span className="text-[1vw]" style={{ color: 'var(--text-secondary)' }}>What Visa did for humans, Agent ID does for machines</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
