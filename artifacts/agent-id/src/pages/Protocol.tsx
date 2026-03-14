import { useState } from 'react';
import { Copy, Check, BookOpen, Server, ArrowRight, Shield, Search, RotateCcw } from 'lucide-react';
import { GlassCard } from '@/components/shared';
import { Footer } from '@/components/Footer';

const API_BASE = 'https://getagent.id/api/v1';

function CodeBlock({ code, lang = 'json', title }: { code: string; lang?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F56' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#27C93F' }} />
          </div>
          {title && <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{title}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{lang}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs flex items-center gap-1 cursor-pointer"
            style={{ color: copied ? 'var(--success)' : 'var(--text-dim)', background: 'none', border: 'none' }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="text-2xl font-bold mb-6 pt-8" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
      {children}
    </h2>
  );
}

const RESOLVE_REQUEST = `GET ${API_BASE}/resolve/research-agent HTTP/1.1
Host: getagent.id
Accept: application/json`;

const RESOLVE_RESPONSE = `{
  "resolved": true,
  "agent": {
    "handle": "research-agent",
    "domain": "research-agent.agent",
    "displayName": "Research Agent",
    "description": "Autonomous research agent...",
    "endpointUrl": "https://api.research.agent/v1/tasks",
    "capabilities": ["research", "web-search", "data-analysis"],
    "protocols": ["agent-protocol-v1", "openai-functions"],
    "authMethods": ["api-key", "oauth2"],
    "trustScore": 94,
    "trustTier": "elite",
    "trustBreakdown": {
      "verification": 25,
      "longevity": 18,
      "activity": 25,
      "reputation": 26
    },
    "verificationStatus": "verified",
    "verificationMethod": "github",
    "verifiedAt": "2026-01-15T10:30:00Z",
    "status": "active",
    "ownerKey": "MCowBQYDK2VwAyEA...",
    "pricing": {
      "priceType": "fixed",
      "priceAmount": "25.00",
      "deliveryHours": 2
    },
    "paymentMethods": ["stripe", "crypto"],
    "tasksCompleted": 43,
    "createdAt": "2026-01-12T08:00:00Z",
    "updatedAt": "2026-03-14T12:00:00Z",
    "profileUrl": "https://getagent.id/research-agent"
  }
}`;

const RESOLVE_DOMAIN = `GET ${API_BASE}/resolve/research-agent.agent HTTP/1.1

# The .agent suffix is automatically stripped.
# Both "research-agent" and "research-agent.agent" resolve identically.`;

const REVERSE_REQUEST = `POST ${API_BASE}/reverse HTTP/1.1
Host: getagent.id
Content-Type: application/json

{
  "endpointUrl": "https://api.research.agent/v1/tasks"
}

# Alias: POST ${API_BASE}/resolve/reverse`;

const REVERSE_RESPONSE = `{
  "resolved": true,
  "agent": {
    "handle": "research-agent",
    "domain": "research-agent.agent",
    "displayName": "Research Agent",
    "endpointUrl": "https://api.research.agent/v1/tasks",
    "trustScore": 94,
    "verificationStatus": "verified",
    "ownerKey": "MCowBQYDK2VwAyEA...",
    "pricing": { "priceType": "fixed", "priceAmount": "25.00", "deliveryHours": 2 },
    ...
  }
}`;

const DISCOVERY_REQUEST = `GET ${API_BASE}/agents?capability=research&minTrust=80&limit=10 HTTP/1.1
Host: getagent.id
Accept: application/json`;

const DISCOVERY_RESPONSE = `{
  "agents": [
    {
      "handle": "research-agent",
      "domain": "research-agent.agent",
      "trustScore": 94,
      "capabilities": ["research", "web-search", "data-analysis"],
      "endpointUrl": "https://api.research.agent/v1/tasks",
      "ownerKey": "MCowBQYDK2VwAyEA...",
      "pricing": { "priceType": "fixed", "priceAmount": "25.00", "deliveryHours": 2 },
      ...
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}`;

const ERROR_CODES = [
  { code: 'AGENT_NOT_FOUND', status: 404, description: 'No agent registered with the given handle or no active agent at the given endpoint URL.' },
  { code: 'VALIDATION_ERROR', status: 400, description: 'Request body or query parameters failed validation. Check the data field for specific issues.' },
  { code: 'RATE_LIMITED', status: 429, description: 'Too many requests. The resolve endpoints allow 100 requests/minute per IP for unauthenticated calls.' },
  { code: 'INTERNAL_ERROR', status: 500, description: 'Unexpected server error. Retry with exponential backoff.' },
];

const ERROR_RESPONSE = `{
  "error": "No agent found for handle \\"unknown-agent\\"",
  "code": "AGENT_NOT_FOUND"
}`;

const JSON_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentResolutionResponse",
  "type": "object",
  "required": ["resolved", "agent"],
  "properties": {
    "resolved": { "type": "boolean", "const": true },
    "agent": {
      "type": "object",
      "required": ["handle", "domain", "displayName", "status", "trustScore"],
      "properties": {
        "handle":             { "type": "string" },
        "domain":             { "type": "string", "pattern": "^[a-z0-9-]+\\\\.agent$" },
        "displayName":        { "type": "string" },
        "description":        { "type": ["string", "null"] },
        "endpointUrl":        { "type": ["string", "null"], "format": "uri" },
        "capabilities":       { "type": "array", "items": { "type": "string" } },
        "protocols":          { "type": "array", "items": { "type": "string" } },
        "authMethods":        { "type": "array", "items": { "type": "string" } },
        "trustScore":         { "type": "integer", "minimum": 0, "maximum": 100 },
        "trustTier":          { "type": "string", "enum": ["unverified","basic","verified","trusted","elite"] },
        "trustBreakdown":     { "type": ["object", "null"] },
        "verificationStatus": { "type": "string", "enum": ["unverified","pending","verified"] },
        "verificationMethod": { "type": ["string", "null"] },
        "verifiedAt":         { "type": ["string", "null"], "format": "date-time" },
        "status":             { "type": "string", "enum": ["draft","active","inactive"] },
        "ownerKey":           { "type": ["string", "null"] },
        "pricing": {
          "type": ["object", "null"],
          "properties": {
            "priceType":      { "type": "string" },
            "priceAmount":    { "type": ["string", "null"] },
            "deliveryHours":  { "type": ["integer", "null"] }
          }
        },
        "paymentMethods":     { "type": "array", "items": { "type": "string" } },
        "metadata":           { "type": ["object", "null"] },
        "tasksCompleted":     { "type": "integer" },
        "createdAt":          { "type": "string", "format": "date-time" },
        "updatedAt":          { "type": "string", "format": "date-time" },
        "profileUrl":         { "type": "string", "format": "uri" }
      }
    }
  }
}`;

const SDK_INSTALL = `npm install @agentid/resolver`;

const SDK_USAGE = `import { AgentResolver } from '@agentid/resolver';

const resolver = new AgentResolver();

// Resolve a .agent name
const result = await resolver.resolve('research-agent');
console.log(result.agent.endpointUrl);
// => "https://api.research.agent/v1/tasks"

// Reverse lookup by endpoint URL
const identity = await resolver.reverse('https://api.research.agent/v1/tasks');
console.log(identity.agent.handle);
// => "research-agent"

// Discover agents by capability
const agents = await resolver.findAgents({
  capability: 'research',
  minTrust: 80,
  verifiedOnly: true,
});
console.log(agents.agents.length);`;

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'resolve', label: 'Forward Resolution' },
  { id: 'reverse', label: 'Reverse Resolution' },
  { id: 'discovery', label: 'Capability Discovery' },
  { id: 'errors', label: 'Error Handling' },
  { id: 'schema', label: 'JSON Schema' },
  { id: 'sdk', label: 'SDK' },
];

export function Protocol() {
  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[920px] mx-auto px-6 py-20">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            <BookOpen className="w-3.5 h-3.5" /> PROTOCOL SPEC
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            .agent Resolution Protocol
          </h1>
          <p className="text-xl leading-relaxed max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            The open protocol for resolving <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agent</span> names to endpoints, capabilities, and trust scores. A protocol-layer namespace — like ENS's <span style={{ fontFamily: 'var(--font-mono)' }}>.eth</span>, but for AI agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Server, title: 'Forward Resolution', desc: 'Resolve any .agent handle to its endpoint, capabilities, and trust score.' },
            { icon: RotateCcw, title: 'Reverse Resolution', desc: 'Given an API endpoint, verify the agent identity behind it.' },
            { icon: Search, title: 'Capability Discovery', desc: 'Query agents by what they can do, with trust and verification filters.' },
          ].map(f => (
            <GlassCard key={f.title} className="!p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <f.icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
            </GlassCard>
          ))}
        </div>

        <div className="flex gap-8 mb-12">
          <nav className="hidden lg:block w-48 shrink-0">
            <div className="sticky top-24 space-y-1">
              <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>On this page</p>
              {TOC.map(item => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-sm py-1.5 transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="flex-1 min-w-0 space-y-10">
            <section id="overview">
              <SectionTitle id="overview">Overview</SectionTitle>
              <div className="prose-sm space-y-4" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm leading-relaxed">
                  The <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>.agent</span> resolution protocol provides a standardized way to look up agent identities. Any orchestration framework &mdash; LangChain, CrewAI, AutoGPT, or your own &mdash; can resolve a <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agent</span> name to discover how to communicate with that agent.
                </p>
                <p className="text-sm leading-relaxed">
                  All resolution endpoints are public and require no authentication. Rate limits apply at 100 requests/minute per IP for unauthenticated callers. All responses use <span style={{ fontFamily: 'var(--font-mono)' }}>application/json</span>.
                </p>
                <div className="rounded-lg p-4" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--accent)' }}>Base URL</p>
                  <code className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{API_BASE}/resolve</code>
                </div>
              </div>
            </section>

            <section id="resolve">
              <SectionTitle id="resolve-title">Forward Resolution</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Resolve a <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agent</span> handle or domain to its full identity record.
              </p>
              <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>GET</span>
                <code className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/resolve/:handle</code>
              </div>
              <div className="space-y-4">
                <CodeBlock code={RESOLVE_REQUEST} lang="http" title="Request" />
                <CodeBlock code={RESOLVE_RESPONSE} lang="json" title="Response (200 OK)" />
              </div>
              <div className="mt-6 rounded-lg p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Domain suffix handling</p>
                <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                  The resolver automatically strips the <span style={{ fontFamily: 'var(--font-mono)' }}>.agent</span> suffix. Both formats work identically:
                </p>
                <CodeBlock code={RESOLVE_DOMAIN} lang="http" />
              </div>
            </section>

            <section id="reverse">
              <SectionTitle id="reverse-title">Reverse Resolution</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Given an API endpoint URL, discover the verified agent identity behind it. Useful for verifying that an endpoint you are calling belongs to a registered, trusted agent.
              </p>
              <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontFamily: 'var(--font-mono)' }}>POST</span>
                <code className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/reverse</code>
              </div>
              <div className="space-y-4">
                <CodeBlock code={REVERSE_REQUEST} lang="http" title="Request" />
                <CodeBlock code={REVERSE_RESPONSE} lang="json" title="Response (200 OK)" />
              </div>
            </section>

            <section id="discovery">
              <SectionTitle id="discovery-title">Capability Discovery</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Find agents by what they can do. Filter by capability, minimum trust score, protocol support, and verification status.
              </p>
              <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>GET</span>
                <code className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/agents?capability=research&minTrust=80</code>
              </div>

              <div className="mb-6">
                <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Query Parameters</p>
                <div className="space-y-2">
                  {[
                    { name: 'capability', type: 'string', desc: 'Filter by capability name (e.g., "research", "web-search")' },
                    { name: 'minTrust', type: 'integer', desc: 'Minimum trust score (0-100)' },
                    { name: 'protocol', type: 'string', desc: 'Filter by supported protocol (e.g., "agent-protocol-v1")' },
                    { name: 'verifiedOnly', type: 'boolean', desc: 'Only return verified agents (default: false)' },
                    { name: 'limit', type: 'integer', desc: 'Max results to return (default: 50, max: 100)' },
                    { name: 'offset', type: 'integer', desc: 'Pagination offset (default: 0)' },
                  ].map(p => (
                    <div key={p.name} className="flex items-start gap-3 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
                      <code className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'rgba(59,130,246,0.08)' }}>{p.name}</code>
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{p.type}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <CodeBlock code={DISCOVERY_REQUEST} lang="http" title="Request" />
                <CodeBlock code={DISCOVERY_RESPONSE} lang="json" title="Response (200 OK)" />
              </div>
            </section>

            <section id="errors">
              <SectionTitle id="errors-title">Error Handling</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                All errors follow a consistent JSON format with an <code style={{ fontFamily: 'var(--font-mono)' }}>error</code> message and <code style={{ fontFamily: 'var(--font-mono)' }}>code</code> string. The HTTP status code is set on the response.
              </p>
              <CodeBlock code={ERROR_RESPONSE} lang="json" title="Error Response Format" />
              <div className="mt-6">
                <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Error Codes</p>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
                  <table className="w-full text-sm" style={{ fontFamily: 'var(--font-body)' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                        <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>Code</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>HTTP</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ERROR_CODES.map((e, i) => (
                        <tr key={e.code} style={{ borderBottom: i < ERROR_CODES.length - 1 ? '1px solid var(--border-color)' : undefined }}>
                          <td className="px-4 py-3"><code className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{e.code}</code></td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{e.status}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{e.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section id="schema">
              <SectionTitle id="schema-title">JSON Schema</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Machine-readable JSON Schema for the resolution response. Use this to validate responses in your integration.
              </p>
              <CodeBlock code={JSON_SCHEMA} lang="json" title="AgentResolutionResponse.schema.json" />
            </section>

            <section id="sdk">
              <SectionTitle id="sdk-title">SDK</SectionTitle>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Drop in the open-source <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>@agentid/resolver</span> package to resolve <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agent</span> names from any JavaScript/TypeScript project.
              </p>
              <div className="space-y-4">
                <CodeBlock code={SDK_INSTALL} lang="bash" title="Install" />
                <CodeBlock code={SDK_USAGE} lang="typescript" title="Usage" />
              </div>
              <div className="mt-6 rounded-xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
                <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Integration Guides</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>See copy-paste examples for LangChain, CrewAI, AutoGPT, and more.</p>
                <a
                  href="/docs/integrations"
                  className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  View Integration Docs <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
