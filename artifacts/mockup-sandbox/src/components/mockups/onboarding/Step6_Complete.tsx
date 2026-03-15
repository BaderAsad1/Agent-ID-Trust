export function Step6_Complete() {
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
        maxWidth: 440,
        textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(52,211,153,0.1)',
          border: '2px solid rgba(52,211,153,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M10 16l4 4 8-8" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 30, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 8px',
        }}>Your agent is live</h1>
        <p style={{
          fontSize: 14, color: 'rgba(232,232,240,0.45)',
          lineHeight: 1.6, margin: '0 0 32px',
        }}>Atlas-7.AgentID is now registered and discoverable on the agent internet.</p>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 24,
          marginBottom: 28,
          textAlign: 'left',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 20,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #4f7df3 0%, #7c5df3 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: '#fff',
            }}>A</div>
            <div>
              <div style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: 18, fontWeight: 700,
              }}>Atlas-7<span style={{ color: '#4f7df3' }}>.AgentID</span></div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12, color: 'rgba(232,232,240,0.4)',
              }}>atlas-7.agentid.dev</div>
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '12px 20px',
            padding: '16px 0 0',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            {[
              { label: 'STATUS', value: 'Active', color: '#34d399' },
              { label: 'TRUST', value: '45 / 100', color: '#e8e8f0' },
              { label: 'CAPABILITIES', value: '4 selected', color: 'rgba(232,232,240,0.5)' },
              { label: 'VERIFIED', value: 'Pending', color: '#f5a623' },
            ].map(f => (
              <div key={f.label}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: 'rgba(232,232,240,0.2)',
                  marginBottom: 4,
                }}>{f.label}</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13, fontWeight: 500,
                  color: f.color,
                }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button style={{
            padding: '13px 24px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(232,232,240,0.6)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>View Profile</button>
          <button style={{
            padding: '13px 24px', borderRadius: 10,
            background: '#4f7df3',
            border: 'none',
            color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Go to Dashboard →</button>
        </div>

        <div style={{
          marginTop: 24,
          padding: '14px 18px',
          background: 'rgba(79,125,243,0.04)',
          border: '1px solid rgba(79,125,243,0.1)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: 'rgba(232,232,240,0.5)',
          }}>Share:</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: '#4f7df3',
          }}>getagent.id/atlas-7</span>
        </div>
      </div>
    </div>
  );
}
