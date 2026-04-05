import { useState, useEffect, useCallback } from 'react';
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import {
  Mail as MailIcon, Send, Search, ArrowLeft, Tag, CheckCircle, XCircle,
  ShieldCheck, ShieldAlert, Bot, User, Clock, Paperclip, ChevronRight,
  Archive, RotateCcw, AlertCircle, RefreshCw, Inbox as InboxIcon,
  FileText, Filter, X, Loader2, CheckSquare, Eye, EyeOff, Code, ChevronDown, Settings,
  Star, Trash2
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api, type Agent, type MailThread, type MailMessage, type MailLabel, type MailEvent, type InboxStats, type MailInbox, type RoutingRule, type MailAttachment } from '@/lib/api';
import { Identicon, GlassCard, PrimaryButton, CardSkeleton, ListSkeleton, EmptyState } from '@/components/shared';

const DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'del', 'ins',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src', 'width', 'height',
    'style', 'class', 'id', 'rel',
    // 'target' intentionally excluded — allows open-redirect from crafted email content
    'colspan', 'rowspan', 'align', 'valign',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['svg', 'math', 'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange'],
  FORCE_BODY: true,
  // Force all links to open safely — prevents email-crafted navigation attacks
  RETURN_DOM_FRAGMENT: false,
};

// After sanitization, enforce rel="noopener noreferrer" on all anchor tags
// to prevent window.opener hijacking and cross-origin navigation attacks from email content.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
});

function sanitizeHtml(html: string): string {
  return String(DOMPurify.sanitize(html, DOMPURIFY_CONFIG));
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Something went wrong</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{message}</p>
      {onRetry && <PrimaryButton variant="ghost" onClick={onRetry}><RefreshCw className="w-4 h-4 mr-2" /> Try Again</PrimaryButton>}
    </div>
  );
}

function TrustBadge({ score, verified }: { score?: number; verified?: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
        <ShieldCheck className="w-3 h-3" /> Verified
      </span>
    );
  }
  if (score !== undefined && score !== null) {
    const color = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
        <ShieldAlert className="w-3 h-3" /> Trust {score}
      </span>
    );
  }
  return null;
}

function SenderBadge({ type }: { type: string }) {
  if (type === 'agent') return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
      <Bot className="w-3 h-3" /> Agent
    </span>
  );
  if (type === 'user') return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
      <User className="w-3 h-3" /> User
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)' }}>
      System
    </span>
  );
}

function DirectionArrow({ direction }: { direction: string }) {
  if (direction === 'inbound') return <span className="text-xs" style={{ color: 'var(--success)' }}>↓ In</span>;
  if (direction === 'outbound') return <span className="text-xs" style={{ color: 'var(--accent)' }}>↑ Out</span>;
  return <span className="text-xs" style={{ color: 'var(--text-dim)' }}>↔ Int</span>;
}

function LabelChip({ label, onRemove }: { label: MailLabel; onRemove?: () => void }) {
  const COLORS: Record<string, string> = {
    inbox: '#3b82f6', sent: '#6366f1', archived: '#6b7280', spam: '#ef4444',
    important: '#f59e0b', tasks: '#10b981', drafts: '#8b5cf6', flagged: '#f97316',
    verified: '#22c55e', quarantine: '#ef4444', unread: '#3b82f6', routed: '#6366f1',
    'requires-approval': '#f59e0b', paid: '#10b981', marketplace: '#8b5cf6',
    jobs: '#06b6d4', agent: '#3b82f6', user: '#8b5cf6',
  };
  const color = label.color || COLORS[label.name] || 'var(--text-muted)';
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      <Tag className="w-2.5 h-2.5" />
      {label.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 hover:opacity-80" style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: 0 }}>
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

function TimeAgo({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  let text: string;
  if (diffMins < 1) text = 'just now';
  else if (diffMins < 60) text = `${diffMins}m ago`;
  else if (diffHours < 24) text = `${diffHours}h ago`;
  else if (diffDays < 7) text = `${diffDays}d ago`;
  else text = d.toLocaleDateString();
  return <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{text}</span>;
}

function RoutingRulesViewer({ rules }: { rules: RoutingRule[] }) {
  if (rules.length === 0) {
    return (
      <EmptyState icon={<Settings className="w-6 h-6" style={{ color: 'var(--text-dim)' }} />} title="No routing rules" description="Configure routing rules to automatically organize incoming messages." />
    );
  }
  return (
    <div className="space-y-2">
      {rules.sort((a, b) => a.priority - b.priority).map(rule => (
        <GlassCard key={rule.id} className="!p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rule.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{
                color: rule.enabled ? 'var(--success)' : 'var(--text-dim)',
                background: rule.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
              }}>{rule.enabled ? 'active' : 'disabled'}</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>priority {rule.priority}</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-medium">When: </span>
              {rule.conditions.map((c, i) => (
                <span key={i}>{i > 0 ? ' AND ' : ''}<code className="px-1 rounded" style={{ background: 'rgba(59,130,246,0.08)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{c.field} {c.operator} {JSON.stringify(c.value)}</code></span>
              ))}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-medium">Then: </span>
              {rule.actions.map((a, i) => (
                <span key={i}>{i > 0 ? ', ' : ''}<code className="px-1 rounded" style={{ background: 'rgba(34,197,94,0.08)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{a.type}{a.params ? ` (${Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(', ')})` : ''}</code></span>
              ))}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function InboxList({ agents, selectedAgent, allStats, inboxes, onSelect }: { agents: Agent[]; selectedAgent: string; allStats: Record<string, InboxStats>; inboxes: Record<string, MailInbox>; onSelect: (id: string) => void }) {
  return (
    <div className="mb-4">
      <GlassCard className="!p-0">
        {agents.map(a => {
          const s = allStats[a.id];
          const inbox = inboxes[a.id];
          const isSelected = a.id === selectedAgent;
          const statusLabel = inbox?.status || (s?.threads.open ? 'active' : 'idle');
          const isActive = statusLabel === 'active';
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b transition-colors hover:bg-white/5 cursor-pointer"
              style={{
                background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent',
                borderColor: 'var(--border-color)',
                border: 'none',
                borderBottom: '1px solid var(--border-color)',
                borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <Identicon handle={a.handle} size={28} />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{a.handle}</div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                  {s && <span>{s.messages.total} messages</span>}
                  {s && <span>{s.threads.open} open</span>}
                  {inbox?.lastMessageAt && <TimeAgo date={inbox.lastMessageAt} />}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {s && s.messages.unread > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent)', color: '#fff', minWidth: '22px', textAlign: 'center' }}>
                    {s.messages.unread}
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{
                  color: isActive ? 'var(--success)' : 'var(--text-dim)',
                  background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                }}>
                  {statusLabel}
                </span>
              </div>
            </button>
          );
        })}
      </GlassCard>
    </div>
  );
}

interface SearchFilters {
  q: string;
  direction?: string;
  senderType?: string;
  senderVerified?: string;
  afterDate?: string;
  beforeDate?: string;
  minTrustScore?: string;
  priority?: string;
  labelId?: string;
}

function SearchBar({ onSearch }: { onSearch: (filters: SearchFilters) => void }) {
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [direction, setDirection] = useState('');
  const [senderType, setSenderType] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [afterDate, setAfterDate] = useState('');
  const [beforeDate, setBeforeDate] = useState('');
  const [minTrustScore, setMinTrustScore] = useState('');
  const [priority, setPriority] = useState('');

  const hasFilters = query || direction || senderType || verifiedOnly || afterDate || beforeDate || minTrustScore || priority;

  const doSearch = () => {
    const filters: SearchFilters = { q: query };
    if (direction) filters.direction = direction;
    if (senderType) filters.senderType = senderType;
    if (verifiedOnly) filters.senderVerified = 'true';
    if (afterDate) filters.afterDate = afterDate;
    if (beforeDate) filters.beforeDate = beforeDate;
    if (minTrustScore) filters.minTrustScore = minTrustScore;
    if (priority) filters.priority = priority;
    onSearch(filters);
  };

  const clearAll = () => {
    setQuery('');
    setDirection('');
    setSenderType('');
    setVerifiedOnly(false);
    setAfterDate('');
    setBeforeDate('');
    setMinTrustScore('');
    setPriority('');
    onSearch({ q: '' });
  };

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <input
          type="text"
          placeholder="Search by subject, body, or sender..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
          className="w-full pl-9 pr-20 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)' }}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="p-1 rounded hover:bg-white/10" style={{ background: 'none', border: 'none', cursor: 'pointer', color: showAdvanced ? 'var(--accent)' : 'var(--text-dim)' }} title="Advanced filters">
            <Filter className="w-3.5 h-3.5" />
          </button>
          {hasFilters && (
            <button onClick={clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {showAdvanced && (
        <div className="flex flex-wrap gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)' }}>
          <select value={direction} onChange={e => setDirection(e.target.value)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <option value="">Any direction</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="internal">Internal</option>
          </select>
          <select value={senderType} onChange={e => setSenderType(e.target.value)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <option value="">Any sender</option>
            <option value="agent">Agent</option>
            <option value="user">User</option>
            <option value="system">System</option>
            <option value="external">External</option>
          </select>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <option value="">Any priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} />
            Verified only
          </label>
          <div className="flex items-center gap-1">
            <label className="text-xs" style={{ color: 'var(--text-dim)' }}>After:</label>
            <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} className="text-xs px-1.5 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Before:</label>
            <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} className="text-xs px-1.5 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Min trust:</label>
            <input type="number" min="0" max="100" value={minTrustScore} onChange={e => setMinTrustScore(e.target.value)} className="text-xs px-1.5 py-1 rounded w-16" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} placeholder="0-100" />
          </div>
          <button onClick={doSearch} className="text-xs px-3 py-1 rounded cursor-pointer" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>Apply</button>
        </div>
      )}
    </div>
  );
}

function LabelFilter({ labels, activeLabel, onSelect }: { labels: MailLabel[]; activeLabel: string | null; onSelect: (id: string | null) => void }) {
  const systemLabels = labels.filter(l => l.isSystem && ['inbox', 'sent', 'drafts', 'archived', 'spam', 'important', 'tasks', 'flagged', 'verified', 'quarantine', 'requires-approval'].includes(l.name));
  const customLabels = labels.filter(l => !l.isSystem);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onSelect(null)}
        className="text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer"
        style={{
          background: activeLabel === null ? 'var(--accent)' : 'transparent',
          color: activeLabel === null ? '#fff' : 'var(--text-muted)',
          border: `1px solid ${activeLabel === null ? 'var(--accent)' : 'var(--border-color)'}`,
        }}
      >All</button>
      {systemLabels.map(l => (
        <button
          key={l.id}
          onClick={() => onSelect(activeLabel === l.id ? null : l.id)}
          className="text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer"
          style={{
            background: activeLabel === l.id ? 'var(--accent)' : 'transparent',
            color: activeLabel === l.id ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${activeLabel === l.id ? 'var(--accent)' : 'var(--border-color)'}`,
          }}
        >{l.name}</button>
      ))}
      {customLabels.map(l => (
        <button
          key={l.id}
          onClick={() => onSelect(activeLabel === l.id ? null : l.id)}
          className="text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer"
          style={{
            background: activeLabel === l.id ? (l.color || 'var(--accent)') : 'transparent',
            color: activeLabel === l.id ? '#fff' : (l.color || 'var(--text-muted)'),
            border: `1px solid ${activeLabel === l.id ? (l.color || 'var(--accent)') : 'var(--border-color)'}`,
          }}
        >{l.name}</button>
      ))}
    </div>
  );
}

function ThreadListItem({
  thread,
  onClick,
  onStar,
  onDelete,
  selectMode,
  selected,
  onSelect,
}: {
  thread: MailThread;
  onClick: () => void;
  onStar?: (starred: boolean) => void;
  onDelete?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}) {
  const lm = thread.lastMessage;
  const isStarred = thread.labels?.some(l => l.name === 'flagged');

  return (
    <div
      className="w-full text-left px-4 py-3 border-b transition-colors group"
      style={{ background: selected ? 'rgba(59,130,246,0.08)' : thread.unreadCount > 0 ? 'rgba(59,130,246,0.04)' : 'transparent', borderBottom: '1px solid var(--border-color)', position: 'relative' }}
    >
      <div className="flex items-start gap-3">
        {selectMode ? (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => { e.stopPropagation(); onSelect?.(e.target.checked); }}
            className="mt-1.5 w-4 h-4 flex-shrink-0 cursor-pointer"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          thread.unreadCount > 0 && <span className="mt-2 block w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
        )}
        <button
          onClick={onClick}
          className="flex-1 min-w-0 text-left cursor-pointer"
          style={{ background: 'none', border: 'none' }}
        >
          <div className="flex items-center gap-2 mb-0.5">
            {lm && (
              <span className="text-xs truncate" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {lm.senderAddress || lm.senderType}
              </span>
            )}
            {lm && <SenderBadge type={lm.senderType} />}
            {lm && <TrustBadge score={lm.senderTrustScore ?? undefined} verified={lm.senderVerified ?? undefined} />}
          </div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-sm truncate ${thread.unreadCount > 0 ? 'font-semibold' : ''}`} style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              {thread.subject || '(no subject)'}
            </span>
            {thread.unreadCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px', minWidth: '18px', textAlign: 'center' }}>
                {thread.unreadCount}
              </span>
            )}
          </div>
          {lm?.snippet && (
            <p className="text-xs truncate mb-1" style={{ color: 'var(--text-dim)' }}>{lm.snippet}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}</span>
            <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ color: thread.status === 'open' ? 'var(--success)' : 'var(--text-dim)', background: thread.status === 'open' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)' }}>
              {thread.status}
            </span>
            {thread.labels && thread.labels.length > 0 && thread.labels.slice(0, 3).map(l => <LabelChip key={l.id} label={l} />)}
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {thread.lastMessageAt && <TimeAgo date={thread.lastMessageAt} />}
          {onStar && (
            <button
              onClick={e => { e.stopPropagation(); onStar(!isStarred); }}
              className="p-1 rounded hover:bg-white/10"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isStarred ? '#f59e0b' : 'var(--text-dim)' }}
              title={isStarred ? 'Unstar' : 'Star'}
            >
              <Star className="w-3.5 h-3.5" fill={isStarred ? '#f59e0b' : 'none'} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
              title="Delete thread"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        </div>
      </div>
    </div>
  );
}

function MessageItem({ message, agentId, onSelect, onMarkRead }: { message: MailMessage; agentId: string; onSelect: () => void; onMarkRead: (read: boolean) => void }) {
  return (
    <div
      onClick={onSelect}
      className="px-4 py-3 border-b transition-colors hover:bg-white/5 cursor-pointer"
      style={{ background: !message.isRead ? 'rgba(59,130,246,0.04)' : 'transparent', borderColor: 'var(--border-color)' }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {!message.isRead && <span className="block w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-sm truncate ${!message.isRead ? 'font-semibold' : ''}`} style={{ color: 'var(--text-primary)' }}>
              {message.senderAddress || message.senderType}
            </span>
            <DirectionArrow direction={message.direction} />
            <SenderBadge type={message.senderType} />
            <TrustBadge score={message.senderTrustScore} verified={message.senderVerified} />
          </div>
          <p className="text-sm mb-1 truncate" style={{ color: 'var(--text-muted)' }}>{message.subject || '(no subject)'}</p>
          {message.snippet && <p className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{message.snippet}</p>}
          {message.labels && message.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.labels.map(l => <LabelChip key={l.id} label={l} />)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {message.attachments && message.attachments.length > 0 && <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />}
          {message.convertedTaskId && <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />}
          <TimeAgo date={message.createdAt} />
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(!message.isRead); }}
            className="p-1 rounded hover:bg-white/10"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
            title={message.isRead ? 'Mark unread' : 'Mark read'}
          >
            {message.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function StructuredPayloadView({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-3 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer"
        style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--accent)', border: 'none', fontFamily: 'var(--font-mono)' }}
      >
        <Code className="w-3.5 h-3.5" />
        Structured Payload
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs overflow-x-auto" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', maxHeight: '200px', background: 'rgba(0,0,0,0.15)' }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ProvenanceTimeline({ chain }: { chain: Array<{ actor: string; action: string; timestamp: string; details?: Record<string, unknown> }> }) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Provenance Chain</h4>
      <div className="space-y-2">
        {chain.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <div className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
            <div>
              <span style={{ color: 'var(--text-primary)' }}>{entry.actor}</span>
              <span style={{ color: 'var(--text-dim)' }}>  -  {entry.action}</span>
              <div style={{ color: 'var(--text-dim)' }}>{new Date(entry.timestamp).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageDetail({ message, agentId, labels: msgLabels, attachments: msgAttachments, onBack, onRefresh, onDelete }: { message: MailMessage; agentId: string; labels?: MailLabel[]; attachments?: MailAttachment[]; onBack: () => void; onRefresh: () => void; onDelete?: () => void }) {
  const [events, setEvents] = useState<MailEvent[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.mail.messageEvents(agentId, message.id);
      setEvents(res.events);
    } catch (err) {
      console.error('[mail] Failed to load events:', err);
    }
  }, [agentId, message.id]);

  useEffect(() => { if (showEvents) loadEvents(); }, [showEvents, loadEvents]);

  const handleReply = async () => {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    try {
      await api.mail.replyToThread(agentId, message.threadId, replyBody.trim());
      setReplyBody('');
      onRefresh();
    } catch (err) {
      console.error('[mail] Reply failed:', err);
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (action: string) => {
    if (action === 'delete') {
      if (!window.confirm('Delete this message? This cannot be undone.')) return;
      setActionLoading(action);
      try {
        await api.mail.deleteMessage(agentId, message.id);
        onDelete ? onDelete() : onBack();
      } catch (err) {
        console.error('[mail] Delete failed:', err);
      } finally {
        setActionLoading(null);
      }
      return;
    }
    setActionLoading(action);
    try {
      if (action === 'archive') await api.mail.archiveMessage(agentId, message.id);
      if (action === 'convert') await api.mail.convertToTask(agentId, message.id);
      if (action === 'reject') await api.mail.rejectMessage(agentId, message.id);
      if (action === 'approve') await api.mail.approveMessage(agentId, message.id);
      if (action === 'route') await api.mail.routeMessage(agentId, message.id);
      onRefresh();
    } catch (err) {
      console.error(`[mail] Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 mb-4 text-sm cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <GlassCard className="!p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {message.subject || '(no subject)'}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{message.senderAddress || message.senderType}</span>
              <DirectionArrow direction={message.direction} />
              <SenderBadge type={message.senderType} />
              <TrustBadge score={message.senderTrustScore} verified={message.senderVerified} />
              {message.priority && message.priority !== 'normal' && (
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: message.priority === 'urgent' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: message.priority === 'urgent' ? '#ef4444' : '#f59e0b' }}>
                  {message.priority}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
            <Clock className="w-3 h-3" />
            {new Date(message.createdAt).toLocaleString()}
          </div>
        </div>

        {message.recipientAddress && (
          <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
            To: {message.recipientAddress}
          </div>
        )}

        {msgLabels && msgLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {msgLabels.map(l => <LabelChip key={l.id} label={l} />)}
          </div>
        )}

        <div className="rounded-lg p-4 mb-4" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)' }}>
          {message.bodyFormat === 'html' && message.bodyHtml ? (
            <div className="text-sm prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.bodyHtml) }} />
          ) : (
            <pre className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)', fontFamily: message.bodyFormat === 'markdown' ? 'var(--font-body)' : 'var(--font-mono)' }}>
              {message.body}
            </pre>
          )}
        </div>

        {msgAttachments && msgAttachments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Attachments</h4>
            <div className="flex flex-wrap gap-2">
              {msgAttachments.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <Paperclip className="w-3 h-3" />
                  {a.filename}
                  {a.size > 0 && <span style={{ color: 'var(--text-dim)' }}>({(a.size / 1024).toFixed(1)}KB)</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {message.convertedTaskId && (
          <div className="flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--success)' }}>
            <CheckSquare className="w-3.5 h-3.5" />
            Converted to Task: {message.convertedTaskId}
          </div>
        )}

        {message.structuredPayload && Object.keys(message.structuredPayload).length > 0 && (
          <StructuredPayloadView payload={message.structuredPayload} />
        )}

        {message.provenanceChain && message.provenanceChain.length > 0 && (
          <ProvenanceTimeline chain={message.provenanceChain} />
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 flex-wrap" style={{ borderTop: '1px solid var(--border-color)' }}>
          <PrimaryButton variant="ghost" onClick={() => handleAction('archive')} disabled={!!actionLoading}>
            {actionLoading === 'archive' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Archive</span>
          </PrimaryButton>
          <PrimaryButton variant="danger" onClick={() => handleAction('delete')} disabled={!!actionLoading}>
            {actionLoading === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Delete</span>
          </PrimaryButton>
          {!message.convertedTaskId && (
            <PrimaryButton variant="ghost" onClick={() => handleAction('convert')} disabled={!!actionLoading}>
              {actionLoading === 'convert' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
              <span className="ml-1.5">Convert to Task</span>
            </PrimaryButton>
          )}
          <PrimaryButton variant="ghost" onClick={() => handleAction('route')} disabled={!!actionLoading}>
            {actionLoading === 'route' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Route</span>
          </PrimaryButton>
          {message.direction === 'inbound' && (
            <>
              <PrimaryButton variant="ghost" onClick={() => handleAction('approve')} disabled={!!actionLoading}>
                {actionLoading === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                <span className="ml-1.5">Approve</span>
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => handleAction('reject')} disabled={!!actionLoading}>
                {actionLoading === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                <span className="ml-1.5">Reject</span>
              </PrimaryButton>
            </>
          )}
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="ml-auto text-xs flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--text-dim)', background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
          >
            <FileText className="w-3 h-3" /> Events
          </button>
        </div>

        {showEvents && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)' }}>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Message Events</h4>
            {events.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No events recorded</p>
            ) : (
              <div className="space-y-1.5">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{ev.eventType}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{new Date(ev.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Reply</h4>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Type your reply..."
            rows={3}
            className="w-full rounded-lg p-3 text-sm resize-none"
            style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)' }}
          />
          <div className="flex justify-end mt-2">
            <PrimaryButton onClick={handleReply} disabled={!replyBody.trim() || sending}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
              Send Reply
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function ComposeModal({ agentId, agents, onClose, onSent }: { agentId: string; agents: Agent[]; onClose: () => void; onSent: () => void }) {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherAgents = agents.filter(a => a.id !== agentId);

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.mail.sendMessage(agentId, {
        recipientAddress: recipientAddress || undefined,
        subject: subject || undefined,
        body: body.trim(),
        bodyFormat: 'text',
        direction: 'outbound',
        senderType: 'user',
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!body.trim() || savingDraft) return;
    setSavingDraft(true);
    setError(null);
    try {
      await api.mail.saveDraft(agentId, {
        recipientAddress: recipientAddress || undefined,
        subject: subject || undefined,
        body: body.trim(),
        bodyFormat: 'text',
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Compose Message</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X className="w-5 h-5" /></button>
        </div>

        {error && <p className="text-sm mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>Recipient</label>
            <div className="flex gap-2 flex-wrap mb-1.5">
              {otherAgents.map(a => (
                <button
                  key={a.id}
                  onClick={() => setRecipientAddress(`${a.handle}@getagent.id`)}
                  className="text-xs px-2 py-1 rounded-full cursor-pointer"
                  style={{
                    background: recipientAddress === `${a.handle}@getagent.id` ? 'var(--accent)' : 'transparent',
                    color: recipientAddress === `${a.handle}@getagent.id` ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${recipientAddress === `${a.handle}@getagent.id` ? 'var(--accent)' : 'var(--border-color)'}`,
                  }}
                >@{a.handle}</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="or enter address..."
              value={recipientAddress}
              onChange={e => setRecipientAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>Subject</label>
            <input
              type="text"
              placeholder="Subject..."
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              className="w-full rounded-lg p-3 text-sm resize-none"
              style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <PrimaryButton variant="ghost" onClick={onClose}>Cancel</PrimaryButton>
          <PrimaryButton variant="ghost" onClick={handleSaveDraft} disabled={!body.trim() || savingDraft || sending}>
            {savingDraft ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileText className="w-4 h-4 mr-1.5" />}
            Save Draft
          </PrimaryButton>
          <PrimaryButton onClick={handleSend} disabled={!body.trim() || sending || savingDraft}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
            Send
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

type MailView = 'threads' | 'thread-detail' | 'message-detail' | 'search-results';

export function Mail() {
  const { agents } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [view, setView] = useState<MailView>('threads');
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<MailThread | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MailMessage | null>(null);
  const [messageLabels, setMessageLabels] = useState<MailLabel[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<MailAttachment[]>([]);
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, InboxStats>>({});
  const [inboxData, setInboxData] = useState<MailInbox | null>(null);
  const [allInboxes, setAllInboxes] = useState<Record<string, MailInbox>>({});
  const [showRoutingRules, setShowRoutingRules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [threadCursor, setThreadCursor] = useState<string | undefined>(undefined);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0].id);
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (agents.length === 0) return;
    const fetchAllStats = async () => {
      const entries: Record<string, InboxStats> = {};
      const inboxEntries: Record<string, MailInbox> = {};
      await Promise.all(agents.map(async (a) => {
        try {
          const [s, inboxRes] = await Promise.all([
            api.mail.inboxStats(a.id),
            api.mail.inbox(a.id),
          ]);
          entries[a.id] = s;
          inboxEntries[a.id] = inboxRes.inbox;
        } catch { /* skip */ }
      }));
      setAgentStats(entries);
      setAllInboxes(inboxEntries);
    };
    fetchAllStats();
  }, [agents]);

  const loadInbox = useCallback(async () => {
    if (!selectedAgent) return;
    setLoading(true);
    setError(null);
    setThreadCursor(undefined);
    setSelectedThreadIds(new Set());
    try {
      const inboxRes = await api.mail.inbox(selectedAgent);
      setInboxData(inboxRes.inbox);
      const [labelsRes, statsRes] = await Promise.all([
        api.mail.labels(selectedAgent),
        api.mail.inboxStats(selectedAgent),
      ]);
      setLabels(labelsRes.labels);
      setStats(statsRes);
      setAgentStats(prev => ({ ...prev, [selectedAgent]: statsRes }));

      if (activeLabel) {
        const searchRes = await api.mail.search(selectedAgent, { labelId: activeLabel });
        setMessages(searchRes.messages);
        setView('search-results');
      } else {
        const threadsRes = await api.mail.threads(selectedAgent, { limit: '25' });
        setThreads(threadsRes.threads);
        setHasMoreThreads(threadsRes.hasMore);
        setThreadCursor(threadsRes.nextCursor);
        if (view === 'search-results') setView('threads');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, activeLabel]);

  const loadMoreThreads = useCallback(async () => {
    if (!selectedAgent || !hasMoreThreads || loadingMore || !threadCursor) return;
    setLoadingMore(true);
    try {
      const threadsRes = await api.mail.threads(selectedAgent, { limit: '25', cursor: threadCursor });
      setThreads(prev => [...prev, ...threadsRes.threads]);
      setHasMoreThreads(threadsRes.hasMore);
      setThreadCursor(threadsRes.nextCursor);
    } catch (e) {
      console.error('[mail] Load more failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedAgent, hasMoreThreads, loadingMore, threadCursor]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  const handleSearch = async (filters: SearchFilters) => {
    const hasFilters = filters.q.trim() || filters.direction || filters.senderType || filters.senderVerified || filters.afterDate || filters.beforeDate || filters.minTrustScore || filters.priority || filters.labelId;
    if (!hasFilters) {
      setView('threads');
      loadInbox();
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.direction) params.direction = filters.direction;
      if (filters.senderType) params.senderType = filters.senderType;
      if (filters.senderVerified) params.senderVerified = filters.senderVerified;
      if (filters.afterDate) params.afterDate = filters.afterDate;
      if (filters.beforeDate) params.beforeDate = filters.beforeDate;
      if (filters.minTrustScore) params.minTrustScore = filters.minTrustScore;
      if (filters.priority) params.priority = filters.priority;
      if (filters.labelId) params.labelId = filters.labelId;
      const res = await api.mail.search(selectedAgent, params);
      setMessages(res.messages);
      setView('search-results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const openThread = async (thread: MailThread) => {
    try {
      const res = await api.mail.thread(selectedAgent, thread.id);
      setSelectedThread(res.thread);
      setView('thread-detail');
    } catch (e) {
      console.error('[mail] Failed to load thread:', e);
    }
  };

  const openMessage = async (messageId: string) => {
    try {
      const res = await api.mail.message(selectedAgent, messageId);
      setSelectedMessage(res.message);
      setMessageLabels(res.labels || []);
      setMessageAttachments(res.attachments || []);
      if (!res.message.isRead) {
        await api.mail.markRead(selectedAgent, messageId, true);
      }
      setView('message-detail');
    } catch (e) {
      console.error('[mail] Failed to load message:', e);
    }
  };

  const handleMarkRead = async (messageId: string, isRead: boolean) => {
    try {
      await api.mail.markRead(selectedAgent, messageId, isRead);
      loadInbox();
    } catch (e) {
      console.error('[mail] Mark read failed:', e);
    }
  };

  const handleStarThread = async (threadId: string, starred: boolean) => {
    try {
      await api.mail.starThread(selectedAgent, threadId, starred);
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const flaggedLabel = labels.find(l => l.name === 'flagged');
        if (!flaggedLabel) return t;
        const currentLabels = t.labels || [];
        if (starred) {
          return { ...t, labels: currentLabels.some(l => l.name === 'flagged') ? currentLabels : [...currentLabels, flaggedLabel] };
        } else {
          return { ...t, labels: currentLabels.filter(l => l.name !== 'flagged') };
        }
      }));
    } catch (e) {
      console.error('[mail] Star failed:', e);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!window.confirm('Delete this thread? This cannot be undone.')) return;
    try {
      await api.mail.deleteThread(selectedAgent, threadId);
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
        setSelectedMessage(null);
        setView('threads');
      }
    } catch (e) {
      console.error('[mail] Delete thread failed:', e);
    }
  };

  const handleBulkAction = async (action: 'mark_read' | 'archive' | 'delete') => {
    if (selectedThreadIds.size === 0) return;
    if (action === 'delete' && !window.confirm(`Delete ${selectedThreadIds.size} thread(s)? This cannot be undone.`)) return;
    try {
      await api.mail.bulkAction(selectedAgent, Array.from(selectedThreadIds), action);
      setSelectedThreadIds(new Set());
      setSelectMode(false);
      loadInbox();
    } catch (e) {
      console.error('[mail] Bulk action failed:', e);
    }
  };

  if (agents.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Mail</h1>
        <EmptyState icon={<MailIcon className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No agents registered" description="Register an agent to access its inbox." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Mail</h1>
        <div className="flex items-center gap-2">
          <PrimaryButton variant="ghost" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
          </PrimaryButton>
          <PrimaryButton
            variant={selectMode ? 'blue' : 'ghost'}
            onClick={() => { setSelectMode(s => !s); setSelectedThreadIds(new Set()); }}
          >
            <CheckSquare className="w-4 h-4" />
          </PrimaryButton>
          <PrimaryButton onClick={() => setShowCompose(true)}>
            <Send className="w-4 h-4 mr-1.5" /> Compose
          </PrimaryButton>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: 'rgba(245,158,11,0.85)' }}>
        <span>Platform-internal messaging only. Receiving email from external addresses is not yet available — coming soon.</span>
      </div>

      {selectMode && selectedThreadIds.size > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{selectedThreadIds.size} selected</span>
          <div className="flex items-center gap-1 ml-auto">
            <PrimaryButton variant="ghost" onClick={() => handleBulkAction('mark_read')}>
              <Eye className="w-3.5 h-3.5 mr-1" /> Mark read
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => handleBulkAction('archive')}>
              <Archive className="w-3.5 h-3.5 mr-1" /> Archive
            </PrimaryButton>
            <PrimaryButton variant="danger" onClick={() => handleBulkAction('delete')}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </PrimaryButton>
          </div>
        </div>
      )}

      <InboxList agents={agents} selectedAgent={selectedAgent} allStats={agentStats} inboxes={allInboxes} onSelect={(id) => { setSelectedAgent(id); setView('threads'); setSelectedThread(null); setSelectedMessage(null); }} />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <GlassCard className="!p-3">
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Total Messages</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats.messages.total}</div>
          </GlassCard>
          <GlassCard className="!p-3">
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Unread</div>
            <div className="text-lg font-bold" style={{ color: stats.messages.unread > 0 ? 'var(--accent)' : 'var(--text-primary)' }}>{stats.messages.unread}</div>
          </GlassCard>
          <GlassCard className="!p-3">
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Threads</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats.threads.total}</div>
          </GlassCard>
          <GlassCard className="!p-3">
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Open Threads</div>
            <div className="text-lg font-bold" style={{ color: 'var(--success)' }}>{stats.threads.open}</div>
          </GlassCard>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1">
          <SearchBar onSearch={handleSearch} />
        </div>
        <PrimaryButton variant="ghost" onClick={() => setShowRoutingRules(!showRoutingRules)}>
          <Settings className="w-4 h-4" />
        </PrimaryButton>
      </div>

      {showRoutingRules && inboxData && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Routing Rules</h3>
            <button onClick={() => setShowRoutingRules(false)} className="text-xs cursor-pointer" style={{ color: 'var(--text-dim)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <RoutingRulesViewer rules={inboxData.routingRules || []} />
        </div>
      )}

      {showFilters && labels.length > 0 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <LabelFilter labels={labels} activeLabel={activeLabel} onSelect={(id) => { setActiveLabel(id); }} />
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadInbox} />
      ) : view === 'message-detail' && selectedMessage ? (
        <MessageDetail
          message={selectedMessage}
          agentId={selectedAgent}
          labels={messageLabels}
          attachments={messageAttachments}
          onBack={() => { setSelectedMessage(null); setView(selectedThread ? 'thread-detail' : 'threads'); }}
          onRefresh={async () => {
            const res = await api.mail.message(selectedAgent, selectedMessage.id);
            setSelectedMessage(res.message);
            setMessageLabels(res.labels || []);
            setMessageAttachments(res.attachments || []);
          }}
          onDelete={async () => {
            setSelectedMessage(null);
            if (selectedThread) {
              const updatedThread = await api.mail.thread(selectedAgent, selectedThread.id).catch(() => null);
              if (updatedThread) {
                setSelectedThread(updatedThread.thread);
                setView('thread-detail');
              } else {
                setSelectedThread(null);
                setView('threads');
              }
            } else {
              setView('threads');
            }
            loadInbox();
          }}
        />
      ) : view === 'thread-detail' && selectedThread ? (
        <div>
          <button onClick={() => { setSelectedThread(null); setView('threads'); }} className="flex items-center gap-2 mb-4 text-sm cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>
            <ArrowLeft className="w-4 h-4" /> Back to threads
          </button>
          <GlassCard className="!p-0">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{selectedThread.subject}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <span>{selectedThread.messageCount} messages</span>
                <span className="capitalize px-1.5 py-0.5 rounded" style={{ color: selectedThread.status === 'open' ? 'var(--success)' : 'var(--text-dim)', background: selectedThread.status === 'open' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)' }}>{selectedThread.status}</span>
                {selectedThread.unreadCount > 0 && <span style={{ color: 'var(--accent)' }}>{selectedThread.unreadCount} unread</span>}
              </div>
            </div>
            {selectedThread.messages && selectedThread.messages.length > 0 ? (
              selectedThread.messages.map(msg => (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  agentId={selectedAgent}
                  onSelect={() => openMessage(msg.id)}
                  onMarkRead={(read) => handleMarkRead(msg.id, read)}
                />
              ))
            ) : (
              <EmptyState
                icon={<MailIcon className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
                title="No messages yet"
                description="This thread has no messages. Start the conversation by composing a reply."
                action={<PrimaryButton variant="ghost" onClick={() => setShowCompose(true)}>Compose</PrimaryButton>}
              />
            )}
          </GlassCard>
        </div>
      ) : view === 'search-results' ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => { setView('threads'); loadInbox(); }} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{messages.length} result{messages.length !== 1 ? 's' : ''}</span>
          </div>
          {messages.length === 0 ? (
            <EmptyState icon={<Search className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No results" description="Try a different search query." />
          ) : (
            <GlassCard className="!p-0">
              {messages.map(msg => (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  agentId={selectedAgent}
                  onSelect={() => openMessage(msg.id)}
                  onMarkRead={(read) => handleMarkRead(msg.id, read)}
                />
              ))}
            </GlassCard>
          )}
        </div>
      ) : (
        <>
          {threads.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
              title="Inbox empty"
              description="No conversation threads yet. Send a message to get started."
              action={<PrimaryButton onClick={() => setShowCompose(true)}><Send className="w-4 h-4 mr-1.5" /> Compose</PrimaryButton>}
            />
          ) : (
            <>
              <GlassCard className="!p-0">
                {threads.map(t => (
                  <ThreadListItem
                    key={t.id}
                    thread={t}
                    onClick={() => openThread(t)}
                    onStar={starred => handleStarThread(t.id, starred)}
                    onDelete={() => handleDeleteThread(t.id)}
                    selectMode={selectMode}
                    selected={selectedThreadIds.has(t.id)}
                    onSelect={sel => setSelectedThreadIds(prev => {
                      const next = new Set(prev);
                      if (sel) next.add(t.id); else next.delete(t.id);
                      return next;
                    })}
                  />
                ))}
              </GlassCard>
              {hasMoreThreads && (
                <div className="mt-3 flex justify-center">
                  <PrimaryButton variant="ghost" onClick={loadMoreThreads} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
                    Load more
                  </PrimaryButton>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCompose && (
        <ComposeModal
          agentId={selectedAgent}
          agents={agents}
          onClose={() => setShowCompose(false)}
          onSent={() => { setShowCompose(false); loadInbox(); }}
        />
      )}
    </div>
  );
}
