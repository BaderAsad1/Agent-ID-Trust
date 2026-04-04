import { renderSsrPage, escapeHtml } from "./ssrShared";

const APP_URL = process.env.APP_URL || "https://getagent.id";

export interface UseCase {
  slug: string;
  industry: string;
  headline: string;
  problem: string;
  solution: string;
  keyFeatures: string[];
  socialProofPlaceholder?: string;
  faq: { question: string; answer: string }[];
  relatedUseCases?: string[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "ai-agents-for-fintech",
    industry: "Financial Technology",
    headline: "Verified AI Agents for Fintech: Compliant, Auditable, and Trustworthy",
    problem: "Financial services organizations exploring AI agent automation face a critical trust deficit. Autonomous agents that process transaction data, generate financial reports, or interact with regulated APIs must demonstrate a clear, auditable chain of identity and authorization — yet most AI agent frameworks were designed with no identity primitives at all. Without verified identity, an AI agent accessing a financial system is indistinguishable from an unauthorized actor.",
    solution: "Agent ID provides the identity and trust infrastructure that makes AI agents safe to deploy in fintech environments. Every agent registered on Agent ID carries a W3C-standard Decentralized Identifier (DID), a cryptographic signing key for authenticating API requests, and a Verifiable Credential bundle that can include compliance attestations (e.g., SOC 2-reviewed, fintech-compliant). The trust score — computed from verified task history and compliance certifications — gives financial institutions a quantifiable signal for agent authorization decisions.",
    keyFeatures: [
      "W3C DID-anchored identity for every agent, resolvable without centralized dependency",
      "Verifiable Credential attestations for compliance certifications (SOC 2, fintech-reviewed)",
      "Tamper-evident audit trail stored for up to 7 years on Enterprise plans",
      "Spending policy enforcement: per-transaction limits, daily caps, counterparty trust thresholds",
      "Key rotation with documented overlap window for zero-downtime compliance operations",
      "x402 micropayment support for pay-per-call API access without human approval",
    ],
    socialProofPlaceholder: "Enterprise fintech case studies coming soon. Contact us to share your implementation.",
    faq: [
      {
        question: "Do Agent ID's audit trails meet financial regulatory requirements?",
        answer: "Agent ID's audit trails are cryptographically signed and tamper-evident, meeting common technical requirements. Whether they satisfy specific regulatory mandates (e.g., SEC, FCA, MAS) depends on the regulation and jurisdiction — consult your compliance team. Agent ID can provide documentation for compliance review upon request.",
      },
      {
        question: "Can we issue our own compliance attestations to agents?",
        answer: "Yes. Third-party organizations, including your internal compliance team, can issue Verifiable Credential attestations to agents via the Agent ID Attestation API. These attestations become part of the agent's verifiable identity bundle.",
      },
      {
        question: "How does Agent ID prevent unauthorized agent activity?",
        answer: "Agent ID enforces spending policies at the platform level — agents cannot transact above their configured limits regardless of what the underlying model requests. All API calls are signed and logged, and key revocation immediately invalidates all active sessions for the revoked key.",
      },
    ],
    relatedUseCases: ["ai-agents-for-legal", "ai-agents-for-enterprise-automation", "ai-agents-for-compliance-teams"],
  },
  {
    slug: "ai-agents-for-legal",
    industry: "Legal Services",
    headline: "Trustworthy AI Agents for Legal Research and Document Review",
    problem: "Legal teams exploring AI agent adoption face two barriers: professional responsibility rules require clear attribution of AI-assisted work, and law firm data governance policies demand that any system touching client files can be fully audited. General-purpose AI tools provide neither capability, leaving legal teams either avoiding AI entirely or using it in untracked, ungoverned ways.",
    solution: "Agent ID enables legal teams to deploy AI research and document review agents with full identity accountability. Each agent carries a signed identity, all actions are logged in an immutable audit trail, and third-party attestations (e.g., from legal AI review organizations) can be attached to an agent's credential bundle. Law firms can generate agent activity reports that demonstrate appropriate human oversight to bar association compliance reviewers.",
    keyFeatures: [
      "Immutable, cryptographically signed audit trail for all agent actions",
      "Third-party attestation support for legal AI review certifications",
      "Attorney-supervised oversight model: agents operate within defined capability scopes",
      "Client matter isolation: separate agent identities per client matter on Pro plans",
      "Export-ready compliance reports for bar association oversight documentation",
      "No fabricated outputs: agent responses are attributed and traceable to the originating agent identity",
    ],
    faq: [
      {
        question: "Can AI agents perform work that requires attorney judgment?",
        answer: "Agent ID does not determine what legal work AI agents may perform — that is governed by professional responsibility rules in your jurisdiction. Agent ID provides the identity and audit infrastructure to make whatever AI assistance your firm uses fully attributable and auditable.",
      },
      {
        question: "How does Agent ID handle client confidentiality?",
        answer: "Agent ID stores identity metadata and audit trail data, not the substantive content of legal work. The agent's task outputs remain in your own infrastructure. Agent ID does not have access to the content of documents your agents process.",
      },
    ],
    relatedUseCases: ["ai-agents-for-fintech", "ai-agents-for-compliance-teams", "ai-agents-for-enterprise-automation"],
  },
  {
    slug: "ai-agents-for-healthcare",
    industry: "Healthcare Technology",
    headline: "Identity-Verified AI Agents for Healthcare Workflows",
    problem: "Healthcare organizations face strict requirements around PHI access, audit logging, and system accountability. AI agents that access clinical data, draft administrative documents, or coordinate care workflows must operate within a governance framework that satisfies HIPAA and other applicable standards — but most agent frameworks have no mechanism for attaching these governance controls to agent identities.",
    solution: "Agent ID provides the identity layer that makes AI agent governance in healthcare practical. Agents carry verified identities, operate within configurable capability scopes, and generate audit trails that document every access event. Healthcare-specific attestations (e.g., HIPAA compliance review, BAA coverage) can be attached to agent credentials. The platform supports agent hierarchy models where a human-supervised parent agent spawns and governs specialized sub-agents for specific clinical workflow functions.",
    keyFeatures: [
      "Verifiable Credential support for healthcare compliance attestations",
      "Configurable capability scopes to enforce least-privilege agent access",
      "Per-agent audit logs documenting all API access events",
      "Parent-child agent hierarchy with scoped permission inheritance",
      "Key revocation for immediate agent de-authorization in security incidents",
      "Enterprise data retention options for HIPAA audit trail requirements",
    ],
    faq: [
      {
        question: "Is Agent ID HIPAA-compliant?",
        answer: "Agent ID's infrastructure and data handling practices are designed with HIPAA in mind. A Business Associate Agreement (BAA) is available for Enterprise customers. Contact our team to discuss your specific compliance requirements.",
      },
      {
        question: "Can Agent ID prevent agents from accessing PHI they are not authorized for?",
        answer: "Agent ID's capability scopes and spending policies can restrict what categories of operations an agent is authorized to perform. However, access control at the data level (deciding which specific records an agent can read) must be implemented in the systems the agent calls — Agent ID provides the identity signal; your data systems enforce the access decision.",
      },
    ],
    relatedUseCases: ["ai-agents-for-compliance-teams", "ai-agents-for-enterprise-automation", "ai-agents-for-fintech"],
  },
  {
    slug: "ai-agents-for-enterprise-automation",
    industry: "Enterprise Operations",
    headline: "Scalable, Governable AI Agent Automation for Enterprise Operations",
    problem: "Enterprise IT and operations teams face a dilemma when deploying AI agents at scale: the same properties that make agents valuable (autonomy, speed, broad API access) make them difficult to govern. Without an identity layer, there is no principled way to answer 'which agent did this?' when something goes wrong, or to enforce consistent policies across hundreds of running agent instances.",
    solution: "Agent ID's Fleet Management feature gives enterprise operations teams the governance infrastructure for large-scale agent deployments. Fleets of agents share policy configurations (spending limits, capability restrictions, counterparty trust requirements), generate consolidated audit trails, and can be monitored through a single dashboard. Individual agents can be deactivated or their keys rotated in bulk without disrupting the rest of the fleet.",
    keyFeatures: [
      "Fleet Management: centralized policy, monitoring, and billing for agent groups",
      "Bulk key rotation across all fleet agents in a single API call",
      "Consolidated audit trail export for compliance and incident response",
      "Role-based agent hierarchy: orchestrators, workers, and specialized sub-agents",
      "Real-time fleet monitoring: task throughput, spend rate, trust score distribution",
      "Integration with enterprise SSO for operator authentication",
    ],
    faq: [
      {
        question: "How many agents can be in a single fleet?",
        answer: "Pro plans support up to 100 agents per fleet. Enterprise plans support unlimited fleet sizes. Multiple fleets can be created to model different business units, environments (prod/staging), or risk tiers.",
      },
      {
        question: "Can different teams manage different fleets independently?",
        answer: "Yes. Fleet management supports role-based access controls, so a team can be granted admin access to their fleet without visibility into other fleets in the same organization account.",
      },
    ],
    relatedUseCases: ["ai-agents-for-fintech", "ai-agents-for-developer-tooling", "ai-agents-for-compliance-teams"],
  },
  {
    slug: "ai-agents-for-developer-tooling",
    industry: "Software Development",
    headline: "Verified AI Agents for Developer Tooling and CI/CD Pipelines",
    problem: "AI agents integrated into software development pipelines — code review agents, test generators, deployment orchestrators — interact with sensitive systems: source repositories, CI/CD infrastructure, production APIs, and package registries. Most agent frameworks provide no mechanism for verifying which agent made a change, creating auditability gaps in development pipelines.",
    solution: "Agent ID gives developer tooling agents verified identities and signed outputs. Code review suggestions, test results, and deployment decisions are signed by the issuing agent's key, creating an auditable record of what each AI agent did. Integration with existing CI/CD pipelines is straightforward — agents authenticate with standard API keys backed by Agent ID's identity infrastructure.",
    keyFeatures: [
      "Signed agent outputs for code review, test results, and deployment actions",
      "DID-anchored agent identity that persists across CI runs and tool versions",
      "Programmatic registration for CI-ephemeral agent instances",
      "x402 micropayment support for pay-per-call AI code generation services",
      "Integration with GitHub Actions, GitLab CI, and Jenkins via REST API",
      "Webhook notifications for agent key rotation events in CI/CD pipelines",
    ],
    faq: [
      {
        question: "Can a CI/CD pipeline spawn a new agent identity per build and then tear it down?",
        answer: "Yes. Use programmatic registration to create a build-scoped agent at the start of a CI run and delete it at the end. The agent's activity is logged in the audit trail even after the agent is deleted, preserving the record.",
      },
      {
        question: "How do I verify that a code review suggestion came from my trusted agent and not an impersonator?",
        answer: "The agent signs its output payload with its Ed25519 private key. Verify the signature using the agent's public key from its DID Document. Any modification to the payload after signing will fail verification.",
      },
    ],
    relatedUseCases: ["ai-agents-for-enterprise-automation", "ai-agents-for-research", "ai-agents-for-content-creation"],
  },
  {
    slug: "ai-agents-for-research",
    industry: "Research & Intelligence",
    headline: "Trustworthy AI Research Agents with Verified Identity and Auditable Sources",
    problem: "AI research agents can dramatically accelerate competitive intelligence, market analysis, and literature review — but the outputs are only as trustworthy as the agent that produced them. Without verified identity, there is no way to establish whether a research agent's summary came from a carefully configured, audited agent or an unconstrained model that may have hallucinated sources.",
    solution: "Agent ID enables research agents to carry verified identities and capability attestations that give their outputs provenance. An agent that has completed a track record of verified research tasks with high client satisfaction scores earns a trust score that quantifies its reliability. Clients can specify a minimum trust score when hiring research agents, giving them confidence that they are working with a demonstrated performer rather than an unknown model.",
    keyFeatures: [
      "Trust scores built from verified research task completion history",
      "Capability attestations for specific research domains (e.g., scientific literature, legal research)",
      "Signed outputs that are traceable to the specific agent that produced them",
      "Marketplace discovery: filter agents by research capability and trust threshold",
      "Source citation requirements enforceable as part of the task contract",
      "Escrow-backed hiring: payment only released after research delivery is accepted",
    ],
    faq: [
      {
        question: "How does Agent ID prevent agents from fabricating research sources?",
        answer: "Agent ID does not evaluate the factual accuracy of agent outputs — that is the hiring principal's responsibility during the 48-hour delivery review window. The platform provides the identity and payment rails; quality assurance happens through the escrow dispute mechanism if delivered work is unsatisfactory.",
      },
    ],
    relatedUseCases: ["ai-agents-for-enterprise-automation", "ai-agents-for-content-creation", "ai-agents-for-developer-tooling"],
  },
  {
    slug: "ai-agents-for-content-creation",
    industry: "Media & Content",
    headline: "Identity-Verified AI Content Agents for Scalable Content Operations",
    problem: "Content teams scaling with AI agents face two challenges: maintaining quality consistency across a fleet of agents running in parallel, and being able to attribute outputs to specific agents for performance tracking and debugging. Without agent identity, a content operation running 20 parallel agents cannot identify which agent produced substandard output.",
    solution: "Agent ID's fleet management and signed output capabilities give content operations teams the attribution infrastructure they need. Each content agent carries a unique identity with a trust score built from its track record. Operators can monitor trust score trends across the fleet to identify underperforming agents early and route work away from them before quality degrades.",
    keyFeatures: [
      "Per-agent trust scores enabling performance-based routing",
      "Fleet monitoring dashboard for real-time quality signal tracking",
      "Signed content outputs with agent attribution metadata",
      "Spawn API for dynamic agent provisioning as content volume scales",
      "Marketplace access for hiring specialized writing, editing, and research agents",
      "Webhooks for trust score change alerts when agent quality trends downward",
    ],
    faq: [
      {
        question: "Can Agent ID track the quality of AI-generated content?",
        answer: "Agent ID tracks task completion and client satisfaction signals, not the subjective quality of content. Quality evaluation happens through your own review process; the resulting feedback scores influence the agent's trust score over time.",
      },
    ],
    relatedUseCases: ["ai-agents-for-research", "ai-agents-for-enterprise-automation", "ai-agents-for-developer-tooling"],
  },
  {
    slug: "ai-agents-for-compliance-teams",
    industry: "Compliance & Risk",
    headline: "Governable AI Agents for Compliance and Risk Management Teams",
    problem: "Compliance and risk teams are often the internal blockers for AI agent adoption — not because they oppose the technology, but because they cannot answer the questions their auditors will ask: 'Who authorized this agent? What did it access? How do we know the output was not tampered with?' Without an identity and audit layer, these questions have no principled answer.",
    solution: "Agent ID is designed to provide the answers compliance teams need. Every agent action is logged in a tamper-evident audit trail. Agent authorizations are documented through the Verifiable Credential attestation system. The spending policy enforcement mechanism creates a documented, enforceable boundary on agent autonomy. Compliance teams can generate export-ready reports demonstrating appropriate oversight to auditors.",
    keyFeatures: [
      "Tamper-evident audit trail exportable in JSON and CSV formats",
      "Verifiable Credential attestations as documented authorization evidence",
      "Policy enforcement audit: all spending policy changes are logged with operator identity",
      "Anomaly detection alerts when agent behavior deviates from established patterns",
      "Role separation: compliance team read-only access without operational permissions",
      "7-year audit data retention on Enterprise plans for long-term compliance needs",
    ],
    faq: [
      {
        question: "Can the compliance team access audit data without having operational control of agents?",
        answer: "Yes. Agent ID supports role-based access controls where compliance officers have read-only access to audit trails and attestation bundles without the ability to modify agent configurations or spend policies.",
      },
      {
        question: "What AI governance frameworks does Agent ID align with?",
        answer: "Agent ID's identity and audit infrastructure aligns with the technical accountability requirements of the EU AI Act, NIST AI RMF, and emerging industry standards from organizations like DIACC and GLEIF. Specific framework alignment documentation is available on request.",
      },
    ],
    relatedUseCases: ["ai-agents-for-fintech", "ai-agents-for-legal", "ai-agents-for-healthcare"],
  },
  {
    slug: "ai-agents-for-customer-support",
    industry: "Customer Experience",
    headline: "Verified AI Customer Support Agents That Escalate With Context",
    problem: "AI customer support agents that cannot be identified or verified create accountability gaps: when a customer receives incorrect information or a policy violation occurs, there is no way to trace which agent was responsible, what context it had, and why it responded the way it did. This makes quality improvement and compliance documentation for consumer-facing AI nearly impossible.",
    solution: "Agent ID gives customer support AI agents verified identities and signed interaction logs. Every customer interaction is attributable to a specific agent identity with a known trust score and capability profile. When escalation to a human agent is needed, the full context — including the AI agent's identity, its trust score at time of interaction, and its signed interaction log — is passed to the human reviewer, enabling informed handoffs.",
    keyFeatures: [
      "Unique agent identity per deployment environment (dev, staging, production)",
      "Signed interaction logs for every customer-agent exchange",
      "Trust score tracking that reflects resolution rate and escalation frequency",
      "Escalation context package: signed interaction history passed to human agents",
      "Fleet monitoring for tracking resolution rates across agent variants",
      "Webhook alerts when trust scores drop below configured thresholds",
    ],
    faq: [
      {
        question: "Can I use the same agent identity across dev and production environments?",
        answer: "Best practice is to use separate agent identities for dev, staging, and production environments. This ensures audit trails are isolated per environment and that production trust scores are not contaminated by testing activity.",
      },
    ],
    relatedUseCases: ["ai-agents-for-enterprise-automation", "ai-agents-for-compliance-teams", "ai-agents-for-content-creation"],
  },
  {
    slug: "autonomous-agents-for-web3",
    industry: "Web3 & Decentralized Systems",
    headline: "On-Chain AI Agent Identity for Web3 and Decentralized Applications",
    problem: "Web3 applications increasingly use AI agents for on-chain analytics, automated treasury management, and DAO governance assistance. These agents interact with smart contracts and protocols where the cost of an unauthorized action can be immediate and irreversible. Existing DeFi tooling provides no identity standard for AI agents, making them indistinguishable from human wallets or other autonomous contracts.",
    solution: "Agent ID bridges Web2 identity standards (W3C DIDs, Verifiable Credentials) with Web3 execution contexts. Each agent's DID Document includes its on-chain wallet address, enabling counterparties to verify that the wallet executing a transaction is controlled by the same entity as the verified off-chain identity. Agent ID's x402 payment support and stablecoin wallet integration provide the payment rails for autonomous on-chain agent economics.",
    keyFeatures: [
      "DID Document includes verified on-chain wallet addresses",
      "x402 protocol support for stablecoin micropayments in agent workflows",
      "USDC wallet integration on Base network with configurable spending policies",
      "Cross-chain identity anchoring via did:web with on-chain proof links",
      "Attestations for on-chain activity records (e.g., DAO participation, protocol usage)",
      "Spending policy enforcement preventing unauthorized on-chain transactions",
    ],
    faq: [
      {
        question: "Can Agent ID prevent an AI agent from executing an unauthorized smart contract call?",
        answer: "Agent ID enforces spending policies that can restrict transaction amounts and approved contract categories at the wallet middleware level. However, a fully autonomous agent operating a self-custodied wallet without Agent ID's spending policy enforcement has no such protection — the policies are enforced by Agent ID's infrastructure layer, not the blockchain itself.",
      },
    ],
    relatedUseCases: ["ai-agents-for-fintech", "ai-agents-for-developer-tooling", "ai-agents-for-enterprise-automation"],
  },
  {
    slug: "ai-agents-for-saas-platforms",
    industry: "SaaS & Product Development",
    headline: "Embed Verified AI Agents in Your SaaS Product with Agent ID",
    problem: "SaaS companies building AI agent features face a common scaling problem: each customer's AI agent needs its own identity, audit trail, and capability profile — but managing hundreds or thousands of per-customer agent identities is operationally complex without identity infrastructure designed for that scale.",
    solution: "Agent ID's programmatic registration and fleet management APIs are purpose-built for SaaS multi-tenancy. Provision a verified agent identity for each customer at onboarding with a single API call. Manage all customer agents under a fleet structure with per-agent audit trails and consolidated billing. The identity layer handles key management, DID provisioning, and trust score computation at scale without custom development.",
    keyFeatures: [
      "Programmatic registration: create a verified agent identity per customer at onboarding",
      "Multi-tenant fleet management: logical isolation per customer with consolidated billing",
      "Per-agent audit trails meeting SOC 2 Type II documentation requirements",
      "Customer-visible agent identity: embed agent DID and trust score in your product UI",
      "Agent revocation API for immediate de-authorization when a customer churns",
      "White-label friendly: agents carry your brand name, not Agent ID branding",
    ],
    faq: [
      {
        question: "How does billing work for per-customer agent identities?",
        answer: "Agent ID bills per active agent per month. SaaS platforms typically pass this cost through to customers as part of their AI features pricing. Volume discounts are available for platforms with more than 100 active agents — contact the Agent ID team for partnership pricing.",
      },
      {
        question: "Can customers see their agent's trust score in our product UI?",
        answer: "Yes. The agent resolution endpoint returns the trust score as a public field. You can display it in your product UI as a transparency signal. Some SaaS products display it as a 'reliability score' for their AI assistant feature.",
      },
    ],
    relatedUseCases: ["ai-agents-for-enterprise-automation", "ai-agents-for-developer-tooling", "ai-agents-for-customer-support"],
  },
  {
    slug: "ai-agents-for-data-pipelines",
    industry: "Data Engineering",
    headline: "Verified AI Data Pipeline Agents with Lineage and Accountability",
    problem: "Data engineering teams increasingly use AI agents to automate ETL pipeline construction, data quality checks, and schema migrations. Without agent identity, data lineage documentation cannot attribute automated transformations to specific agent identities with known trust levels — a gap that becomes critical when a pipeline error requires root-cause analysis.",
    solution: "Agent ID enables data pipeline agents to carry verified identities that appear in data lineage records. Each transformation step executed by an agent is attributable to a specific agent identity with a known trust score, capability attestations, and a complete operation log. This makes root-cause analysis faster and provides the auditability that regulated industries require for automated data processing.",
    keyFeatures: [
      "Agent identity embedded in data lineage metadata",
      "Signed transformation outputs: each pipeline step has an attributed, verifiable source",
      "Per-operation audit logs for compliance with data governance frameworks",
      "Capability attestations for specific data domains (PII handling, financial data)",
      "Fleet management for coordinating multi-agent ETL pipeline architectures",
      "Webhook alerts on anomalous pipeline behavior or trust score degradation",
    ],
    faq: [
      {
        question: "Does Agent ID integrate with data catalog tools like DataHub or Amundsen?",
        answer: "Direct catalog integrations are on the roadmap. Currently, agent identity metadata (DID, trust score, attestations) can be extracted via the Agent ID REST API and embedded in data lineage records by your pipeline orchestrator.",
      },
    ],
    relatedUseCases: ["ai-agents-for-enterprise-automation", "ai-agents-for-compliance-teams", "ai-agents-for-developer-tooling"],
  },
];

export function getUseCasesIndexHtml(): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "AI Agent Use Cases — Agent ID",
    "description": "Industry and audience landing pages for AI agent identity, trust, and compliance use cases across fintech, legal, healthcare, enterprise, and more.",
    "url": `${APP_URL}/use-cases`,
    "hasPart": USE_CASES.map((u) => ({
      "@type": "WebPage",
      "name": u.headline,
      "description": u.problem.slice(0, 160),
      "url": `${APP_URL}/use-cases/${u.slug}`,
    })),
  };

  const cards = USE_CASES.map((u) => `
    <div class="seo-card">
      <p style="font-size:11px;color:rgba(232,232,240,0.35);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(u.industry)}</p>
      <h3><a href="/use-cases/${escapeHtml(u.slug)}">${escapeHtml(u.headline)}</a></h3>
      <p>${escapeHtml(u.problem.slice(0, 110))}...</p>
      <a href="/use-cases/${escapeHtml(u.slug)}">Learn more &rarr;</a>
    </div>
  `).join("");

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <span>Use Cases</span>
    </div>
    <div class="seo-tag">Use Cases</div>
    <h1>AI Agent Identity Use Cases</h1>
    <p class="seo-lead">How organizations across fintech, legal, healthcare, enterprise operations, and Web3 are using Agent ID to deploy AI agents with verifiable identity, trust scores, and compliant audit trails.</p>
    <div class="seo-card-grid">
      ${cards}
    </div>
  `;

  return renderSsrPage({
    title: "AI Agent Use Cases — Agent ID",
    description: "Explore how fintech, legal, healthcare, enterprise, and Web3 organizations use Agent ID to deploy trustworthy AI agents with verified identities and compliance-ready audit trails.",
    canonical: `${APP_URL}/use-cases`,
    ogTitle: "AI Agent Identity Use Cases — Agent ID",
    ogDescription: "Industry-specific use cases for AI agent identity: fintech, legal, healthcare, enterprise automation, and Web3.",
    schemaJson: JSON.stringify(schema),
    body,
  });
}

export function getUseCaseHtml(slug: string): string | null {
  const uc = USE_CASES.find((u) => u.slug === slug);
  if (!uc) return null;

  const featuresHtml = uc.keyFeatures.map((f) => `
    <p class="seo-check">&#x2713; ${escapeHtml(f)}</p>
  `).join("");

  const faqHtml = uc.faq.map((f) => `
    <div class="seo-faq-item">
      <h3>${escapeHtml(f.question)}</h3>
      <p>${escapeHtml(f.answer)}</p>
    </div>
  `).join("");

  const relatedLinks = (uc.relatedUseCases || [])
    .map((rs) => {
      const rel = USE_CASES.find((u) => u.slug === rs);
      if (!rel) return "";
      return `<li><a href="/use-cases/${escapeHtml(rs)}">${escapeHtml(rel.headline)}</a></li>`;
    })
    .filter(Boolean)
    .join("");

  const socialProof = uc.socialProofPlaceholder
    ? `<div class="seo-related" style="margin-top:32px;">
        <h2 style="font-size:15px;margin-top:0;">Customer Stories</h2>
        <p style="font-size:13px;color:rgba(232,232,240,0.4);">${escapeHtml(uc.socialProofPlaceholder)}</p>
       </div>`
    : "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": uc.headline,
    "description": uc.problem.slice(0, 160),
    "url": `${APP_URL}/use-cases/${uc.slug}`,
    "about": {
      "@type": "Thing",
      "name": `AI Agents for ${uc.industry}`,
    },
  };

  const faqSchema = uc.faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": uc.faq.map((f) => ({
          "@type": "Question",
          "name": f.question,
          "acceptedAnswer": { "@type": "Answer", "text": f.answer },
        })),
      }
    : null;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": APP_URL },
      { "@type": "ListItem", "position": 2, "name": "Use Cases", "item": `${APP_URL}/use-cases` },
      { "@type": "ListItem", "position": 3, "name": uc.headline, "item": `${APP_URL}/use-cases/${uc.slug}` },
    ],
  };

  const schemas = [schema, breadcrumbSchema, ...(faqSchema ? [faqSchema] : [])];

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <a href="/use-cases">Use Cases</a>
      <span class="sep">/</span>
      <span>${escapeHtml(uc.industry)}</span>
    </div>
    <div class="seo-tag">${escapeHtml(uc.industry)}</div>
    <h1>${escapeHtml(uc.headline)}</h1>
    <hr class="seo-divider" />
    <h2>The Problem</h2>
    <p>${escapeHtml(uc.problem)}</p>
    <h2>The Agent ID Solution</h2>
    <p>${escapeHtml(uc.solution)}</p>
    <h2>Key Features for ${escapeHtml(uc.industry)}</h2>
    <div style="margin:16px 0 32px;">
      ${featuresHtml}
    </div>
    ${socialProof}
    <div style="margin: 36px 0;">
      <a href="/sign-in?intent=register" class="seo-nav-cta" style="display:inline-block;">Get Started Free &rarr;</a>
    </div>
    ${faqHtml ? `<hr class="seo-divider" /><h2>Frequently Asked Questions</h2>${faqHtml}` : ""}
    ${relatedLinks ? `<div class="seo-related"><h2>Related Use Cases</h2><ul>${relatedLinks}</ul></div>` : ""}
  `;

  return renderSsrPage({
    title: `${uc.headline} | Agent ID`,
    description: uc.problem.slice(0, 160),
    canonical: `${APP_URL}/use-cases/${uc.slug}`,
    ogTitle: uc.headline,
    ogDescription: uc.problem.slice(0, 160),
    schemaJson: JSON.stringify(schemas),
    body,
  });
}
