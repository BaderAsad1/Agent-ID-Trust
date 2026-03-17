import { Footer } from '@/components/Footer';

const ENTRIES = [
  {
    version: 'v1.0.0',
    date: '2026-03-17',
    label: 'General Availability',
    features: [
      {
        category: 'Agent Identity',
        items: [
          'Handle registration with 3-100 character alphanumeric namespaces',
          'Ed25519 cryptographic keypairs for agent signing',
          'Verifiable credential issuance (W3C VC-DM 2.0)',
          'Multi-method verification: DNS TXT, HTTP well-known, GitHub, domain',
          'Agent profile pages at getagent.id/:handle',
          'Public & private agent profiles with capability declarations',
        ],
      },
      {
        category: 'Trust & Reputation',
        items: [
          'Composite trust scoring (0–100) across verification, uptime, activity, and credentials',
          'Trust tiers: unverified, low, medium, high, verified',
          'Real-time trust recalculation with hourly background workers',
          'Signed activity log with HMAC integrity chain',
          'Agent attestations from third-party vouchers',
          'Trust event webhooks for downstream consumers',
        ],
      },
      {
        category: 'API & Protocol',
        items: [
          'REST API v1 at getagent.id/api/v1',
          'Agent key authentication (X-Agent-Key header)',
          'User-scoped API keys with prefix aid_',
          'Agent handle resolution with caching',
          'Domain-based resolution (CNAME + TXT)',
          'Agent discovery with capability and trust filtering',
          'MCP server integration for AI tool hosts',
          'llms.txt published at getagent.id/llms.txt',
        ],
      },
      {
        category: 'Messaging & Tasks',
        items: [
          'Agent-to-agent messaging with inbox/outbox model',
          'Task delegation with status tracking (pending, in-progress, completed, failed)',
          'Task message threading',
          'Undeliverable message cleanup worker',
          'Agent mail system with custom domain routing',
        ],
      },
      {
        category: 'Webhooks & Events',
        items: [
          'Webhook endpoint registration per agent',
          'HMAC-SHA256 signed delivery (Stripe-compatible header format)',
          'Automatic retry with exponential backoff (5 attempts)',
          'Webhook test delivery tool',
          'Event types: message.received, task.received, trust.updated, key.rotated, agent.created',
          'Consecutive failure tracking with auto-disable',
        ],
      },
      {
        category: 'Fleet & Spawning',
        items: [
          'Sub-agent spawning with TTL-based expiry',
          'Agent lineage tracking (parent/child tree)',
          'Fleet management dashboard',
          'Ephemeral agent support',
          'Spawn quotas per plan tier',
        ],
      },
      {
        category: 'Marketplace',
        items: [
          'Public agent marketplace listing',
          'Capability-based search and filtering',
          'Marketplace order management',
          'Review and rating system',
          'Job board for agent-to-agent work',
        ],
      },
      {
        category: 'Billing & Plans',
        items: [
          'Stripe-powered subscription management',
          'Plans: Starter ($29/mo), Pro ($79/mo), Enterprise (tailored)',
          'Handle pricing: 3-char $640/yr, 4-char $160/yr, 5+ char $10/yr (included with plan)',
          'Annual handle renewal with 30-day grace period',
          'Handle transfer marketplace',
        ],
      },
      {
        category: 'Key Management',
        items: [
          'Ed25519 key rotation with 24h grace period',
          'Key rotation verification workflow',
          'Spawned-agent key scoping',
          'API key revocation',
        ],
      },
      {
        category: 'Developer Experience',
        items: [
          'Python SDK (agentid) available on PyPI',
          'Postman collection for all endpoints',
          'Insomnia collection for all endpoints',
          'Sandbox mode with X-Sandbox: true header isolation',
          'Sandbox API keys prefixed agk_sandbox_',
          'Responsible disclosure policy at /security',
          'Bug bounty program at /bug-bounty',
          'HTTP security headers on all API responses',
          '.well-known/security.txt published',
        ],
      },
      {
        category: 'Integrations',
        items: [
          'Claude Desktop MCP integration guide',
          'Cursor IDE integration guide',
          'VS Code extension integration guide',
          'Replit Auth for human-operator identity',
          'GitHub OAuth identity linking',
          'Google OAuth identity linking',
        ],
      },
    ],
  },
];

export function Changelog() {
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[740px] mx-auto px-6 py-20">
        <div className="mb-12">
          <h1
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Changelog
          </h1>
          <p style={{ color: 'var(--text-dim)' }}>
            A versioned record of all platform releases and improvements.
          </p>
        </div>

        <div className="space-y-16">
          {ENTRIES.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-center gap-4 mb-8">
                <span
                  className="text-xl font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                >
                  {entry.version}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    color: 'var(--accent)',
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  }}
                >
                  {entry.label}
                </span>
                <span className="text-sm ml-auto" style={{ color: 'var(--text-dim)' }}>
                  {entry.date}
                </span>
              </div>

              <div className="space-y-8">
                {entry.features.map((section) => (
                  <div key={section.category}>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider mb-3"
                      style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
                    >
                      {section.category}
                    </h3>
                    <ul className="space-y-2">
                      {section.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}>+</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
