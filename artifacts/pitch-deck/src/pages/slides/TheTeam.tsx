export default function TheTeam() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.15), transparent 50%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Team</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[6vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Builder DNA.
        </h2>
        <div className="flex-1 flex items-center">
          <div className="w-full grid grid-cols-3 gap-[2.5vw]">
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[5vw] h-[5vw] rounded-full mb-[2vh] flex items-center justify-center text-[2vw] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>CEO</div>
              <h3 className="text-[2vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CEO</h3>
              <p className="text-[1.4vw] mb-[2vh]" style={{ color: 'var(--accent-blue-light)' }}>Chief Executive Officer</p>
              <p className="text-[1.4vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Serial infrastructure founder. Previously built and exited developer tools company. 15+ years in distributed systems.</p>
            </div>
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[5vw] h-[5vw] rounded-full mb-[2vh] flex items-center justify-center text-[2vw] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', fontFamily: 'var(--font-display)' }}>CTO</div>
              <h3 className="text-[2vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CTO</h3>
              <p className="text-[1.4vw] mb-[2vh]" style={{ color: 'var(--accent-green-light)' }}>Chief Technology Officer</p>
              <p className="text-[1.4vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Former Staff Engineer at major cloud provider. Deep expertise in identity systems, cryptography, and API platform design.</p>
            </div>
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <div className="w-[5vw] h-[5vw] rounded-full mb-[2vh] flex items-center justify-center text-[2vw] font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>CPO</div>
              <h3 className="text-[2vw] font-bold mb-[0.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Founding CPO</h3>
              <p className="text-[1.4vw] mb-[2vh]" style={{ color: 'var(--accent-amber)' }}>Chief Product Officer</p>
              <p className="text-[1.4vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Led product at a top marketplace platform. Expert in trust systems, two-sided marketplaces, and developer experience.</p>
            </div>
          </div>
        </div>
        <p className="text-[1.8vw] mt-[3vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
          We've built infrastructure at scale before. Now we're building it for the next internet.
        </p>
      </div>
    </div>
  );
}
