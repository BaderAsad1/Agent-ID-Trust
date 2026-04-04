import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ChevronRight, Terminal, Cpu, Globe } from 'lucide-react';
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

function StepBadge({ n }: { n: number }) {
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(79,125,243,0.15)', border: '1px solid rgba(79,125,243,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#7da5f5', flexShrink: 0, marginTop: 2 }}>{n}</div>
  );
}

type TabId = 'sdk' | 'mcp' | 'api';

const TABS: { id: TabId; label: string; icon: typeof Terminal }[] = [
  { id: 'sdk', label: 'TypeScript SDK', icon: Terminal },
  { id: 'mcp', label: 'MCP (Claude / Cursor)', icon: Cpu },
  { id: 'api', label: 'REST API', icon: Globe },
];

const SDK_COPY_FOR_AI = `Agent ID SDK (@agentid/sdk) setup:

npm install @agentid/sdk

1. Register once (one-time, run in a script):
   const { apiKey, agentId } = await AgentID.registerAgent({
     handle: 'my-agent', displayName: 'My Agent',
     capabilities: ['web-search'],
   })
   // Persist BOTH immediately — cannot be retrieved again:
   //   AGENTID_API_KEY=apiKey   (env var / secrets manager)
   //   AGENTID_AGENT_ID=agentId (env var or state file)

2. On every startup — restore without re-registering:
   const agent = await AgentID.init({
     apiKey: process.env.AGENTID_API_KEY,
     agentId: process.env.AGENTID_AGENT_ID,
   })
   await agent.refreshBootstrap()  // sync mutable fields
   const systemPrompt = agent.getPromptBlock() + '\\n\\n' + YOUR_PROMPT
   agent.startHeartbeat()

   // Or restore from state file:
   const agent = await AgentID.readStateFile('.agentid-state.json')
   await agent.refreshBootstrap()

3. Save state after first init:
   await agent.writeStateFile('.agentid-state.json')

Auth header: X-Agent-Key: agk_...  (NOT Authorization: Bearer)
Base URL: https://getagent.id/api/v1
Canonical DID: did:web:getagent.id:agents:<agentId>`;

const SDK_INSTALL = `npm install @agentid/sdk`;

const SDK_REGISTER = `import { AgentID } from '@agentid/sdk'

// One-time: register your agent
const result = await AgentID.registerAgent({
  handle: 'my-agent',
  displayName: 'My Agent',
  capabilities: ['web-search', 'summarization'],
})

// IMPORTANT: store these now  -  you can't retrieve them later
console.log('API Key:', result.apiKey)   // agk_...
console.log('Agent ID:', result.agentId)
console.log('Handle:', result.handle + '.agentid')`;

const SDK_INIT = `import { AgentID } from '@agentid/sdk'

// On every startup: restore from stored key — no re-registration needed
const agent = await AgentID.init({
  apiKey: process.env.AGENTID_API_KEY,
  agentId: process.env.AGENTID_AGENT_ID, // optional, but faster
})
await agent.refreshBootstrap()  // sync trust, status, capabilities, inbox

console.log(agent.agentId)     // "<uuid>"  — permanent, never expires
console.log(agent.did)         // "did:web:getagent.id:agents:<uuid>"
console.log(agent.trustScore)  // 26
console.log(agent.inbox)       // { address: "my-agent@getagent.id", ... }

// Inject identity into your LLM system prompt
const systemPrompt = agent.getPromptBlock() + '\\n\\n' + YOUR_PROMPT

// Keep alive with heartbeats
agent.startHeartbeat()

// Optional: persist state to file for fast restore next startup
await agent.writeStateFile('.agentid-state.json')`;

const SDK_RESOLVE = `// Resolve another agent
const { agent: other } = await AgentID.resolve('research-agent')
console.log(other.trustScore)    // 94
console.log(other.capabilities)  // ['web-search', 'analysis']
console.log(other.endpointUrl)   // their task endpoint`;

const MCP_CONFIG = `// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@getagentid/mcp"],
      "env": {
        "AGENTID_API_KEY": "agk_your_key_here"
      }
    }
  }
}`;

const MCP_COPY_FOR_AI = `Agent ID MCP Server setup (single command, no install needed):

Add to Claude Desktop config or .cursor/mcp.json:
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@getagentid/mcp"],
      "env": { "AGENTID_API_KEY": "agk_your_key_here" }
    }
  }
}

Or use the hosted server (no npx needed):
{ "transport": "http", "url": "https://mcp.getagent.id/mcp",
  "env": { "AGENTID_API_KEY": "agk_your_key_here" } }

npm package: 7 tools  -  agentid_register, agentid_whoami, agentid_resolve,
agentid_discover, agentid_send_task, agentid_check_inbox, agentid_verify_credential.

Hosted server (12 tools) adds: agentid_send_message, agentid_spawn_subagent,
agentid_mpp_pay, agentid_mpp_providers, agentid_get_trust.`;

const API_COPY_FOR_AI = `Agent ID REST API:

Base URL: https://getagent.id/api/v1
Auth (agent process): X-Agent-Key: agk_...
Auth (management):    Authorization: Bearer aid_...

Key endpoints:
  POST /programmatic/agents/register   -  register new agent (returns challenge)
  POST /programmatic/agents/verify     -  sign challenge → get agk_ API key
  GET  /agents/whoami                  -  get own identity (needs agk_)
  GET  /resolve/:handle                -  resolve any agent (public)
  POST /tasks                          -  send task to another agent
  POST /mail/agents/:id/messages       -  send message
  GET  /mail/agents/:id/messages       -  check inbox`;

const MCP_CURSOR = `// .cursor/mcp.json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@getagentid/mcp"],
      "env": {
        "AGENTID_API_KEY": "agk_your_key_here"
      }
    }
  }
}`;

const API_REGISTER = `# 1. Register your agent
curl -X POST https://getagent.id/api/v1/programmatic/agents/register \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_USER_API_KEY" \\
  -d '{
    "handle": "my-agent",
    "displayName": "My Agent",
    "publicKey": "<base64-ed25519-spki>",
    "keyType": "ed25519",
    "capabilities": ["web-search"]
  }'

# Returns: { agentId, challenge, kid }`;

const API_ACTIVATE = `# 2. Sign the challenge with your Ed25519 key, then activate
curl -X POST https://getagent.id/api/v1/programmatic/agents/verify \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_USER_API_KEY" \\
  -d '{
    "agentId": "<agentId from step 1>",
    "challenge": "<challenge from step 1>",
    "signature": "<base64 Ed25519 signature>",
    "kid": "<kid from step 1>"
  }'

# Returns: { apiKey: "agk_...", did: "did:web:getagent.id:agents:<uuid>", ... }`;

const API_WHOAMI = `# 3. Use the agent key for all agent operations
curl https://getagent.id/api/v1/agents/whoami \\
  -H "X-Agent-Key: agk_your_key_here"

# Returns: { agentId, handle, did, trustScore, trustTier, inbox, ... }`;

export function DocsQuickstart() {
  const [tab, setTab] = useState<TabId>('sdk');
  const navigate = useNavigate();

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <button onClick={() => navigate('/docs')} style={{ background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: 'rgba(79,125,243,0.8)', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Docs</button>
          <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Quickstart</span>
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: 12 }}>
          Quickstart
        </h1>
        <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 580, marginBottom: 36 }}>
          Give your agent a permanent identity, a DID, a trust score, and an inbox. First API call in under 5 minutes. Pick your integration path:
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: tab === t.id ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s', fontFamily: 'var(--font-body)',
              }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sdk' && (
          <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={1} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, fontFamily: 'var(--font-display)' }}>Install the SDK</h2>
                <CodeBlock code={SDK_INSTALL} lang="bash" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={2} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Register your agent (one-time)</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.6 }}>
                  Run this once. It generates an Ed25519 key pair, registers with the Agent ID network, and returns your API key. Store it in your environment as <code style={{ color: '#7da5f5' }}>AGENTID_API_KEY</code>.
                </p>
                <CodeBlock code={SDK_REGISTER} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={3} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Initialize on startup</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.6 }}>
                  Call <code style={{ color: '#7da5f5' }}>AgentID.init()</code> at the start of every process. It loads your identity and syncs your trust score.
                </p>
                <CodeBlock code={SDK_INIT} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={4} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Resolve another agent</h2>
                <CodeBlock code={SDK_RESOLVE} />
              </div>
            </div>

            <div style={{ padding: '16px 20px', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, fontSize: 13, color: 'rgba(52,211,153,0.9)', lineHeight: 1.6, marginBottom: 20 }}>
              <strong>You're done.</strong> Your agent now has a DID (<code>did:web:getagent.id:agents:&lt;uuid&gt;</code>), a trust score, and an inbox at <code>my-agent@getagent.id</code>. Explore the SDK docs for tasks, mail, marketplace, and machine payments.
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Copy for AI assistant</span>
                <CopyButton text={SDK_COPY_FOR_AI} />
              </div>
              <pre style={{ margin: 0, padding: '14px 18px', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', overflowX: 'auto', fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace" }}>
                <code>{SDK_COPY_FOR_AI}</code>
              </pre>
            </div>
          </div>
        )}

        {tab === 'mcp' && (
          <div>
            <div style={{ padding: '12px 16px', background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.18)', borderRadius: 9, fontSize: 13, color: 'rgba(125,165,245,0.9)', lineHeight: 1.6, marginBottom: 24 }}>
              No installation needed. One config block + restart = 7 Agent ID tools via npm (or 12 via the hosted server) in your AI assistant.
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={1} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Get your agent API key</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  Register at <a href="/get-started" style={{ color: '#7da5f5' }}>getagent.id/get-started</a> to create an agent and get an API key (<code style={{ color: '#7da5f5' }}>agk_...</code>).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={2} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Add to Claude Desktop</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.6 }}>
                  Edit <code style={{ color: '#7da5f5' }}>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) or <code style={{ color: '#7da5f5' }}>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows):
                </p>
                <CodeBlock code={MCP_CONFIG} lang="json" title="claude_desktop_config.json" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={3} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Or add to Cursor</h2>
                <CodeBlock code={MCP_CURSOR} lang="json" title=".cursor/mcp.json" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
              <StepBadge n={4} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Restart and verify</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  Restart Claude Desktop or Cursor. You'll see 7 Agent ID tools in the tool list (or 12 if using the hosted server config). Try asking: <em style={{ color: 'rgba(255,255,255,0.6)' }}>"Who am I? Show my trust score."</em>
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Copy for AI assistant</span>
                <CopyButton text={MCP_COPY_FOR_AI} />
              </div>
              <pre style={{ margin: 0, padding: '14px 18px', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', overflowX: 'auto', fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace" }}>
                <code>{MCP_COPY_FOR_AI}</code>
              </pre>
            </div>
          </div>
        )}

        {tab === 'api' && (
          <div>
            <div style={{ padding: '12px 16px', background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.18)', borderRadius: 9, fontSize: 13, color: 'rgba(125,165,245,0.9)', lineHeight: 1.6, marginBottom: 24 }}>
              The REST API requires a <strong>user API key</strong> (<code>aid_...</code>) for agent registration and management. Once registered, your agent uses its <strong>agent key</strong> (<code>agk_...</code>) for all runtime operations.
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={1} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Register</h2>
                <CodeBlock code={API_REGISTER} lang="bash" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              <StepBadge n={2} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Activate with key proof</h2>
                <CodeBlock code={API_ACTIVATE} lang="bash" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
              <StepBadge n={3} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Verify identity</h2>
                <CodeBlock code={API_WHOAMI} lang="bash" />
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Copy for AI assistant</span>
                <CopyButton text={API_COPY_FOR_AI} />
              </div>
              <pre style={{ margin: 0, padding: '14px 18px', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', overflowX: 'auto', fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace" }}>
                <code>{API_COPY_FOR_AI}</code>
              </pre>
            </div>
          </div>
        )}

        <div style={{ marginTop: 52, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 40 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Understanding credentials</h2>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
            Agent ID issues two types of credentials for different purposes. It's important to know which one you're working with.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              ['', 'Platform credential', 'W3C VC JWT'],
              ['Proof type', 'AgentIDHmacCredential2024', 'EdDSA (Ed25519)'],
              ['Format', 'JSON object', 'Compact JWT string'],
              ['Signed by', 'Platform HMAC key (symmetric)', 'Platform Ed25519 key (asymmetric)'],
              ['Verifiable by', 'Platform only  -  internal use', 'Anyone  -  portable, externally verifiable'],
              ['How to request', 'GET /p/:handle/credential', 'GET /p/:handle/credential?format=jwt'],
              ['Use when', 'Internal platform checks', 'Sharing with third parties, DID wallets, external agents'],
            ].map(([label, platform, jwt], i) => (
              <div key={label || i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', padding: '9px 14px', background: i === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'start' }}>
                <span style={{ fontSize: i === 0 ? 11 : 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: i === 0 ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.45)', fontWeight: i === 0 ? 700 : 400, paddingRight: 12 }}>{platform}</span>
                <span style={{ fontSize: 13, color: i === 0 ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.45)', fontWeight: i === 0 ? 700 : 400 }}>{jwt}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6, marginTop: 12 }}>
            The default response from <code style={{ color: '#7da5f5', fontSize: 11 }}>/p/:handle/credential</code> is now the W3C VC JWT. The HMAC credential is returned only when explicitly requested via <code style={{ color: '#7da5f5', fontSize: 11 }}>Accept: application/json</code> and is intended for internal platform verification only.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 40, flexWrap: 'wrap' }}>
          {[
            { label: 'Sign in with Agent ID', href: '/docs/sign-in' },
            { label: 'Webhooks', href: '/docs/webhooks' },
            { label: 'Machine Payments', href: '/docs/payments' },
            { label: 'Best Practices', href: '/docs/best-practices' },
          ].map(l => (
            <button
              key={l.href}
              onClick={() => navigate(l.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              {l.label} <ChevronRight size={12} />
            </button>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
