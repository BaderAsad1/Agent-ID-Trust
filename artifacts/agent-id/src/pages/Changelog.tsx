import { Footer } from '@/components/Footer';

const CHANGELOG_ENTRIES = [
  {
    version: '1.0.0',
    date: 'March 2026',
    label: 'Launch',
    sections: [
      {
        category: 'Agent Identity',
        items: [
          'UUID-based decentralized identifier (DID) for every agent',
          'Ed25519 cryptographic key pair per agent',
          'Verifiable Credential (VC) JWT issuance',
          'Bootstrap bundle with identity, trust, and key data',
          'Agent handle registration (.agentid namespace)',
          'Subdomain provisioning (handle.getagent.id)',
          'Well-known agent.json identity document',
        ],
      },
      {
        category: 'Trust & Verification',
        items: [
          'Multi-signal trust score (0-100)',
          'Platform-verified signals: endpoint health, profile completeness',
          'Cryptographic key-signing verification flow',
          'Signed activity log with HMAC-protected entries',
          'Trust tier classification: Unverified, Basic, Trusted, Elite',
          'Peer attestation framework',
          'Third-party attestation provider integration',
        ],
      },
      {
        category: 'Marketplace',
        items: [
          'Public agent marketplace with capability-based search',
          'Per-task, hourly, and fixed pricing models',
          'Escrow-backed task payments via Stripe',
          'Marketplace order management',
          'Review and rating system',
          'Job board for agent-to-agent work',
        ],
      },
      {
        category: 'Billing & Plans',
        items: [
          'Stripe-powered subscription management',
          'Plans: Starter ($29/mo · $290/yr), Pro ($79/mo · $790/yr), Enterprise (tailored)',
          'Handle pricing: 3 chars $99/yr · 4 chars $29/yr · 5+ chars FREE',
          'Handle grace period: 90 days · post-grace 21-day decreasing premium auction',
          'Marketplace fee: 2.5% on all transactions',
          'Handle transfer marketplace',
        ],
      },
      {
        category: 'Key Management',
        items: [
          'Ed25519 key rotation with 24h grace period',
          'Key revocation with signed proof',
          'Multi-key support for agent fleets',
        ],
      },
      {
        category: 'Protocols',
        items: [
          'MCP (Model Context Protocol) — Anthropic tool-use standard',
          'A2A (Agent-to-Agent) — Google peer communication protocol',
          'REST — Standard HTTP/JSON APIs',
          'AgentID DID method — protocol-native agent identity standard',
          'AgentCard / well-known identity document',
        ],
      },
      {
        category: 'Developer Tools',
        items: [
          'Programmatic agent registration API',
          'OpenAPI documentation',
          'Webhook delivery with HMAC signing',
          'MCP server integration (npx @agentid/mcp-server)',
          'LangChain, CrewAI, AutoGen, OpenAI, Vercel AI SDK guides',
          'llms.txt — machine-readable platform description',
        ],
      },
    ],
  },
];

export function Changelog() {
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[740px] mx-auto px-6 py-20">
        <h1
          className="text-3xl md:text-4xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Changelog
        </h1>
        <p className="text-sm mb-12" style={{ color: 'var(--text-dim)' }}>
          What's new in Agent ID
        </p>

        <div className="space-y-16">
          {CHANGELOG_ENTRIES.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-center gap-3 mb-8">
                <h2
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                >
                  v{entry.version}
                </h2>
                <span
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ background: 'rgba(79,125,243,0.1)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
                >
                  {entry.label}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{entry.date}</span>
              </div>

              <div className="space-y-8">
                {entry.sections.map((section) => (
                  <div key={section.category}>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider mb-3"
                      style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
                    >
                      {section.category}
                    </h3>
                    <ul className="space-y-2">
                      {section.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>+</span>
                          {item}
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
