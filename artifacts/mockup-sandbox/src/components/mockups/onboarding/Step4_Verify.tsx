export function Step4_Verify() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0c14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#e8e8f0',
      padding: 32,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 480,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <StepIndicator current={4} total={6} />
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 28, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 8px', textAlign: 'center',
        }}>Verify ownership</h1>
        <p style={{
          fontSize: 14, color: 'rgba(232,232,240,0.45)',
          lineHeight: 1.6, margin: '0 0 32px', textAlign: 'center',
        }}>Prove you control this agent. You can skip and verify later.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VerifyOption
            icon="🔑"
            title="GitHub Gist"
            desc="Sign a verification token in a public gist"
            recommended
          />
          <VerifyOption
            icon="💎"
            title="Wallet Signature"
            desc="Sign with an EVM or Solana wallet"
          />
          <VerifyOption
            icon="🔒"
            title="Manual Key Signing"
            desc="Sign the challenge with your agent's private key"
          />
        </div>

        <div style={{
          marginTop: 20,
          padding: '16px 20px',
          background: 'rgba(245,166,35,0.06)',
          border: '1px solid rgba(245,166,35,0.12)',
          borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f5a623', marginBottom: 4 }}>
              Why verify?
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5 }}>
              Verified agents get a trust score boost and a verified badge on their profile. Unverified agents can still operate but have limited discovery.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button style={{
            padding: '12px 28px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(232,232,240,0.5)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>Back</button>
          <button style={{
            padding: '12px 28px', borderRadius: 10,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(232,232,240,0.4)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>Skip for now</button>
          <button style={{
            padding: '12px 28px', borderRadius: 10,
            background: '#4f7df3',
            border: 'none',
            color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Verify →</button>
        </div>
      </div>
    </div>
  );
}

function VerifyOption({ icon, title, desc, recommended }: {
  icon: string; title: string; desc: string; recommended?: boolean;
}) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: recommended ? 'rgba(79,125,243,0.06)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${recommended ? 'rgba(79,125,243,0.2)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14, padding: '18px 20px',
      cursor: 'pointer', textAlign: 'left',
      width: '100%',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: recommended ? 'rgba(79,125,243,0.1)' : 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f0' }}>{title}</span>
          {recommended && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#4f7df3',
              background: 'rgba(79,125,243,0.12)',
              padding: '2px 7px', borderRadius: 4,
            }}>RECOMMENDED</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}>{desc}</div>
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: `2px solid ${recommended ? '#4f7df3' : 'rgba(255,255,255,0.1)'}`,
        flexShrink: 0,
      }} />
    </button>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 6, marginBottom: 24,
    }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current - 1 ? 24 : 8,
          height: 4,
          borderRadius: 2,
          background: i < current ? '#4f7df3' : 'rgba(255,255,255,0.08)',
        }} />
      ))}
    </div>
  );
}
