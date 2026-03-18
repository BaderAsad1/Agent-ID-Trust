import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ChevronRight, Building2, Users, Shield, GitBranch, Key, AlertTriangle } from 'lucide-react';
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

const ORG_REGISTER_EXAMPLE = `import { AgentID } from '@agentid/sdk'

// 1. Register the organisation itself
const org = await AgentID.orgs.register({
  slug: 'acmecorp',          // resolves as acmecorp.agentid
  displayName: 'Acme Corp',
  website: 'https://acmecorp.com',
  description: 'AI-first enterprise automation',
})

console.log(org.orgId)          // org_01JX...
console.log(org.handle)         // acmecorp.agentid
console.log(org.orgTrustScore)  // 0 — grows as org gets verified

// 2. Register the CEO agent under the org
const ceo = await AgentID.orgs.registerMember(org.orgId, {
  handle: 'ceo',              // resolves as ceo@acmecorp.agentid
  displayName: 'CEO Agent',
  capabilities: ['strategy', 'approve', 'delegate'],
  role: 'admin',              // org admin — can invite/revoke members
})

console.log(ceo.handle)         // ceo@acmecorp.agentid
console.log(ceo.apiKey)         // agk_... — store securely

// 3. Register sub-agents (C-suite)
const cto = await AgentID.orgs.registerMember(org.orgId, {
  handle: 'cto',
  displayName: 'CTO Agent',
  capabilities: ['engineering', 'architecture', 'code-review'],
  role: 'member',
})

const cmo = await AgentID.orgs.registerMember(org.orgId, {
  handle: 'cmo',
  displayName: 'CMO Agent',
  capabilities: ['marketing', 'content', 'campaigns'],
  role: 'member',
})`;

const TEAM_REGISTER_EXAMPLE = `// Register a team under the org
const engTeam = await AgentID.orgs.createTeam(org.orgId, {
  slug: 'engineering',
  displayName: 'Engineering Team',
  parentAgentId: cto.agentId,   // CTO is the parent
})

// Register leaf agents under the engineering team
const coder1 = await AgentID.orgs.registerMember(org.orgId, {
  handle: 'compiler',
  displayName: 'Compiler Agent',
  capabilities: ['typescript', 'python', 'code-generation'],
  role: 'member',
  teamId: engTeam.teamId,
  parentAgentId: cto.agentId,
})

const artAgent = await AgentID.orgs.registerMember(org.orgId, {
  handle: 'canvas',
  displayName: 'Canvas Agent',
  capabilities: ['design', 'illustration', 'brand-assets'],
  role: 'member',
  teamId: engTeam.teamId,
})

// Resulting handles:
// compiler@acmecorp.agentid
// canvas@acmecorp.agentid
//
// Resolution includes org context:
// GET /api/v1/resolve/compiler@acmecorp
// → { handle: "compiler@acmecorp", orgId: "org_01JX...",
//     orgHandle: "acmecorp", teamSlug: "engineering",
//     effectiveTrustScore: 62, ... }`;

const TRUST_EXAMPLE = `// Trust is computed as:
// effectiveTrust = round(0.6 * agentTrust + 0.4 * orgTrust)
//
// If the org is verified (orgTrustScore >= 40), all members
// receive a minimum effectiveTrust of 30 regardless of their
// individual score.

const resolved = await AgentID.resolve('compiler@acmecorp')

console.log(resolved.agentTrustScore)     // 45 — individual history
console.log(resolved.orgTrustScore)       // 88 — org is elite-tier
console.log(resolved.effectiveTrustScore) // Math.round(0.6*45 + 0.4*88) = 62
console.log(resolved.trustTier)           // "trusted"

// An unproven new hire still benefits from the org's reputation:
const newHire = await AgentID.resolve('newbot@acmecorp')
console.log(newHire.agentTrustScore)     // 12 — brand new agent
console.log(newHire.orgTrustScore)       // 88
console.log(newHire.effectiveTrustScore) // Math.round(0.6*12 + 0.4*88) = 42
// → "verified" tier, not "unverified" — org reputation carries them`;

const DELEGATION_EXAMPLE = `// CEO issues a delegation VC to the CTO
// Scoped to engineering capabilities only
const ceoCred = await AgentID.orgs.issueCredential({
  issuerId: ceo.agentId,
  issuerApiKey: process.env.CEO_API_KEY,
  subjectAgentId: cto.agentId,
  type: 'delegation',
  scopes: ['engineering.*', 'task:approve', 'task:send'],
  expiresIn: '90d',
})

console.log(ceoCred.credentialId)   // vc_01JX...
console.log(ceoCred.jwtVc)          // JWT-encoded Verifiable Credential

// CTO re-delegates to the engineering lead (subset of scopes only)
const ctoSubDelegation = await AgentID.orgs.issueCredential({
  issuerId: cto.agentId,
  issuerApiKey: process.env.CTO_API_KEY,
  subjectAgentId: engLead.agentId,
  type: 'delegation',
  scopes: ['task:send'],            // can't exceed CTO's own scopes
  parentCredentialId: ceoCred.credentialId,
  expiresIn: '30d',
})

// Anyone can verify the delegation chain:
const verified = await AgentID.verifyCredential(ctoSubDelegation.jwtVc)
console.log(verified.chain)
// [
//   { issuer: "ceo@acmecorp", subject: "cto@acmecorp",   scopes: ["engineering.*", "task:approve", "task:send"] },
//   { issuer: "cto@acmecorp", subject: "lead@acmecorp",  scopes: ["task:send"] }
// ]`;

const REVOKE_EXAMPLE = `// Org admin instantly revokes any member
// All downstream delegations from this agent are also invalidated

await AgentID.orgs.removeMember(org.orgId, {
  agentId: cto.agentId,
  adminApiKey: process.env.CEO_API_KEY,
  reason: 'restructuring',
})

// After revocation:
// - cto@acmecorp.agentid resolves with status: "revoked"
// - All VCs issued by cto are immediately invalid
// - lead@acmecorp.agentid loses the sub-delegated cto credential
// - Other members are unaffected

// Revoke a specific credential without removing the member:
await AgentID.orgs.revokeCredential(ceoCred.credentialId, {
  adminApiKey: process.env.CEO_API_KEY,
  reason: 'scope change',
})`;

const RESOLVE_EXAMPLE = `# Resolve an org handle
curl https://getagent.id/api/v1/resolve/acmecorp
# → { orgId, handle, displayName, memberCount, orgTrustScore, verificationStatus }

# Resolve a member handle
curl https://getagent.id/api/v1/resolve/cto@acmecorp
# → { agentId, handle, orgId, orgHandle, teamSlug,
#     agentTrustScore, orgTrustScore, effectiveTrustScore,
#     trustTier, capabilities, endpointUrl, role }

# List all members of an org
curl -H "X-Agent-Key: agk_..." \\
  https://getagent.id/api/v1/orgs/org_01JX.../members

# Discover orgs with high trust
curl "https://getagent.id/api/v1/orgs?minOrgTrust=80&verifiedOnly=true"`;

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'handles', label: 'Handle format' },
  { id: 'trust', label: 'Trust inheritance' },
  { id: 'register', label: 'Register org & agents' },
  { id: 'teams', label: 'Teams & hierarchy' },
  { id: 'delegation', label: 'Credential delegation' },
  { id: 'revocation', label: 'Revocation' },
  { id: 'api', label: 'REST API' },
];

const ORG_CHART = [
  {
    handle: 'acmecorp.agentid',
    label: 'Org Root',
    role: 'Organisation',
    trust: 88,
    tier: 'elite',
    color: '#4F7DF3',
    depth: 0,
  },
  {
    handle: 'ceo@acmecorp.agentid',
    label: 'CEO',
    role: 'Admin',
    trust: 90,
    tier: 'elite',
    color: '#8B5CF6',
    depth: 1,
  },
  {
    handle: 'cto@acmecorp.agentid',
    label: 'CTO',
    role: 'Member',
    trust: 78,
    tier: 'trusted',
    color: '#8B5CF6',
    depth: 1,
  },
  {
    handle: 'cmo@acmecorp.agentid',
    label: 'CMO',
    role: 'Member',
    trust: 74,
    tier: 'trusted',
    color: '#8B5CF6',
    depth: 1,
  },
  {
    handle: 'compiler@acmecorp.agentid',
    label: 'Coder',
    role: 'Engineering team',
    trust: 62,
    tier: 'trusted',
    color: '#10B981',
    depth: 2,
  },
  {
    handle: 'canvas@acmecorp.agentid',
    label: 'Art',
    role: 'Engineering team',
    trust: 55,
    tier: 'verified',
    color: '#10B981',
    depth: 2,
  },
  {
    handle: 'content@acmecorp.agentid',
    label: 'Content',
    role: 'Marketing team',
    trust: 59,
    tier: 'verified',
    color: '#F59E0B',
    depth: 2,
  },
];

const TIER_COLORS: Record<string, string> = {
  elite: '#F59E0B',
  trusted: '#60A5FA',
  verified: '#34D399',
  basic: 'rgba(255,255,255,0.35)',
  unverified: 'rgba(255,255,255,0.2)',
};

export function DocsOrganizations() {
  const [activeSection, setActiveSection] = useState('overview');
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
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Organisation Agents</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(79,125,243,0.1)', border: '1px solid rgba(79,125,243,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={17} style={{ color: '#4F7DF3' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Organisation Agents
          </h1>
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 580, marginBottom: 32 }}>
          Register a company, department, or team as a verified org on Agent ID. Every agent in the org gets a namespaced handle, inherits the org's trust baseline, and participates in a delegated credential chain — from CEO down to individual coder or art agents.
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

          <section id="overview" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>Overview</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 20 }}>
              A company running AI agents needs more than individual registrations. Agent ID supports first-class organisations — a verified entity that owns a namespace, sets a trust floor for all its members, and controls a delegation hierarchy from the board level down to individual task agents.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
              {[
                { icon: Users, color: '#4F7DF3', title: 'Namespaced handles', desc: 'Every agent gets agent@org.agentid — clear ownership, no collisions.' },
                { icon: Shield, color: '#8B5CF6', title: 'Trust inheritance', desc: "Org reputation floors sub-agent trust. A new hire isn't unverified if the org is elite." },
                { icon: GitBranch, color: '#10B981', title: 'Delegation chain', desc: 'CEO issues VCs to C-suite; they re-delegate (within scope) down the tree.' },
              ].map(f => (
                <div key={f.title} style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
                  <f.icon size={16} style={{ color: f.color, marginBottom: 10 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 5 }}>{f.title}</div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 22px', marginBottom: 4 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Example org — Acme Corp</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ORG_CHART.map((agent) => (
                  <div
                    key={agent.handle}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 90px 80px',
                      alignItems: 'center',
                      padding: '8px 12px',
                      marginLeft: agent.depth * 28,
                      background: 'rgba(255,255,255,0.025)',
                      border: `1px solid ${agent.color}22`,
                      borderLeft: `2px solid ${agent.color}55`,
                      borderRadius: 8,
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{agent.label}</div>
                      <code style={{ fontSize: 10.5, color: agent.color + 'cc', fontFamily: "'Fira Code',monospace" }}>{agent.handle}</code>
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{agent.role}</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TIER_COLORS[agent.tier] }}>{agent.trust}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', display: 'block' }}>{agent.tier}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 14, marginBottom: 0 }}>
                Trust scores shown are <strong style={{ color: 'rgba(255,255,255,0.35)' }}>effectiveTrustScore</strong> — blended from individual agent history and org reputation.
              </p>
            </div>
          </section>

          <section id="handles" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Handle format</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Org agents use <code style={{ color: '#7da5f5' }}>agent@org</code> handle notation. The <code style={{ color: '#7da5f5' }}>@</code> separator signals org membership at a glance — mirrors email convention and is unambiguous when parsed.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { type: 'Individual agent', handle: 'research-bot.agentid', note: 'No org — standalone identity' },
                { type: 'Org root', handle: 'acmecorp.agentid', note: 'The org entity itself' },
                { type: 'Org member', handle: 'cto@acmecorp.agentid', note: 'Agent inside org' },
                { type: 'Canonical DID', handle: 'did:agentid:org:acmecorp:cto', note: 'Underlying DID format' },
              ].map((row, i) => (
                <div key={row.handle} style={{ display: 'grid', gridTemplateColumns: '160px 260px 1fr', padding: '9px 14px', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{row.type}</span>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{row.handle}</code>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{row.note}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="trust" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Trust inheritance</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
              Every org member has two trust signals: their own history and the org's reputation. Agent ID blends them into a single <strong style={{ color: 'rgba(255,255,255,0.65)' }}>effectiveTrustScore</strong> that third parties can query in one call.
            </p>

            <div style={{ padding: '14px 18px', background: 'rgba(79,125,243,0.06)', border: '1px solid rgba(79,125,243,0.18)', borderRadius: 10, marginBottom: 20, fontFamily: "'Fira Code',monospace", fontSize: 13, color: '#7da5f5', lineHeight: 2 }}>
              effectiveTrust = round(<span style={{ color: '#34D399' }}>0.6</span> × agentTrust + <span style={{ color: '#F59E0B' }}>0.4</span> × orgTrust)
              <br />
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'var(--font-body)' }}>Floor: if org is verified (orgTrust ≥ 40), all members receive effectiveTrust ≥ 30</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
              {[
                ['Agent', 'agentTrust', 'orgTrust', 'effectiveTrust', 'Tier', 'header'],
                ['CEO (established)', '91', '88', '90', 'elite', ''],
                ['CTO (experienced)', '72', '88', '78', 'trusted', ''],
                ['New coder (day 1)', '12', '88', '42', 'verified', ''],
                ['Solo agent (no org)', '12', '—', '12', 'unverified', ''],
              ].map(([agent, at, ot, et, tier, header], i) => (
                <div key={agent} style={{ display: 'grid', gridTemplateColumns: '200px 90px 90px 110px 1fr', padding: '9px 14px', background: i === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ fontSize: i === 0 ? 11 : 13, color: i === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)', fontWeight: i === 0 ? 700 : 400, textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{agent}</span>
                  <span style={{ fontSize: 13, color: i === 0 ? 'rgba(255,255,255,0.25)' : '#34D399', fontWeight: i === 0 ? 700 : 500, textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{at}</span>
                  <span style={{ fontSize: 13, color: i === 0 ? 'rgba(255,255,255,0.25)' : '#F59E0B', fontWeight: i === 0 ? 700 : 500, textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{ot}</span>
                  <span style={{ fontSize: 13, color: i === 0 ? 'rgba(255,255,255,0.25)' : '#7da5f5', fontWeight: i === 0 ? 700 : 700, textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{et}</span>
                  <span style={{ fontSize: 12, color: i === 0 ? 'rgba(255,255,255,0.25)' : TIER_COLORS[tier] || 'rgba(255,255,255,0.3)', fontWeight: i === 0 ? 700 : 600, textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.05em' : 0 }}>{tier}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, margin: 0 }}>
              The org's <code style={{ color: '#7da5f5' }}>orgTrustScore</code> rises with business verification (legal entity proof, website attestation, domain verification). An elite-tier org meaningfully lifts every member's standing — making it worth investing in org verification early.
            </p>
            <CodeBlock code={TRUST_EXAMPLE} title="Trust blending — TypeScript" />
          </section>

          <section id="register" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Register org &amp; agents</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              One SDK call registers the org; subsequent calls add members. Each member gets its own API key and DID, stored securely by each respective agent.
            </p>
            <CodeBlock code={ORG_REGISTER_EXAMPLE} title="Register org + C-suite — TypeScript" />
          </section>

          <section id="teams" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Teams &amp; hierarchy</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              Teams group agents under a parent. There is no handle nesting beyond <code style={{ color: '#7da5f5' }}>agent@org</code> — team membership is metadata, not URL structure. All handles remain flat and human-readable.
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 8, fontSize: 12.5, color: 'rgba(52,211,153,0.7)', lineHeight: 1.55, marginBottom: 16 }}>
              <strong style={{ fontWeight: 700 }}>Handle stays flat:</strong> A coder in the engineering team is <code style={{ fontSize: 11 }}>compiler@acmecorp.agentid</code> — not <code style={{ fontSize: 11 }}>compiler@engineering.acmecorp.agentid</code>. Team membership is queryable via the API but doesn't change the handle.
            </div>
            <CodeBlock code={TEAM_REGISTER_EXAMPLE} title="Teams + leaf agents — TypeScript" />
          </section>

          <section id="delegation" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Credential delegation</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              Authority flows through signed Verifiable Credentials. The CEO issues a VC to the CTO; the CTO can re-delegate a subset to the engineering lead; the lead can further delegate. At every step, the chain is cryptographically verifiable and the scope can only narrow, never expand.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { from: 'CEO', to: 'CTO', scopes: ['engineering.*', 'task:approve', 'task:send'], color: '#8B5CF6' },
                { from: 'CTO', to: 'Eng Lead', scopes: ['task:send'], color: '#4F7DF3' },
                { from: 'Eng Lead', to: 'Coder', scopes: ['task:send'], color: '#10B981' },
              ].map(d => (
                <div key={d.from} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.025)', border: `1px solid ${d.color}25`, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: d.color, fontWeight: 700, marginBottom: 8 }}>{d.from} → {d.to}</div>
                  {d.scopes.map(s => (
                    <code key={s} style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'Fira Code',monospace", marginBottom: 2 }}>{s}</code>
                  ))}
                </div>
              ))}
            </div>
            <CodeBlock code={DELEGATION_EXAMPLE} title="Issue & verify delegation chain — TypeScript" />
          </section>

          <section id="revocation" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>Revocation</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 12 }}>
              Any org admin can remove a member or revoke a specific credential. Revocation is immediate and cascades — every VC issued by the revoked agent becomes invalid.
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, fontSize: 12.5, color: 'rgba(252,165,165,0.75)', lineHeight: 1.55, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ color: '#EF4444', marginTop: 1, flexShrink: 0 }} />
              <span><strong style={{ fontWeight: 700 }}>Cascade is irreversible:</strong> Removing an agent immediately invalidates all credentials they issued downstream. If a CTO issued VCs to 50 team agents, those all expire on CTO removal. Re-issue from the CEO or a new CTO after restructuring.</span>
            </div>
            <CodeBlock code={REVOKE_EXAMPLE} title="Remove member & revoke credentials — TypeScript" />
          </section>

          <section id="api" style={{ marginBottom: 52 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>REST API</h2>
            <CodeBlock code={RESOLVE_EXAMPLE} lang="bash" title="Resolution & discovery" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16 }}>
              {[
                { method: 'POST', path: '/api/v1/orgs/register', desc: 'Register a new organisation' },
                { method: 'GET', path: '/api/v1/orgs/:orgId', desc: 'Get org profile' },
                { method: 'POST', path: '/api/v1/orgs/:orgId/members', desc: 'Register a member agent' },
                { method: 'GET', path: '/api/v1/orgs/:orgId/members', desc: 'List all org members' },
                { method: 'DELETE', path: '/api/v1/orgs/:orgId/members/:agentId', desc: 'Remove & revoke a member' },
                { method: 'POST', path: '/api/v1/orgs/:orgId/teams', desc: 'Create a team' },
                { method: 'POST', path: '/api/v1/orgs/:orgId/credentials/issue', desc: 'Issue delegation VC' },
                { method: 'DELETE', path: '/api/v1/credentials/:credId', desc: 'Revoke a specific credential' },
                { method: 'GET', path: '/api/v1/resolve/:handle', desc: 'Resolve agent@org handle with org context' },
                { method: 'GET', path: '/api/v1/orgs', desc: 'Discover orgs by trust / capability' },
              ].map(r => (
                <div key={r.method + r.path} style={{ display: 'grid', gridTemplateColumns: '56px 340px 1fr', padding: '9px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 7, borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.method === 'POST' ? '#F59E0B' : r.method === 'DELETE' ? '#EF4444' : '#34D399', fontFamily: 'var(--font-mono)' }}>{r.method}</span>
                  <code style={{ fontSize: 12.5, color: '#7da5f5', fontFamily: "'Fira Code',monospace" }}>{r.path}</code>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{r.desc}</span>
                </div>
              ))}
            </div>
          </section>

        </main>
      </div>

      <Footer />
    </div>
  );
}
