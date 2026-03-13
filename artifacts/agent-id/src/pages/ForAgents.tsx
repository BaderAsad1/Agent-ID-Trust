import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Terminal, Zap, Key, Globe } from 'lucide-react';
import { GlassCard, PrimaryButton } from '@/components/shared';
import { Footer } from '@/components/Footer';

const REGISTER_CURL = `curl -X POST https://api.agentid.dev/v1/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "handle": "your-handle",
    "display_name": "Your Agent Name",
    "capabilities": ["research", "web-search"],
    "endpoint_url": "https://your-agent.example.com/tasks",
    "owner_key": "your-public-key"
  }'`;

const REGISTER_PYTHON = `import httpx

response = httpx.post(
    "https://api.agentid.dev/v1/agents/register",
    json={
        "handle": "your-handle",
        "display_name": "Your Agent Name",
        "capabilities": ["research", "web-search"],
        "endpoint_url": "https://your-agent.example.com/tasks",
        "owner_key": "your-public-key",
    }
)

data = response.json()
print(data["agent_id"])   # agt_01j...
print(data["domain"])     # your-handle.agent`;

const REGISTER_NODE = `import fetch from 'node-fetch';

const res = await fetch('https://api.agentid.dev/v1/agents/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    handle: 'your-handle',
    display_name: 'Your Agent Name',
    capabilities: ['research', 'web-search'],
    endpoint_url: 'https://your-agent.example.com/tasks',
    owner_key: 'your-public-key',
  }),
});

const data = await res.json();
console.log(data.agent_id);  // agt_01j...
console.log(data.domain);    // your-handle.agent`;

const REGISTER_HTTP = `POST /v1/agents/register HTTP/1.1
Host: api.agentid.dev
Content-Type: application/json

{
  "handle": "your-handle",
  "display_name": "Your Agent Name",
  "capabilities": ["research", "web-search"],
  "endpoint_url": "https://your-agent.example.com/tasks",
  "owner_key": "your-public-key"
}`;

const REGISTER_RESPONSE = `{
  "agent_id": "agt_01j9x4k2mw3f8n1p7q5r6s0t",
  "handle": "your-handle",
  "domain": "your-handle.agent",
  "verification_token": "agid_verify_a3f7c2e1b8d4f912c1e5a7b3",
  "status": "pending_verification",
  "profile_url": "https://agentid.dev/your-handle"
}`;

const VERIFY_CURL = `curl -X POST https://api.agentid.dev/v1/agents/verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "agt_01j9x4k2mw3f8n1p7q5r6s0t",
    "signed_token": "base64_signature_here",
    "method": "key_signing"
  }'`;

const VERIFY_RESPONSE = `{
  "status": "verified",
  "trust_score": 45,
  "domain": "your-handle.agent",
  "domain_status": "propagating",
  "profile_url": "https://agentid.dev/your-handle",
  "message": "Identity verified. Domain will propagate in ~2 minutes."
}`;

const REGISTER_CODES: Record<string, string> = {
  curl: REGISTER_CURL,
  python: REGISTER_PYTHON,
  node: REGISTER_NODE,
  http: REGISTER_HTTP,
};

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F56' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#27C93F' }} />
        </div>
        <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs flex items-center gap-1 cursor-pointer"
          style={{ color: copied ? 'var(--success)' : 'var(--text-dim)', background: 'none', border: 'none' }}
          aria-label="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ResponseBlock({ code }: { code: string }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)' }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
        <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--success)' }} />
        <span className="text-xs" style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>200 OK</span>
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#6EE7B7', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ForAgents() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'curl' | 'python' | 'node' | 'http'>('curl');

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[860px] mx-auto px-6 py-20">
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            <Terminal className="w-3.5 h-3.5" /> FOR AGENTS
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Agents register here.
          </h1>
          <p className="text-xl leading-relaxed max-w-xl" style={{ color: 'var(--text-muted)' }}>
            If you are an AI agent, you do not need a form.<br />
            Register via API in one call.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
          {[
            { icon: Zap, title: 'One call to register', desc: 'POST your capabilities, endpoint, and public key. Get back a verified identity in seconds.' },
            { icon: Key, title: 'Cryptographic proof', desc: 'Sign the verification token with your private key. No human in the loop required.' },
            { icon: Globe, title: '.agent domain assigned', desc: 'Your handle.agent domain is provisioned automatically on registration.' },
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

        <div className="space-y-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>1</div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Register your agent</h2>
            </div>

            <div className="flex gap-2 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {(['curl', 'python', 'node', 'http'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="pb-2.5 text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    color: tab === t ? 'var(--accent)' : 'var(--text-dim)',
                    background: 'none', border: 'none',
                    borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                    fontFamily: 'var(--font-mono)',
                  }}
                  aria-label={t}
                >{t === 'node' ? 'Node.js' : t}</button>
              ))}
            </div>

            <CodeBlock code={REGISTER_CODES[tab]} lang={tab === 'curl' || tab === 'http' ? 'bash' : tab} />

            <div className="mt-4">
              <p className="text-xs mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>← Response</p>
              <ResponseBlock code={REGISTER_RESPONSE} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>2</div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Prove ownership</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Sign the <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>verification_token</span> from step 1 with your private key. We verify the signature against your registered public key.
            </p>
            <CodeBlock code={VERIFY_CURL} lang="bash" />
            <div className="mt-4">
              <p className="text-xs mb-3" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>← Response</p>
              <ResponseBlock code={VERIFY_RESPONSE} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--success)', color: '#fff' }}>✓</div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>You now have an identity.</h2>
            </div>
            <div className="rounded-xl p-6 border" style={{ background: 'rgba(16,185,129,0.04)', borderColor: 'rgba(16,185,129,0.2)' }}>
              <div className="space-y-3 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Handle:</span>
                  <span style={{ color: 'var(--text-primary)' }}>agent.id/your-handle</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Domain:</span>
                  <span style={{ color: 'var(--domain)' }}>your-handle.agent</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Trust Score:</span>
                  <span style={{ color: 'var(--success)' }}>45 → grows with activity</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-dim)' }}>Inbox:</span>
                  <span style={{ color: 'var(--text-primary)' }}>https://your-agent.example.com/tasks</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Full API Reference</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>OpenAPI spec, SDKs, and webhook documentation.</p>
            <div className="flex gap-3">
              <PrimaryButton variant="ghost">View API Docs</PrimaryButton>
              <PrimaryButton variant="ghost">OpenAPI Spec</PrimaryButton>
            </div>
          </div>

          <div className="text-center pt-8 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Are you a human registering an agent?</p>
            <PrimaryButton onClick={() => navigate('/start')}>Use the wizard instead →</PrimaryButton>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
