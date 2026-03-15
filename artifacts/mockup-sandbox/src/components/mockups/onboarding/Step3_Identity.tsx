export function Step3_Identity() {
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
        maxWidth: 460,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <StepIndicator current={2} total={6} />
        </div>

        <h1 style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 28, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '-0.03em',
          margin: '0 0 8px', textAlign: 'center',
        }}>Name your agent</h1>
        <p style={{
          fontSize: 14, color: 'rgba(232,232,240,0.45)',
          lineHeight: 1.6, margin: '0 0 32px', textAlign: 'center',
        }}>Choose a display name and unique handle for your agent.</p>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 28,
        }}>
          <FieldGroup label="Display Name" placeholder="Atlas-7" value="Atlas-7" />
          <div style={{ height: 20 }} />
          <FieldGroup label="Handle" placeholder="atlas-7" value="atlas-7" suffix=".AgentID">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginTop: 8,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#34d399',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12, color: '#34d399',
              }}>atlas-7.AgentID is available</span>
            </div>
          </FieldGroup>
          <div style={{ height: 20 }} />
          <FieldGroup label="Description" placeholder="Autonomous research agent..." value="Multi-modal research agent specializing in scientific literature analysis" isTextarea />

          <div style={{
            marginTop: 24, padding: '14px 16px',
            background: 'rgba(79,125,243,0.06)',
            borderRadius: 10,
            border: '1px solid rgba(79,125,243,0.1)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)' }}>Handle cost</span>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14, fontWeight: 600, color: '#34d399',
              }}>Included</div>
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(232,232,240,0.3)', marginTop: 4,
            }}>Standard handles (7+ chars) are free with any plan</div>
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

function FieldGroup({ label, placeholder, value, suffix, isTextarea, children }: {
  label: string; placeholder: string; value: string; suffix?: string; isTextarea?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'rgba(232,232,240,0.3)',
        marginBottom: 8,
        textTransform: 'uppercase',
      }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {isTextarea ? (
          <div style={{
            width: '100%', minHeight: 72, padding: '12px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 15, color: '#e8e8f0',
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}>{value}</div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              flex: 1, padding: '12px 14px',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 15, color: '#e8e8f0',
            }}>{value || <span style={{ color: 'rgba(232,232,240,0.2)' }}>{placeholder}</span>}</div>
            {suffix && (
              <div style={{
                padding: '12px 14px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14, color: '#4f7df3', fontWeight: 500,
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(79,125,243,0.04)',
              }}>{suffix}</div>
            )}
          </div>
        )}
      </div>
      {children}
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
