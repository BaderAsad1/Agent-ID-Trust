import { useState, useEffect, useCallback } from 'react';
import { adminApi, ApiError, type AdminDisputeRow } from '@/lib/api';

type Resolution = 'refund_buyer' | 'release_seller' | 'split';

const STORAGE_KEY = 'agentid:admin_key';

export function AdminDisputes() {
  const [adminKey, setAdminKey] = useState<string>(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [authed, setAuthed] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [disputes, setDisputes] = useState<AdminDisputeRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('open,responded');
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, { resolution: Resolution; adminNote: string }>>({});
  const [actionState, setActionState] = useState<Record<string, { submitting?: boolean; error?: string; success?: string }>>({});

  const load = useCallback(async (key: string, status: string) => {
    setLoading(true);
    setAuthError('');
    try {
      const res = await adminApi.listDisputes(key, status);
      setDisputes(res.disputes);
      setAuthed(true);
      try { sessionStorage.setItem(STORAGE_KEY, key); } catch { /* noop */ }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAuthError('Invalid admin key');
        setAuthed(false);
      } else {
        setAuthError(e instanceof Error ? e.message : 'Failed to load disputes');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey && !authed) {
      void load(adminKey, statusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    void load(adminKey, statusFilter);
  };

  const refresh = () => void load(adminKey, statusFilter);

  const setDraft = (orderId: string, patch: Partial<{ resolution: Resolution; adminNote: string }>) => {
    setResolutionDraft(p => ({
      ...p,
      [orderId]: {
        resolution: patch.resolution ?? p[orderId]?.resolution ?? 'refund_buyer',
        adminNote: patch.adminNote ?? p[orderId]?.adminNote ?? '',
      },
    }));
  };

  const resolve = async (orderId: string) => {
    const draft = resolutionDraft[orderId] ?? { resolution: 'refund_buyer' as Resolution, adminNote: '' };
    setActionState(p => ({ ...p, [orderId]: { submitting: true } }));
    try {
      const res = await adminApi.resolveDispute(adminKey, orderId, {
        resolution: draft.resolution,
        adminNote: draft.adminNote || undefined,
      });
      setActionState(p => ({
        ...p,
        [orderId]: { success: `Resolved (${res.paymentAction})` },
      }));
      void load(adminKey, statusFilter);
    } catch (e) {
      setActionState(p => ({
        ...p,
        [orderId]: { error: e instanceof Error ? e.message : 'Failed to resolve' },
      }));
    }
  };

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0a0a0a)', color: 'var(--text-primary, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <form onSubmit={submitAuth} style={{ width: '100%', maxWidth: 380, background: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-color, #2a2a2a)', borderRadius: 12, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Admin · Disputes</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim, #888)', marginBottom: 12 }}>Enter the admin key to continue.</p>
          <input
            type="password"
            value={adminKey}
            onChange={e => setAdminKey(e.target.value)}
            placeholder="X-Admin-Key"
            data-testid="input-admin-key"
            style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13 }}
          />
          {authError && <p style={{ color: 'var(--error, #ef4444)', fontSize: 12, marginTop: 8 }}>{authError}</p>}
          <button
            type="submit"
            data-testid="button-admin-auth"
            disabled={!adminKey || loading}
            style={{ marginTop: 12, width: '100%', background: 'var(--marketplace, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: 13, cursor: 'pointer', opacity: !adminKey || loading ? 0.6 : 1 }}
          >{loading ? 'Authenticating…' : 'Continue'}</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0a0a0a)', color: 'var(--text-primary, #fff)', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Marketplace Disputes</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); void load(adminKey, e.target.value); }}
              data-testid="select-status-filter"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="open,responded">Awaiting action</option>
              <option value="open">Open</option>
              <option value="responded">Responded</option>
              <option value="resolved">Resolved</option>
              <option value="open,responded,resolved">All</option>
            </select>
            <button onClick={refresh} data-testid="button-refresh" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Refresh</button>
          </div>
        </div>

        {loading && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>}
        {!loading && disputes.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }} data-testid="text-no-disputes">No disputes match the current filter.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {disputes.map(({ dispute, order, listingTitle }) => {
            const draft = resolutionDraft[order.id] ?? { resolution: 'refund_buyer' as Resolution, adminNote: '' };
            const action = actionState[order.id] ?? {};
            return (
              <div
                key={dispute.id}
                data-testid={`card-dispute-${dispute.id}`}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600 }}>{listingTitle}</h3>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: 'var(--error, #ef4444)' }}>
                        {dispute.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      Order #{order.id.slice(0, 8)} · ${Number(order.priceAmount).toFixed(2)} · opened {new Date(dispute.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><span style={{ color: 'var(--text-dim)' }}>Reason: </span>{dispute.reason}</div>
                  {dispute.description && <div><span style={{ color: 'var(--text-dim)' }}>Buyer details: </span>{dispute.description}</div>}
                  {dispute.evidence && <div><span style={{ color: 'var(--text-dim)' }}>Evidence: </span>{dispute.evidence}</div>}
                  {dispute.sellerResponse && <div><span style={{ color: 'var(--text-dim)' }}>Seller response: </span>{dispute.sellerResponse}</div>}
                  {dispute.resolution && <div><span style={{ color: 'var(--text-dim)' }}>Resolution: </span>{dispute.resolution}{dispute.adminNote ? ` — ${dispute.adminNote}` : ''}</div>}
                </div>

                {dispute.status !== 'resolved' && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(['refund_buyer', 'release_seller', 'split'] as Resolution[]).map(r => {
                        const active = draft.resolution === r;
                        return (
                          <button
                            key={r}
                            onClick={() => setDraft(order.id, { resolution: r })}
                            data-testid={`button-resolution-${r}-${dispute.id}`}
                            style={{ background: active ? 'var(--marketplace)' : 'var(--bg-base)', color: active ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                          >{r.replace(/_/g, ' ')}</button>
                        );
                      })}
                    </div>
                    <textarea
                      value={draft.adminNote}
                      onChange={e => setDraft(order.id, { adminNote: e.target.value })}
                      placeholder="Optional admin note (sent to both parties)"
                      data-testid={`input-admin-note-${dispute.id}`}
                      rows={2}
                      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8, fontSize: 12, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => resolve(order.id)}
                        disabled={action.submitting}
                        data-testid={`button-resolve-${dispute.id}`}
                        style={{ background: 'var(--marketplace)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', opacity: action.submitting ? 0.6 : 1 }}
                      >{action.submitting ? 'Resolving…' : 'Resolve'}</button>
                      {action.error && <span style={{ color: 'var(--error, #ef4444)', fontSize: 12 }}>{action.error}</span>}
                      {action.success && <span style={{ color: 'var(--success, #10b981)', fontSize: 12 }} data-testid={`text-resolve-success-${dispute.id}`}>{action.success}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AdminDisputes;
