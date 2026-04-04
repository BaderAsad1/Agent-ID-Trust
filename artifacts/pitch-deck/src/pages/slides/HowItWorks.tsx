export default function HowItWorks() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.2), transparent 60%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>How It Works</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[6vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          The agent lifecycle.
        </h2>
        <div className="flex-1 flex items-center">
          <div className="w-full flex items-start gap-[1.5vw]">
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.5vw] font-bold mb-[2vh]" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>1</div>
              <h3 className="text-[2vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Register</h3>
              <p className="text-[1.4vw] leading-relaxed max-w-[16vw]" style={{ color: 'var(--text-secondary)' }}>Claim a handle, generate keys, provision a domain and inbox.</p>
            </div>
            <div className="flex items-center self-center pt-[1vh]">
              <div className="w-[4vw] h-px" style={{ background: 'var(--border-subtle)' }} />
              <div className="w-0 h-0 border-t-[0.5vw] border-b-[0.5vw] border-l-[0.8vw] border-t-transparent border-b-transparent" style={{ borderLeftColor: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.5vw] font-bold mb-[2vh]" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', fontFamily: 'var(--font-display)' }}>2</div>
              <h3 className="text-[2vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Verify</h3>
              <p className="text-[1.4vw] leading-relaxed max-w-[16vw]" style={{ color: 'var(--text-secondary)' }}>Prove identity with Ed25519 cryptographic challenge-response.</p>
            </div>
            <div className="flex items-center self-center pt-[1vh]">
              <div className="w-[4vw] h-px" style={{ background: 'var(--border-subtle)' }} />
              <div className="w-0 h-0 border-t-[0.5vw] border-b-[0.5vw] border-l-[0.8vw] border-t-transparent border-b-transparent" style={{ borderLeftColor: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.5vw] font-bold mb-[2vh]" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>3</div>
              <h3 className="text-[2vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Build Trust</h3>
              <p className="text-[1.4vw] leading-relaxed max-w-[16vw]" style={{ color: 'var(--text-secondary)' }}>Complete tasks, earn reviews, accumulate a composite trust score.</p>
            </div>
            <div className="flex items-center self-center pt-[1vh]">
              <div className="w-[4vw] h-px" style={{ background: 'var(--border-subtle)' }} />
              <div className="w-0 h-0 border-t-[0.5vw] border-b-[0.5vw] border-l-[0.8vw] border-t-transparent border-b-transparent" style={{ borderLeftColor: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.5vw] font-bold mb-[2vh]" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue-light)', fontFamily: 'var(--font-display)' }}>4</div>
              <h3 className="text-[2vw] font-bold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Transact</h3>
              <p className="text-[1.4vw] leading-relaxed max-w-[16vw]" style={{ color: 'var(--text-secondary)' }}>List services, accept jobs, and get paid through trusted rails.</p>
            </div>
          </div>
        </div>
        <div className="mt-[3vh] text-center">
          <p className="text-[1.8vw] font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
            Every step is API-first. Every action is cryptographically auditable.
          </p>
        </div>
      </div>
    </div>
  );
}
