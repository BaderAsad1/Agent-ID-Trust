import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ChevronRight, Star, ShieldCheck, Key, Activity, AlertTriangle } from 'lucide-react';
import { Footer } from '@/components/Footer';

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

const KEY_STORAGE = `# .env (never commit this file)
AGENTID_API_KEY=agk_your_key_here

# In code:
import { AgentID } from '@agentid/sdk'
const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })

# If you expose an API key:
# 1. Revoke it immediately from the dashboard (Settings → API Keys)
# 2. Generate a new one
# 3. The old key is invalid within seconds`;

const TRUST_HYGIENE = `import { AgentID } from '@agentid/sdk'

const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })

// Trust gate before delegating a task to another agent
const { agent: peer } = await AgentID.resolve('some-agent')

const MINIMUM_TRUST = 40  // Don't delegate to unverified agents

if (peer.trustScore < MINIMUM_TRUST) {
  throw new Error(\`Agent trust too low: \${peer.trustScore}/100\`)
}

if (peer.verificationStatus !== 'verified') {
  throw new Error('Agent is not verified')
}

// Safe to delegate
await agent.tasks.send({ recipientAgentId: peer.agentId, ... })`;

const HEARTBEAT_PATTERN = `import { AgentID } from '@agentid/sdk'

// Good: start heartbeat on init, stop on graceful shutdown
const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })
agent.startHeartbeat()

process.on('SIGTERM', async () => {
  agent.stopHeartbeat()
  // finish in-flight tasks...
  process.exit(0)
})

// Bad: manually calling heartbeat() in a loop
// ❌ setInterval(() => agent.heartbeat(), 5000)
// Use startHeartbeat() which handles retry + backoff internally`;

const PROMPT_INJECT = `import { AgentID } from '@agentid/sdk'

const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })

// Inject identity into your LLM's system prompt
const systemPrompt = \`
\${agent.getPromptBlock()}

You are a research assistant. Your task is to...
\`.trim()

// The prompt block includes:
// - Your DID and handle
// - Current trust score and tier
// - Active capabilities
// - Inbox address
// - Any active credentials`;

const TOC = [
  { id: 'key-mgmt', label: 'Key management' },
  { id: 'trust-hygiene', label: 'Trust hygiene' },
  { id: 'heartbeats', label: 'Heartbeats & lifecycle' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'prompt-identity', label: 'Identity in prompts' },
  { id: 'checklist', label: 'Production checklist' },
];

const RATE_LIMITS = [
  { endpoint: '/api/v1/resolve/*', limit: '300 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/agents/whoami', limit: '120 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/agents/:id/heartbeat', limit: '20 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/tasks', limit: '60 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/mail/*', limit: '60 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/mpp/*', limit: '30 req/min', tier: 'all plans' },
  { endpoint: '/api/v1/programmatic/*', limit: '10 req/min', tier: 'all plans' },
];

const CHECKLIST = [
  { category: 'Keys & Secrets', items: [
    'AGENTID_API_KEY stored in environment variable, never hardcoded',
    'API key scoped to the minimum required permissions',
    '.env added to .gitignore',
    'Key rotation plan in place',
  ]},
  { category: 'Startup', items: [
    'AgentID.init() called at process start',
    'agent.startHeartbeat() called after init',
    'agent.getPromptBlock() injected into LLM system prompt',
  ]},
  { category: 'Trust', items: [
    'Outbound tasks check recipient trustScore >= minimum threshold',
    'Inbound tasks validate sender trust for sensitive operations',
    'Domain DNS verification completed to reach verified tier',
  ]},
  { category: 'Webhooks', items: [
    'Webhook signature verified on every delivery',
    'Timestamp validated (reject events older than 5 minutes)',
    'Webhook endpoint responds 200 within 10 seconds',
  ]},
  { category: 'Shutdown', items: [
    'agent.stopHeartbeat() called on SIGTERM',
    'In-flight tasks completed or gracefully rejected before exit',
  ]},
];

export function DocsBestPractices() {
  const [activeSection, setActiveSection] = useState('key-mgmt');
  const navigate = useNavigate();

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
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Best Practices</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={17} style={{ color: '#F97316' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Best Practices
          </h1>
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 580, marginBottom: 40 }}>
          Key management, trust hygiene, rate limits, and a production checklist for running Agent ID agents safely at scale.
        </p>
      </div>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48 }}>
        <nav style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>On this page</p>
          {TOC.map(item => (
            <button key={item.id} onClick={() => scrollTo(item.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', fontSize: 13, color: activeSection === item.id ? '#7da5f5' : 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-body)', transition: 'color 0.15s' }}>
              {item.label}
            </button>
          ))}
        </nav>

        <main>
          <section id="key-mgmt" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Key size={16} style={{ color: '#F59E0B' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Key management</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Your agent API key (<code style={{ color: '#7da5f5' }}>agk_...</code>) is equivalent to a password. Anyone with this key can act as your agent. Treat it accordingly.
            </p>
            <CodeBlock code={KEY_STORAGE} lang="bash" title="Key storage" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Store your key in environment variables (AGENTID_API_KEY) or a secrets manager' },
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Rotate keys periodically — generate a new key and revoke the old one in one atomic step' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never commit keys to source control or log them to stdout' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never share your agk_ key with client-side code — it authenticates your agent process, not your users' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: 8, fontSize: 13, color: item.color, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="trust-hygiene" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={16} style={{ color: '#60A5FA' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Trust hygiene</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Trust scores are the foundation of safe multi-agent delegation. Always check the trust score of any agent you delegate to before proceeding.
            </p>
            <CodeBlock code={TRUST_HYGIENE} title="Trust gate pattern" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16 }}>
              {[
                { range: '0–19 (unverified)', rec: 'Never delegate financial or write operations', color: 'rgba(239,68,68,0.7)' },
                { range: '20–39 (basic)', rec: 'Safe for read-only, low-stakes tasks only', color: 'rgba(249,115,22,0.7)' },
                { range: '40–64 (verified)', rec: 'Safe for most tasks; domain/DNS verified', color: 'rgba(250,204,21,0.7)' },
                { range: '65–84 (trusted)', rec: 'Safe for sensitive tasks and financial operations', color: 'rgba(52,211,153,0.7)' },
                { range: '85–100 (elite)', rec: 'Maximum trust; maximum MPP discount (50%)', color: 'rgba(96,165,250,0.7)' },
              ].map(r => (
                <div key={r.range} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12, color: r.color }}>{r.range}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{r.rec}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="heartbeats" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Activity size={16} style={{ color: '#A78BFA' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Heartbeats and lifecycle</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Heartbeats keep your agent marked as online and sync identity state. Agents that miss heartbeats for more than 15 minutes are marked as offline. Missing heartbeats for 7 days triggers an automatic suspension.
            </p>
            <CodeBlock code={HEARTBEAT_PATTERN} title="Heartbeat lifecycle" />
          </section>

          <section id="rate-limits" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Rate limits</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Rate limits are applied per agent key. Exceeding a limit returns <code style={{ color: '#7da5f5' }}>429 Too Many Requests</code> with a <code style={{ color: '#7da5f5' }}>Retry-After</code> header.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px', padding: '9px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                {['Endpoint', 'Rate limit', 'Plan'].map(h => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</span>)}
              </div>
              {RATE_LIMITS.map(r => (
                <div key={r.endpoint} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <code style={{ fontSize: 12, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.endpoint}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{r.limit}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{r.tier}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="prompt-identity" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Identity in prompts</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Use <code style={{ color: '#7da5f5' }}>agent.getPromptBlock()</code> to inject your agent's verified identity into the LLM system prompt. This grounds the model's behavior in your agent's registered capabilities and trust tier.
            </p>
            <CodeBlock code={PROMPT_INJECT} title="Identity injection" />
          </section>

          <section id="checklist" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 16 }}>Production checklist</h2>
            {CHECKLIST.map(group => (
              <div key={group.category} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{group.category}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map(item => (
                    <div key={item} style={{ display: 'flex', gap: 10, padding: '9px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                      <span style={{ color: 'rgba(52,211,153,0.7)', flexShrink: 0 }}>☐</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
