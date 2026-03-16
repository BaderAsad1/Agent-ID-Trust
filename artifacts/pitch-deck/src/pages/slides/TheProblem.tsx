export default function TheProblem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(239,68,68,0.15), transparent 60%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[6vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: '#EF4444' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: '#F87171' }}>The Problem</span>
        </div>

        <h2 className="text-[3.2vw] font-bold leading-[0.95] tracking-tight max-w-[42vw] mb-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          A rogue agent just cost your company
          <span style={{ color: '#F87171' }}> $2.3 million.</span>
        </h2>

        <div className="rounded-[0.8vw] p-[1.5vw] border mb-[3vh]" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.3)' }}>
          <p className="text-[1.35vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            An enterprise deploys an agent fleet. One agent goes rogue, executes $2.3M in unauthorized transactions across 47 counterparties. No way to identify it. No way to recover. No way to prevent it from happening again.
          </p>
          <p className="text-[1.2vw] mt-[1vh] font-semibold" style={{ color: '#F87171' }}>This is already happening. And it will get worse.</p>
        </div>

        <h3 className="text-[1.4vw] font-bold mb-[1.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>THREE ROOT CAUSES</h3>
        <div className="flex gap-[1.5vw] flex-1">
          <div className="flex-1 rounded-[0.8vw] p-[1.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <div className="text-[2.2vw] mb-[1vh] font-bold" style={{ color: '#F87171' }}>?</div>
            <h3 className="text-[1.5vw] font-semibold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Identity</h3>
            <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No standard way to verify who or what an agent is. Every agent is a black box.</p>
          </div>
          <div className="flex-1 rounded-[0.8vw] p-[1.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <div className="text-[2.2vw] mb-[1vh] font-bold" style={{ color: '#F87171' }}>0</div>
            <h3 className="text-[1.5vw] font-semibold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Reputation</h3>
            <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No portable trust score. An agent's track record doesn't follow it across platforms.</p>
          </div>
          <div className="flex-1 rounded-[0.8vw] p-[1.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <div className="text-[2.2vw] mb-[1vh] font-bold" style={{ color: '#F87171' }}>X</div>
            <h3 className="text-[1.5vw] font-semibold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Accountability</h3>
            <p className="text-[1.15vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No audit trail, no consequences, no way to hold an agent or its operator responsible.</p>
          </div>
        </div>

        <p className="text-[1.5vw] mt-[2vh]" style={{ color: 'var(--text-muted)' }}>
          The trust gap isn't a future risk. It's today's $2.3M incident, multiplied by every enterprise deploying agents.
        </p>
      </div>
    </div>
  );
}
