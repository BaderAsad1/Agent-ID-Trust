import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS, HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';

const shortHandleFaq = (() => {
  const t3 = HANDLE_PRICING_TIERS.find(t => t.minLength === 3);
  const t4 = HANDLE_PRICING_TIERS.find(t => t.minLength === 4);
  return `3- and 4-character handles are premium due to their scarcity  -  priced at $${t3?.annualPrice ?? 99}/yr and $${t4?.annualPrice ?? 29}/yr respectively, similar to ENS short-name pricing. Handles with 5 or more characters are included at no extra charge with any Starter, Pro, or Enterprise plan.`;
})();

const FAQ_ITEMS = [
  {
    q: 'What happens if I don\'t renew?',
    a: 'Your UUID machine identity is permanent  -  it never expires and always resolves. Only your handle (the human-readable alias) is annual. After expiry you get a 90-day grace period, then a 21-day decreasing-price auction before the handle becomes available to others.',
  },
  {
    q: 'Can I upgrade or downgrade at any time?',
    a: 'Yes. Plan changes take effect immediately and are prorated. Downgrading from Pro to Starter is seamless  -  your agents retain their UUID identities. 5+ character handles are included with any paid plan.',
  },
  {
    q: 'What are short handles and how are they priced?',
    a: shortHandleFaq,
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 text-left cursor-pointer gap-4"
        style={{ background: 'none', border: 'none' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{q}</span>
        {open
          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
          : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />}
      </button>
      {open && (
        <p className="pb-4 text-sm" style={{ color: 'var(--text-muted)' }}>{a}</p>
      )}
    </div>
  );
}

export function Pricing() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const getDisplayPrice = (plan: typeof PRICING_PLANS[number]) => {
    if (plan.price === null) return null;
    if (billing === 'yearly' && plan.yearlyPriceMonthly) return plan.yearlyPriceMonthly;
    return plan.price;
  };

  const getYearlySavings = (plan: typeof PRICING_PLANS[number]): number | null => {
    if (!plan.price || !plan.yearlyPrice) return null;
    const monthly = parseInt(plan.price.replace('$', ''), 10);
    const yearly = parseInt(plan.yearlyPrice.replace('$', ''), 10);
    return monthly * 12 - yearly;
  };

  const handleCta = async (plan: typeof PRICING_PLANS[number]) => {
    if (plan.contactOnly) {
      window.location.href = 'mailto:enterprise@getagent.id';
      return;
    }
    if (plan.name === 'Free') {
      navigate(userId ? '/dashboard' : '/start');
      return;
    }
    if (!userId) {
      navigate(`/start?plan=${plan.name.toLowerCase()}`);
      return;
    }
    try {
      setLoadingPlan(plan.name);
      const base = window.location.origin;
      const result = await api.billing.checkout({
        plan: plan.name.toLowerCase() as 'starter' | 'pro',
        billingInterval: billing,
        successUrl: `${base}/dashboard?upgraded=true`,
        cancelUrl: `${base}/pricing`,
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      navigate('/dashboard/settings');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Simple pricing. SDK, MCP, and REST API included.
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Four tiers, starting free. Every agent gets a permanent UUID identity at registration, regardless of plan.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={() => setBilling('monthly')}
            className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
            style={{
              background: billing === 'monthly' ? 'rgba(79,125,243,0.15)' : 'transparent',
              color: billing === 'monthly' ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${billing === 'monthly' ? 'rgba(79,125,243,0.3)' : 'var(--border-color)'}`,
            }}
          >Monthly</button>
          <button
            onClick={() => setBilling('yearly')}
            className="text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2"
            style={{
              background: billing === 'yearly' ? 'rgba(79,125,243,0.15)' : 'transparent',
              color: billing === 'yearly' ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${billing === 'yearly' ? 'rgba(79,125,243,0.3)' : 'var(--border-color)'}`,
            }}
          >
            Yearly
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Save 2 months</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {PRICING_PLANS.map(plan => {
            const displayPrice = getDisplayPrice(plan);
            const savings = getYearlySavings(plan);
            return (
              <GlassCard
                key={plan.name}
                className={`!p-8 flex flex-col ${plan.highlight ? "!border-[var(--accent)]" : ""}`}
              >
                {plan.highlight && (
                  <div className="text-xs font-semibold px-3 py-1 rounded-full mb-4 self-start" style={{ background: 'rgba(79,125,243,0.1)', color: 'var(--accent)' }}>
                    Most popular
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  {displayPrice ? (
                    <>
                      <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{displayPrice}</span>
                      {!plan.contactOnly && <span className="text-sm" style={{ color: 'var(--text-dim)' }}>/ mo</span>}
                    </>
                  ) : (
                    <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Contact us</span>
                  )}
                </div>
                {billing === 'yearly' && plan.yearlyPrice && !plan.contactOnly && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>billed {plan.yearlyPrice}/yr</span>
                    {savings !== null && savings > 0 && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                        Save ${savings}/yr
                      </span>
                    )}
                  </div>
                )}
                {billing === 'monthly' && !plan.contactOnly && plan.price && (
                  <div className="mb-2 h-5" />
                )}
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <PrimaryButton
                  variant={plan.variant}
                  className="w-full"
                  disabled={loadingPlan === plan.name}
                  onClick={() => handleCta(plan)}
                >
                  {loadingPlan === plan.name ? 'Redirecting…' : plan.cta}
                </PrimaryButton>
              </GlassCard>
            );
          })}
        </div>

        <p className="text-center text-sm mb-16" style={{ color: 'var(--text-dim)' }}>
          Trusted by autonomous agents everywhere  -  verifiable, routable, and ready to work.
        </p>

        <div className="max-w-[700px] mx-auto">
          <h2 className="text-xl font-bold mb-6 text-center" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Frequently asked questions
          </h2>
          <div>
            {FAQ_ITEMS.map(item => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
