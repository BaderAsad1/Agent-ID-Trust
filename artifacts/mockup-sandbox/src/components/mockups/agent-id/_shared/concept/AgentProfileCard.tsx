import type { AnimationPhase } from './useHeroAnimation';

const CAPS = ['Code Execution', 'API Access', 'Data Analysis', 'Web Browsing', 'File I/O'];

function Identicon({ visible }: { visible: boolean }) {
  const cells = [
    [1,0,1,0,1],
    [0,1,1,1,0],
    [1,1,0,1,1],
    [0,1,1,1,0],
    [1,0,1,0,1],
  ];
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: 'linear-gradient(135deg, var(--accent-blue), #7c5bf5)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: 6,
      transform: visible ? 'scale(1)' : 'scale(0.3)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
    }}>
      {cells.flat().map((on, i) => (
        <div key={i} style={{
          borderRadius: 2,
          background: on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.1)',
        }} />
      ))}
    </div>
  );
}

function TrustRing({ phase }: { phase: AnimationPhase }) {
  const size = 52;
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = phase.trustRing ? circ - (phase.trustCount / 100) * circ : circ;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{
        transform: 'rotate(-90deg)',
        animation: phase.alive ? 'concept-ring-pulse 3s ease-in-out infinite' : 'none',
      }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--border-color)" strokeWidth="2.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--trust-green)" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
        color: 'var(--trust-green)',
        opacity: phase.trustRing ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>{phase.trustCount}</span>
    </div>
  );
}

export function AgentProfileCard({ phase }: { phase: AnimationPhase }) {
  return (
    <div style={{
      position: 'relative',
      width: 380, maxWidth: '90vw',
      borderRadius: 20,
      border: '1px solid var(--border-color-strong)',
      background: 'var(--bg-card)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden',
      opacity: phase.frame ? 1 : 0,
      transform: phase.frame ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
      filter: phase.frame ? 'blur(0px)' : 'blur(8px)',
      transition: 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94), filter 0.8s ease',
      animation: phase.alive ? 'concept-breathe 4s ease-in-out infinite, concept-float 6s ease-in-out infinite' : 'none',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        height: 1,
        background: 'var(--accent-gradient)',
        animation: phase.alive ? 'concept-topline 1.2s ease-out forwards' : 'none',
        width: phase.alive ? undefined : 0,
        opacity: phase.alive ? undefined : 0,
      }} />

      <div style={{ padding: '28px 28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <Identicon visible={phase.avatar} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18, fontWeight: 600, color: 'var(--text-primary)',
              opacity: phase.name ? 1 : 0,
              transform: phase.name ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
              marginBottom: 4,
            }}>Atlas-7</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--accent-blue)',
              opacity: phase.handle ? 1 : 0,
              transform: phase.handle ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>agent.id/atlas-7</div>
          </div>
          <TrustRing phase={phase} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          opacity: phase.domain ? 1 : 0,
          transform: phase.domain ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--text-secondary)',
            background: 'var(--chip-bg)',
            border: '1px solid var(--chip-border)',
            borderRadius: 20, padding: '3px 10px',
          }}>atlas-7.agent.id</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 600,
            color: 'var(--trust-green)',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 20, padding: '3px 10px',
            animation: phase.seal ? 'concept-seal-flash 0.5s ease-out forwards' : 'none',
            opacity: phase.seal ? undefined : 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.5 5.5a.75.75 0 0 0-1.06 0L7 8.94 5.56 7.5a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4-4a.75.75 0 0 0-.06-1.06z"/>
            </svg>
            Verified
          </span>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {CAPS.map((cap, i) => (
            <span key={cap} style={{
              fontSize: 11, fontFamily: 'var(--font-body)',
              color: 'var(--text-secondary)',
              background: 'var(--chip-bg)',
              border: '1px solid var(--chip-border)',
              borderRadius: 6, padding: '4px 10px',
              opacity: phase.chips ? 1 : 0,
              transform: phase.chips ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.9)',
              transition: `opacity 0.35s ease ${i * 80}ms, transform 0.35s ease ${i * 80}ms`,
            }}>{cap}</span>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--border-color)',
        padding: '14px 28px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: phase.footer ? 1 : 0,
        transform: phase.footer ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Marketplace</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Listed &middot; 4.9 &#9733;</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Uptime</div>
          <div style={{ fontSize: 12, color: 'var(--trust-green)', fontFamily: 'var(--font-mono)' }}>99.97%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Invocations</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>1.2M</div>
        </div>
      </div>
    </div>
  );
}
