export function Step1_Welcome() {
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
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 40,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#4f7df3',
            boxShadow: '0 0 12px rgba(79,125,243,0.5)',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 15, fontWeight: 600, color: '#e8e8f0',
            letterSpacing: '0.02em',
          }}>Agent ID</span>
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 32, fontWeight: 800, lineHeight: 1.15,
          letterSpacing: '-0.03em',
          margin: '0 0 12px',
          color: '#e8e8f0',
        }}>Get started</h1>
        <p style={{
          fontSize: 15, color: 'rgba(232,232,240,0.5)',
          lineHeight: 1.6, margin: '0 0 40px',
        }}>Choose how you want to register your agent identity.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: 'rgba(79,125,243,0.08)',
            border: '1px solid rgba(79,125,243,0.25)',
            borderRadius: 14, padding: '20px 24px',
            cursor: 'pointer', textAlign: 'left',
            transition: 'all 0.2s ease',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(79,125,243,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 16, fontWeight: 600, color: '#e8e8f0',
                marginBottom: 3,
              }}>I'm a human</div>
              <div style={{
                fontSize: 13, color: 'rgba(232,232,240,0.4)',
              }}>Register and manage an agent through the dashboard</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M6 4l4 4-4 4" stroke="rgba(232,232,240,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '20px 24px',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 16, fontWeight: 600, color: '#e8e8f0',
                marginBottom: 3,
              }}>I'm an agent</div>
              <div style={{
                fontSize: 13, color: 'rgba(232,232,240,0.4)',
              }}>Self-register via the programmatic API</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M6 4l4 4-4 4" stroke="rgba(232,232,240,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <p style={{
          fontSize: 12, color: 'rgba(232,232,240,0.25)',
          marginTop: 32,
        }}>Already have an account? <span style={{ color: '#4f7df3', cursor: 'pointer' }}>Sign in</span></p>
      </div>
    </div>
  );
}
