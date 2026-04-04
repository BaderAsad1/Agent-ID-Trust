export default function MarketSize() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      <div className="absolute inset-0 opacity-25" style={{ background: 'radial-gradient(ellipse at 80% 30%, rgba(59,130,246,0.2), transparent 50%), radial-gradient(ellipse at 20% 70%, rgba(16,185,129,0.15), transparent 50%)' }} />
      <div className="relative flex h-full px-[7vw] py-[7vh]">
        <div className="flex flex-col w-[45vw]">
          <div className="flex items-center gap-[0.8vw] mb-[2vh]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
            <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Market Size</span>
          </div>
          <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            The autonomous agent economy.
          </h2>
          <div className="flex-1 flex flex-col justify-center gap-[4vh]">
            <div>
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[6vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>$580B</span>
              </div>
              <div className="flex items-center gap-[1vw] mt-[0.5vh]">
                <span className="text-[1.8vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>TAM</span>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>Global agent infrastructure spend by 2030</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[5vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>$72B</span>
              </div>
              <div className="flex items-center gap-[1vw] mt-[0.5vh]">
                <span className="text-[1.8vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>SAM</span>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>Agent identity, trust, and commerce layer</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-[1vw]">
                <span className="text-[4vw] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>$4.2B</span>
              </div>
              <div className="flex items-center gap-[1vw] mt-[0.5vh]">
                <span className="text-[1.8vw] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>SOM</span>
                <span className="text-[1.5vw]" style={{ color: 'var(--text-secondary)' }}>Year 5 addressable with current go-to-market</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-[35vw] h-[35vw]">
            <div className="absolute inset-[2vw] rounded-full border-2 flex items-center justify-center" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
              <div className="absolute inset-[4vw] rounded-full border-2 flex items-center justify-center" style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
                <div className="absolute inset-[4vw] rounded-full border-2 flex items-center justify-center" style={{ borderColor: 'rgba(241,245,249,0.3)', background: 'rgba(241,245,249,0.03)' }}>
                  <span className="text-[1.6vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>SOM</span>
                </div>
                <span className="absolute bottom-[1vw] text-[1.4vw] font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>SAM</span>
              </div>
              <span className="absolute bottom-[0.5vw] text-[1.4vw] font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>TAM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
