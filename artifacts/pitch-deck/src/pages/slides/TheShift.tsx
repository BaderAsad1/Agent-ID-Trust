const base = import.meta.env.BASE_URL;

export default function TheShift() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <img
        src={`${base}hero-shift.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        alt="Billions of AI agents flowing through digital infrastructure"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,9,17,0.92) 0%, rgba(6,9,17,0.6) 50%, rgba(6,9,17,0.95) 100%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[3vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Tectonic Shift</span>
        </div>
        <h2 className="text-[4.5vw] font-bold leading-[0.95] tracking-tight max-w-[55vw]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          The internet is being
          <span style={{ color: 'var(--accent-blue-light)' }}> rebuilt for machines.</span>
        </h2>
        <div className="flex-1 flex items-end pb-[2vh]">
          <div className="flex gap-[3vw]">
            <div className="flex flex-col">
              <span className="text-[8vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>10B+</span>
              <span className="mt-[1vh] text-[1.6vw] max-w-[18vw]" style={{ color: 'var(--text-secondary)' }}>Autonomous AI agents projected by 2028</span>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--border-subtle)' }} />
            <div className="flex flex-col">
              <span className="text-[8vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>47%</span>
              <span className="mt-[1vh] text-[1.6vw] max-w-[18vw]" style={{ color: 'var(--text-secondary)' }}>Of enterprise API traffic will be agent-to-agent by 2027</span>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--border-subtle)' }} />
            <div className="flex flex-col">
              <span className="text-[8vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$2.9T</span>
              <span className="mt-[1vh] text-[1.6vw] max-w-[18vw]" style={{ color: 'var(--text-secondary)' }}>Projected autonomous agent economy by 2030</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
