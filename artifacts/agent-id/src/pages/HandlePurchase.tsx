import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Footer } from '@/components/Footer';

const HANDLE_TIERS = [
  { tier: 'premium_3', label: '3-Character Handles', price: '$640/yr', priceNote: 'On-chain ENS pricing', example: 'kai', color: '#f59e0b' },
  { tier: 'premium_4', label: '4-Character Handles', price: '$160/yr', priceNote: 'On-chain ENS pricing', example: 'nova', color: '#8b5cf6' },
  { tier: 'standard_5plus', label: '5+ Character Handles', price: '$10/yr', priceNote: 'Included with any plan', example: 'marvin', color: '#10b981' },
];

export function HandlePurchase() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [handle, setHandle] = useState(searchParams.get('handle') ?? '');
  const [agentId, setAgentId] = useState(searchParams.get('agentId') ?? '');
  const [checkResult, setCheckResult] = useState<{
    available: boolean;
    tier?: string;
    annual?: number;
    annualUsd?: number;
    status?: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    if (handle && handle.length >= 3) {
      void checkHandle(handle);
    }
  }, []);

  async function checkHandle(h: string) {
    if (!h || h.length < 3) return;
    setChecking(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/handles/check?handle=${encodeURIComponent(h.toLowerCase())}`);
      const data = await res.json() as {
        available?: boolean;
        tier?: string;
        annual?: number;
        annualUsd?: number;
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        setCheckError(data.error ?? 'Failed to check handle');
        return;
      }
      setCheckResult(data as { available: boolean; tier?: string; annual?: number; annualUsd?: number; status?: string });
    } catch {
      setCheckError('Network error — please try again');
    } finally {
      setChecking(false);
    }
  }

  async function handlePurchase() {
    if (!userId) {
      navigate('/sign-in?next=/handle/purchase');
      return;
    }
    if (!checkResult?.available) return;
    const h = handle.toLowerCase();
    const tier = checkResult.tier;
    const isStandard = tier === 'standard_5plus';
    if (isStandard) {
      navigate('/pricing');
      return;
    }
    setPurchasing(true);
    try {
      const successUrl = `${window.location.origin}${BASE_URL}/dashboard?handle_purchased=${encodeURIComponent(h)}`;
      const cancelUrl = `${window.location.origin}${BASE_URL}/handle/purchase?handle=${encodeURIComponent(h)}`;
      const body: Record<string, string> = { handle: h, successUrl, cancelUrl };
      if (agentId) body.agentId = agentId;
      const res = await fetch(`${BASE_URL}/api/v1/billing/handle-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setCheckError(data.error ?? 'Failed to start checkout');
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckError('Network error — please try again');
    } finally {
      setPurchasing(false);
    }
  }

  const tierInfo = HANDLE_TIERS.find(t => t.tier === checkResult?.tier);

  return (
    <div style={{ minHeight: '100vh', padding: '80px 24px 40px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
        Purchase a Handle
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 40, fontSize: 16 }}>
        Handles are paid, expiring aliases for your permanent agent UUID identity. Priced by length, ENS-exact.
      </p>

      <div style={{
        background: 'var(--bg-card, rgba(255,255,255,0.05))',
        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        borderRadius: 16,
        padding: 32,
        marginBottom: 32,
      }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Handle
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', fontSize: 18, fontWeight: 600,
            }}>@</span>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="yourhandle"
              style={{
                width: '100%',
                padding: '12px 14px 12px 32px',
                background: 'var(--bg-input, rgba(0,0,0,0.3))',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 16,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={() => checkHandle(handle)}
            disabled={checking || handle.length < 3}
            style={{
              padding: '12px 24px',
              background: 'var(--brand-primary, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: handle.length >= 3 && !checking ? 'pointer' : 'not-allowed',
              opacity: handle.length < 3 || checking ? 0.5 : 1,
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: 'nowrap',
            }}
          >
            {checking ? 'Checking...' : 'Check'}
          </button>
        </div>

        {checkError && (
          <p style={{ marginTop: 12, color: '#ef4444', fontSize: 14 }}>{checkError}</p>
        )}

        {checkResult && (
          <div style={{ marginTop: 20 }}>
            {checkResult.available ? (
              <div style={{
                padding: 20,
                background: `${tierInfo?.color ?? '#10b981'}15`,
                border: `1px solid ${tierInfo?.color ?? '#10b981'}40`,
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        background: tierInfo?.color ?? '#10b981',
                        color: '#fff',
                        borderRadius: 6,
                        padding: '2px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>{tierInfo?.label ?? checkResult.tier}</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>Available</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>
                      @{handle.toLowerCase()}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                      {tierInfo?.priceNote}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: tierInfo?.color ?? '#10b981' }}>
                      {tierInfo?.price ?? `$${checkResult.annualUsd}/yr`}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>billed annually</div>
                  </div>
                </div>

                {checkResult.tier === 'standard_5plus' ? (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>
                      5+ character handles are included with any active plan ($10/yr).
                    </p>
                    <button
                      onClick={() => navigate('/pricing')}
                      style={{
                        width: '100%',
                        padding: '14px 24px',
                        background: 'var(--brand-primary, #6366f1)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 16,
                      }}
                    >
                      View Plans — from $29/mo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handlePurchase()}
                    disabled={purchasing}
                    style={{
                      marginTop: 16,
                      width: '100%',
                      padding: '14px 24px',
                      background: tierInfo?.color ?? '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: purchasing ? 'not-allowed' : 'pointer',
                      opacity: purchasing ? 0.7 : 1,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {purchasing ? 'Starting checkout...' : `Purchase @${handle.toLowerCase()} — ${tierInfo?.price ?? `$${checkResult.annualUsd}/yr`}`}
                  </button>
                )}

                {agentId && (
                  <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                    This handle will be assigned to agent {agentId.slice(0, 8)}…
                  </p>
                )}
              </div>
            ) : (
              <div style={{
                padding: 20,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12,
                color: '#ef4444',
              }}>
                @{handle.toLowerCase()} is <strong>{checkResult.status ?? 'unavailable'}</strong>. Try a different handle.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-card, rgba(255,255,255,0.03))',
        border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        borderRadius: 16,
        padding: 28,
        marginBottom: 32,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
          Handle Pricing
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {HANDLE_TIERS.map(t => (
            <div key={t.tier} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: `${t.color}10`,
              border: `1px solid ${t.color}30`,
              borderRadius: 10,
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>e.g. @{t.example}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: t.color, fontSize: 18 }}>{t.price}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.priceNote}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card, rgba(255,255,255,0.03))',
        border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        borderRadius: 16,
        padding: 28,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
          How handles work
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Your agent UUID is permanent and free — it never expires',
            'Handles are optional paid aliases on top of your UUID identity',
            '3–4 character handles are priced at ENS-exact rates (on-chain)',
            '5+ character handles require an active Starter plan or above',
            'Handles expire annually — renew to keep your handle alias',
          ].map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, color: 'var(--text-muted)', fontSize: 14 }}>
              <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>→</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Footer />
    </div>
  );
}
