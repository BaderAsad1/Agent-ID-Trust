import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, CheckCircle, X, AlertCircle, RefreshCw, Star, Shield, Package, Zap, Award } from 'lucide-react';
import { Identicon, CapabilityChip, GlassCard, PrimaryButton, StarRating, ListSkeleton, EmptyState } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type Listing, type Review, type OrderMilestone } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatPrice } from '@/lib/pricing';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise() {
  if (!stripePromise) {
    stripePromise = api.marketplace.stripeConfig().then(({ publishableKey }) => {
      if (!publishableKey) return null;
      return loadStripe(publishableKey);
    }).catch(() => null);
  }
  return stripePromise;
}

type PackageTier = 'basic' | 'standard' | 'premium';

interface Package {
  tier: PackageTier;
  label: string;
  price: string;
  deliveryTime: string;
  deliverables: string[];
  highlighted?: boolean;
}

function formatDelivery(hours?: number | null): string {
  if (!hours) return '< 24 hours';
  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `< ${hours} hours`;
  return `${Math.ceil(hours / 24)} days`;
}

function buildPackages(listing: Listing): Package[] {
  const base = Number(listing.priceAmount || 25);
  const deliverables = listing.whatYouGet || ['Completed task', 'Summary report'];
  const baseDelivery = listing.deliveryHours;
  return [
    {
      tier: 'basic',
      label: 'Basic',
      price: `$${Math.round(base * 0.7)}`,
      deliveryTime: formatDelivery(baseDelivery ? baseDelivery * 2 : 48),
      deliverables: deliverables.slice(0, Math.max(2, Math.ceil(deliverables.length / 2))),
    },
    {
      tier: 'standard',
      label: 'Standard',
      price: `$${base}`,
      deliveryTime: formatDelivery(baseDelivery || 24),
      deliverables: deliverables,
      highlighted: true,
    },
    {
      tier: 'premium',
      label: 'Premium',
      price: `$${Math.round(base * 1.8)}`,
      deliveryTime: formatDelivery(baseDelivery ? Math.ceil(baseDelivery / 2) : 4),
      deliverables: [...deliverables, 'Priority support', 'Revisions included'],
    },
  ];
}

const DEFAULT_MILESTONE_STEPS = [
  { label: 'Order Received', icon: Package, color: 'var(--accent)', status: 'pending' as const },
  { label: 'In Progress', icon: Zap, color: 'var(--marketplace)', status: 'pending' as const },
  { label: 'Review', icon: Star, color: 'var(--warning)', status: 'pending' as const },
  { label: 'Delivered', icon: CheckCircle, color: 'var(--success)', status: 'pending' as const },
];

const MILESTONE_COLORS: Record<string, string> = {
  'pending': 'var(--border-color)',
  'in_progress': 'var(--marketplace)',
  'completed': 'var(--success)',
  'skipped': 'var(--text-dim)',
};

function MilestoneTimeline({ activeStep = 0, milestones }: { activeStep?: number; milestones?: OrderMilestone[] }) {
  if (milestones && milestones.length > 0) {
    const sorted = [...milestones].sort((a, b) => a.order - b.order);
    return (
      <div className="py-6">
        <h3 className="text-lg font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Milestone Plan</h3>
        <div className="space-y-3">
          {sorted.map((m, i) => {
            const color = MILESTONE_COLORS[m.status] || 'var(--border-color)';
            const isCompleted = m.status === 'completed';
            const isInProgress = m.status === 'in_progress';
            return (
              <div key={m.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: isCompleted ? 'rgba(16,185,129,0.15)' : isInProgress ? 'rgba(139,92,246,0.15)' : 'var(--bg-elevated)', border: `2px solid ${color}`, color }}>
                    {isCompleted ? '✓' : i + 1}
                  </div>
                  {i < sorted.length - 1 && <div className="w-0.5 h-5 mt-1" style={{ background: 'var(--border-color)' }} />}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>{m.status.replace('_', ' ')}</span>
                  </div>
                  {m.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{m.description}</p>}
                  {m.dueAt && <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>Due: {new Date(m.dueAt).toLocaleDateString()}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <h3 className="text-lg font-semibold mb-6" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>How it works</h3>
      <div className="flex items-start gap-0">
        {DEFAULT_MILESTONE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i <= activeStep;
          const isLast = i === DEFAULT_MILESTONE_STEPS.length - 1;
          return (
            <div key={step.label} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div className="flex-1" style={{ height: '2px', background: i === 0 ? 'transparent' : isActive ? step.color : 'var(--border-color)' }} />
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={{
                    background: isActive ? `${step.color}20` : 'var(--bg-elevated)',
                    border: `2px solid ${isActive ? step.color : 'var(--border-color)'}`,
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? step.color : 'var(--text-dim)' }} />
                </div>
                <div className="flex-1" style={{ height: '2px', background: isLast ? 'transparent' : isActive && i < activeStep ? DEFAULT_MILESTONE_STEPS[i + 1]?.color : 'var(--border-color)' }} />
              </div>
              <div className="text-center mt-2 px-1">
                <span className="text-xs font-medium" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-dim)' }}>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackageSelector({ listing, selectedTier, onSelect }: { listing: Listing; selectedTier: PackageTier; onSelect: (t: PackageTier) => void }) {
  const packages = buildPackages(listing);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {packages.map(pkg => (
        <div
          key={pkg.tier}
          onClick={() => onSelect(pkg.tier)}
          className="relative rounded-2xl p-5 cursor-pointer transition-all duration-200"
          style={{
            background: selectedTier === pkg.tier ? 'rgba(139,92,246,0.1)' : 'var(--bg-surface)',
            border: `2px solid ${selectedTier === pkg.tier ? 'var(--marketplace)' : pkg.highlighted ? 'rgba(139,92,246,0.3)' : 'var(--border-color)'}`,
          }}
        >
          {pkg.highlighted && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: 'var(--marketplace)', color: '#fff' }}>Most Popular</span>
            </div>
          )}
          <div className="mb-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{pkg.label}</span>
          </div>
          <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{pkg.price}</div>
          <div className="flex items-center gap-1 text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            <Clock className="w-3 h-3" /> {pkg.deliveryTime}
          </div>
          <ul className="space-y-2">
            {pkg.deliverables.map(d => (
              <li key={d} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                {d}
              </li>
            ))}
          </ul>
          {selectedTier === pkg.tier && (
            <div className="mt-4 text-xs font-medium text-center" style={{ color: 'var(--marketplace)' }}>Selected</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CheckoutForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message ?? 'Payment failed');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <PrimaryButton variant="purple" className="w-full" disabled={!stripe || processing}>
        {processing ? 'Processing...' : 'Confirm Payment'}
      </PrimaryButton>
    </form>
  );
}

type PaymentMethod = 'stripe' | 'usdc';

function HireModal({ onClose, listing }: { onClose: () => void; listing: Listing }) {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedTier, setSelectedTier] = useState<PackageTier>('standard');
  const [taskDesc, setTaskDesc] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [orderMilestones, setOrderMilestones] = useState<OrderMilestone[]>([]);

  const packages = buildPackages(listing);
  const selectedPkg = packages.find(p => p.tier === selectedTier)!;
  const tierPriceNum = Number(selectedPkg.price.replace('$', ''));

  useEffect(() => {
    getStripePromise().then((s) => setStripeReady(!!s));
  }, []);

  const fetchOrderMilestones = async (oid: string) => {
    try {
      const res = await api.marketplace.orders.milestones(oid);
      if (res.milestones && res.milestones.length > 0) setOrderMilestones(res.milestones);
    } catch { /* fallback to default visual */ }
  };

  const handleCreateOrder = async () => {
    if (!userId) { setError('Please sign in first'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.marketplace.orders.create({
        listingId: listing.id,
        taskDescription: `[${selectedPkg.label} Package] ${taskDesc || ''}`,
        packageTier: selectedTier,
        tierPrice: tierPriceNum.toString(),
        paymentProvider: paymentMethod,
      });
      setOrderId(result.id);
      if (paymentMethod === 'usdc') {
        fetchOrderMilestones(result.id);
        setStep(4);
        return;
      }
      if (!result.clientSecret) {
        setError('Payment processing unavailable. Please try again later.');
        return;
      }
      setClientSecret(result.clientSecret);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    if (!orderId) { setError('Order not found.'); return; }
    try {
      await api.marketplace.orders.confirmPayment(orderId);
      fetchOrderMilestones(orderId);
      setStep(4);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment was authorized but confirmation failed. Please contact support.');
    }
  };

  const stripePromiseVal = getStripePromise();
  const STEP_LABELS = ['Select Package', 'Review Milestones', 'Payment', 'Confirmed'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} aria-label="Close">
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: i + 1 <= step ? 'var(--marketplace)' : 'var(--bg-surface)',
                      color: i + 1 <= step ? '#fff' : 'var(--text-dim)',
                      border: `1px solid ${i + 1 <= step ? 'var(--marketplace)' : 'var(--border-color)'}`,
                    }}
                  >{i + 1}</div>
                  <span className="text-xs hidden sm:inline" style={{ color: i + 1 === step ? 'var(--text-primary)' : 'var(--text-dim)' }}>{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: i + 1 < step ? 'var(--marketplace)' : 'var(--border-color)', minWidth: 16 }} />}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Choose a package</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select the package that best fits your needs</p>
            </div>
            <PackageSelector listing={listing} selectedTier={selectedTier} onSelect={setSelectedTier} />
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Describe your specific needs (optional)</label>
              <textarea
                placeholder="Any specific requirements, context, or special instructions..."
                value={taskDesc}
                onChange={e => setTaskDesc(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-muted)' }}>Payment method</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'stripe' as PaymentMethod, label: 'Credit Card', sublabel: 'Stripe secured', icon: '💳' },
                  { key: 'usdc' as PaymentMethod, label: 'USDC', sublabel: 'Crypto payment', icon: '🪙' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMethod(m.key)}
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm cursor-pointer text-left"
                    style={{
                      background: paymentMethod === m.key ? 'rgba(139,92,246,0.1)' : 'var(--bg-base)',
                      borderColor: paymentMethod === m.key ? 'var(--marketplace)' : 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <div>
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{m.sublabel}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Package</span><span style={{ color: 'var(--text-primary)' }}>{selectedPkg.label}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Delivery</span><span style={{ color: 'var(--text-primary)' }}>{selectedPkg.deliveryTime}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Payment</span><span style={{ color: 'var(--text-primary)' }}>{paymentMethod === 'usdc' ? 'USDC' : 'Card'}</span></div>
              <div className="flex justify-between font-semibold pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total</span>
                <span style={{ color: 'var(--marketplace)' }}>{selectedPkg.price}{paymentMethod === 'usdc' ? ' USDC' : ''}</span>
              </div>
            </div>
            <PrimaryButton variant="purple" className="w-full" onClick={() => setStep(2)}>
              Review Milestones & Confirm
            </PrimaryButton>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Review your order milestones</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your <strong style={{ color: 'var(--marketplace)' }}>{selectedPkg.label}</strong> package includes these milestone steps. Funds are released milestone-by-milestone after your approval.</p>
            <MilestoneTimeline activeStep={0} />
            <div className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Package</span><span style={{ color: 'var(--text-primary)' }}>{selectedPkg.label}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Delivery</span><span style={{ color: 'var(--text-primary)' }}>{selectedPkg.deliveryTime}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Payment</span><span style={{ color: 'var(--text-primary)' }}>{paymentMethod === 'usdc' ? 'USDC' : 'Card'}</span></div>
              <div className="flex justify-between font-semibold pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total</span>
                <span style={{ color: 'var(--marketplace)' }}>{selectedPkg.price}{paymentMethod === 'usdc' ? ' USDC' : ''}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <PrimaryButton variant="ghost" className="flex-1" onClick={() => setStep(1)}>Back</PrimaryButton>
              <PrimaryButton variant="purple" className="flex-1" onClick={handleCreateOrder} disabled={submitting}>
                {submitting ? 'Creating order...' : paymentMethod === 'usdc' ? 'Pay with USDC' : 'Continue to Payment'}
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 3 && clientSecret && stripeReady && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Payment details</h3>
            <div className="rounded-lg border p-4 space-y-2 text-sm mb-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Service</span><span style={{ color: 'var(--text-primary)' }}>{listing.title}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Package</span><span style={{ color: 'var(--text-primary)' }}>{selectedPkg.label}</span></div>
              <div className="flex justify-between font-semibold"><span style={{ color: 'var(--text-primary)' }}>Total</span><span style={{ color: 'var(--marketplace)' }}>{selectedPkg.price}</span></div>
            </div>
            <Elements stripe={stripePromiseVal} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#a855f7' } } }}>
              <CheckoutForm onSuccess={handlePaymentSuccess} onError={(msg) => setError(msg)} />
            </Elements>
          </div>
        )}

        {step === 3 && (!clientSecret || !stripeReady) && (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--warning)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Payment processing is currently unavailable. Please try again later.</p>
          </div>
        )}

        {step === 4 && (
          <div className="py-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <CheckCircle className="w-8 h-8" style={{ color: 'var(--success)' }} />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Order confirmed!</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your {selectedPkg.label} package is now active. The agent will begin working shortly.</p>
              {orderId && (
                <div className="mt-2 text-xs px-3 py-1.5 rounded-lg inline-block" style={{ background: 'var(--bg-surface)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  Order #{orderId.slice(0, 8)}
                </div>
              )}
            </div>
            <MilestoneTimeline activeStep={1} milestones={orderMilestones.length > 0 ? orderMilestones : undefined} />
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <PrimaryButton variant="purple" className="flex-1" onClick={() => { onClose(); navigate('/mail'); }}>
                Message Agent
              </PrimaryButton>
              <PrimaryButton variant="ghost" className="flex-1" onClick={() => { onClose(); navigate('/dashboard/orders'); }}>
                View My Orders
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'reviews'>('overview');
  const [showHire, setShowHire] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const l = await api.marketplace.listings.get(id);
      setListing(l);
      try {
        const r = await api.marketplace.reviews.byListing(id);
        setReviews(r.reviews || []);
      } catch { setReviews([]); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-10"><ListSkeleton rows={6} /></div>
    </div>
  );

  if (error || !listing) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-10 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'Listing not found'}</p>
        <PrimaryButton variant="ghost" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
      </div>
      <Footer />
    </div>
  );

  const avgRating = Number(listing.avgRating || 0);

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      {showHire && <HireModal onClose={() => setShowHire(false)} listing={listing} />}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-sm mb-6">
          <button onClick={() => navigate('/marketplace')} className="cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>Marketplace</button>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-dim)' }}>{listing.category}</span>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-muted)' }}>{listing.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
          <div className="lg:col-span-7">
            <div className="flex items-start gap-4 mb-6">
              <Identicon handle={listing.agentId || listing.id} size={56} />
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{listing.title}</h1>
                <div className="flex flex-wrap items-center gap-3">
                  {avgRating > 0 && <StarRating rating={avgRating} count={reviews.length} />}
                  {listing.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--marketplace)' }}>{listing.category}</span>}
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--domain)' }}>
                    <Shield className="w-3.5 h-3.5" /> Identity Verified
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mb-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {[{ key: 'overview' as const, label: 'Overview' }, { key: 'reviews' as const, label: `Reviews (${reviews.length})` }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="pb-3 text-sm font-medium cursor-pointer"
                  style={{ color: tab === t.key ? 'var(--marketplace)' : 'var(--text-muted)', background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? 'var(--marketplace)' : 'transparent' }}
                  aria-label={t.label}
                >{t.label}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-8">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{listing.description}</p>

                <div>
                  <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Packages</h3>
                  <PackageSelector
                    listing={listing}
                    selectedTier="standard"
                    onSelect={() => {}}
                  />
                </div>

                <MilestoneTimeline activeStep={0} />

                {listing.whatYouGet && listing.whatYouGet.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>What you get</h3>
                    <ul className="space-y-2">
                      {listing.whatYouGet.map(item => (
                        <li key={item} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Capabilities</h3>
                  <div className="flex flex-wrap gap-2">
                    {(listing.capabilities || []).map(c => <CapabilityChip key={c} label={c} variant="purple" />)}
                  </div>
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div className="space-y-4">
                {reviews.length === 0 ? (
                  <EmptyState icon={<Star className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />} title="No reviews yet" description="Be the first to hire this agent and leave a review." />
                ) : (
                  reviews.map(r => (
                    <GlassCard key={r.id} className="!p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StarRating rating={r.rating} />
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                            Verified Purchase
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{r.comment}</p>
                    </GlassCard>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              <GlassCard purple>
                <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{formatPrice(listing.priceAmount, listing.priceType)}</div>
                <div className="flex items-center gap-1 text-sm mb-1" style={{ color: 'var(--text-dim)' }}>
                  <Clock className="w-3.5 h-3.5" /> {formatDelivery(listing.deliveryHours)} typical
                </div>
                <PrimaryButton large variant="purple" className="w-full mb-2" onClick={() => setShowHire(true)}>
                  Hire this Agent
                </PrimaryButton>
                <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>Secure payment via Stripe. Funds held in escrow until delivery.</p>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
