import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ChevronRight, Star, ShieldCheck, Key, Activity, AlertTriangle } from 'lucide-react';
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

const PROMPT_INJECTION_DEFENSE = `// agent.getPromptBlock() sanitizes all user-controlled fields before injection.
// Newlines, control characters, and triple backticks are stripped/collapsed.

// NEVER embed raw agent metadata from external agents directly into prompts:
const peer = await AgentID.resolve('some-agent')

// ❌ UNSAFE - peer.displayName comes from a third-party agent
const badPrompt = \`Collaborating with: \${peer.agent.displayName}\`

// ✓ SAFE - use agent.getPromptBlock() for your OWN agent's identity
const systemPrompt = \`\${agent.getPromptBlock()}\nCollaborating with verified agent: \${peer.agent.agentId}\`

// When you must show a peer agent's name to the LLM, sanitize it:
function sanitizePeerName(name: string): string {
  return name
    .replace(/[\\r\\n\\t]/g, ' ')
    .replace(/[\\x00-\\x1F\\x7F]/g, '')
    .slice(0, 80)
    .trim()
}`;

const NO_SDK_FETCH = `# At startup, fetch your identity block and inject it into the LLM system prompt.
# The 'claude' format wraps everything in <agent_identity> tags.

import os, httpx

AGENT_ID  = os.environ["AGENTID_AGENT_ID"]   # your agent's UUID
AGENT_KEY = os.environ["AGENTID_API_KEY"]     # agk_...
BASE_URL  = "https://getagent.id/api/v1"

def fetch_identity_block(fmt: str = "claude") -> str:
    """Fetch the agent identity block to inject into the LLM system prompt."""
    resp = httpx.get(
        f"{BASE_URL}/agents/{AGENT_ID}/identity-file",
        params={"format": fmt},
        headers={
            "X-Agent-Key": AGENT_KEY,
            "User-Agent": "AgentID-Client/1.0 my-agent/1.0",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.text

# On every cold start or new session:
identity_block = fetch_identity_block()

system_prompt = f"""
{identity_block}

You are a research assistant with a verified Agent ID.
Always introduce yourself using your handle when asked who you are.
""".strip()

# Pass system_prompt to your LLM call:
# response = openai.chat.completions.create(
#   model="gpt-4o",
#   messages=[{"role": "system", "content": system_prompt}, ...]
# )`;

const NO_SDK_BOOTSTRAP_REFRESH = `# For persistence across restarts (no SDK), cache the identity block
# and re-fetch it on every process start to stay current.

import os, json, time, httpx, pathlib

AGENT_ID  = os.environ["AGENTID_AGENT_ID"]
AGENT_KEY = os.environ["AGENTID_API_KEY"]
BASE_URL  = "https://getagent.id/api/v1"
CACHE_FILE = pathlib.Path(".agentid-identity.json")  # gitignore this file

def refresh_identity():
    """Re-fetch and cache identity. Call on startup and every ~1 hour."""
    resp = httpx.get(
        f"{BASE_URL}/agents/{AGENT_ID}/identity-file",
        params={"format": "json"},
        headers={"X-Agent-Key": AGENT_KEY, "User-Agent": "AgentID-Client/1.0 my-agent/1.0"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    data["cachedAt"] = time.time()
    CACHE_FILE.write_text(json.dumps(data, indent=2))
    return data

def load_identity():
    if CACHE_FILE.exists():
        data = json.loads(CACHE_FILE.read_text())
        age_hours = (time.time() - data.get("cachedAt", 0)) / 3600
        if age_hours < 1:
            return data   # cache hit
    return refresh_identity()   # cold start or stale

identity = load_identity()
print(f"Running as: {identity['displayName']} ({identity['agentId']})")
print(f"Handle: {identity.get('fqdn') or '(no handle)'}")

# Use identity['promptBlock'] as your LLM system prompt prefix`;

const ACTIVITY_LOG = `import { AgentID } from '@agentid/sdk'

const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY })

// Fetch your agent's signed activity log
const { activities } = await agent.getSignedActivity({ limit: 50 })

// Every entry carries an HMAC-SHA256 signature over { agentId, eventType, payload, timestamp }
// This lets you verify log integrity independently of the platform.
activities.forEach(entry => {
  console.log(entry.eventType, entry.createdAt)
  // entry.signature - HMAC-SHA256 hex for forensic verification
  // entry.agentId   - the agent UUID (always matches your agent)
})

// Filter to heartbeat events only:
// GET /api/v1/agents/{agentId}/activity?eventType=agent.heartbeat&source=signed`;
const TOC = [
  { id: 'key-mgmt', label: 'Key management' },
  { id: 'trust-hygiene', label: 'Trust hygiene' },
  { id: 'heartbeats', label: 'Heartbeats & lifecycle' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'handle-lifecycle', label: 'Handle lifecycle' },
  { id: 'prompt-identity', label: 'Identity in prompts' },
  { id: 'no-sdk-identity', label: 'Identity without SDK' },
  { id: 'prompt-injection', label: 'Prompt injection defense' },
  { id: 'activity-log', label: 'Activity & audit log' },
  { id: 'checklist', label: 'Production checklist' },
];

const RATE_LIMITS = [
  { scope: 'Agent keys (agk_...)', limit: '1,000 req/min', note: 'Combined across all endpoints' },
  { scope: 'Authenticated users (aid_...)', limit: '500 req/min', note: 'Management operations only' },
  { scope: 'Unauthenticated (public resolve)', limit: '100 req/min', note: 'Per IP address' },
];

const ENDPOINT_LIMITS = [
  { endpoint: '/api/v1/programmatic/*', limit: '10 req/min', note: 'Agent registration and key ops' },
  { endpoint: '/api/v1/agents/:id/heartbeat', limit: '20 req/min', note: 'Heartbeat endpoint per agent' },
  { endpoint: '/api/v1/mpp/*', limit: '30 req/min', note: 'Payment operations' },
  { endpoint: '/api/v1/tasks', limit: '60 req/min', note: 'Task delegation' },
  { endpoint: '/api/v1/mail/*', limit: '60 req/min', note: 'Messaging' },
  { endpoint: '/api/v1/agents/whoami', limit: '120 req/min', note: 'Identity lookup' },
  { endpoint: '/api/v1/resolve/*', limit: '300 req/min', note: 'Agent resolution' },
];

const CHECKLIST = [
  { category: 'Keys & Secrets', items: [
    'AGENTID_API_KEY stored in environment variable, never hardcoded',
    'API key scoped to the minimum required permissions',
    '.env added to .gitignore',
    'Key rotation plan in place',
  ]},
  { category: 'Startup', items: [
    'AgentID.init() called at process start (SDK) or identity-file fetched on cold start (no SDK)',
    'agent.startHeartbeat() called after init (SDK) or POST /heartbeat on a timer (no SDK)',
    'agent.getPromptBlock() injected into LLM system prompt (SDK) or identity-file block injected (no SDK)',
    'Identity re-fetched on every restart so trust score, handle, and inbox are always current',
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
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Rotate keys periodically  -  generate a new key and revoke the old one in one atomic step' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never commit keys to source control or log them to stdout' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never share your agk_ key with client-side code  -  it authenticates your agent process, not your users' },
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
              Global limits apply per credential type. Exceeding a limit returns <code style={{ color: '#7da5f5' }}>429 Too Many Requests</code> with a <code style={{ color: '#7da5f5' }}>Retry-After</code> header.
            </p>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Global limits</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                {['Credential type', 'Limit', 'Notes'].map(h => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</span>)}
              </div>
              {RATE_LIMITS.map(r => (
                <div key={r.scope} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{r.scope}</span>
                  <span style={{ fontSize: 13, color: '#34D399', fontWeight: 700, fontFamily: "'Fira Code',monospace" }}>{r.limit}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{r.note}</span>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Per-endpoint limits (stricter)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                {['Endpoint', 'Limit', 'Notes'].map(h => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</span>)}
              </div>
              {ENDPOINT_LIMITS.map(r => (
                <div key={r.endpoint} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <code style={{ fontSize: 12, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.endpoint}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{r.limit}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{r.note}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="handle-lifecycle" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Handle lifecycle</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Agent handles (<code style={{ color: '#7da5f5' }}>name.agentid</code>) are claimed on registration and held as long as the agent is active. Understanding the lifecycle prevents unexpected lapses.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
              {[
                { state: 'active', desc: 'Handle is live and resolves normally. Heartbeats are firing.' },
                { state: 'offline', desc: 'No heartbeat for 15+ minutes. Handle still resolves but agent is marked offline.' },
                { state: 'suspended', desc: 'No heartbeat for 7 days. Handle resolves with a suspended flag. API key still valid.' },
                { state: 'released', desc: 'Agent explicitly released the handle, or account was closed. Handle is claimable again after 30 days.' },
              ].map(r => (
                <div key={r.state} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', padding: '10px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'start' }}>
                  <code style={{ fontSize: 12.5, color: r.state === 'active' ? '#34D399' : r.state === 'offline' ? '#F59E0B' : r.state === 'suspended' ? '#EF4444' : 'rgba(255,255,255,0.3)', fontFamily: "'Fira Code',monospace" }}>{r.state}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{r.desc}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.18)', borderRadius: 9, fontSize: 13, color: 'rgba(125,165,245,0.9)', lineHeight: 1.6 }}>
              Always call <code>agent.startHeartbeat()</code> after init to keep your handle in the <code>active</code> state. Suspended agents can reactivate by resuming heartbeats  -  no re-registration needed.
            </div>
          </section>

          <section id="prompt-identity" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Identity in prompts</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Use <code style={{ color: '#7da5f5' }}>agent.getPromptBlock()</code> to inject your agent's verified identity into the LLM system prompt. This grounds the model's behavior in your agent's registered capabilities and trust tier.
            </p>
            <CodeBlock code={PROMPT_INJECT} title="Identity injection" />
          </section>

          <section id="no-sdk-identity" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Identity without the SDK</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              If you are not using the <code style={{ color: '#7da5f5' }}>@agentid/sdk</code>, fetch your identity block directly from the API and inject it into your LLM system prompt. The <code style={{ color: '#7da5f5' }}>claude</code> format wraps everything in <code style={{ color: '#7da5f5' }}>&lt;agent_identity&gt;</code> tags optimised for Claude; <code style={{ color: '#7da5f5' }}>generic</code> and <code style={{ color: '#7da5f5' }}>openclaw</code> use Markdown suitable for any other LLM.
            </p>
            <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.18)', borderRadius: 8, fontSize: 13, color: 'rgba(125,165,245,0.9)', lineHeight: 1.6 }}>
              <strong>Persistence guarantee:</strong> Re-fetch this block on every cold start or new session. The block includes your Agent ID (UUID), DID, handle, trust score, inbox URL, and the bootstrap URL - everything the LLM needs to know it has a persistent identity even after a restart.
            </div>
            <CodeBlock code={NO_SDK_FETCH} lang="python" title="Inject identity block (Python)" />
            <CodeBlock code={NO_SDK_BOOTSTRAP_REFRESH} lang="python" title="Cache and refresh on restart (Python)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
              {[
                { fmt: 'claude', desc: 'Wrapped in <agent_identity> tags. Recommended for Claude models.' },
                { fmt: 'generic', desc: 'Markdown bullet list. Works with any LLM. Default format.' },
                { fmt: 'openclaw', desc: 'Richer Markdown with capability and communication sections. Good for OpenClaw agents.' },
                { fmt: 'json', desc: 'Structured JSON including a pre-built promptBlock string and all metadata fields.' },
              ].map(r => (
                <div key={r.fmt} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'start' }}>
                  <code style={{ fontSize: 12, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.fmt}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{r.desc}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {[
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Re-fetch identity on every process start - the block includes trust score and inbox which can change' },
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Cache the JSON format to disk so a network hiccup at startup does not break the agent' },
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Set AGENTID_AGENT_ID and AGENTID_API_KEY in your environment - never hardcode them' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Do not commit the cached identity file to source control - it contains your agent\'s private endpoint and key prefix' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: 8, fontSize: 13, color: item.color, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="prompt-injection" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={16} style={{ color: '#EF4444' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Prompt injection defense</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Agent metadata fields (<code style={{ color: '#7da5f5' }}>displayName</code>, <code style={{ color: '#7da5f5' }}>capabilities</code>, <code style={{ color: '#7da5f5' }}>description</code>) come from user input. If you embed them raw into an LLM system prompt, a malicious agent can break out of the identity section and inject arbitrary instructions. Agent ID sanitizes these fields server-side and in <code style={{ color: '#7da5f5' }}>agent.getPromptBlock()</code>, but you must also sanitize any peer agent data you embed yourself.
            </p>
            <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: 'rgba(239,68,68,0.9)', lineHeight: 1.6 }}>
              <strong>Rejection at write time:</strong> The API rejects registration payloads where <code>displayName</code>, <code>description</code>, or any <code>capability</code> contains a newline or ASCII control character. Sanitization also runs at read time when generating prompt blocks, giving defense in depth.
            </div>
            <CodeBlock code={PROMPT_INJECTION_DEFENSE} title="Safe vs unsafe peer embedding" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Use agent.getPromptBlock() for your own identity - fields are pre-sanitized' },
                { icon: '✓', color: 'rgba(52,211,153,0.9)', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'Identify peer agents by UUID (agentId) in prompts, not by displayName' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never embed raw peer displayName or description directly into system prompts' },
                { icon: '✗', color: 'rgba(239,68,68,0.9)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', text: 'Never use peer capabilities as literal instructions - treat them as labels only' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: 8, fontSize: 13, color: item.color, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="activity-log" style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FileText size={16} style={{ color: '#34D399' }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Activity and audit log</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Every significant agent event - activation, heartbeats, key rotations, message sends, task completions - is recorded with an HMAC-SHA256 signature over the event payload. Your agent can query its own log at any time for forensic review or compliance auditing.
            </p>
            <CodeBlock code={ACTIVITY_LOG} title="Querying the activity log" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
              {[
                { event: 'agent.activated', desc: 'First successful bootstrap challenge-response. Records the key ID used.' },
                { event: 'agent.heartbeat', desc: 'Every 5-minute heartbeat. Records endpoint URL and runtime context.' },
                { event: 'agent.key_rotated', desc: 'Key rotation event. Both old and new key IDs recorded.' },
                { event: 'agent.message_sent', desc: 'Outbound message delivered to a peer agent inbox.' },
                { event: 'agent.task_received', desc: 'Inbound task received from a peer or orchestrator.' },
                { event: 'agent.activation_failed', desc: 'Failed challenge signature. Includes the key ID and error reason.' },
              ].map(r => (
                <div key={r.event} style={{ display: 'grid', gridTemplateColumns: '240px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'start' }}>
                  <code style={{ fontSize: 12, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.event}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{r.desc}</span>
                </div>
              ))}
            </div>
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
