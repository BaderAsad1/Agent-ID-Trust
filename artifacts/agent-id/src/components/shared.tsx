import { useState } from 'react';
import { Copy, Check, ExternalLink, Loader2 } from 'lucide-react';

export function AgentHandle({ handle, showPrefix = true, size = 'md' }: { handle: string; showPrefix?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const [copied, setCopied] = useState(false);
  const sizeClasses = { sm: 'text-xs px-1.5 py-0.5', md: 'text-sm px-2 py-1', lg: 'text-base px-3 py-1.5' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md ${sizeClasses[size]} cursor-pointer group`}
      style={{ fontFamily: 'var(--font-mono)', background: 'rgba(59,130,246,0.1)', color: 'var(--text-primary)' }}
      onClick={() => { navigator.clipboard.writeText(`getagent.id/${handle}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {showPrefix && <span style={{ color: 'var(--text-muted)' }}>getagent.id/</span>}
      <span>{handle}</span>
      {copied ? <Check className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--success)' }} /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />}
    </span>
  );
}

export function DomainBadge({ domain, size = 'md' }: { domain: string; size?: 'sm' | 'md' | 'lg' }) {
  const [copied, setCopied] = useState(false);
  const sizeClasses = { sm: 'text-xs px-1.5 py-0.5', md: 'text-sm px-2 py-1', lg: 'text-lg px-3 py-1.5' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${sizeClasses[size]} cursor-pointer group`}
      style={{ fontFamily: 'var(--font-mono)', background: 'var(--domain-bg)', color: 'var(--domain)' }}
      onClick={() => { navigator.clipboard.writeText(domain); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {domain}
      {copied ? <Check className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </span>
  );
}

export function TrustScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-color)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ fontFamily: 'var(--font-body)', color }}>{score}</span>
    </div>
  );
}

export function StatusDot({ status }: { status: 'active' | 'inactive' | 'draft' | 'propagating' | 'verified' | 'pending' | 'unverified' }) {
  const colors: Record<string, string> = { active: 'var(--success)', inactive: 'var(--text-dim)', draft: 'var(--text-dim)', propagating: 'var(--warning)', verified: 'var(--success)', pending: 'var(--warning)', unverified: 'var(--text-dim)' };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full ${status === 'active' ? 'animate-pulse-dot' : status === 'propagating' ? 'animate-pulse-dot' : ''}`}
        style={{ backgroundColor: colors[status] }}
      />
      <span className="text-xs capitalize" style={{ color: colors[status] }}>{status}</span>
    </span>
  );
}

export function CapabilityChip({ label, variant = 'default' }: { label: string; variant?: 'default' | 'purple' }) {
  return (
    <span
      className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-opacity-60"
      style={{
        borderColor: variant === 'purple' ? 'rgba(139,92,246,0.3)' : 'var(--border-color)',
        color: 'var(--text-muted)',
        background: variant === 'purple' ? 'rgba(139,92,246,0.08)' : 'transparent',
      }}
    >
      {label}
    </span>
  );
}

export function Identicon({ handle, size = 40 }: { handle: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) { hash = handle.charCodeAt(i) + ((hash << 5) - hash); }
  const hue = Math.abs(hash % 360);
  const cells = [];
  for (let i = 0; i < 25; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const mirrorCol = col > 2 ? 4 - col : col;
    const idx = row * 3 + mirrorCol;
    const filled = ((hash >> (idx % 16)) & 1) === 1;
    if (filled) {
      cells.push(<rect key={i} x={col * 10} y={row * 10} width="10" height="10" fill={`hsl(${hue}, 65%, 55%)`} />);
    }
  }
  return (
    <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: size, height: size, background: 'var(--bg-elevated)' }}>
      <svg viewBox="0 0 50 50" width={size} height={size}>{cells}</svg>
    </div>
  );
}

export function SectionHeading({ children, sub, left = false }: { children: React.ReactNode; sub?: string; left?: boolean }) {
  return (
    <div className={`${left ? '' : 'text-center'} mb-12`}>
      <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{children}</h2>
      {sub && <p className={`text-lg ${left ? '' : 'max-w-2xl mx-auto'}`} style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

export function GlassCard({ children, className = '', hover = false, purple = false, onClick }: { children: React.ReactNode; className?: string; hover?: boolean; purple?: boolean; onClick?: () => void }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${hover ? 'transition-all duration-150 hover:-translate-y-0.5 cursor-pointer' : ''} ${className}`}
      style={{
        background: 'var(--bg-surface)',
        borderColor: purple ? 'rgba(139,92,246,0.3)' : 'var(--border-color)',
        boxShadow: purple ? '0 0 20px rgba(139,92,246,0.05)' : '0 1px 3px rgba(0,0,0,0.2)',
      }}
      onClick={onClick}
      onMouseEnter={e => { if (hover && purple) (e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,92,246,0.15)'); else if (hover) (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'); }}
      onMouseLeave={e => { if (hover && purple) (e.currentTarget.style.boxShadow = '0 0 20px rgba(139,92,246,0.05)'); else if (hover) (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)'); }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ children, onClick, large = false, variant = 'blue', className = '', disabled = false }: { children: React.ReactNode; onClick?: () => void; large?: boolean; variant?: 'blue' | 'purple' | 'ghost' | 'danger'; className?: string; disabled?: boolean }) {
  const base = `inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 ${large ? 'px-8 py-3 text-base' : 'px-5 py-2.5 text-sm'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
  const styles: Record<string, React.CSSProperties> = {
    blue: { background: 'var(--accent)', color: '#fff' },
    purple: { background: 'var(--marketplace)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)' },
    danger: { background: 'var(--danger)', color: '#fff' },
  };
  return (
    <button className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 px-5 py-2.5 text-sm cursor-pointer w-full border-t-[0.5px] border-r-[0.5px] border-b-[0.5px] border-l-[0.5px]" style={{ fontFamily: 'var(--font-body)', ...styles[variant] }} onClick={disabled ? undefined : onClick} aria-label={typeof children === 'string' ? children : undefined}>
      {children}
    </button>
  );
}

export function InputField({ label, placeholder, type = 'text', value, onChange, prefix, suffix, mono = false, maxLength, charCount }: {
  label?: string; placeholder?: string; type?: string; value?: string; onChange?: (v: string) => void; prefix?: string; suffix?: React.ReactNode; mono?: boolean; maxLength?: number; charCount?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{prefix}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          maxLength={maxLength}
          aria-label={label || placeholder}
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--border-focus)]"
          style={{
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
            background: 'var(--bg-base)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
            paddingLeft: prefix ? `${prefix.length * 8 + 16}px` : undefined,
          }}
        />
        {suffix && <div className="absolute right-3">{suffix}</div>}
      </div>
      {charCount && maxLength && value !== undefined && (
        <div className="text-xs text-right" style={{ color: value.length >= maxLength ? 'var(--danger)' : 'var(--text-dim)' }}>{value.length}/{maxLength}</div>
      )}
    </div>
  );
}

export function LoadingSpinner({ size = 16 }: { size?: number }) {
  return <Loader2 className="animate-spin-slow" style={{ width: size, height: size, color: 'var(--accent)' }} />;
}

export function AvailabilityCheck({ available }: { available: boolean | null }) {
  if (available === null) return <LoadingSpinner />;
  if (available) return <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />;
  return <span className="text-xs" style={{ color: 'var(--danger)' }}>Taken</span>;
}

export function StarRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span style={{ color: 'var(--warning)' }}>★</span>
      <span style={{ color: 'var(--text-primary)' }}>{rating.toFixed(1)}</span>
      {count !== undefined && <span style={{ color: 'var(--text-dim)' }}>({count})</span>}
    </span>
  );
}

export function EventTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    task_received: 'var(--accent)', task_completed: 'var(--success)', marketplace_hire: 'var(--marketplace)',
    verification_event: 'var(--domain)', capability_updated: 'var(--warning)', profile_viewed: 'var(--text-muted)',
    domain_active: 'var(--domain)', payment_received: 'var(--success)',
  };
  const labels: Record<string, string> = {
    task_received: 'Task', task_completed: 'Done', marketplace_hire: 'Hire',
    verification_event: 'Verify', capability_updated: 'Update', profile_viewed: 'View',
    domain_active: 'DNS', payment_received: 'Pay',
  };
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded" style={{ background: `${colors[type]}20`, color: colors[type] }}>
      {labels[type] || type}
    </span>
  );
}

export function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80" style={{ color: 'var(--accent)' }}>
      {children} <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function Skeleton({ w, h = 16, rounded = 'md', className = '' }: { w?: number | string; h?: number | string; rounded?: 'sm' | 'md' | 'lg' | 'full'; className?: string }) {
  const r = { sm: '4px', md: '8px', lg: '12px', full: '9999px' };
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w || '100%',
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: r[rounded],
        background: 'linear-gradient(90deg, var(--bg-elevated) 25%, rgba(30,41,59,0.6) 50%, var(--bg-elevated) 75%)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border p-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton w={40} h={40} rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton w={120} h={14} />
          <Skeleton w={80} h={10} />
        </div>
        <Skeleton w={32} h={32} rounded="full" />
      </div>
      <Skeleton h={12} className="mb-2" />
      <Skeleton w="80%" h={12} className="mb-4" />
      <div className="flex gap-2">
        <Skeleton w={60} h={24} rounded="full" />
        <Skeleton w={60} h={24} rounded="full" />
        <Skeleton w={60} h={24} rounded="full" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
          <Skeleton w={60} h={12} />
          <Skeleton w={50} h={20} rounded="sm" />
          <Skeleton h={12} className="flex-1" />
          <Skeleton w={60} h={12} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{title}</h3>
      <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>{description}</p>
      {action}
    </div>
  );
}
