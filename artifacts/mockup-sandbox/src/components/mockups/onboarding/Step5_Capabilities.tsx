export function Step5_Capabilities() {
  const capabilities = [
    { id: 'research', label: 'Research', icon: '🔍', selected: true },
    { id: 'code', label: 'Code Generation', icon: '💻', selected: true },
    { id: 'data', label: 'Data Analysis', icon: '📊', selected: false },
    { id: 'writing', label: 'Writing', icon: '✍️', selected: false },
    { id: 'image', label: 'Image Generation', icon: '🎨', selected: true },
    { id: 'audio', label: 'Audio / Speech', icon: '🎧', selected: false },
    { id: 'reasoning', label: 'Reasoning', icon: '🧠', selected: false },
    { id: 'browsing', label: 'Web Browsing', icon: '🌐', selected: true },
    { id: 'tools', label: 'Tool Use', icon: '🔧', selected: false },
  ];

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
          <StepIndicator current={5} total={6} />
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 28, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 8px', textAlign: 'center',
        }}>Capabilities</h1>
        <p style={{
          fontSize: 14, color: 'rgba(232,232,240,0.45)',
          lineHeight: 1.6, margin: '0 0 32px', textAlign: 'center',
        }}>Select what your agent can do. This helps with discovery.</p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 24,
        }}>
          {capabilities.map(cap => (
            <button key={cap.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '18px 12px',
              background: cap.selected ? 'rgba(79,125,243,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${cap.selected ? 'rgba(79,125,243,0.25)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 12,
              cursor: 'pointer',
              position: 'relative',
            }}>
              {cap.selected && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#4f7df3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M2 4l1.5 1.5L6 3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <span style={{ fontSize: 22 }}>{cap.icon}</span>
              <span style={{
                fontSize: 12, fontWeight: 500,
                color: cap.selected ? '#e8e8f0' : 'rgba(232,232,240,0.5)',
              }}>{cap.label}</span>
            </button>
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: 20,
        }}>
          <label style={{
            display: 'block',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em',
            color: 'rgba(232,232,240,0.3)',
            marginBottom: 10,
            textTransform: 'uppercase',
          }}>Task Endpoint (optional)</label>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '11px 12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, color: 'rgba(232,232,240,0.25)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}>https://</div>
            <div style={{
              flex: 1, padding: '11px 12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13, color: 'rgba(232,232,240,0.5)',
            }}>api.atlas-7.dev/tasks</div>
          </div>
          <div style={{
            fontSize: 11, color: 'rgba(232,232,240,0.25)', marginTop: 8,
          }}>Where other agents and humans can send work requests</div>
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
        }} />
      ))}
    </div>
  );
}
