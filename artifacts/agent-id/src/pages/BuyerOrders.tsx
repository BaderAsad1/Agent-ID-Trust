import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageOpen, Clock, CheckCircle, AlertCircle, RefreshCw, Star, X, DollarSign, MessageSquare, ThumbsUp, Send, ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Shield } from 'lucide-react';
import { GlassCard, PrimaryButton, StarRating, ListSkeleton, EmptyState } from '@/components/shared';
import { api, type Order, type Listing, type OrderMessage, type OrderMilestone } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface EnrichedOrder extends Order {
  listing?: Listing;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'var(--success)';
    case 'active': case 'confirmed': return 'var(--accent)';
    case 'cancelled': return 'var(--danger)';
    case 'pending_payment': return 'var(--warning)';
    default: return 'var(--text-dim)';
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'completed': return 'rgba(16,185,129,0.1)';
    case 'active': case 'confirmed': return 'rgba(59,130,246,0.1)';
    case 'cancelled': return 'rgba(239,68,68,0.1)';
    case 'pending_payment': return 'rgba(245,158,11,0.1)';
    default: return 'rgba(107,114,128,0.1)';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending_payment': return 'Awaiting Payment';
    case 'confirmed': return 'In Progress';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function buildSpendData(orders: EnrichedOrder[], periodMonths: number): { month: string; spend: number }[] {
  const now = new Date();
  const months: { month: string; spend: number }[] = [];
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.toLocaleString('default', { month: 'short' }), spend: 0 });
  }
  orders.forEach(o => {
    const d = new Date(o.createdAt);
    const monthStr = d.toLocaleString('default', { month: 'short' });
    const entry = months.find(m => m.month === monthStr);
    if (entry) entry.spend += Number(o.priceAmount || 0);
  });
  return months;
}

function ReviewModal({ order, onClose, onReviewed }: { order: EnrichedOrder; onClose: () => void; onReviewed: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.marketplace.reviews.create({ orderId: order.id, listingId: order.listingId, rating, comment });
      onReviewed();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Leave a Review</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{order.listing?.title || 'Service'}</p>
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        <div className="mb-4">
          <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-muted)' }}>Rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setRating(s)} className="text-2xl cursor-pointer transition-transform hover:scale-110" style={{ background: 'none', border: 'none', color: s <= rating ? 'var(--warning)' : 'var(--text-dim)' }}>★</button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Comment (optional)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Describe your experience..." className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <PrimaryButton variant="purple" className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Review'}
        </PrimaryButton>
      </div>
    </div>
  );
}

function DisputeModal({ order, onClose, onDisputeSubmitted }: { order: EnrichedOrder; onClose: () => void; onDisputeSubmitted: () => void }) {
  const DISPUTE_REASONS = [
    'Work not delivered',
    'Quality below expectations',
    'Agent unresponsive',
    'Deliverables incomplete',
    'Order not as described',
    'Other',
  ];
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the issue in detail.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.marketplace.orders.dispute(order.id, { reason, description, evidence: evidence || undefined });
      setSuccess(true);
      setTimeout(() => { onDisputeSubmitted(); onClose(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit dispute. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'rgba(239,68,68,0.3)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5" style={{ color: 'var(--danger)' }} />
          <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Open a Dispute</h3>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Order: <span style={{ color: 'var(--text-primary)' }}>{order.listing?.title || order.id}</span></p>
        {success ? (
          <div className="text-center py-6">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Dispute submitted. Our team will review within 48h.</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Reason</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                {DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Description <span style={{ color: 'var(--danger)' }}>*</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the issue clearly..." className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div className="mb-5">
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Evidence (URLs or notes, optional)</label>
              <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={2} placeholder="Screenshot URLs, email chains, etc." className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm cursor-pointer" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer" style={{ background: submitting ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {submitting ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderMessagingThread({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await api.marketplace.orders.messages.list(orderId);
      setMessages(r.messages || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const msg = await api.marketplace.orders.messages.send(orderId, body.trim());
      setMessages(prev => [...prev, msg]);
      setBody('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="py-4 text-center text-xs" style={{ color: 'var(--text-dim)' }}>Loading messages...</div>;

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
      <div className="px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
        Order Thread
      </div>
      {error && <p className="text-xs p-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>No messages yet. Start the conversation.</p>
        ) : messages.map(m => (
          <div key={m.id} className={`flex ${m.senderRole === 'buyer' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] rounded-xl px-3 py-2 text-xs" style={{
              background: m.senderRole === 'buyer' ? 'rgba(139,92,246,0.15)' : m.senderRole === 'system' ? 'rgba(107,114,128,0.1)' : 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}>
              {m.senderRole === 'system' && <span className="block text-xs mb-0.5 font-medium" style={{ color: 'var(--text-dim)' }}>System</span>}
              <p>{m.body}</p>
              <span className="block text-right mt-1" style={{ color: 'var(--text-dim)', fontSize: '10px' }}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 p-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Message provider..."
          className="flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        />
        <button onClick={handleSend} disabled={sending || !body.trim()} className="p-2 rounded-lg cursor-pointer transition-all" style={{ background: body.trim() ? 'rgba(139,92,246,0.2)' : 'var(--bg-elevated)', color: body.trim() ? 'var(--marketplace)' : 'var(--text-dim)', border: '1px solid var(--border-color)' }}>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function OrderMilestoneTracker({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [milestones, setMilestones] = useState<OrderMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.marketplace.orders.milestones(orderId)
      .then(r => setMilestones(r.milestones || []))
      .catch(() => {
        const defaultSteps: OrderMilestone[] = [
          { id: '1', orderId, label: 'Order Received', status: 'completed', order: 1 },
          { id: '2', orderId, label: 'In Progress', status: orderStatus === 'confirmed' ? 'in_progress' : orderStatus === 'completed' ? 'completed' : 'pending', order: 2 },
          { id: '3', orderId, label: 'Review', status: orderStatus === 'completed' ? 'completed' : 'pending', order: 3 },
          { id: '4', orderId, label: 'Delivered', status: orderStatus === 'completed' ? 'completed' : 'pending', order: 4 },
        ];
        setMilestones(defaultSteps);
      })
      .finally(() => setLoading(false));
  }, [orderId, orderStatus]);

  if (loading) return null;

  const statusColor = (s: string) => s === 'completed' ? 'var(--success)' : s === 'in_progress' ? 'var(--accent)' : 'var(--text-dim)';
  const statusBg = (s: string) => s === 'completed' ? 'rgba(16,185,129,0.15)' : s === 'in_progress' ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)';

  return (
    <div className="mt-3 flex items-center gap-1 flex-wrap">
      {milestones.sort((a, b) => a.order - b.order).map((m, i) => (
        <div key={m.id} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: statusBg(m.status), color: statusColor(m.status) }}>
            {m.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : m.status === 'in_progress' ? <Clock className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border" style={{ borderColor: 'var(--text-dim)' }} />}
            {m.label}
          </div>
          {i < milestones.length - 1 && <div className="w-3 h-px" style={{ background: 'var(--border-color)' }} />}
        </div>
      ))}
    </div>
  );
}

export function BuyerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [periodMonths, setPeriodMonths] = useState(6);
  const [reviewOrder, setReviewOrder] = useState<EnrichedOrder | null>(null);
  const [disputeOrder, setDisputeOrder] = useState<EnrichedOrder | null>(null);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('order_watchlist') || '[]')); }
    catch { return new Set(); }
  });

  const toggleWatchlist = (orderId: string) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      localStorage.setItem('order_watchlist', JSON.stringify([...next]));
      return next;
    });
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.marketplace.orders.list({ role: 'buyer' });
      const rawOrders = result.orders || [];
      const enriched: EnrichedOrder[] = await Promise.all(
        rawOrders.map(async (o: Order) => {
          try {
            const listing = await api.marketplace.listings.get(o.listingId);
            return { ...o, listing };
          } catch {
            return o;
          }
        })
      );
      setOrders(enriched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const periodCutoff = new Date();
  periodCutoff.setMonth(periodCutoff.getMonth() - periodMonths);
  const periodOrders = orders.filter(o => new Date(o.createdAt) >= periodCutoff);

  const filtered = orders.filter(o => statusFilter === 'all' || o.status === statusFilter || (statusFilter === 'active' && o.status === 'confirmed'));

  const totalSpend = periodOrders.reduce((s, o) => s + Number(o.priceAmount || 0), 0);
  const activeCount = orders.filter(o => o.status === 'confirmed' || o.status === 'pending_payment').length;
  const completedCount = orders.filter(o => o.status === 'completed').length;

  const spendByAgent: Record<string, { name: string; spend: number }> = {};
  periodOrders.forEach(o => {
    const key = o.listingId;
    const name = o.listing?.title || key.slice(0, 12);
    if (!spendByAgent[key]) spendByAgent[key] = { name, spend: 0 };
    spendByAgent[key].spend += Number(o.priceAmount || 0);
  });
  const agentData = Object.values(spendByAgent).sort((a, b) => b.spend - a.spend).slice(0, 5);

  const spendByCategory: Record<string, number> = {};
  periodOrders.forEach(o => {
    const cat = o.listing?.category || 'Other';
    spendByCategory[cat] = (spendByCategory[cat] || 0) + Number(o.priceAmount || 0);
  });
  const categoryData = Object.entries(spendByCategory).map(([cat, spend]) => ({ cat, spend }));

  const spendData = buildSpendData(periodOrders, periodMonths);

  return (
    <div>
      {reviewOrder && <ReviewModal order={reviewOrder} onClose={() => setReviewOrder(null)} onReviewed={fetchOrders} />}
      {disputeOrder && <DisputeModal order={disputeOrder} onClose={() => setDisputeOrder(null)} onDisputeSubmitted={fetchOrders} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>My Orders</h1>
        <PrimaryButton variant="purple" onClick={() => navigate('/marketplace')}>Browse Marketplace</PrimaryButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Spent', value: `$${totalSpend.toFixed(2)}`, icon: DollarSign, color: 'var(--marketplace)' },
          { label: 'Active Orders', value: activeCount.toString(), icon: Clock, color: 'var(--accent)' },
          { label: 'Completed', value: completedCount.toString(), icon: CheckCircle, color: 'var(--success)' },
          { label: 'Watchlisted', value: watchlist.size.toString(), icon: BookmarkCheck, color: 'var(--warning)' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <GlassCard key={stat.label} className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{stat.label}</span>
              </div>
              <div className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
            </GlassCard>
          );
        })}
      </div>

      {orders.length > 0 && (
        <div className="space-y-6 mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Spend Analytics</h2>
            <div className="flex gap-1">
              {[{ label: '3M', v: 3 }, { label: '6M', v: 6 }, { label: '12M', v: 12 }].map(p => (
                <button key={p.v} onClick={() => setPeriodMonths(p.v)} className="text-xs px-2 py-1 rounded cursor-pointer" style={{ background: periodMonths === p.v ? 'rgba(139,92,246,0.15)' : 'transparent', color: periodMonths === p.v ? 'var(--marketplace)' : 'var(--text-dim)', border: 'none' }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard>
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Spend Over Time</h3>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={spendData}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--marketplace)' }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Spend']} />
                  <Bar dataKey="spend" fill="var(--marketplace)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>By Agent</h3>
              {agentData.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-dim)' }}>No data</p>
              ) : (
                <div className="space-y-2.5">
                  {agentData.map(({ name, spend }) => (
                    <div key={name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="truncate max-w-28" style={{ color: 'var(--text-muted)' }}>{name}</span>
                        <span style={{ color: 'var(--text-primary)' }}>${spend.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(spend / (agentData[0]?.spend || 1)) * 100}%`, background: 'var(--marketplace)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>By Category</h3>
              {categoryData.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-dim)' }}>No data</p>
              ) : (
                <div className="space-y-2.5">
                  {categoryData.sort((a, b) => b.spend - a.spend).map(({ cat, spend }) => (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                        <span style={{ color: 'var(--text-primary)' }}>${spend.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(spend / totalSpend) * 100}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {['all', 'active', 'completed', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f as typeof statusFilter)}
            className="px-3 py-1.5 rounded-lg text-sm capitalize cursor-pointer"
            style={{
              background: statusFilter === f ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: statusFilter === f ? 'var(--marketplace)' : 'var(--text-muted)',
              border: `1px solid ${statusFilter === f ? 'rgba(139,92,246,0.3)' : 'var(--border-color)'}`,
            }}
          >{f === 'all' ? 'All Orders' : f}</button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <PrimaryButton variant="ghost" onClick={fetchOrders}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No orders yet"
          description="Browse the marketplace and hire an agent to get started."
          action={<PrimaryButton variant="purple" onClick={() => navigate('/marketplace')}>Browse Marketplace</PrimaryButton>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const isExpanded = expandedOrderId === order.id;
            const isWatched = watchlist.has(order.id);
            return (
              <GlassCard key={order.id} className="!p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                          {order.listing?.title || 'Service'}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: getStatusBg(order.status), color: getStatusColor(order.status) }}>
                          {getStatusLabel(order.status)}
                        </span>
                        {isWatched && <BookmarkCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />}
                      </div>
                      {order.taskDescription && (
                        <p className="text-xs mb-2 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{order.taskDescription}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>${Number(order.priceAmount || 0).toFixed(2)}</span>
                        {order.paymentProvider && <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>{order.paymentProvider === 'usdc' ? 'USDC' : 'Stripe'}</span>}
                        {order.listing?.category && <span>{order.listing.category}</span>}
                        <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {order.status === 'confirmed' && (
                        <button
                          onClick={async () => {
                            setApprovingOrderId(order.id);
                            try {
                              await api.marketplace.orders.releaseMilestone(order.id);
                              fetchOrders();
                            } catch {
                              setError('Failed to approve milestone. Please try again.');
                            } finally {
                              setApprovingOrderId(null);
                            }
                          }}
                          disabled={approvingOrderId === order.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                          style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)', opacity: approvingOrderId === order.id ? 0.6 : 1 }}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" /> {approvingOrderId === order.id ? 'Approving...' : 'Approve Milestone'}
                        </button>
                      )}
                      {order.status === 'completed' && (
                        <button onClick={() => setReviewOrder(order)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <Star className="w-3.5 h-3.5" /> Review
                        </button>
                      )}
                      {(order.status === 'confirmed' || order.status === 'pending_payment' || order.status === 'completed') && (
                        <button onClick={() => setDisputeOrder(order)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.15)' }}>
                          <AlertCircle className="w-3.5 h-3.5" /> Dispute
                        </button>
                      )}
                      <button onClick={() => toggleWatchlist(order.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: isWatched ? 'rgba(245,158,11,0.1)' : 'var(--bg-elevated)', color: isWatched ? 'var(--warning)' : 'var(--text-muted)', border: `1px solid ${isWatched ? 'rgba(245,158,11,0.2)' : 'var(--border-color)'}` }}>
                        {isWatched ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                      </button>
                      {order.listing && (
                        <button onClick={() => navigate(`/marketplace/${order.listingId}`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                          View Agent
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                        style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.15)' }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <OrderMilestoneTracker orderId={order.id} orderStatus={order.status} />

                  {isExpanded && (
                    <OrderMessagingThread orderId={order.id} />
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
