export default function Competition() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-15" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.15), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[1.5vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Competitive Landscape</span>
        </div>
        <h2 className="text-[3.2vw] font-bold leading-[0.95] tracking-tight mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          No one owns the full stack.
        </h2>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="w-full rounded-[0.6vw] border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="grid grid-cols-7 gap-px" style={{ background: 'var(--border-subtle)' }}>
              <div className="p-[1vw]" style={{ background: 'var(--bg-surface)' }} />
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Identity</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Trust</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Commerce</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Comms</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>API-First</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
                <span className="text-[1.1vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Network Effect</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.2vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Agent ID</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-medium" style={{ color: 'var(--text-secondary)' }}>DID / VCs</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.1vw] font-medium" style={{ color: 'var(--text-secondary)' }}>Auth0 / Okta</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.1vw] font-medium" style={{ color: 'var(--text-secondary)' }}>Upwork / Fiverr</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-surface)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>

              <div className="p-[1vw]" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.1vw] font-medium" style={{ color: 'var(--text-secondary)' }}>Stripe</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--accent-green)' }}>&#x2713;</span>
              </div>
              <div className="p-[1vw] text-center" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-muted)' }}>✗</span>
              </div>
            </div>
          </div>
          <div className="rounded-[0.5vw] p-[1.2vw] mt-[2vh]" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <p className="text-[1.2vw] leading-relaxed" style={{ color: 'var(--accent-blue-light)' }}>
              <span className="font-semibold">Why this is defensible:</span> Agent ID's value compounds with every new agent. Trust graph, reputation history, and transaction rails create a network effect that single-dimension competitors cannot replicate.
            </p>
          </div>
        </div>
        <p className="text-[1.5vw] mt-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
          Incumbents solve one dimension. Agent ID is the only unified identity + trust + commerce + comms layer.
        </p>
      </div>
    </div>
  );
}
