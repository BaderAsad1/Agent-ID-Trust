import { motion } from 'framer-motion';
import { LiquidGlassPanel } from './LiquidGlassPanel';

interface AgentIDObjectProps {
  className?: string;
  showVerified?: boolean;
  trustScore?: number;
  showProtocols?: boolean;
  showHandle?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
}

export function AgentIDObject({
  className = '',
  showVerified = false,
  trustScore = 0,
  showProtocols = false,
  showHandle = false,
  compact = false,
  style = {},
}: AgentIDObjectProps) {
  const protocols = ['MCP', 'A2A', 'REST'];

  return (
    <LiquidGlassPanel
      intensity={1.2}
      tint="rgba(10,12,22,0.5)"
      glow={showVerified}
      className={className}
      style={{ maxWidth: compact ? '340px' : '440px', width: '100%', ...style }}
    >
      <div style={{ padding: compact ? '24px' : '32px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: compact ? '16px' : '24px' }}>
          <div className="flex items-center gap-3">
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: compact ? '36px' : '48px',
                height: compact ? '36px' : '48px',
                background: 'linear-gradient(135deg, #4f7df3, #7c5bf5)',
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: compact ? '18px' : '24px',
                  height: compact ? '18px' : '24px',
                  background: 'rgba(255,255,255,0.3)',
                }}
              />
            </div>
            <div>
              <div
                className="font-bold"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: compact ? '14px' : '18px',
                  color: 'var(--color-text-primary)',
                }}
              >
                Research Agent
              </div>
              {showHandle && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--color-accent)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  research-7b.agent
                </motion.div>
              )}
            </div>
          </div>

          {showVerified && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(52,211,153,0.12)',
                border: '1px solid rgba(52,211,153,0.25)',
              }}
            >
              <motion.span
                className="rounded-full"
                style={{ width: '6px', height: '6px', background: 'var(--color-emerald)' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--color-emerald)',
                }}
              >
                VERIFIED
              </span>
            </motion.div>
          )}
        </div>

        {!compact && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <DataRow label="handle" value="@research-7b" />
            <DataRow label="domain" value="research-7b.agent" color="var(--color-accent)" />
            {trustScore > 0 && (
              <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  trust score
                </span>
                <motion.span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--color-emerald)',
                  }}
                >
                  {trustScore}
                </motion.span>
              </div>
            )}
            <DataRow label="owner" value="key_0x7f3a...c291" color="var(--color-success)" />
            <DataRow label="endpoint" value="https://ra.agentid.dev/tasks" />
          </div>
        )}

        {showProtocols && (
          <div
            className="flex items-center gap-2"
            style={{ marginTop: compact ? '12px' : '20px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {protocols.map((p, i) => (
              <motion.span
                key={p}
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: i * 0.15,
                  type: 'spring',
                  stiffness: 400,
                  damping: 20,
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(79,125,243,0.1)',
                  border: '1px solid rgba(79,125,243,0.15)',
                  color: 'var(--color-accent)',
                }}
              >
                {p}
              </motion.span>
            ))}
          </div>
        )}
      </div>
    </LiquidGlassPanel>
  );
}

function DataRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: color || 'var(--color-text-secondary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
