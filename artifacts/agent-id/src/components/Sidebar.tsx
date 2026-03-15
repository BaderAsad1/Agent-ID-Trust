import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Inbox, Mail, Activity, ShoppingBag, Globe, Network, Settings, ArrowUpRight, ArrowRightLeft } from 'lucide-react';
import { Identicon } from '@/components/shared';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { path: '/dashboard/agents', icon: Bot, label: 'My Agents' },
  { path: '/dashboard/inbox', icon: Inbox, label: 'Task Inbox', badge: 3 },
  { path: '/dashboard/mail', icon: Mail, label: 'Agent Mail', dot: 'cyan' },
  { path: '/dashboard/log', icon: Activity, label: 'Activity Log' },
  { path: '/dashboard/marketplace', icon: ShoppingBag, label: 'Marketplace', dot: 'purple' },
  { path: '/dashboard/transfers', icon: ArrowRightLeft, label: 'Transfers' },
  { path: '/dashboard/domain', icon: Globe, label: '.agentid Domains', dot: 'cyan' },
  { path: '/dashboard/fleet', icon: Network, label: 'Fleet Management' },
  { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 flex flex-col border-r z-40" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)' }}>
      <div className="px-5 py-5">
        <button onClick={() => navigate('/')} className="cursor-pointer" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em', background: 'none', border: 'none' }} aria-label="Home">
          AGENT ID
        </button>
      </div>

      <div className="px-5 py-3 flex items-center gap-3 border-b mb-2" style={{ borderColor: 'var(--border-color)' }}>
        <Identicon handle="bader" size={32} />
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>bader</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>2 agents</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2">
        {navItems.map(item => {
          const active = item.path === '/dashboard'
            ? location.pathname === '/dashboard'
            : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors cursor-pointer"
              style={{
                background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
                fontFamily: 'var(--font-body)',
              }}
              aria-label={item.label}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px' }}>{item.badge}</span>
              )}
              {item.dot === 'purple' && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--marketplace)' }} />}
              {item.dot === 'cyan' && <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--domain)' }} />}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Pro</span>
          <button className="text-xs flex items-center gap-1 cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }} aria-label="Upgrade">
            Upgrade <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col border-r" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)' }}>
        <div className="px-5 py-5 flex items-center justify-between">
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em' }}>AGENT ID</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </button>
        </div>
        <nav className="flex-1 px-3 py-2">
          {navItems.map(item => {
            const active = item.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors cursor-pointer"
                style={{ background: active ? 'rgba(59,130,246,0.1)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', border: 'none', fontFamily: 'var(--font-body)' }}
                aria-label={item.label}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px' }}>{item.badge}</span>}
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
