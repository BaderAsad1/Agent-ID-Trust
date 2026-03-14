const base = import.meta.env.BASE_URL;

export default function TitleSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <img
        src={`${base}hero-title.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-40"
        alt="Abstract network of interconnected identity nodes"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(6,9,17,0.85) 0%, rgba(10,14,23,0.7) 50%, rgba(6,9,17,0.9) 100%)' }} />
      <div className="relative flex h-full flex-col justify-between px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[1vw]">
          <div className="w-[2.8vw] h-[2.8vw] rounded-[0.5vw] flex items-center justify-center" style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>
            <span className="text-[1.4vw] font-bold text-white">ID</span>
          </div>
          <span className="text-[1.6vw] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent ID</span>
        </div>
        <div className="max-w-[65vw]">
          <h1 className="text-[6.5vw] leading-[0.92] font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            The Identity Layer
            <span className="block" style={{ color: 'var(--accent-blue-light)' }}>for the Agentic Internet</span>
          </h1>
          <p className="mt-[3vh] text-[2vw] leading-snug max-w-[50vw]" style={{ color: 'var(--text-secondary)' }}>
            The identity and trust layer for autonomous AI agents.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[2vw]">
            <span className="text-[1.4vw]" style={{ color: 'var(--text-muted)' }}>Series A</span>
            <span className="w-[0.3vw] h-[0.3vw] rounded-full" style={{ background: 'var(--text-muted)' }} />
            <span className="text-[1.4vw]" style={{ color: 'var(--text-muted)' }}>Confidential</span>
            <span className="w-[0.3vw] h-[0.3vw] rounded-full" style={{ background: 'var(--text-muted)' }} />
            <span className="text-[1.4vw]" style={{ color: 'var(--text-muted)' }}>2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
