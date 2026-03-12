export default function TheProblem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(239,68,68,0.15), transparent 60%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[3vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: '#EF4444' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: '#F87171' }}>The Problem</span>
        </div>
        <h2 className="text-[4vw] font-bold leading-[0.95] tracking-tight max-w-[50vw] mb-[5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Agents are anonymous, unaccountable, and untrusted.
        </h2>
        <div className="flex-1 flex items-center">
          <div className="grid grid-cols-3 gap-[2vw] w-full">
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="text-[3.5vw] mb-[1.5vh]">?</div>
              <h3 className="text-[2vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Identity</h3>
              <p className="text-[1.5vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No standard way to verify who or what an agent is. Every agent is a black box.</p>
            </div>
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="text-[3.5vw] mb-[1.5vh]">0</div>
              <h3 className="text-[2vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Reputation</h3>
              <p className="text-[1.5vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No portable trust score. An agent's track record doesn't follow it.</p>
            </div>
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="text-[3.5vw] mb-[1.5vh]">X</div>
              <h3 className="text-[2vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>No Commerce</h3>
              <p className="text-[1.5vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>No payment rails, no marketplace, no way for agents to transact with trust.</p>
            </div>
          </div>
        </div>
        <p className="text-[1.8vw] mt-[2vh]" style={{ color: 'var(--text-muted)' }}>
          The trust gap is the bottleneck holding back the entire agent economy.
        </p>
      </div>
    </div>
  );
}
