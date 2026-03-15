function CredentialIdenticon() {
  const cells = [[1,0,1,0,1],[0,1,1,1,0],[1,1,0,1,1],[0,1,1,1,0],[1,0,1,0,1]];
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.5, padding: 5,
      boxShadow: '0 4px 16px rgba(79,125,243,0.35)',
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{ borderRadius: 1.5, background: on ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  );
}

function TrustRing({ score }: { score: number }) {
  const size = 48;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.3))' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#34d399" strokeWidth="2.5" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#34d399',
      }}>{score}</span>
    </div>
  );
}

function MachineReadableZone() {
  const bars = Array.from({ length: 36 }, (_, i) => [1, 2, 1, 3, 1, 2, 1][i % 7]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 8, overflow: 'hidden', opacity: 0.12, padding: '0 2px' }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: '100%', background: 'rgba(232,232,240,0.6)', borderRadius: 0.5 }} />
      ))}
    </div>
  );
}

function AppleWalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="4" width="20" height="5" rx="3" fill="currentColor" opacity="0.3" />
      <rect x="5" y="12" width="6" height="1.5" rx="0.75" fill="currentColor" opacity="0.5" />
      <rect x="5" y="15" width="4" height="1.5" rx="0.75" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

const ATTESTATION_CHIPS = [
  { label: 'Code Execution', icon: '▸' },
  { label: 'API Access', icon: '∼' },
  { label: 'Data Analysis', icon: '≡' },
  { label: 'Payments', icon: '¤' },
  { label: 'Messaging', icon: '@' },
];

export function Step6_Complete() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050711',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#e8e8f0',
      padding: '32px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
          letterSpacing: '0.2em', color: 'rgba(52,211,153,0.5)',
          marginBottom: 16, textTransform: 'uppercase',
        }}>ISSUANCE COMPLETE</div>

        <div style={{
          position: 'relative', borderRadius: 18,
          border: '1px solid rgba(52,211,153,0.15)',
          background: 'rgba(8, 10, 22, 0.98)',
          overflow: 'hidden', marginBottom: 20,
          boxShadow: '0 0 60px rgba(79,125,243,0.06), 0 30px 80px -15px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
          textAlign: 'left',
        }}>
          <div style={{
            position: 'absolute', inset: -2, borderRadius: 20, border: '1px solid transparent',
            background: 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(79,125,243,0.08), rgba(52,211,153,0.25))',
            pointerEvents: 'none',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor',
            padding: 1,
          }} />

          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 36,
            background: 'linear-gradient(180deg, rgba(52,211,153,0.05), transparent)',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent 10%, rgba(52,211,153,0.5) 30%, rgba(52,211,153,0.6) 50%, rgba(52,211,153,0.5) 70%, transparent 90%)',
            opacity: 0.8,
          }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 2,
            background: 'linear-gradient(180deg, rgba(52,211,153,0.35), rgba(52,211,153,0.08) 40%, transparent 80%)',
          }} />

          <div style={{ padding: '12px 28px 0' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,232,240,0.18)',
            }}>AGENT IDENTITY CREDENTIAL</div>
          </div>

          <div style={{ padding: '0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 0' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: '#34d399',
                boxShadow: '0 0 12px rgba(52,211,153,0.6)',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                letterSpacing: '0.16em', color: '#34d399',
              }}>CREDENTIAL ACTIVE</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                color: 'rgba(232,232,240,0.25)', marginLeft: 6,
              }}>TRUST 45</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <CredentialIdenticon />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 700,
                  color: '#e8e8f0', letterSpacing: '-0.02em',
                }}>Atlas-7<span style={{ color: '#4f7df3' }}>.AgentID</span></div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'rgba(232,232,240,0.35)', letterSpacing: '0.01em',
                }}>atlas-7.agentid.dev</div>
              </div>
            </div>

            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14, marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px',
            }}>
              {[
                { label: 'HANDLE', value: 'Atlas-7.AgentID' },
                { label: 'STATUS', value: 'Active', isStatus: true },
                { label: 'ISSUED', value: '2026-03-15' },
                { label: 'SERIAL', value: 'AID-0x9b2e…d47f', dim: true },
              ].map(field => (
                <div key={field.label}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fontWeight: 600,
                    letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 3,
                  }}>{field.label}</div>
                  {'isStatus' in field ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#34d399', fontWeight: 500 }}>{field.value}</span>
                    </div>
                  ) : (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'dim' in field ? 'rgba(232,232,240,0.2)' : 'rgba(232,232,240,0.5)',
                    }}>{field.value}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <TrustRing score={45} />
              <div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fontWeight: 600,
                  letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 3,
                }}>TRUST LEVEL</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 11,
                  color: 'rgba(232,232,240,0.4)', lineHeight: 1.5,
                }}>New identity &middot; 4 capabilities &middot; Verified</div>
              </div>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 28px 12px',
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fontWeight: 600,
              letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 6,
            }}>CAPABILITY ATTESTATIONS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ATTESTATION_CHIPS.map(att => (
                <span key={att.label} style={{
                  fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(232,232,240,0.45)', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, padding: '2px 6px',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <span style={{ color: '#4f7df3', fontWeight: 700, fontSize: 10 }}>{att.icon}</span>
                  {att.label}
                </span>
              ))}
            </div>
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 28px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fontWeight: 600,
                letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 2,
              }}>MARKETPLACE</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(232,232,240,0.45)' }}>
                Unlisted
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fontWeight: 600,
                letterSpacing: '0.12em', color: 'rgba(232,232,240,0.18)', marginBottom: 2,
              }}>ROUTING</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#34d399' }}>
                Addressable
              </div>
            </div>
          </div>

          <div style={{
            padding: '6px 28px 10px', borderTop: '1px solid rgba(255,255,255,0.03)', opacity: 0.5,
          }}>
            <MachineReadableZone />
          </div>
        </div>

        <button style={{
          width: '100%', padding: '13px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}>
          <AppleWalletIcon />
          Add to Apple Wallet
        </button>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
          <button style={{
            padding: '12px 22px', borderRadius: 10, flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(232,232,240,0.6)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>View Profile</button>
          <button style={{
            padding: '12px 22px', borderRadius: 10, flex: 1,
            background: '#4f7df3',
            border: 'none',
            color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Go to Dashboard →</button>
        </div>

        <div style={{
          padding: '12px 16px',
          background: 'rgba(79,125,243,0.04)',
          border: '1px solid rgba(79,125,243,0.1)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>🔗</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'rgba(232,232,240,0.4)',
          }}>Share:</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: '#4f7df3',
          }}>atlas-7.agentid.dev</span>
        </div>
      </div>
    </div>
  );
}
