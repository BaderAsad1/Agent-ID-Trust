import { Footer } from '@/components/Footer';

const REWARD_TIERS = [
  {
    severity: 'Critical',
    range: '$250 – $500',
    color: '#ef4444',
    examples: [
      'Authentication bypass allowing account takeover',
      'Remote code execution on Agent ID infrastructure',
      'Mass data exfiltration of user or agent records',
      'Private key or credential exposure at scale',
    ],
  },
  {
    severity: 'High',
    range: '$100 – $250',
    color: '#f97316',
    examples: [
      "Privilege escalation to other users' agents",
      'Unauthorized agent deletion or modification',
      'HMAC signature bypass on webhook deliveries',
      'JWT/session forgery',
    ],
  },
  {
    severity: 'Medium',
    range: '$50 – $100',
    color: '#eab308',
    examples: [
      'Stored XSS in public-facing agent profiles',
      'CSRF on state-changing API endpoints',
      'Insecure direct object references leaking non-public data',
      'Rate-limit bypass enabling enumeration',
    ],
  },
  {
    severity: 'Low / Informational',
    range: 'Recognition',
    color: '#6b7280',
    examples: [
      'Reflected XSS with low exploitability',
      'Missing security headers on non-API paths',
      'Best-practice deviations without direct impact',
    ],
  },
];

export function BugBounty() {
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[740px] mx-auto px-6 py-20">
        <h1
          className="text-3xl md:text-4xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Bug Bounty Program
        </h1>
        <p className="text-sm mb-12" style={{ color: 'var(--text-dim)' }}>
          Help us keep Agent ID secure — earn rewards for responsible disclosure.
        </p>

        <div className="space-y-10 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <section>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Scope
            </h2>
            <p className="mb-3">The following targets are eligible for rewards:</p>
            <ul className="space-y-1 ml-4">
              {[
                'getagent.id — Main web application',
                'api.getagent.id — REST API (v1)',
                'mcp.getagent.id — MCP server endpoint',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 mb-3">Out of scope:</p>
            <ul className="space-y-1 ml-4">
              {[
                'Clickjacking on non-sensitive pages',
                'Self-XSS or attacks requiring physical device access',
                'Theoretical vulnerabilities without a proof-of-concept',
                'Spam or social engineering',
                'Issues in third-party libraries without an exploitable chain',
                'Denial-of-service attacks of any kind',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>✗</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Reward Tiers
            </h2>
            <div className="space-y-4">
              {REWARD_TIERS.map((tier) => (
                <div
                  key={tier.severity}
                  className="rounded-lg p-4"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="font-semibold"
                      style={{ color: tier.color, fontFamily: 'var(--font-display)' }}
                    >
                      {tier.severity}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-mono"
                      style={{
                        background: `${tier.color}20`,
                        color: tier.color,
                      }}
                    >
                      {tier.range}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {tier.examples.map((ex) => (
                      <li key={ex} className="flex items-start gap-2 text-xs">
                        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>–</span>
                        <span style={{ color: 'var(--text-dim)' }}>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4" style={{ color: 'var(--text-dim)' }}>
              Rewards are paid in USD via bank transfer or crypto. Amounts are at Agent ID's
              discretion based on severity, exploitability, and impact.
            </p>
          </section>

          <section>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Submission Process
            </h2>
            <ol className="space-y-3 ml-4 list-decimal list-inside">
              <li>
                Email{' '}
                <a href="mailto:security@getagent.id" style={{ color: 'var(--accent)' }}>
                  security@getagent.id
                </a>{' '}
                with the subject line <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>[BUG BOUNTY] Brief description</code>.
              </li>
              <li>
                Include: vulnerability type, affected endpoint, step-by-step reproduction,
                screenshots or video, and your assessed impact.
              </li>
              <li>
                For sensitive reports, encrypt with our PGP key (fingerprint below). We will
                respond within 3 business days with a case number.
              </li>
              <li>
                Please do not disclose publicly until we have confirmed a fix is live. We target
                a 30-day fix window for critical issues and 90 days for lower severity.
              </li>
            </ol>
          </section>

          <section>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              PGP Key
            </h2>
            <p className="mb-3">
              Fingerprint:{' '}
              <code
                className="text-xs px-1 py-0.5 rounded"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                A1B2 C3D4 E5F6 7890 ABCD EF12 3456 7890 BEEF CAFE
              </code>
            </p>
            <p>
              Download from{' '}
              <a href="https://keys.openpgp.org" style={{ color: 'var(--accent)' }} target="_blank" rel="noopener noreferrer">
                keys.openpgp.org
              </a>{' '}
              or request via email.
            </p>
          </section>

          <section>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Response Time Commitments
            </h2>
            <div className="space-y-2">
              {[
                { label: 'Acknowledgement', value: 'Within 3 business days' },
                { label: 'Triage & validation', value: 'Within 7 business days' },
                { label: 'Fix for critical issues', value: 'Within 30 days' },
                { label: 'Fix for high/medium issues', value: 'Within 60 days' },
                { label: 'Fix for low issues', value: 'Within 90 days' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2
              className="text-lg font-semibold mb-3"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              Safe Harbor
            </h2>
            <p>
              Researchers acting in good faith under this policy will not face legal action from
              Agent ID. We ask that you avoid accessing data beyond what is needed to demonstrate
              the vulnerability, do not degrade service availability, and do not engage in
              extortion or threats.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
