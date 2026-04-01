import { useState } from 'react';
import { Copy, Check, ChevronRight, Shield, Zap, Code2, Globe, Key, Lock } from 'lucide-react';
import { Footer } from '@/components/Footer';

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

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 64 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: 6 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(79,125,243,0.15)', border: '1px solid rgba(79,125,243,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#7da5f5', marginTop: 1 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, lineHeight: 1.3 }}>{title}</h3>
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

const BASE = 'https://getagent.id';

const DELEGATED_STEP1 = `// 1. Generate PKCE code verifier + challenge
const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
const enc = new TextEncoder();
const digest = await crypto.subtle.digest('SHA-256', enc.encode(codeVerifier));
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '');

// 2. Store verifier in session for later
sessionStorage.setItem('pkce_verifier', codeVerifier);

// 3. Build authorization URL
const state = crypto.randomUUID();
sessionStorage.setItem('oauth_state', state);

const url = new URL('${BASE}/oauth/authorize');
url.searchParams.set('response_type', 'code');
url.searchParams.set('client_id',     'YOUR_CLIENT_ID');
url.searchParams.set('redirect_uri',  'https://yourapp.com/callback');
url.searchParams.set('scope',         'read agents:read');
url.searchParams.set('state',         state);
url.searchParams.set('code_challenge', codeChallenge);
url.searchParams.set('code_challenge_method', 'S256');

window.location.href = url.toString();`;

const DELEGATED_STEP2 = `// /callback route  -  after user approves
const params = new URLSearchParams(window.location.search);
const code  = params.get('code');
const state = params.get('state');

// Validate state
if (state !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch  -  possible CSRF');
}

const codeVerifier = sessionStorage.getItem('pkce_verifier');

const resp = await fetch('${BASE}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     'YOUR_CLIENT_ID',
    code,
    redirect_uri:  'https://yourapp.com/callback',
    code_verifier: codeVerifier,
  }),
});

const { access_token, refresh_token, expires_in, token_type } = await resp.json();`;

const DELEGATED_STEP3 = `// Fetch agent identity from userinfo endpoint
const resp = await fetch('${BASE}/oauth/userinfo', {
  headers: { Authorization: \`Bearer \${access_token}\` },
});

const agent = await resp.json();
// agent = {
//   sub: 'did:agentid:clawd',
//   agent_id: '...',
//   handle: 'clawd',
//   trust_tier: 'trusted',
//   verification_status: 'verified',
//   claim_state: 'claimed',
//   owner_backed: true,
//   session_type: 'delegated',
//   scope: 'read agents:read',
//   trust_context: { capabilities: [...] },
// }

// Create your local session
createLocalSession({ agentDid: agent.sub, handle: agent.handle, trustTier: agent.trust_tier });`;

const AUTONOMOUS_CHALLENGE = `// 1. Request a challenge nonce from Agent ID
const resp = await fetch('${BASE}/api/v1/auth/challenge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id:  'YOUR_AGENT_ID',
    client_id: 'YOUR_CLIENT_ID',
    audience:  '${BASE}',
  }),
});

const { nonce, expiresAt } = await resp.json();`;

const AUTONOMOUS_ASSERTION = `import { signAssertion } from '@agentid/sdk'; // or use the snippet below

// 2. Sign the assertion with your agent's Ed25519 private key
//    The assertion is a JWT: header.claims.signature
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: \`did:web:getagent.id:agents:\${AGENT_ID}\`,
  sub: \`did:agentid:\${AGENT_HANDLE}\`,
  aud: ['${BASE}'],
  iat: now,
  exp: now + 120,          // 2 minute window
  jti: nonce,              // Use the server-issued nonce as jti
  scope: 'read agents:read',
};

const assertion = await signEdDSAJwt(claims, privateKey, keyId);`;

const AUTONOMOUS_TOKEN = `// 3. Exchange the signed assertion for a token
const resp = await fetch('${BASE}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:agentid:grant-type:signed-assertion',
    client_id:  'YOUR_CLIENT_ID',
    agent_id:   'YOUR_AGENT_ID',
    scope:      'read agents:read',
    assertion,
  }),
});

const { access_token, expires_in } = await resp.json();
// access_token is a short-lived (15 min) JWT signed by Agent ID`;

const VALIDATE_TOKEN = `// Server-side validation (Node.js example)
import * as jose from 'jose';

const JWKS = jose.createRemoteJWKSet(
  new URL('${BASE}/.well-known/jwks.json')
);

async function validateAgentToken(token: string) {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer:   '${BASE}',
    audience: 'YOUR_CLIENT_ID',
  });

  // Check agent state
  if (payload.agent_state !== 'active') {
    throw new Error('Agent is not active');
  }

  // Use trust tier for access decisions
  const tier = payload.trust_tier as string;
  const trustOrder = { unverified: 0, basic: 1, verified: 2, trusted: 3, elite: 4 };
  const trustLevel = trustOrder[tier as keyof typeof trustOrder] ?? 0;

  return {
    agentDid:           payload.sub,
    handle:             payload.handle as string,
    trustTier:          tier,
    trustLevel,
    verificationStatus: payload.verification_status as string,
    sessionType:        payload.session_type as string,
    scopes:             (payload.scope as string).split(' '),
  };
}`;

const BUTTON_EMBED = `import { SignInWithAgentID } from './SignInWithAgentID';

// Dark button (default)
<SignInWithAgentID
  clientId="agclient_..."
  redirectUri="https://yourapp.com/callback"
  scopes={['read', 'agents:read']}
/>

// Light variant
<SignInWithAgentID
  clientId="agclient_..."
  redirectUri="https://yourapp.com/callback"
  theme="light"
  size="lg"
/>

// Headless  -  build the URL yourself
import { buildAgentIDAuthUrl } from './SignInWithAgentID';

const authUrl = buildAgentIDAuthUrl({
  clientId: 'agclient_...',
  redirectUri: 'https://yourapp.com/callback',
  scopes: ['read'],
  codeChallenge: computed_challenge,
});`;

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'register', label: '1. Register your app' },
  { id: 'delegated', label: '2. Delegated flow' },
  { id: 'autonomous', label: '3. Autonomous flow' },
  { id: 'validate', label: '4. Validate tokens' },
  { id: 'button', label: '5. Button component' },
  { id: 'claims', label: 'Token claims' },
  { id: 'security', label: 'Security notes' },
];

export function DocsSignIn() {
  const [activeSection, setActiveSection] = useState('overview');

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Hero */}
      <div style={{ padding: '64px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(79,125,243,0.8)', background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 6, padding: '2px 10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Docs</span>
          <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Sign in with Agent ID</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', marginBottom: 14 }}>
          Sign in with Agent ID <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 6, verticalAlign: 'middle', letterSpacing: '0.04em' }}>BETA</span>
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 620 }}>
          Let your app authenticate AI agents  -  either through a human-delegated browser flow or fully autonomous machine-to-machine auth using signed assertions.
        </p>

        {/* Mode cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 36 }}>
          <div style={{ padding: '20px 22px', background: 'rgba(79,125,243,0.07)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Globe size={16} style={{ color: '#7da5f5' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#7da5f5' }}>Delegated (Browser)</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>A human owner opens a consent screen, picks an agent, approves scopes. Your app gets an agent-centric token. Standard OAuth 2.0 + PKCE.</p>
          </div>
          <div style={{ padding: '20px 22px', background: 'rgba(124,92,246,0.07)', border: '1px solid rgba(124,92,246,0.2)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Zap size={16} style={{ color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>Autonomous (M2M)</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>No browser, no human. The agent signs a structured assertion with its Ed25519 key. Agent ID verifies and issues a short-lived access token.</p>
          </div>
        </div>
      </div>

      {/* Body  -  sidebar + content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 48 }}>

        {/* Sticky TOC */}
        <nav style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>On this page</p>
          {TOC.map(item => (
            <button key={item.id} onClick={() => scrollTo(item.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', fontSize: 13, color: activeSection === item.id ? '#7da5f5' : 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)', transition: 'color 0.15s' }}>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main>

          {/* Overview */}
          <Section id="overview" title="How it works" subtitle="Agent ID is a standard OIDC/OAuth 2.0 provider  -  any compliant library integrates with zero customisation.">
            <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Discovery document</p>
              <code style={{ fontSize: 13, color: '#7da5f5' }}>GET {BASE}/.well-known/openid-configuration</code>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { icon: Shield, label: 'Authorization', val: `${BASE}/oauth/authorize` },
                { icon: Key, label: 'Token endpoint', val: `${BASE}/oauth/token` },
                { icon: Code2, label: 'Userinfo', val: `${BASE}/oauth/userinfo` },
                { icon: Lock, label: 'JWKS', val: `${BASE}/.well-known/jwks.json` },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Icon size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
                  </div>
                  <code style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{val}</code>
                </div>
              ))}
            </div>
            <Callout type="info">
              Tokens are signed with <strong>EdDSA (Ed25519)</strong> and are short-lived (15 minutes). Verify them locally using the JWKS endpoint  -  no introspection call needed for typical auth checks.
            </Callout>
          </Section>

          {/* Register */}
          <Section id="register" title="1. Register your app" subtitle="Create an OAuth client to get your client_id.">
            <Step n={1} title="POST to the registration endpoint">
              <CodeBlock language="bash" code={`curl -X POST ${BASE}/api/v1/clients \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "name": "My App",
    "redirectUris": ["https://yourapp.com/callback"],
    "grantTypes": ["authorization_code"],
    "allowedScopes": ["read", "agents:read"],
    "tokenEndpointAuthMethod": "none"
  }'`} />
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 10, lineHeight: 1.6 }}>
                You'll receive a <code style={{ color: '#7da5f5' }}>client_id</code>. For public clients (SPAs, mobile apps) set <code style={{ color: '#7da5f5' }}>tokenEndpointAuthMethod: "none"</code>  -  PKCE is then required.
              </p>
            </Step>
            <Callout type="tip">
              For autonomous agent auth (M2M), add <code>"urn:agentid:grant-type:signed-assertion"</code> to <code>grantTypes</code>. Autonomous clients must be public (no client secret).
            </Callout>
          </Section>

          {/* Delegated */}
          <Section id="delegated" title="2. Delegated flow (browser)" subtitle="The human owner approves access through Agent ID's consent screen. Your app gets agent-centric tokens.">
            <Step n={1} title="Redirect to Agent ID authorization">
              <CodeBlock code={DELEGATED_STEP1} />
            </Step>
            <Step n={2} title="Exchange the authorization code">
              <CodeBlock code={DELEGATED_STEP2} />
            </Step>
            <Step n={3} title="Fetch agent identity and create session">
              <CodeBlock code={DELEGATED_STEP3} />
            </Step>
          </Section>

          {/* Autonomous */}
          <Section id="autonomous" title="3. Autonomous flow (M2M)" subtitle="No browser, no human. The agent authenticates directly using its registered Ed25519 key.">
            <div style={{ marginBottom: 20, padding: '14px 18px', background: 'rgba(124,92,246,0.07)', border: '1px solid rgba(124,92,246,0.18)', borderRadius: 10, fontSize: 13, color: 'rgba(160,130,255,0.9)', lineHeight: 1.6 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Pre-requisite</strong>
              Your agent must be registered with Agent ID and have an active Ed25519 key pair. The public key must be uploaded to your agent's key registry.
            </div>
            <Step n={1} title="Request a nonce challenge">
              <CodeBlock code={AUTONOMOUS_CHALLENGE} />
            </Step>
            <Step n={2} title="Sign the assertion with your private key">
              <CodeBlock code={AUTONOMOUS_ASSERTION} />
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 10, lineHeight: 1.6 }}>
                The assertion is a compact JWT (<code style={{ color: '#7da5f5' }}>alg: "EdDSA"</code>). The <code style={{ color: '#7da5f5' }}>jti</code> must exactly match the nonce from step 1  -  this is the replay-prevention binding.
              </p>
            </Step>
            <Step n={3} title="Exchange for an access token">
              <CodeBlock code={AUTONOMOUS_TOKEN} />
            </Step>
            <Callout type="warn">
              Nonces are single-use and expire quickly (default 5 minutes). Never reuse a nonce  -  the server will reject replayed assertions.
            </Callout>
          </Section>

          {/* Validate */}
          <Section id="validate" title="4. Validate tokens" subtitle="Verify Agent ID-issued JWTs locally using the JWKS endpoint. No network round-trip required for standard checks.">
            <CodeBlock code={VALIDATE_TOKEN} />
            <div style={{ marginTop: 16 }}>
              <Callout type="info">
                For sensitive operations (financial, write access), supplement JWT validation with a live introspection call to <code>{BASE}/api/v1/auth/introspect</code> to check real-time revocation and trust state.
              </Callout>
            </div>
          </Section>

          {/* Button */}
          <Section id="button" title="5. Button component" subtitle="Drop-in React component for the Sign in with Agent ID button.">
            <CodeBlock code={BUTTON_EMBED} />
          </Section>

          {/* Claims */}
          <Section id="claims" title="Token claims" subtitle="Every Agent ID access token includes these claims.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { claim: 'sub', desc: 'Agent DID  -  e.g. did:agentid:clawd', type: 'string' },
                { claim: 'iss', desc: 'Token issuer (https://getagent.id)', type: 'string' },
                { claim: 'aud', desc: 'Your client_id', type: 'string' },
                { claim: 'agent_id', desc: 'Internal Agent ID (UUID)', type: 'string' },
                { claim: 'handle', desc: 'Agent handle (e.g. "clawd")', type: 'string | null' },
                { claim: 'trust_tier', desc: 'unverified | basic | verified | trusted | elite', type: 'string' },
                { claim: 'verification_status', desc: 'verified | pending | unverified', type: 'string' },
                { claim: 'agent_state', desc: 'active | suspended | revoked', type: 'string' },
                { claim: 'claim_state', desc: 'claimed | unclaimed', type: 'string' },
                { claim: 'owner_type', desc: 'user | org | self | none', type: 'string' },
                { claim: 'owner_backed', desc: 'true if the agent has a human or org owner', type: 'boolean' },
                { claim: 'session_type', desc: 'delegated (browser flow) | autonomous (M2M)', type: 'string' },
                { claim: 'scope', desc: 'Space-separated granted scopes', type: 'string' },
                { claim: 'jti', desc: 'Unique token ID for revocation checks', type: 'string' },
                { claim: 'exp', desc: '15-minute expiry (Unix timestamp)', type: 'number' },
                { claim: 'trust_context', desc: 'Full trust object: capabilities, org info, etc.', type: 'object' },
              ].map(({ claim, desc, type }) => (
                <div key={claim} style={{ display: 'grid', gridTemplateColumns: '160px 80px 1fr', gap: 0, padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code', monospace" }}>{claim}</code>
                  <span style={{ fontSize: 11, color: 'rgba(124,92,246,0.7)', fontFamily: "'Fira Code', monospace" }}>{type}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Security */}
          <Section id="security" title="Security notes" subtitle="Important safeguards to keep in mind when integrating.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '🔒', title: 'Always validate state', body: 'Compare the state parameter from the callback against what you stored before redirecting. Reject mismatches to prevent CSRF.' },
                { icon: '🔑', title: 'PKCE is mandatory for public clients', body: 'Public clients (no client_secret) must use S256 PKCE. The server rejects authorization requests without a code_challenge from public clients.' },
                { icon: '⏱', title: 'Short-lived tokens', body: 'Access tokens expire in 15 minutes. Build a refresh flow using the refresh_token for longer sessions.' },
                { icon: '🔄', title: 'Validate trust freshness for sensitive ops', body: 'For financial or high-privilege actions, call /api/v1/auth/introspect to get live revocation and trust state rather than relying solely on the JWT.' },
                { icon: '🚫', title: 'Revoked agents are hard-rejected', body: 'An agent with status revoked, suspended, or draft cannot obtain a token. Any attempt returns invalid_client immediately.' },
                { icon: '🎯', title: 'Autonomous: nonces are single-use', body: 'Each nonce issued by /api/v1/auth/challenge can only be used once. The jti in your assertion must match the issued nonce  -  replays are rejected.' },
              ].map(({ icon, title, body }) => (
                <div key={title} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

        </main>
      </div>

      <Footer />
    </div>
  );
}
