import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Inbox, Mail, Activity, ShoppingBag, Globe, Network, Settings, ArrowUpRight, ArrowRightLeft, ShieldCheck, Wallet, Lock, X, AtSign, PackageOpen } from 'lucide-react';
import { Identicon } from '@/components/shared';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';

function useUserPlan(): string {
  const [plan, setPlan] = useState<string>('none');
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    api.billing.subscription().then(res => setPlan(res.plan)).catch(() => {});
  }, [userId]);

  return plan;
}

function useInboxCount() {
  const [count, setCount] = useState(0);
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api.tasks.list({ status: 'pending' }).then(res => {
      if (!cancelled) setCount(res.tasks?.length ?? 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  return count;
}

function useMailUnreadCount() {
  const [count, setCount] = useState(0);
  const { agents } = useAuth();

  useEffect(() => {
    if (!agents || agents.length === 0) return;
    // Check first agent's inbox stats for unread count
    api.mail.inboxStats(agents[0].id)
      .then(stats => setCount(stats.messages.unread ?? 0))
      .catch(() => {});
  }, [agents]);

  return count;
}

type UserPlan = 'none' | 'free' | 'starter' | 'pro' | 'enterprise';

function planLevel(plan: UserPlan | string | undefined): number {
  switch (plan) {
    case 'enterprise': return 4;
    case 'pro': return 3;
    case 'starter': return 2;
    case 'free': return 1;
    default: return 0;
  }
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const inboxCount = useInboxCount();
  const mailUnreadCount = useMailUnreadCount();
  const displayName = user?.displayName || user?.username || 'agent';

  const handleNav = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const userPlan = useUserPlan();
  const userPlanLevel = planLevel(userPlan);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Overview', minPlan: 0 },
    { path: '/dashboard/agents', icon: Bot, label: 'My Agents', minPlan: 0 },
    { path: '/dashboard/handles', icon: AtSign, label: 'Handles', minPlan: 0 },
    { path: '/dashboard/inbox', icon: Inbox, label: 'Task Inbox', count: inboxCount, minPlan: 2 },
    { path: '/dashboard/mail', icon: Mail, label: 'Agent Mail', count: mailUnreadCount, minPlan: 2 },
    { path: '/dashboard/log', icon: Activity, label: 'Activity Log', minPlan: 0 },
    { path: '/dashboard/marketplace', icon: ShoppingBag, label: 'Marketplace', dot: 'purple' as const, minPlan: 0 },
    { path: '/dashboard/orders', icon: PackageOpen, label: 'My Orders', minPlan: 0 },
    { path: '/dashboard/credential', icon: ShieldCheck, label: 'Credential', minPlan: 2 },
    { path: '/dashboard/wallet', icon: Wallet, label: 'Wallet', minPlan: 0 },
    { path: '/dashboard/transfers', icon: ArrowRightLeft, label: 'Transfers', minPlan: 0 },
    { path: '/dashboard/domain', icon: Globe, label: '.agentid Domains', dot: 'cyan' as const, minPlan: 0 },
    { path: '/dashboard/fleet', icon: Network, label: 'Agent Fleet', minPlan: 3 },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings', minPlan: 0 },
  ];

  return (
    <>
      <div className="px-5 py-5">
        <button
          onClick={() => handleNav('/')}
          className="cursor-pointer"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.05em', background: 'none', border: 'none' }}
          aria-label="Home"
        >
          AGENT ID
        </button>
      </div>

      <div className="px-5 py-3 flex items-center gap-3 border-b mb-2" style={{ borderColor: 'var(--border-color)' }}>
        <Identicon handle={displayName} size={32} />
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Dashboard</div>
        </div>
      </div>

      <nav aria-label="Dashboard navigation" className="flex-1 px-3 py-2">
        {navItems.map(item => {
          const active = item.path === '/dashboard'
            ? location.pathname === '/dashboard'
            : location.pathname.startsWith(item.path);
          const locked = userPlanLevel < item.minPlan;
          return (
            <button
              key={item.path}
              onClick={() => locked ? handleNav('/pricing') : handleNav(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors cursor-pointer"
              style={{
                background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: locked ? 'var(--text-dim)' : active ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
                fontFamily: 'var(--font-body)',
                opacity: locked ? 0.6 : 1,
              }}
              aria-label={item.label}
              title={locked ? `Requires a higher plan` : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {locked && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />}
              {!locked && 'count' in item && (item.count ?? 0) > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff', fontSize: '10px' }}>{item.count}</span>
              )}
              {!locked && item.dot === 'purple' && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--marketplace)' }} />}
              {!locked && item.dot === 'cyan' && !('count' in item) && <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--domain)' }} />}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs capitalize" style={{ color: 'var(--text-dim)' }}>
            {userPlan === 'none' ? 'Free' : userPlan} plan
          </span>
          <button
            className="text-xs flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--accent)', background: 'none', border: 'none' }}
            onClick={() => handleNav('/pricing')}
            aria-label="Upgrade plan"
          >
            Upgrade <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside aria-label="Dashboard sidebar" className="fixed left-0 top-0 bottom-0 w-60 flex flex-col border-r z-40" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)' }}>
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-60 flex flex-col border-r" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', zIndex: 51 }}>
        <div className="absolute top-3 right-3">
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
