import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ChevronRight, CreditCard, Zap } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { useIsMobile } from '@/hooks/use-mobile';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#34d399' : 'rgba(255,255,255,0.35)', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function CodeBlock({ code, lang = 'typescript', title }: { code: string; lang?: string; title?: string }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title || lang}</span>
        <CopyButton text={code} />
      </div>
      <pre style={{ margin: 0, padding: '16px 18px', fontSize: 12.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', overflowX: 'auto', fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const MPP_SDK_EXAMPLE = `// ── Option A: Agent ID SDK (recommended) ─────────────────
import { AgentID } from '@agentid/sdk'

const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })

// 1. Create a payment intent (wraps Stripe MPP under the hood)
const intent = await agent.mpp.createPaymentIntent({
  amountCents: 100,          // $1.00
  paymentType: 'api_call',
  resourceId: 'premium-research',
})

console.log(intent.paymentIntentId)  // pi_...

// 2. Retry the original 402-gated request with payment attached
const result = await agent.mpp.payAndRetry(
  '/api/v1/premium/research',
  requirement,            // The MppPaymentRequirement from the 402 response
  intent.paymentIntentId!,
  { method: 'POST', body: { query: 'climate data 2024' } }
)

// 3. Check payment history
const { payments } = await agent.mpp.getPaymentHistory(20, 0)

// ── Option B: Raw Stripe MPP API ──────────────────────────
// (Stripe API version 2026-03-04.preview)
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-03-04.preview',
})

const paymentIntent = await stripe.paymentIntents.create({
  amount: 100,               // $1.00 in cents
  currency: 'usd',
  payment_method_types: ['crypto'],
  payment_method_data: { type: 'crypto' },
  payment_method_options: {
    crypto: {
      mode: 'deposit',
      deposit_options: { networks: ['tempo'] },
    },
  },
  confirm: true,
})

// Funds settle on Tempo blockchain, then appear in Stripe Dashboard
// on the business's standard payout schedule.
// Same fraud protection, tax calc, and reporting as any Stripe txn.`;

const MPP_402_HANDLER = `// Handling 402 responses automatically
import { MppModule } from '@agentid/sdk'

const response = await fetch('/api/v1/some/paid-endpoint', {
  headers: { 'X-Agent-Key': process.env.AGENTID_API_KEY }
})

if (MppModule.isMppPaymentRequired(response)) {
  const body = await response.json()
  const requirement = MppModule.parseMppRequirement(body)

  if (requirement) {
    // Trust discounts are pre-applied in requirement.amountCents
    // if your agent is verified/trusted/elite
    console.log('Amount due:', requirement.amountCents, 'cents')
    console.log('Discount:', requirement.trustDiscount?.discountPercent + '%')

    const intent = await agent.mpp.createPaymentIntent({
      amountCents: requirement.amountCents,
      paymentType: requirement.paymentType,
      resourceId: requirement.resourceId,
    })

    const result = await agent.mpp.payAndRetry(
      requirement.resource,
      requirement,
      intent.paymentIntentId!,
    )
  }
}`;

const X402_EXAMPLE = `// x402 USDC on Base  -  for on-chain, stablecoin payments
// Served via the same 402 response pattern

const response = await fetch('/api/v1/some/crypto-endpoint', {
  headers: { 'X-Agent-Key': process.env.AGENTID_API_KEY }
})

// 402 response includes x402 payment requirements
const body = await response.json()
// body.protocol = "x402"
// body.requirement.network = "base"
// body.requirement.currency = "USDC"
// body.requirement.amount = "1.00"
// body.requirement.recipient = "0x..."

// Use an x402-compatible client to complete on-chain payment
// then retry with X-Payment-Receipt header`;

const API_CREATE_INTENT = `curl -X POST https://getagent.id/api/v1/mpp/create-intent \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Key: agk_your_key" \\
  -d '{
    "amountCents": 100,
    "currency": "usd",
    "paymentType": "api_call",
    "resourceId": "premium-research"
  }'

# Returns:
# {
#   "success": true,
#   "paymentIntentId": "pi_...",
#   "clientSecret": "pi_..._secret_..."
# }`;

const LIST_PROVIDERS = `import { MppModule } from '@agentid/sdk'

const providers = MppModule.listProviders()
// [
//   { name: "stripe_mpp", protocol: "stripe_mpp",
//     description: "Stripe Machine Payments Protocol  -  fiat via Stripe" },
//   { name: "x402_usdc", protocol: "x402",
//     description: "x402 USDC on Base  -  crypto via USDC stablecoin" }
// ]`;

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'stripe-mpp', label: 'Stripe MPP' },
  { id: 'x402', label: 'x402 (USDC)' },
  { id: 'trust-discounts', label: 'Trust discounts' },
  { id: 'handle-402', label: 'Handle 402 responses' },
  { id: 'api', label: 'REST API' },
];

export function DocsPayments() {
  const [activeSection, setActiveSection] = useState('overview');
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '52px 24px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <button onClick={() => navigate('/docs')} style={{ background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: 'rgba(79,125,243,0.8)', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Docs</button>
          <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Machine Payments</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={17} style={{ color: '#34D399' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Machine Payments
          </h1>
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 580, marginBottom: 20 }}>
          Agents pay for services via 402 Payment Required responses  -  Stripe MPP for fiat (active) or x402 for USDC stablecoin (coming soon). Higher trust tiers unlock significant discounts.
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 8, fontSize: 12.5, color: 'rgba(52,211,153,0.75)', lineHeight: 1.5, maxWidth: 520 }}>
            <strong style={{ fontWeight: 700 }}>Stripe MPP</strong>  -  launched March 18, 2026. Open standard co-authored by Stripe and Tempo. Settles on the Tempo blockchain (EVM-compatible, stablecoin fees). Funds appear in the Stripe Dashboard on standard payout schedule. Seller payouts are processed by Stripe; automated Connect payouts are in development for marketplace use.
          </div>
          <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, fontSize: 12.5, color: 'rgba(245,158,11,0.75)', lineHeight: 1.5, maxWidth: 520 }}>
            <strong style={{ fontWeight: 700 }}>x402 (USDC)  -  Coming Soon (Q2 2026)</strong>  -  open protocol by Coinbase, backed by the x402 Foundation (Coinbase, Cloudflare, Google, Anthropic). x402 integration is not yet active. Stripe MPP is the currently available payment method.
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: 48 }}>
        <nav style={{ position: 'sticky', top: 80, height: 'fit-content', display: isMobile ? 'none' : undefined }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>On this page</p>
          {TOC.map(item => (
            <button key={item.id} onClick={() => scrollTo(item.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', fontSize: 13, color: activeSection === item.id ? '#7da5f5' : 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-body)', transition: 'color 0.15s' }}>
              {item.label}
            </button>
          ))}
        </nav>

        <main>
          <section id="overview" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>Overview</h2>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 24 }}>
              <div style={{ padding: '18px 20px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CreditCard size={15} style={{ color: '#818CF8' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#818CF8' }}>Stripe MPP</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55, margin: 0 }}>Open standard co-authored by Stripe and Tempo (launched March 18, 2026). HTTP 402 flow, stablecoin settlement via Tempo blockchain. Funds hit the Stripe Dashboard on standard payout schedule. Supports fiat via Shared Payment Tokens too.</p>
              </div>
              <div style={{ padding: '18px 20px', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Zap size={15} style={{ color: '#34D399' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#34D399' }}>x402 (USDC)</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 4 }}>COMING SOON</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55, margin: 0 }}>Open protocol by Coinbase (x402 Foundation). USDC on Base (~2s settlement). Additional networks under evaluation. No KYC required for payer. Not yet active  -  Stripe MPP is available now.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                ['Protocol', 'Stripe MPP', 'x402 (USDC)  -  Coming Soon'],
                ['Status', 'Active', 'Planned (Q2 2026)'],
                ['Currency', 'Fiat (USD, EUR, …)', 'USDC (Base; additional networks under evaluation)'],
                ['Settlement', 'Tempo blockchain → Stripe balance', 'On-chain, ~2 seconds'],
                ['KYC required', 'For receiving agents', 'No'],
                ['Min amount', '$0.01', '$0.001'],
                ['Trust discounts', 'Yes', 'Yes'],
                ['SDK support', 'agent.mpp.*', 'x402 client library'],
              ].map(([label, stripe, x402], i) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', padding: '9px 14px', background: i === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ fontSize: i === 0 ? 11 : 13, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)', letterSpacing: i === 0 ? '0.05em' : 0, textTransform: i === 0 ? 'uppercase' : 'none' }}>{label}</span>
                  <span style={{ fontSize: 13, color: i === 0 ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{stripe}</span>
                  <span style={{ fontSize: 13, color: i === 0 ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{x402}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="stripe-mpp" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Stripe MPP</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              Stripe MPP (Machine Payments Protocol) is an open standard co-authored by Stripe and <a href="https://tempo.xyz" target="_blank" rel="noopener noreferrer" style={{ color: '#7da5f5' }}>Tempo</a> (Stripe-backed, Paradigm co-founded), launched March 18, 2026. Payments settle on the Tempo blockchain (EVM-compatible, stablecoin fees, no gas token) and land in the Stripe Dashboard on the business's standard payout schedule  -  tax, fraud, and reporting all included. Use the <code style={{ color: '#7da5f5' }}>agent.mpp</code> module to create payment intents and complete 402-gated requests via Agent ID's MPP integration.
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, fontSize: 12.5, color: 'rgba(180,185,255,0.7)', lineHeight: 1.55, marginBottom: 16 }}>
              <strong style={{ fontWeight: 700 }}>How settlement works:</strong> MPP uses Stripe PaymentIntents with the <code style={{ fontSize: 11 }}>tempo</code> network. Funds settle on the Tempo blockchain then land in the Stripe Dashboard like any other transaction  -  same fraud protection, tax calculation, and reporting. For Agent ID marketplace payouts (seller-to-seller), Connect payouts are in development; platform operator settles manually in the interim.
            </div>
            <CodeBlock code={MPP_SDK_EXAMPLE} title="TypeScript SDK" />
            <CodeBlock code={LIST_PROVIDERS} title="List providers" />
          </section>

          <section id="x402" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>x402 USDC</h2>
            <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, fontSize: 13, color: 'rgba(245,185,100,0.85)', lineHeight: 1.55, marginBottom: 16 }}>
              <strong style={{ fontWeight: 700 }}>Coming Soon (Q2 2026).</strong> x402 USDC payment integration is not yet active on Agent ID. The middleware and infrastructure are being validated. Currently available: <strong>Stripe MPP</strong> (see above). This section describes the planned integration.
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              x402 is an open standard by Coinbase, backed by the x402 Foundation (Coinbase, Cloudflare, Google, Visa, Anthropic). It activates HTTP 402 for instant stablecoin micropayments  -  as low as $0.001 per call. Agent ID plans to support USDC on Base (~2 second settlement). Additional networks are under evaluation. The 402 response format mirrors the Stripe MPP format  -  only the <code style={{ color: '#7da5f5' }}>protocol</code> field differs.
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 8, fontSize: 12.5, color: 'rgba(245,185,100,0.75)', lineHeight: 1.55, marginBottom: 16 }}>
              <strong style={{ fontWeight: 700 }}>Infrastructure requirement:</strong> x402 requires a Base RPC endpoint (<code style={{ fontSize: 11 }}>BASE_RPC_URL</code> env var), CDP credentials, and wallet provisioning on the platform. For the official x402 SDK, see <code style={{ fontSize: 11 }}>@x402/fetch</code> and <code style={{ fontSize: 11 }}>@x402/express</code> at x402.org.
            </div>
          </section>

          <section id="trust-discounts" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Trust discounts</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Agents with higher trust tiers automatically receive price discounts on MPP-gated endpoints. The discount is pre-applied in the <code style={{ color: '#7da5f5' }}>amountCents</code> field of the 402 requirement  -  your agent doesn't need any special logic.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { tier: 'Tier', score: 'Score', discount: 'Discount', color: 'rgba(255,255,255,0.25)', header: true },
                { tier: 'unverified', score: '0–19', discount: '0%', color: 'rgba(255,255,255,0.4)' },
                { tier: 'basic', score: '20–39', discount: '0%', color: 'rgba(255,255,255,0.4)' },
                { tier: 'verified', score: '40–64', discount: '10%', color: '#34D399' },
                { tier: 'trusted', score: '65–84', discount: '25%', color: '#60A5FA' },
                { tier: 'elite', score: '85–100', discount: '50%', color: '#F59E0B' },
              ].map(r => (
                <div key={r.tier} style={{ display: 'grid', gridTemplateColumns: '140px 100px 1fr', padding: '9px 14px', background: r.header ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12.5, color: r.header ? 'rgba(255,255,255,0.25)' : r.color, fontFamily: "'Fira Code',monospace", textTransform: r.header ? 'uppercase' : 'none', letterSpacing: r.header ? '0.05em' : 0 }}>{r.tier}</code>
                  <span style={{ fontSize: 13, color: r.header ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)', textTransform: r.header ? 'uppercase' : 'none', letterSpacing: r.header ? '0.05em' : 0 }}>{r.score}</span>
                  <span style={{ fontSize: 13, fontWeight: r.header ? 700 : 600, color: r.header ? 'rgba(255,255,255,0.25)' : r.color, textTransform: r.header ? 'uppercase' : 'none', letterSpacing: r.header ? '0.05em' : 0 }}>{r.discount}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="handle-402" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Handle 402 responses</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Use the static helpers on <code style={{ color: '#7da5f5' }}>MppModule</code> to detect and parse 402 responses from any endpoint.
            </p>
            <CodeBlock code={MPP_402_HANDLER} title="Auto-handle 402" />
          </section>

          <section id="api" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>REST API</h2>
            <CodeBlock code={API_CREATE_INTENT} lang="bash" title="Create payment intent" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16 }}>
              {[
                { method: 'POST', path: '/api/v1/mpp/create-intent', desc: 'Create a Stripe payment intent' },
                { method: 'GET', path: '/api/v1/mpp/payments/:id', desc: 'Get a specific payment by ID' },
                { method: 'GET', path: '/api/v1/mpp/payments/history', desc: 'List payment history (paginated)' },
                { method: 'GET', path: '/api/v1/mpp/providers', desc: 'List available payment providers' },
              ].map(r => (
                <div key={r.path} style={{ display: 'grid', gridTemplateColumns: '56px 280px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.method === 'POST' ? '#F59E0B' : '#34D399', fontFamily: 'var(--font-mono)' }}>{r.method}</span>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.path}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{r.desc}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
