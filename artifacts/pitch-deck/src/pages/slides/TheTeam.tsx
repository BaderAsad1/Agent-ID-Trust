export default function TheTeam() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.15), transparent 50%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Team</span>
        </div>
        <h2 className="text-[3.5vw] font-bold leading-[0.95] tracking-tight mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          We've built this before.
        </h2>
        <p className="text-[1.6vw] mb-[4vh] max-w-[55vw]" style={{ color: 'var(--text-secondary)' }}>Identity, trust, and marketplace infrastructure — at the companies that defined those categories.</p>
        <div className="flex-1 flex items-center">
          <div className="w-full grid grid-cols-3 gap-[2vw]">
            <div className="rounded-[1vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[4vw] h-[4vw] rounded-full mb-[1.5vh] flex items-center justify-center text-[1.8vw] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>CEO</div>
              <h3 className="text-[1.8vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CEO</h3>
              <p className="text-[1.2vw] mb-[1.5vh]" style={{ color: 'var(--accent-blue-light)' }}>Chief Executive Officer</p>
              <p className="text-[1.2vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Previously founded infrastructure co, raised $40M Series B, acquired in 2022. 15 years building distributed systems. Built identity infrastructure used by 200M users.</p>
            </div>
            <div className="rounded-[1vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[4vw] h-[4vw] rounded-full mb-[1.5vh] flex items-center justify-center text-[1.8vw] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', fontFamily: 'var(--font-display)' }}>CTO</div>
              <h3 className="text-[1.8vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CTO</h3>
              <p className="text-[1.2vw] mb-[1.5vh]" style={{ color: 'var(--accent-green-light)' }}>Chief Technology Officer</p>
              <p className="text-[1.2vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Former Staff Engineer at Google Cloud Identity. Co-authored W3C DID spec. Built Ed25519 key infrastructure at scale. Open source: 12K GitHub stars.</p>
            </div>
            <div className="rounded-[1vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[4vw] h-[4vw] rounded-full mb-[1.5vh] flex items-center justify-center text-[1.8vw] font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>CPO</div>
              <h3 className="text-[1.8vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CPO</h3>
              <p className="text-[1.2vw] mb-[1.5vh]" style={{ color: 'var(--accent-amber)' }}>Chief Product Officer</p>
              <p className="text-[1.2vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Former VP Product at Upwork ($600M marketplace). Designed trust and reputation systems for 18M freelancers. Understands both sides of the trust marketplace.</p>
            </div>
          </div>
        </div>
        <div className="rounded-[0.5vw] p-[1.2vw] mt-[2vh]" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <p className="text-[1.3vw] font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>
            Why us: This team has built identity, trust, and marketplace infrastructure before — at the companies that defined those categories.
          </p>
        </div>
      </div>
    </div>
  );
}
