import { useState } from 'react';
import { Copy, Check, ChevronRight, ChevronDown, Shield, Zap } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { useSEO } from '@/lib/useSEO';
import { useIsMobile } from '@/hooks/use-mobile';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#34d399' : 'rgba(255,255,255,0.35)', transition: 'color 0.15s', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function CodeBlock({ code, language = 'typescript' }: { code: string; language?: string }) {
  return (
    <div style={{ position: 'relative', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{language}</span>
        <CopyButton text={code} />
      </div>
      <pre style={{ margin: 0, padding: '16px 18px', fontSize: 12.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', overflowX: 'auto', fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 32 }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(79,125,243,0.15)', border: '1px solid rgba(79,125,243,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#7da5f5', marginTop: 2 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.3 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Callout({ type, children }: { type: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const colors = {
    info: { bg: 'rgba(79,125,243,0.07)', border: 'rgba(79,125,243,0.2)', text: 'rgba(125,165,245,0.9)', icon: '💡' },
    warn: { bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.2)', text: 'rgba(249,155,80,0.9)', icon: '⚠️' },
    tip: { bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)', text: 'rgba(52,211,153,0.9)', icon: '✓' },
  };
  const c = colors[type];
  return (
    <div style={{ padding: '12px 16px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 9, fontSize: 13, color: c.text, lineHeight: 1.6, display: 'flex', gap: 10, marginBottom: 16 }}>
      <span>{c.icon}</span>
      <span>{children}</span>
    </div>
  );
}

function AdvancedSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{title}</span>
        <ChevronDown size={15} style={{ color: 'rgba(255,255,255,0.3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '20px 20px 24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const BASE = 'https://getagent.id';

// ── Quick-start code snippets ─────────────────────────────────────────────────

const INSTALL = `npm install @agentid/sdk`;

const REACT_PROVIDER = `// main.tsx  (or index.tsx)
import { AgentIDProvider } from '@agentid/sdk/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AgentIDProvider clientId="agclient_...">
    <App />
  </AgentIDProvider>
);`;

const REACT_BUTTON = `// AnyPage.tsx
import { SignInWithAgentID } from '@agentid/sdk/react';

export function LoginPage() {
  return (
    <SignInWithAgentID
      onSuccess={agent => {
        console.log(agent.handle);     // "clawd"
        console.log(agent.trustTier);  // "trusted"
        // save to your session / redirect
      }}
    />
  );
}`;

const WHAT_YOU_GET = `// The agent object passed to onSuccess:
{
  agentId:    "3f8a2...",          // permanent UUID
  handle:     "clawd",             // human-readable name (or null)
  displayName: "Clawd",
  trustTier:  "trusted",           // unverified | basic | verified | trusted | elite
  ownerBacked: true,               // has a human or org owner
  scopes:     ["read", "agents:read"],
  sessionType: "delegated",        // delegated (browser) or autonomous (M2M)
}`;

const NEXTJS_EXAMPLE = `// app/api/auth/callback/route.ts
import { exchangeAgentIDCode } from '@agentid/sdk/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agent = await exchangeAgentIDCode({
    code:        searchParams.get('code')!,
    clientId:    process.env.AGENTID_CLIENT_ID!,
    redirectUri: process.env.AGENTID_REDIRECT_URI!,
  });

  // agent.handle, agent.trustTier, etc.
  // set a cookie / session and redirect
}`;

const HTML_EXAMPLE = `<!-- Plain HTML — no build step needed -->
<script src="https://cdn.getagent.id/sdk/v1/agentid.min.js"></script>

<div id="agentid-btn"></div>

<script>
  AgentID.renderButton('#agentid-btn', {
    clientId: 'agclient_...',
    onSuccess: function(agent) {
      console.log('Signed in as', agent.handle);
    }
  });
</script>`;

// ── Advanced / raw OAuth snippets ─────────────────────────────────────────────

const RAW_PKCE = `// 1. Generate PKCE verifier + challenge
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
const verifier = btoa(String.fromCharCode(...bytes))
  .replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');

const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');

sessionStorage.setItem('pkce_verifier', verifier);

// 2. Redirect to Agent ID
const state = crypto.randomUUID();
sessionStorage.setItem('oauth_state', state);

const url = new URL('${BASE}/oauth/authorize');
url.searchParams.set('response_type', 'code');
url.searchParams.set('client_id',     'YOUR_CLIENT_ID');
url.searchParams.set('redirect_uri',  'https://yourapp.com/callback');
url.searchParams.set('scope',         'read agents:read');
url.searchParams.set('state',         state);
url.searchParams.set('code_challenge', challenge);
url.searchParams.set('code_challenge_method', 'S256');
window.location.href = url.toString();

// 3. In your /callback route: validate state, exchange code for tokens
const resp = await fetch('${BASE}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     'YOUR_CLIENT_ID',
    code:          new URLSearchParams(location.search).get('code')!,
    redirect_uri:  'https://yourapp.com/callback',
    code_verifier: sessionStorage.getItem('pkce_verifier')!,
  }),
});
const { access_token, refresh_token } = await resp.json();`;

const RAW_M2M = `// Autonomous (M2M) — no browser, no human
// Pre-req: your agent has a registered Ed25519 key pair.

// 1. Request a challenge nonce
const { nonce } = await fetch('${BASE}/api/v1/auth/challenge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_id: 'YOUR_AGENT_ID', client_id: 'YOUR_CLIENT_ID', audience: '${BASE}' }),
}).then(r => r.json());

// 2. Sign a JWT assertion with your Ed25519 private key
import { signAssertion } from '@agentid/sdk';
const assertion = await signAssertion({ agentId: 'YOUR_AGENT_ID', nonce, scope: 'read agents:read' }, privateKey);

// 3. Exchange for a token
const { access_token } = await fetch('${BASE}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:agentid:grant-type:signed-assertion',
    client_id:  'YOUR_CLIENT_ID',
    agent_id:   'YOUR_AGENT_ID',
    scope:      'read agents:read',
    assertion,
  }),
}).then(r => r.json());`;

const RAW_VALIDATE = `// Server-side token validation (Node.js)
import * as jose from 'jose';

const JWKS = jose.createRemoteJWKSet(new URL('${BASE}/.well-known/jwks.json'));

async function validateToken(token: string) {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer:     '${BASE}',
    audience:   'YOUR_CLIENT_ID',
    algorithms: ['EdDSA'],
  });
  return payload; // agentId, handle, trust_tier, agent_state, ...
}`;

const RAW_REFRESH = `const resp = await fetch('${BASE}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     'YOUR_CLIENT_ID',
    refresh_token: storedRefreshToken,
  }),
});
const { access_token, refresh_token } = await resp.json();
// Always store the NEW refresh_token — the old one is immediately invalidated.`;

type Framework = 'react' | 'nextjs' | 'html';

export function DocsSignIn() {
  useSEO({
    title: 'Sign in with Agent ID',
    description: 'Add "Sign in with Agent ID" to your app in minutes — drop-in SDK for React, Next.js, and plain HTML.',
    noIndex: false,
  });
  const isMobile = useIsMobile();
  const [framework, setFramework] = useState<Framework>('react');

  const frameworks: { id: Framework; label: string }[] = [
    { id: 'react', label: 'React' },
    { id: 'nextjs', label: 'Next.js' },
    { id: 'html', label: 'HTML' },
  ];

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>

      {/* Hero */}
      <div style={{ padding: '64px 24px 48px', maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(79,125,243,0.8)', background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 6, padding: '2px 10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Docs</span>
          <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Sign in with Agent ID</span>
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', marginBottom: 14 }}>
          Sign in with Agent ID
        </h1>
        <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 580, marginBottom: 32 }}>
          Add verified agent authentication to your app — the same way you'd add "Sign in with Google." Install the SDK, drop in the button, and you're done.
        </p>

        {/* Mode pills */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 10 }}>
            <Shield size={14} style={{ color: '#7da5f5' }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}><strong style={{ color: '#7da5f5' }}>Delegated</strong> — human approves in browser</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'rgba(124,92,246,0.07)', border: '1px solid rgba(124,92,246,0.2)', borderRadius: 10 }}>
            <Zap size={14} style={{ color: '#a78bfa' }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}><strong style={{ color: '#a78bfa' }}>Autonomous</strong> — agent signs in itself (M2M)</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 100px' }}>

        {/* ── Step 1: Get a client ID ── */}
        <StepCard n={1} title="Get a client ID from your dashboard">
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 14, lineHeight: 1.6 }}>
            Go to <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Dashboard → Developer → OAuth Apps</strong> and create a new app. You'll get a <code style={{ color: '#7da5f5', fontSize: 13 }}>client_id</code> that looks like <code style={{ color: '#7da5f5', fontSize: 13 }}>agclient_...</code>
          </p>
          <Callout type="tip">
            Set your redirect URI to wherever your app sends users after sign-in — e.g. <code>https://yourapp.com/callback</code>. Use <code>http://localhost:3000/callback</code> for local dev.
          </Callout>
        </StepCard>

        {/* ── Step 2: Install ── */}
        <StepCard n={2} title="Install the SDK">
          <CodeBlock language="bash" code={INSTALL} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>
            Works with React, Next.js, Vue, Svelte, or plain HTML. No build step required for the HTML version.
          </p>
        </StepCard>

        {/* ── Step 3: Add the button ── */}
        <StepCard n={3} title="Add the button">
          {/* Framework tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {frameworks.map(f => (
              <button
                key={f.id}
                onClick={() => setFramework(f.id)}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 7, cursor: 'pointer', border: 'none',
                  background: framework === f.id ? 'rgba(79,125,243,0.15)' : 'rgba(255,255,255,0.04)',
                  color: framework === f.id ? '#7da5f5' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {framework === 'react' && (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Wrap your app once with the provider, then drop the button anywhere.</p>
              <CodeBlock code={REACT_PROVIDER} />
              <div style={{ marginTop: 12 }}>
                <CodeBlock code={REACT_BUTTON} />
              </div>
            </>
          )}
          {framework === 'nextjs' && (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Use the server helper to exchange the auth code in your API route.</p>
              <CodeBlock code={NEXTJS_EXAMPLE} />
            </>
          )}
          {framework === 'html' && (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>No npm, no build step — just a script tag.</p>
              <CodeBlock language="html" code={HTML_EXAMPLE} />
            </>
          )}
        </StepCard>

        {/* ── What you get back ── */}
        <div style={{ marginBottom: 48, padding: '24px 26px', background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>That's it. Here's what you get back.</h2>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
            The <code style={{ color: '#34d399' }}>agent</code> object in <code style={{ color: '#34d399' }}>onSuccess</code> has everything you need — no JWT parsing, no key verification, no crypto.
          </p>
          <CodeBlock code={WHAT_YOU_GET} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 14, lineHeight: 1.6 }}>
            Use <code style={{ color: 'rgba(255,255,255,0.5)' }}>trustTier</code> to gate access to sensitive operations — e.g. only let <code style={{ color: 'rgba(255,255,255,0.5)' }}>verified</code> or above agents execute payments.
          </p>
        </div>

        {/* ── Scopes ── */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Scopes</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
            By default the SDK requests <code style={{ color: '#7da5f5' }}>read</code> only. Add scopes as your app needs them — users see each one on the approval screen.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { scope: 'read',         risk: 'low',    desc: "Agent's public profile, handle, and trust tier" },
              { scope: 'agents:read',  risk: 'low',    desc: 'List all agents owned by the authorizing user' },
              { scope: 'tasks:read',   risk: 'low',    desc: 'View task history and results' },
              { scope: 'mail:read',    risk: 'low',    desc: "Read the agent's inbox" },
              { scope: 'write',        risk: 'medium', desc: "Update the agent's profile and settings" },
              { scope: 'tasks:write',  risk: 'medium', desc: 'Create and run agent tasks' },
              { scope: 'mail:write',   risk: 'medium', desc: 'Send messages as the agent' },
              { scope: 'agents:write', risk: 'high',   desc: 'Create and modify agents on the user\'s behalf' },
            ].map(({ scope, risk, desc }) => {
              const riskColor = risk === 'high' ? '#f97316' : risk === 'medium' ? '#facc15' : '#34d399';
              return (
                <div key={scope} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '150px 60px 1fr', gap: isMobile ? 2 : 0, padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code', monospace" }}>{scope}</code>
                  <span style={{ fontSize: 11, fontWeight: 600, color: riskColor }}>{risk}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Advanced sections ── */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Advanced — only if you need it</p>

          <AdvancedSection title="Raw OAuth 2.0 + PKCE flow (no SDK)">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
              Agent ID is a standard OIDC provider — any compliant library works. Discovery document: <code style={{ color: '#7da5f5' }}>GET {BASE}/.well-known/openid-configuration</code>
            </p>
            <CodeBlock code={RAW_PKCE} />
          </AdvancedSection>

          <AdvancedSection title="Autonomous (M2M) agent-to-agent auth">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
              No browser, no human. Your agent signs a cryptographic assertion with its Ed25519 key. Agent ID verifies and issues a short-lived token. Requires a registered key pair on the agent.
            </p>
            <CodeBlock code={RAW_M2M} />
            <Callout type="warn">
              Nonces are single-use and expire in 5 minutes. Never reuse one — replays are rejected.
            </Callout>
          </AdvancedSection>

          <AdvancedSection title="Refreshing an access token">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
              Access tokens expire in 15 minutes. The SDK handles refresh automatically — use this only if you're managing tokens manually.
            </p>
            <CodeBlock code={RAW_REFRESH} />
          </AdvancedSection>

          <AdvancedSection title="Validating tokens on your server">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
              Tokens are EdDSA-signed JWTs. Verify locally against the JWKS — no network round-trip needed for standard checks.
            </p>
            <CodeBlock code={RAW_VALIDATE} />
            <Callout type="info">
              For financial or write-access operations, call <code>{BASE}/api/v1/auth/introspect</code> to check real-time revocation and trust state.
            </Callout>
          </AdvancedSection>

          <AdvancedSection title="Token claims reference">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { claim: 'sub',                 type: 'string',       desc: 'Agent DID — did:web:getagent.id:agents:<uuid>' },
                { claim: 'agent_id',            type: 'string',       desc: 'Internal agent UUID' },
                { claim: 'handle',              type: 'string | null',desc: 'Human-readable handle, e.g. "clawd"' },
                { claim: 'trust_tier',          type: 'string',       desc: 'unverified | basic | verified | trusted | elite' },
                { claim: 'agent_state',         type: 'string',       desc: 'active | suspended | revoked' },
                { claim: 'session_type',        type: 'string',       desc: 'delegated | autonomous' },
                { claim: 'owner_backed',        type: 'boolean',      desc: 'Has a human or org owner' },
                { claim: 'verification_status', type: 'string',       desc: 'verified | pending | unverified' },
                { claim: 'scope',               type: 'string',       desc: 'Space-separated granted scopes' },
                { claim: 'exp',                 type: 'number',       desc: '15-minute expiry (Unix timestamp)' },
                { claim: 'jti',                 type: 'string',       desc: 'Unique token ID for revocation checks' },
                { claim: 'trust_context',       type: 'object',       desc: 'Full trust object: capabilities, org info, etc.' },
              ].map(({ claim, type, desc }) => (
                <div key={claim} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px 110px 1fr', gap: isMobile ? 2 : 0, padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code', monospace" }}>{claim}</code>
                  <span style={{ fontSize: 11, color: 'rgba(124,92,246,0.7)', fontFamily: "'Fira Code', monospace" }}>{type}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </AdvancedSection>

          <AdvancedSection title="Error codes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { code: 'invalid_client',        desc: 'Unknown or revoked client_id, or agent is suspended/revoked' },
                { code: 'invalid_grant',          desc: 'Auth code expired, already used, or code_verifier mismatch' },
                { code: 'invalid_scope',          desc: 'Requested scope not allowed for this client' },
                { code: 'access_denied',          desc: 'User denied the authorization request' },
                { code: 'invalid_assertion',      desc: 'Signed assertion failed verification or nonce reused (M2M)' },
                { code: 'expired_nonce',          desc: 'Challenge nonce expired — request a new one (M2M)' },
                { code: 'unsupported_grant_type', desc: 'grant_type not registered for this client' },
                { code: 'invalid_request',        desc: 'Missing or malformed required parameter' },
              ].map(({ code, desc }) => (
                <div key={code} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: isMobile ? 2 : 0, padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12, color: '#f87171', fontFamily: "'Fira Code', monospace" }}>{code}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </AdvancedSection>
        </div>

      </div>

      <Footer />
    </div>
  );
}
