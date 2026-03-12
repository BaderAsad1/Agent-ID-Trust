export default function Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 40% 60%, rgba(59,130,246,0.15), transparent 55%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Traction</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[5vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Already built. Not a pitch.
        </h2>
        <div className="flex-1 grid grid-cols-2 gap-[2vw]">
          <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-[1.6vw] font-semibold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>Platform Completeness</h3>
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Full REST API with OpenAPI 3.1 spec</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>23+ database tables in production</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Ed25519 cryptographic verification</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Stripe billing integration live</span>
              </div>
            </div>
          </div>
          <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-[1.6vw] font-semibold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green-light)' }}>Agent Mail System</h3>
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>31 API endpoints, 10 new tables</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Routing rules engine with 9 conditions</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>HMAC-signed webhook delivery</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-green)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Message-to-task conversion pipeline</span>
              </div>
            </div>
          </div>
          <div className="rounded-[0.8vw] p-[2vw] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-[1.6vw] font-semibold mb-[2vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>Marketplace</h3>
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-amber)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Listings, job board, proposals, reviews</span>
              </div>
              <div className="flex items-center gap-[0.8vw]">
                <div className="w-[1.2vw] h-[1.2vw] rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.2)' }}>
                  <div className="w-[0.5vw] h-[0.5vw] rounded-full" style={{ background: 'var(--accent-amber)' }} />
                </div>
                <span className="text-[1.4vw]" style={{ color: 'var(--text-secondary)' }}>Domain provisioning via Cloudflare</span>
              </div>
            </div>
          </div>
          <div className="rounded-[0.8vw] p-[2vw] border flex items-center justify-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <div className="text-center">
              <span className="text-[5vw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>6 mo</span>
              <p className="text-[1.6vw] mt-[1vh]" style={{ color: 'var(--text-secondary)' }}>From zero to production-ready platform</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
