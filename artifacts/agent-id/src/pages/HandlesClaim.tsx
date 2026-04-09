import { useState, useEffect, useRef } from 'react';
import { Search, CheckCircle, XCircle, Clock, AlertTriangle, AtSign, Loader2, Gavel, ArrowRight } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { api } from '@/lib/api';
import { HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';

type HandleStatus = 'idle' | 'loading' | 'available' | 'taken' | 'reserved' | 'in-auction' | 'invalid';

interface CheckResult {
  available: boolean;
  handle: string;
  status?: string;
  reserved?: boolean;
  reservedReason?: string;
  message?: string;
  reason?: string;
  tier?: string;
  annualUsd?: number;
  annual?: number;
  pricing?: {
    tier: string;
    annualPriceUsd: number;
    annualPriceCents: number;
    description: string;
  };
  auction?: {
    currentPrice: number;
    currentPriceDollars: number;
    endsAt: string;
    bidUrl: string;
  };
}

function getTierLabel(result: CheckResult): string {
  const tier = result.tier ?? result.pricing?.tier ?? '';
  if (tier === 'premium_3') return '3-character';
  if (tier === 'premium_4') return '4-character';
  if (tier === 'standard_5plus') return '5+ character';
  return '';
}

function getAnnualUsd(result: CheckResult): number | null {
  if (result.annualUsd !== undefined) return result.annualUsd;
  if (result.pricing?.annualPriceUsd !== undefined) return result.pricing.annualPriceUsd;
  return null;
}

function isStandardHandle(result: CheckResult): boolean {
  const tier = result.tier ?? result.pricing?.tier ?? '';
  return tier === 'standard_5plus';
}

function ScarcityBadge({ handle }: { handle: string }) {
  const len = handle.replace(/[^a-z0-9]/gi, '').length;
  if (len <= 3) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
        Ultra-scarce
      </span>
    );
  }
  if (len === 4) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
        Premium
      </span>
    );
  }
  return null;
}

function isFreePlan(plan: string | null): boolean {
  return plan === 'free' || plan === 'none' || plan === '';
}

function isPlanLoading(plan: string | null): boolean {
  return plan === null;
}

export function HandlesClaim() {
  const { userId } = useAuth();
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [existingHandleCount, setExistingHandleCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<HandleStatus>('idle');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      api.billing.subscription().catch(() => ({ plan: 'unknown' })),
      api.agents.list().catch(() => ({ agents: [] })),
    ]).then(([sub, agentData]) => {
      setUserPlan((sub as { plan?: string }).plan ?? 'none');
      const agents = (agentData as { agents: Array<{ handle?: string | null }> }).agents ?? [];
      setExistingHandleCount(agents.filter(a => a.handle).length);
    });
  }, [userId]);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed) {
      setStatus('idle');
      setResult(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus('loading');
    setResult(null);
    setClaimError(null);

    const seq = ++seqRef.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.handles.check(trimmed) as CheckResult;
        if (seq !== seqRef.current) return;
        setResult(data);
        if (!data.available) {
          if (data.status === 'in-auction') setStatus('in-auction');
          else if (data.status === 'taken') setStatus('taken');
          else if (data.reserved || data.status === 'reserved') setStatus('reserved');
          else if (!data.status && data.reason) setStatus('invalid');
          else setStatus('taken');
        } else {
          setStatus('available');
        }
      } catch (err: unknown) {
        if (seq !== seqRef.current) return;
        setStatus('invalid');
        setResult(null);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // A standard 5+ char handle is free only for paid plan users claiming their FIRST handle.
  const standardHandleIsFree =
    isStandardHandle(result ?? ({} as CheckResult)) &&
    !isFreePlan(userPlan) &&
    existingHandleCount === 0;

  const handleClaim = async () => {
    if (!result?.handle) return;
    setClaimLoading(true);
    setClaimError(null);
    try {
      if (standardHandleIsFree) {
        // First handle on a paid plan — no charge
        await api.agents.create({ handle: result.handle, displayName: result.handle });
        const successUrl = `/dashboard/handles?claimed=${encodeURIComponent(result.handle)}`;
        window.location.href = successUrl;
        return;
      }
      if (!isStandardHandle(result)) {
        // Premium handle (3 or 4 char) — always paid via checkout
        const base = window.location.origin;
        const successUrl = `${base}/dashboard/handles?claimed=${encodeURIComponent(result.handle)}`;
        const cancelUrl = `${base}/dashboard/handles`;
        const data = await api.billing.handleCheckout(result.handle, undefined, successUrl, cancelUrl);
        if (data.url) window.location.href = data.url;
        else if (data.included) window.location.href = successUrl;
        return;
      }
      // Standard handle but NOT free (free plan user, OR paid plan user already has a handle)
      const base = window.location.origin;
      const successUrl = `${base}/dashboard/handles?claimed=${encodeURIComponent(result.handle)}`;
      const cancelUrl = `${base}/dashboard/handles`;
      const data = await api.billing.handleCheckout(result.handle, undefined, successUrl, cancelUrl);
      if (data.url) window.location.href = data.url;
      else if (data.included) window.location.href = successUrl;
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim handle. Please try again.');
    } finally {
      setClaimLoading(false);
    }
  };

  const normalizedQuery = query.trim().replace(/^@/, '');
  const claimedParam = new URLSearchParams(window.location.search).get('claimed');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Claim a Handle
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Search for a handle and claim it. Your first standard handle is included free on Starter or Pro; additional handles and all Free-plan handles are $5/yr.
        </p>
      </div>

      {claimedParam && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Handle claimed successfully!</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>@{claimedParam} is now yours.</div>
          </div>
        </div>
      )}

      <GlassCard className="!p-6 mb-6">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
            <AtSign className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search a handle…"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-8 pr-10 py-3 rounded-xl text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-dim)' }} />}
            {status === 'available' && <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />}
            {status === 'in-auction' && <Gavel className="w-4 h-4" style={{ color: '#f59e0b' }} />}
            {(status === 'taken' || status === 'reserved' || status === 'invalid') && <XCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />}
          </div>
        </div>

        {normalizedQuery.length > 0 && status !== 'idle' && status !== 'loading' && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            {status === 'available' && result && (() => {
              const planLoading = isPlanLoading(userPlan) || existingHandleCount === null;
              const isStandard = isStandardHandle(result);
              const annualUsd = getAnnualUsd(result);

              // Derive what this handle costs for this user
              let handleCostLabel: string;
              let handleCostNote: string | null = null;
              if (!isStandard) {
                handleCostLabel = annualUsd !== null ? `$${annualUsd}/yr` : 'Paid';
              } else if (standardHandleIsFree) {
                handleCostLabel = 'Included free';
              } else if (isFreePlan(userPlan)) {
                handleCostLabel = '$5/yr';
                handleCostNote = 'Free plan · upgrade to Starter or Pro to get your first handle free';
              } else {
                // Paid plan but already has a handle
                handleCostLabel = '$5/yr';
                handleCostNote = `You already have ${existingHandleCount} handle${(existingHandleCount ?? 0) > 1 ? 's' : ''} — additional handles are $5/yr each`;
              }

              const ctaLabel = planLoading
                ? null
                : isStandard && standardHandleIsFree
                  ? `Register @${result.handle} — Free`
                  : isStandard
                    ? `Add @${result.handle} for $5/yr`
                    : `Claim @${result.handle}`;

              return (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>@{result.handle}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                          Available
                        </span>
                        <ScarcityBadge handle={result.handle} />
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {getTierLabel(result) && (
                          <span className="capitalize">{getTierLabel(result)} handle</span>
                        )}
                        {!planLoading && (
                          <span className="font-semibold" style={{ color: standardHandleIsFree ? 'var(--success)' : 'var(--text-primary)' }}>
                            {handleCostLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {planLoading ? (
                      <PrimaryButton variant="blue" className="flex-shrink-0" disabled>
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</span>
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton
                        variant="blue"
                        className="flex-shrink-0"
                        disabled={claimLoading}
                        onClick={handleClaim}
                      >
                        {claimLoading ? (
                          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</span>
                        ) : ctaLabel}
                      </PrimaryButton>
                    )}
                  </div>

                  {/* Context note for non-free cases */}
                  {!planLoading && handleCostNote && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(79,125,243,0.06)', border: '1px solid rgba(79,125,243,0.2)' }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#4f7df3' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold mb-1" style={{ color: '#e8e8f0' }}>
                          $5/yr for this handle
                        </div>
                        <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                          {handleCostNote}.{' '}
                          {isFreePlan(userPlan)
                            ? <>Standard 5+ character handles are <span style={{ color: '#34d399', fontWeight: 600 }}>included free</span> with Starter ($29/mo) or Pro ($79/mo).</>
                            : <>Your first handle per plan cycle is included; additional handles are $5/yr each.</>
                          }
                        </div>
                        {isFreePlan(userPlan) && (
                          <a
                            href="/pricing"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                            style={{ background: 'rgba(79,125,243,0.15)', color: '#4f7df3', border: '1px solid rgba(79,125,243,0.3)', textDecoration: 'none' }}
                          >
                            View plans <ArrowRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {claimError && (
                    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {claimError}
                    </div>
                  )}
                </div>
              );
            })()}

            {status === 'in-auction' && result && (
              <div className="flex items-start gap-3">
                <Gavel className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    @{result.handle} is in auction
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    This handle is currently in a dutch auction.
                    {result.auction && (
                      <> Current price: <span className="font-semibold">${result.auction.currentPriceDollars}</span>.</>
                    )}
                    {' '}Contact support@getagent.id if you want to participate.
                  </div>
                </div>
              </div>
            )}

            {status === 'taken' && (
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    @{result?.handle ?? normalizedQuery} is taken
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    This handle belongs to another agent. Try a different name.
                  </div>
                </div>
              </div>
            )}

            {status === 'reserved' && (
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    @{result?.handle ?? normalizedQuery} is reserved
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {result?.message ?? result?.reason ?? 'This handle is reserved. If you believe you are the rightful owner, contact support@getagent.id.'}
                  </div>
                </div>
              </div>
            )}

            {status === 'invalid' && (
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {result?.reason ?? 'Handle must be 3–100 characters using only letters, numbers, and hyphens.'}
                </div>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard className="!p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          Handle pricing tiers
        </h3>
        <div className="space-y-3">
          {HANDLE_PRICING_TIERS.map(tier => {
            const isStandardTier = tier.annualPrice === 0;
            let priceLabel: string;
            let priceColor: string;
            if (!isStandardTier) {
              priceLabel = `$${tier.annualPrice}/yr`;
              priceColor = 'var(--text-primary)';
            } else if (userPlan === null || existingHandleCount === null) {
              priceLabel = 'Included with paid plan';
              priceColor = 'var(--success)';
            } else if (!isFreePlan(userPlan) && existingHandleCount === 0) {
              priceLabel = 'Included free (1st handle)';
              priceColor = 'var(--success)';
            } else {
              priceLabel = isFreePlan(userPlan) ? '$5/yr' : '$5/yr (additional)';
              priceColor = 'var(--text-primary)';
            }
            return (
              <div key={tier.label} className="flex items-center justify-between text-sm">
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{tier.label}</span>
                <span className="font-semibold" style={{ color: priceColor }}>{priceLabel}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3 pt-3 border-t" style={{ color: 'var(--text-dim)', borderColor: 'var(--border-color)' }}>
          Grace period: 90 days after expiry · Handle loss never affects your UUID machine identity.
        </p>
      </GlassCard>

      <div className="mt-6 flex items-center gap-2">
        <Search className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Handles resolve through the Agent ID protocol. Web access at <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>name.getagent.id</span>.
        </span>
      </div>
    </div>
  );
}
