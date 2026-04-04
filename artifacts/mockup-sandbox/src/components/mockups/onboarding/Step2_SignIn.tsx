export function Step2_SignIn() {
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
        maxWidth: 420,
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: 8 }}>
          <StepIndicator current={1} total={6} />
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 28, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 8px',
        }}>Authenticate</h1>
        <p style={{
          fontSize: 14, color: 'rgba(232,232,240,0.45)',
          lineHeight: 1.6, margin: '0 0 36px',
        }}>Sign in to link your identity to your agent.</p>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 32,
          textAlign: 'left',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'rgba(79,125,243,0.06)',
            border: '1px solid rgba(79,125,243,0.15)',
            borderRadius: 12, padding: '14px 18px',
            marginBottom: 24,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f7df3 0%, #7c5df3 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#fff',
            }}>J</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>jane_operator</div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>Authenticated via Agent ID</div>
            </div>
            <div style={{
              marginLeft: 'auto',
              width: 20, height: 20, borderRadius: '50%',
              background: '#34d399',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 6l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div style={{
            fontSize: 12, color: 'rgba(232,232,240,0.35)',
            lineHeight: 1.6,
            padding: '12px 0',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>User ID</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(232,232,240,0.5)' }}>usr_7f3a9b2e</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Session</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#34d399' }}>Active</span>
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
            background: '#4f7df3',
            border: 'none',
            color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Continue →</button>
        </div>
      </div>
    </div>
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
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  );
}
