import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { PRICING_PLANS, HANDLE_PRICING_TIERS } from '@/lib/pricing';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';

const FAQ_ITEMS = [
  {
    q: 'What does the Free plan include?',
    a: 'One agent with a permanent UUID identity, trust scoring, a public ERC-8004 agent card, and full access to the SDK, MCP server, and REST API. Handles are available as a separate purchase.',
  },
  {
    q: 'What\'s the difference between a UUID and a handle?',
    a: 'Every agent gets a UUID — the permanent machine identifier that never expires. A handle like openclaw.agentid is the human-readable name that maps to it. Think IP address vs domain name. UUIDs are free forever.',
  },
  {
    q: 'Can I buy a handle without a paid plan?',
    a: 'Yes. Handles are available on any plan, including Free. Premium short handles (3-4 characters) are $99/year and $29/year respectively. Additional 5+ character handles are $5/year.',
  },
  {
    q: 'What happens if I don\'t renew a handle?',
    a: 'Your agent\'s UUID identity is permanent. Only handles are annual. After expiry, you get a 90-day grace period before the handle becomes available for re-registration.',
  },
  {
    q: 'Can I upgrade or downgrade anytime?',
    a: 'Yes. Changes take effect immediately and are prorated. Your agents keep their identities and handles regardless of plan changes.',
  },
  {
    q: 'Can my agent register itself?',
    a: 'Yes. The SDK supports fully autonomous registration — your agent generates keys, registers, and gets its identity in two API calls. No human required.',
  },
  {
    q: 'Is Agent ID on-chain?',
    a: 'Built on the ERC-8004 standard, deployed across 25+ chains including Base, Ethereum, Arbitrum, and Polygon. Handles can be minted as on-chain NFTs. Your agent card is ERC-8004 compliant regardless of on-chain status.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: 'var(--border-color)' }}>
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

const HANDLE_TABLE_ROWS = [
  { label: '5+ chars', price: '$5/year', example: 'openclaw.agentid', note: 'or free with paid plan' },
  { label: '4 chars', price: '$29/year', example: 'flux.agentid', note: 'Max 2 per account' },
  { label: '3 chars', price: '$99/year', example: 'kai.agentid', note: 'Max 1 per account' },
];

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

  const getYearlySavings = (plan: typeof PRICING_PLANS[number]): string | null => {
    if (plan.yearlySavings && billing === 'yearly') return plan.yearlySavings;
    return null;
  };

  const getCtaLabel = (plan: typeof PRICING_PLANS[number]) => {
    if (loadingPlan === plan.name) return 'Redirecting…';
    return plan.cta;
  };

  const handleCta = async (plan: typeof PRICING_PLANS[number]) => {
    if (plan.contactOnly) {
      window.location.href = 'mailto:team@getagent.id';
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

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Identity for every agent.
          </h1>
          <p className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Free to start. Scales with your fleet.
          </p>
          <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            Every agent gets a permanent machine identity at registration — it never expires, even on the free plan.
          </p>
        </div>

        {/* Billing toggle */}
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
            Annual
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>Save 17%</span>
          </button>
        </div>

        {/* Plan cards */}
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
                    <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Custom pricing</span>
                  )}
                </div>
                {billing === 'yearly' && plan.yearlyPrice && !plan.contactOnly && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>billed {plan.yearlyPrice}/yr</span>
                    {savings && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                        save {savings}
                      </span>
                    )}
                  </div>
                )}
                {billing === 'monthly' && !plan.contactOnly && plan.price && (
                  <div className="mb-2 h-5" />
                )}
                <p className="text-sm mb-5 italic" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
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
                  {getCtaLabel(plan)}
                </PrimaryButton>
              </GlassCard>
            );
          })}
        </div>

        <p className="text-center text-sm mb-20" style={{ color: 'var(--text-dim)' }}>
          No credit card required for Free · Cancel or change plans anytime
        </p>

        {/* Handle pricing table */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold mb-2 text-center" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            .agentid Handles
          </h2>
          <p className="text-center text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
            Give your agent a name.
          </p>
          <p className="text-center text-sm mb-8 max-w-xl mx-auto" style={{ color: 'var(--text-dim)' }}>
            Handles are available on any plan — including Free. Paid plans include free handles to get you started.
          </p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
            {/* Table header */}
            <div className="grid grid-cols-4 px-6 py-3 text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
              <span>Handle length</span>
              <span>Price</span>
              <span>Example</span>
              <span>Limits</span>
            </div>
            {HANDLE_TABLE_ROWS.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-4 px-6 py-4 text-sm items-center"
                style={{
                  background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)',
                  borderTop: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                }}
              >
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{row.price}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.example}</span>
                <span style={{ fontSize: 12 }}>{row.note}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-dim)' }}>
            On-chain NFT minting included for premium handles. Available for all handles when ready.
          </p>
        </div>

        {/* FAQ */}
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
