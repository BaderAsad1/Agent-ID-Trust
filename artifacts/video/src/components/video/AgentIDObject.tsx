import { motion } from 'framer-motion';
import { elementAnimations } from '@/lib/video/animations';

const OBJECT_FIELDS = [
  { key: 'handle', label: '@research-agent', mono: true, dimLabel: 'handle' },
  { key: 'domain', label: 'research-agent.agent', mono: true, dimLabel: 'domain', color: 'var(--color-accent)' },
  { key: 'owner', label: 'Verified — key_0x7f3a...c291', mono: true, dimLabel: 'owner', color: 'var(--color-success)' },
  { key: 'trust', label: '94', dimLabel: 'trust score', special: 'trust' },
  { key: 'caps', label: 'research · web-search · summarization · citation', mono: true, dimLabel: 'capabilities' },
  { key: 'endpoint', label: 'https://ra.example.com/tasks', mono: true, dimLabel: 'endpoint' },
  { key: 'logs', label: '2,847 signed entries', mono: true, dimLabel: 'activity log' },
  { key: 'protocols', label: 'MCP · A2A · REST', mono: true, dimLabel: 'protocols' },
];

export function AgentIDObject({ 
  className = '', 
  animateIn = false, 
  delay = 0 
}: { 
  className?: string;
  animateIn?: boolean;
  delay?: number;
}) {
  return (
    <motion.div 
      className={`relative rounded-2xl overflow-hidden backdrop-blur-md ${className}`}
      style={{
        background: 'rgba(10, 12, 22, 0.6)',
        border: '1px solid rgba(226, 232, 240, 0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
      initial={animateIn ? { opacity: 0, y: 40, scale: 0.95 } : {}}
      animate={animateIn ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay }}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
      
      <div className="p-[6vw]" style={{ padding: '1.5vw' }}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'var(--color-bg-muted)' }}>
              <div className="w-8 h-8 rounded-full" style={{ background: 'var(--color-accent)' }} />
            </div>
            <div>
              <div className="text-lg font-bold text-primary" style={{ fontFamily: 'var(--font-display)' }}>Research Agent</div>
              <div className="text-xs text-text-muted mt-1" style={{ fontFamily: 'var(--font-mono)' }}>agt_01j9x4k2mw</div>
            </div>
          </div>
          
          <motion.div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full" 
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
            initial={animateIn ? { opacity: 0, scale: 0.8 } : {}}
            animate={animateIn ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: delay + 0.8, duration: 0.5, type: 'spring' }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--color-success)' }} />
            <span className="text-[11px] font-bold tracking-wider uppercase text-success" style={{ fontFamily: 'var(--font-mono)' }}>Verified</span>
          </motion.div>
        </div>

        <div className="space-y-4">
          {OBJECT_FIELDS.map((f, i) => (
            <motion.div
              key={f.key}
              initial={animateIn ? { opacity: 0, x: -10 } : { opacity: 1 }}
              animate={animateIn ? { opacity: 1, x: 0 } : { opacity: 1 }}
              transition={{ delay: delay + 0.4 + (i * 0.1), duration: 0.5 }}
              className="flex items-baseline justify-between py-2 border-b border-white/5 last:border-0"
            >
              <span className="text-xs tracking-[0.12em] uppercase text-text-muted w-1/3" style={{ fontFamily: 'var(--font-mono)' }}>
                {f.dimLabel}
              </span>
              
              {f.special === 'trust' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-success" style={{ fontFamily: 'var(--font-display)' }}>94</span>
                </div>
              ) : (
                <span
                  className="text-sm text-right w-2/3 truncate"
                  style={{
                    fontFamily: f.mono ? 'var(--font-mono)' : 'var(--font-body)',
                    color: f.color || 'var(--color-text-secondary)',
                  }}
                >
                  {f.label}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-6 pt-4 flex items-center justify-between border-t border-white/10">
          <div className="flex gap-2">
            {['MCP', 'A2A', 'REST'].map((p, i) => (
              <motion.span 
                key={p} 
                initial={animateIn ? { opacity: 0, y: 5 } : { opacity: 1 }}
                animate={animateIn ? { opacity: 1, y: 0 } : { opacity: 1 }}
                transition={{ delay: delay + 1.2 + (i * 0.1) }}
                className="text-xs px-2 py-1 rounded" 
                style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
              >
                {p}
              </motion.span>
            ))}
          </div>
          <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-mono)' }}>agentid/v1</span>
        </div>
      </div>
    </motion.div>
  );
}
