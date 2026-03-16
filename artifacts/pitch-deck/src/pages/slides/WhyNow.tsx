export default function WhyNow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(245,158,11,0.25), transparent 55%), radial-gradient(ellipse at 20% 70%, rgba(239,68,68,0.15), transparent 50%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[3vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-amber)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>Why Now</span>
        </div>
        <h2 className="text-[4vw] font-bold leading-[0.95] tracking-tight max-w-[55vw] mb-[4vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          The window just opened.
          <span className="block text-[2.4vw] mt-[1vh] font-semibold" style={{ color: 'var(--accent-amber)' }}>And it will close fast.</span>
        </h2>
        <div className="flex-1 flex gap-[2vw]">
          <div className="flex-1 flex flex-col gap-[1.5vh]">
            <div className="rounded-[0.8vw] p-[1.8vw] border flex-1" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(245,158,11,0.3)' }}>
              <div className="flex items-center gap-[0.8vw] mb-[1.2vh]">
                <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>2025</span>
                <span className="text-[1.3vw] font-semibold" style={{ color: 'var(--text-primary)' }}>Agents went mainstream</span>
              </div>
              <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>OpenAI function calling, Anthropic Computer Use, Google Gemini agents. LangChain + CrewAI + AutoGPT crossed 50M combined downloads.</p>
            </div>
            <div className="rounded-[0.8vw] p-[1.8vw] border flex-1" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(245,158,11,0.3)' }}>
              <div className="flex items-center gap-[0.8vw] mb-[1.2vh]">
                <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>400%</span>
                <span className="text-[1.3vw] font-semibold" style={{ color: 'var(--text-primary)' }}>Enterprise agent deployments YoY</span>
              </div>
              <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Fortune 500 companies are deploying agent fleets with no identity layer. Every deployment is a trust incident waiting to happen.</p>
            </div>
            <div className="rounded-[0.8vw] p-[1.8vw] border flex-1" style={{ background: 'var(--bg-surface)', borderColor: 'rgba(239,68,68,0.3)' }}>
              <div className="flex items-center gap-[0.8vw] mb-[1.2vh]">
                <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: '#F87171' }}>EU AI Act</span>
                <span className="text-[1.3vw] font-semibold" style={{ color: 'var(--text-primary)' }}>Compliance is now mandatory</span>
              </div>
              <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>2025 regulations mandate agent accountability. Compliance creates structural demand for identity infrastructure. This isn't optional anymore.</p>
            </div>
          </div>
          <div className="w-[32vw] flex flex-col justify-center">
            <div className="rounded-[1vw] p-[2.5vw] border" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-[2vw] font-bold mb-[2.5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>The Trust Gap is Real</h3>
              <div className="flex flex-col gap-[2vh]">
                <div>
                  <div className="flex justify-between items-baseline mb-[0.5vh]">
                    <span className="text-[1.3vw]" style={{ color: 'var(--text-secondary)' }}>Agents deployed without identity</span>
                    <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: '#F87171' }}>94%</span>
                  </div>
                  <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                    <div className="h-full rounded-full" style={{ width: '94%', background: '#EF4444' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-[0.5vh]">
                    <span className="text-[1.3vw]" style={{ color: 'var(--text-secondary)' }}>Enterprises citing trust as blocker</span>
                    <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>78%</span>
                  </div>
                  <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                    <div className="h-full rounded-full" style={{ width: '78%', background: 'var(--accent-amber)' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-[0.5vh]">
                    <span className="text-[1.3vw]" style={{ color: 'var(--text-secondary)' }}>Infrastructure solutions available</span>
                    <span className="text-[1.8vw] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>0</span>
                  </div>
                  <div className="w-full h-[0.5vh] rounded-full" style={{ background: 'var(--bg-card)' }}>
                    <div className="h-full rounded-full w-0" style={{ background: 'var(--accent-blue)' }} />
                  </div>
                </div>
              </div>
              <p className="text-[1.2vw] mt-[2vh] leading-relaxed" style={{ color: 'var(--text-muted)' }}>The problem just became unavoidable. No infrastructure exists to solve it. The window is now.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
