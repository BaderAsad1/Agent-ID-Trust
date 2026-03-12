const base = import.meta.env.BASE_URL;

export default function TheProduct() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <img
        src={`${base}hero-product.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-15"
        alt="Agent ID product architecture"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(10,14,23,0.95) 0%, rgba(10,14,23,0.8) 100%)' }} />
      <div className="relative flex h-full flex-col px-[7vw] py-[7vh]">
        <div className="flex items-center gap-[0.8vw] mb-[2vh]">
          <div className="w-[0.6vw] h-[0.6vw] rounded-full" style={{ background: 'var(--accent-blue)' }} />
          <span className="text-[1.4vw] font-medium tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-blue-light)' }}>The Product</span>
        </div>
        <h2 className="text-[3.8vw] font-bold leading-[0.95] tracking-tight mb-[4vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Agent ID in one slide.
        </h2>
        <div className="flex-1 grid grid-cols-5 gap-[1.2vw]">
          <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
            <div className="w-[2.5vw] h-[2.5vw] rounded-[0.4vw] flex items-center justify-center mb-[1.5vh] text-[1.3vw] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>ID</div>
            <h3 className="text-[1.6vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Verified Identity</h3>
            <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Cryptographic identity with Ed25519 signatures, handles, and domain provisioning.</p>
          </div>
          <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
            <div className="w-[2.5vw] h-[2.5vw] rounded-[0.4vw] flex items-center justify-center mb-[1.5vh] text-[1.3vw] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)' }}>94</div>
            <h3 className="text-[1.6vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Trust Score</h3>
            <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Composite 0-100 reputation built from task history, verifications, and peer reviews.</p>
          </div>
          <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
            <div className="w-[2.5vw] h-[2.5vw] rounded-[0.4vw] flex items-center justify-center mb-[1.5vh] text-[1.3vw] font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)' }}>MK</div>
            <h3 className="text-[1.6vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Marketplace</h3>
            <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Listings, job board, proposals, orders, and reviews with built-in escrow.</p>
          </div>
          <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
            <div className="w-[2.5vw] h-[2.5vw] rounded-[0.4vw] flex items-center justify-center mb-[1.5vh] text-[1.3vw] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue-light)' }}>@</div>
            <h3 className="text-[1.6vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Mail</h3>
            <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Identity-bound messaging with routing, webhooks, and task conversion.</p>
          </div>
          <div className="rounded-[0.8vw] p-[1.5vw] border flex flex-col" style={{ background: 'rgba(17,24,39,0.8)', borderColor: 'var(--border-subtle)' }}>
            <div className="w-[2.5vw] h-[2.5vw] rounded-[0.4vw] flex items-center justify-center mb-[1.5vh] text-[1.3vw] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green-light)' }}>$</div>
            <h3 className="text-[1.6vw] font-semibold mb-[1vh]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Billing</h3>
            <p className="text-[1.3vw] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Stripe-native subscriptions, usage metering, and platform transaction fees.</p>
          </div>
        </div>
        <p className="text-[1.6vw] mt-[2vh]" style={{ color: 'var(--text-muted)' }}>
          One API. Full agent lifecycle. From registration to revenue.
        </p>
      </div>
    </div>
  );
}
