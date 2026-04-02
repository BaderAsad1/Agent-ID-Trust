import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Footer } from '@/components/Footer';
import { api } from '@/lib/api';

interface HandleTier {
  tier: string;
  label: string;
  price: string;
  priceNote: string;
  example: string;
  color: string;
  badge: string;
  minLen: number;
  maxLen: number;
  includedWithPaidPlan: boolean;
}

const HANDLE_TIERS: HandleTier[] = [
  { tier: 'premium_3', label: '3-Character Handles', price: '$99/yr', priceNote: 'Ultra-premium short handle', example: 'kai', color: '#f59e0b', badge: 'Premium', minLen: 3, maxLen: 3, includedWithPaidPlan: false },
  { tier: 'premium_4', label: '4-Character Handles', price: '$29/yr', priceNote: 'Premium short handle', example: 'nova', color: '#8b5cf6', badge: 'Standard', minLen: 4, maxLen: 4, includedWithPaidPlan: false },
  { tier: 'standard_5plus', label: '5+ Character Handles', price: 'Included', priceNote: 'Included with Starter, Pro, or Enterprise', example: 'marvin', color: '#10b981', badge: 'Basic', minLen: 5, maxLen: Infinity, includedWithPaidPlan: true },
];

function getTierByHandle(handle: string): HandleTier | null {
  const len = handle.replace(/[^a-z0-9-]/g, '').length;
  if (len <= 0 || len <= 2) return null;
  return HANDLE_TIERS.find(t => len >= t.minLen && len <= t.maxLen) ?? null;
}

function getTierByKey(tierKey: string): HandleTier | null {
  return HANDLE_TIERS.find(t => t.tier === tierKey) ?? null;
}

export function HandlePurchase() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [handle, setHandle] = useState(searchParams.get('handle') ?? '');
  const [agentId, setAgentId] = useState(searchParams.get('agentId') ?? '');
  const [displayName, setDisplayName] = useState('');
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
  const [successHandle, setSuccessHandle] = useState<string | null>(null);

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

  const checkHandle = useCallback(async (h: string) => {
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
      setCheckError('Network error  -  please try again');
    } finally {
      setChecking(false);
    }
  }, [BASE_URL]);

  useEffect(() => {
    if (!handle || handle.length < 3) {
      setCheckResult(null);
      setCheckError(null);
      return;
    }
    const delay = handle === (searchParams.get('handle') ?? '') ? 0 : 500;
    const timeout = setTimeout(() => {
      void checkHandle(handle);
    }, delay);
    return () => clearTimeout(timeout);
  }, [handle, checkHandle]);

  async function handleRegisterFree() {
    if (!userId) {
      navigate('/sign-in?next=/handle/purchase?handle=' + encodeURIComponent(handle));
      return;
    }
    if (!checkResult?.available) return;
    const h = handle.toLowerCase();
    setPurchasing(true);
    setCheckError(null);
    try {
      await api.agents.create({
        handle: h,
        displayName: displayName.trim() || h,
      });
      setSuccessHandle(h);
      setTimeout(() => navigate('/dashboard'), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register handle';
      setCheckError(msg);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePurchase() {
    if (!userId) {
      navigate('/sign-in?next=/handle/purchase?handle=' + encodeURIComponent(handle));
      return;
    }
    if (!checkResult?.available) return;
    const h = handle.toLowerCase();
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
      setCheckError('Network error  -  please try again');
    } finally {
      setPurchasing(false);
    }
  }

  const handleLen = handle.replace(/[^a-z0-9-]/g, '').length;
  const isReserved = handleLen > 0 && handleLen <= 2;
  const tierInfo: HandleTier | null = (checkResult?.tier ? getTierByKey(checkResult.tier) : null) ?? getTierByHandle(handle);
  const isIncludedHandle = tierInfo?.includedWithPaidPlan ?? false;

  const inputBorderColor = handle.length < 3
    ? 'var(--border-color, rgba(255,255,255,0.15))'
    : checking
      ? 'rgba(255,255,255,0.2)'
      : checkResult?.available
        ? '#10b981'
        : checkResult
          ? '#ef4444'
          : 'var(--border-color, rgba(255,255,255,0.15))';

  if (successHandle) {
    return (
      <div style={{ minHeight: '100vh', padding: '80px 24px 40px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            @{successHandle} is yours!
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 16, marginBottom: 24 }}>
            Your handle has been registered. Redirecting to your dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '80px 24px 40px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
        Claim Your Handle
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 40, fontSize: 16 }}>
        5+ character handles are included with Starter, Pro, or Enterprise plans. Premium short handles (3–4 chars) are priced by scarcity.
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
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: 18, fontWeight: 600, zIndex: 1,
          }}>@</span>
          <input
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="yourhandle"
            style={{
              width: '100%',
              padding: '12px 42px 12px 32px',
              background: 'var(--bg-input, rgba(0,0,0,0.3))',
              border: `1px solid ${inputBorderColor}`,
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 16,
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
          />
          <span style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 16,
          }}>
            {checking ? '⏳' : checkResult?.available ? '✅' : checkResult ? '❌' : ''}
          </span>
        </div>

        {isReserved && handle.length > 0 && (
          <p style={{ marginTop: 10, color: '#f59e0b', fontSize: 13 }}>
            {handleLen === 1 ? 'Too short  -  handles must be at least 3 characters.' : 'Too short  -  1–2 character handles are reserved and not available.'}
          </p>
        )}

        {handle.length >= 3 && !checking && !checkResult && !checkError && (
          <p style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            Checking availability…
          </p>
        )}

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {tierInfo && (
                        <span style={{
                          background: tierInfo.color,
                          color: '#fff',
                          borderRadius: 6,
                          padding: '2px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}>{tierInfo.badge}</span>
                      )}
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        {isIncludedHandle ? 'Available  -  Included with plan' : 'Available'}
                      </span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>
                      @{handle.toLowerCase()}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                      {tierInfo?.priceNote ?? ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: tierInfo?.color ?? '#10b981' }}>
                      {isIncludedHandle ? 'Included' : (tierInfo?.price ?? `$${checkResult.annualUsd}/yr`)}
                    </div>
                    {!isIncludedHandle && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>billed annually</div>
                    )}
                  </div>
                </div>

                {isIncludedHandle ? (
                  <div>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Display name (optional)"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'var(--bg-input, rgba(0,0,0,0.3))',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        boxSizing: 'border-box',
                        marginBottom: 12,
                      }}
                    />
                    <button
                      onClick={() => void handleRegisterFree()}
                      disabled={purchasing}
                      style={{
                        width: '100%',
                        padding: '14px 24px',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: purchasing ? 'not-allowed' : 'pointer',
                        opacity: purchasing ? 0.7 : 1,
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {purchasing ? 'Registering…' : `Register @${handle.toLowerCase()}  -  Included with plan`}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handlePurchase()}
                    disabled={purchasing}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      background: tierInfo?.color ?? '#8b5cf6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: purchasing ? 'not-allowed' : 'pointer',
                      opacity: purchasing ? 0.7 : 1,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {purchasing ? 'Starting checkout…' : `Register & Pay @${handle.toLowerCase()}  -  ${tierInfo?.price ?? `$${checkResult.annualUsd}/yr`}`}
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
                ❌ @{handle.toLowerCase()} is <strong>{checkResult.status ?? 'unavailable'}</strong>. Try a different handle.
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{
                    background: t.color, color: '#fff', borderRadius: 4,
                    padding: '1px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  }}>{t.badge}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>e.g. @{t.example}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: t.color, fontSize: 18 }}>{t.price}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.priceNote}</div>
              </div>
            </div>
          ))}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10,
          }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>1–2 Character Handles</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>e.g. @ai</div>
            </div>
            <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 18 }}>Reserved</div>
          </div>
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
            'Your agent UUID is permanent and free  -  it never expires',
            'Handles are optional aliases on top of your UUID identity',
            '5+ character handles are included with Starter, Pro, or Enterprise plans',
            '3–4 character handles are premium short handles priced by scarcity',
            'Paid handles expire annually  -  renew to keep your handle alias',
            'Add on-chain minting to any handle for $5 to anchor it to Base',
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
