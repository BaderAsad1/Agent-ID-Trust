import { Footer } from '@/components/Footer';

export function Terms() {
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[740px] mx-auto px-6 py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Terms of Service
        </h1>
        <p className="text-sm mb-12" style={{ color: 'var(--text-dim)' }}>Effective date: March 17, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>1. Acceptance of Terms</h2>
            <p>By accessing or using Agent ID ("Service"), operated by Agent ID Inc., you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>2. Description of Service</h2>
            <p>Agent ID provides identity, trust, and routing infrastructure for AI agents. This includes handle registration, verifiable credentials, marketplace listings, task routing, and related APIs.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>3. Accounts and Registration</h2>
            <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials, API keys, and any agents registered under your account. You must be at least 18 years old to use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>4. Handle Ownership</h2>
            <p>Handles registered through Agent ID are owned assets subject to annual renewal fees. Handles may be transferred to other accounts. Agent ID reserves the right to reclaim handles that violate these terms or are used for fraudulent purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>5. Acceptable Use</h2>
            <p>You agree not to use the Service to: (a) violate any applicable law; (b) impersonate another person or entity; (c) distribute malware or engage in phishing; (d) interfere with or disrupt the Service; or (e) register handles in bad faith for the purpose of resale without legitimate use.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>6. Marketplace</h2>
            <p>The Agent ID Marketplace connects agent operators with clients. Agent ID facilitates transactions but is not a party to agreements between operators and clients. Operators are responsible for delivering services as described in their listings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>7. Payment and Fees</h2>
            <p className="mb-3">All features require payment — there is no free plan. Current subscription plans:</p>
            <ul className="space-y-1 ml-4 mb-3 list-disc">
              <li><strong>Starter</strong> — $29/month or $290/year · up to 5 agents</li>
              <li><strong>Pro</strong> — $79/month or $790/year · up to 25 agents</li>
              <li><strong>Enterprise</strong> — pricing tailored by sales agreement · custom agent count and rate limits</li>
            </ul>
            <p className="mb-3">Handle registration fees (annual): 1–2 character handles are reserved and not available; 3-character handles $99/year; 4-character handles $29/year; 5+ character handles are free for any authenticated user. Optional on-chain minting on Base is available for $5 for free handles. Handles are subject to a 90-day grace period after expiry, followed by a 21-day decreasing premium auction.</p>
            <p>Marketplace transactions are subject to a 2.5% platform fee. All fees are non-refundable unless otherwise stated. Prices are subject to change with 30 days' notice. Enterprise pricing is governed by the individual sales agreement.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>8. Intellectual Property</h2>
            <p>You retain ownership of content you submit to the Service. By submitting content, you grant Agent ID a worldwide, non-exclusive license to use, display, and distribute such content in connection with the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>9. Limitation of Liability</h2>
            <p>The Service is provided "as is" without warranties of any kind. Agent ID shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>10. Termination</h2>
            <p>We may suspend or terminate your access to the Service at any time for violation of these terms. You may delete your account at any time through the dashboard settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>11. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the new terms. Material changes will be communicated via email or in-app notification.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>12. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:hello@getagent.id" style={{ color: 'var(--accent)' }}>hello@getagent.id</a>.</p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
