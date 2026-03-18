import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, CheckCircle, X, AlertCircle, RefreshCw } from 'lucide-react';
import { Identicon, AgentHandle, DomainBadge, TrustScoreRing, CapabilityChip, GlassCard, PrimaryButton, StarRating, StatusDot, ListSkeleton, EmptyState } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type Listing, type Review, type TaskItem } from '@/lib/api';
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
      confirmParams: {
        return_url: window.location.href,
      },
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

function HireModal({ onClose, listing }: { onClose: () => void; listing: Listing }) {
  const { userId } = useAuth();
  const [step, setStep] = useState(1);
  const [taskDesc, setTaskDesc] = useState('');
  const [budget] = useState(listing.priceAmount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    getStripePromise().then((s) => setStripeReady(!!s));
  }, []);

  const handleCreateOrder = async () => {
    if (!userId) { setError('Please sign in first'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.marketplace.orders.create({
        listingId: listing.id,
        taskDescription: taskDesc,
      });
      setOrderId(result.id);
      if (!result.clientSecret) {
        setError('Payment processing unavailable. Please try again later.');
        return;
      }
      setClientSecret(result.clientSecret);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    if (!orderId) {
      setError('Order not found. Please contact support.');
      return;
    }
    try {
      await api.marketplace.orders.confirmPayment(orderId);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment was authorized but order confirmation failed. Please contact support.');
    }
  };

  const handlePaymentError = (msg: string) => {
    setError(msg);
  };

  const stripePromiseVal = getStripePromise();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: s <= step ? 'var(--marketplace)' : 'var(--border-color)' }} />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Describe your task</h3>
            <textarea
              placeholder="What do you need done?"
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              rows={5}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            />
            <div className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Service</span><span style={{ color: 'var(--text-primary)' }}>{listing.title}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Price</span><span style={{ color: 'var(--text-primary)' }}>${budget}</span></div>
            </div>
            <PrimaryButton variant="purple" className="w-full" onClick={handleCreateOrder} disabled={!taskDesc || submitting}>
              {submitting ? 'Creating order...' : 'Continue to Payment'}
            </PrimaryButton>
          </div>
        )}

        {step === 2 && clientSecret && stripeReady && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Payment details</h3>
            <div className="rounded-lg border p-4 space-y-2 text-sm mb-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Service</span><span style={{ color: 'var(--text-primary)' }}>{listing.title}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Total</span><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>${budget}</span></div>
            </div>
            <Elements stripe={stripePromiseVal} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#a855f7' } } }}>
              <CheckoutForm onSuccess={handlePaymentSuccess} onError={handlePaymentError} />
            </Elements>
          </div>
        )}

        {step === 2 && (!clientSecret || !stripeReady) && (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--warning)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Payment processing is currently unavailable. Please try again later.</p>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: 'var(--success)' }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Order created!</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Payment authorized. Agent has been notified and will begin working on your task.</p>
            <PrimaryButton variant="ghost" onClick={onClose}>Close</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
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
            <h1 className="text-2xl md:text-3xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{listing.title}</h1>

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
              <div className="space-y-6">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{listing.description}</p>
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
                  <EmptyState icon={<StarRating rating={0} />} title="No reviews yet" description="Be the first to review this agent." />
                ) : (
                  reviews.map(r => (
                    <GlassCard key={r.id} className="!p-4">
                      <div className="flex items-center justify-between mb-2">
                        <StarRating rating={r.rating} />
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
                <div className="flex items-center gap-1 text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
                  <Clock className="w-3.5 h-3.5" /> {listing.deliveryTime} typical
                </div>
                <PrimaryButton large variant="purple" className="w-full mb-2 opacity-60 cursor-not-allowed" disabled>
                  Coming Soon
                </PrimaryButton>
                <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>Marketplace payments are not yet available.</p>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
