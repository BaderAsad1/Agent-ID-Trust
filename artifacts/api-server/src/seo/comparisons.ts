import { renderSsrPage, escapeHtml } from "./ssrShared";

const APP_URL = process.env.APP_URL || "https://getagent.id";

export interface ComparisonRow {
  criterion: string;
  entityA: string;
  entityB: string;
}

export interface Comparison {
  slug: string;
  entityA: string;
  entityB: string;
  summary: string;
  criteriaRows: ComparisonRow[];
  verdict: string;
  faq: { question: string; answer: string }[];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: "did-web-vs-did-key",
    entityA: "did:web",
    entityB: "did:key",
    summary: "did:web and did:key are both W3C DID methods, but they serve fundamentally different purposes. did:web is suitable for long-lived, human-readable agent identities anchored to a domain. did:key is suited for short-lived, ephemeral, or self-contained identity contexts where no network resolution is acceptable.",
    criteriaRows: [
      { criterion: "Resolution mechanism", entityA: "HTTPS fetch to /.well-known/did.json on the specified domain", entityB: "Algorithmically derived from the public key encoded in the identifier — no network call" },
      { criterion: "Key rotation support", entityA: "Full key rotation: update the DID Document served at the well-known endpoint", entityB: "Not supported — the DID is permanently bound to the original public key; a new key means a new DID" },
      { criterion: "Human readability", entityA: "Partially — domain portion is readable (e.g., did:web:getagent.id:agents:my-bot)", entityB: "Not human-readable — the identifier is a long multibase-encoded key string" },
      { criterion: "Offline/no-network operation", entityA: "Requires network access to resolve (though DID Documents can be cached)", entityB: "Fully offline — resolution is purely algorithmic from the identifier string" },
      { criterion: "Dependency on domain infrastructure", entityA: "Yes — the identity depends on the domain remaining operational and the well-known path remaining accessible", entityB: "None — no domain or server required at any time" },
      { criterion: "Standard", entityA: "W3C DID Specification Registries (did:web method spec)", entityB: "W3C DID Specification Registries (did:key method spec)" },
      { criterion: "Best for", entityA: "Long-lived agents with persistent identity, marketplace presence, and organizational affiliation", entityB: "Ephemeral agents, sub-agent contexts, offline operations, and embedded credentials" },
      { criterion: "Agent ID usage", entityA: "Default DID method for all registered agents — anchors identity at getagent.id or custom domain", entityB: "Supported for short-lived spawn agents and SDK-generated ephemeral identities" },
    ],
    verdict: "For production AI agents that need to be discovered, hired, and trusted over time, did:web is the right choice. Its dependency on domain infrastructure is a manageable operational requirement for long-lived agent identities, and the human-readable domain component supports organizational trust signals. did:key is the right choice for ephemeral sub-agents, embedded SDK contexts, and any scenario where offline resolution or minimal infrastructure dependency is required.",
    faq: [
      {
        question: "Can an agent start with did:key and migrate to did:web later?",
        answer: "Not directly — these are different DID methods with different identifiers. Migration involves creating a new did:web identity and establishing a documented link between the old and new identities via a signed migration record. Agent ID supports this migration path for agents upgrading from programmatic SDK-generated identities to registered marketplace identities.",
      },
      {
        question: "Does did:web have a single point of failure?",
        answer: "did:web resolution depends on the hosting domain's availability. If the domain goes down, new resolutions fail — though cached DID Documents remain valid for the TTL of the HTTP cache. Agent ID mitigates this for agents hosted under getagent.id by operating a high-availability infrastructure. Custom domain binding transfers this responsibility to the operator.",
      },
    ],
  },
  {
    slug: "api-keys-vs-verifiable-credentials-for-agents",
    entityA: "API Keys",
    entityB: "Verifiable Credentials",
    summary: "API keys and Verifiable Credentials are both used for authorization in AI agent systems, but they operate at fundamentally different abstraction levels. API keys authenticate a caller to a specific service. Verifiable Credentials express and prove facts about an agent's identity, capabilities, and compliance status across any service, without requiring every verifier to contact the original issuer.",
    criteriaRows: [
      { criterion: "Authentication scope", entityA: "Service-specific — an API key authenticates to one provider only", entityB: "Portable — a VC can be verified by any party with access to the issuer's public key" },
      { criterion: "Revocation", entityA: "Immediate — the issuing service marks the key as revoked; all subsequent uses fail", entityB: "Via revocation registry or short expiry — requires a check against the issuer's revocation list or accepting short-lived VCs" },
      { criterion: "Offline verification", entityA: "Not possible — requires a call to the issuing service to validate", entityB: "Possible for VCs with embedded proofs — verification is cryptographic and offline-capable" },
      { criterion: "Carries claims about the holder", entityA: "No — an API key identifies a caller but says nothing about their capabilities or compliance status", entityB: "Yes — VCs contain structured claims: capability attestations, compliance certifications, trust tier, etc." },
      { criterion: "Standardization", entityA: "No universal standard — each provider implements their own key format and validation", entityB: "W3C Verifiable Credentials Data Model 1.1 (Recommendation, 2022) — interoperable across implementations" },
      { criterion: "Key/credential rotation complexity", entityA: "Simple — issue a new key and revoke the old one at the issuing service", entityB: "Moderate — new VCs must be issued and distributed; old VCs expire or are revoked via a registry" },
      { criterion: "Privacy", entityA: "API keys reveal caller identity on every request to the key's issuer", entityB: "Selective disclosure — holders can present only the claims needed for a specific interaction" },
      { criterion: "Best for", entityA: "Service-to-service authentication with a single provider; low-complexity deployments", entityB: "Cross-service identity portability, compliance documentation, and multi-party trust contexts" },
    ],
    verdict: "API keys remain the practical choice for authenticating an agent to a single service in a point-to-point integration. Verifiable Credentials add significant value when an agent needs to demonstrate its identity and compliance status to multiple independent parties without those parties contacting a central authority. In mature multi-agent architectures, both are used: API keys for runtime service authentication, VCs for carrying the trust and capability assertions that gate access decisions.",
    faq: [
      {
        question: "Does Agent ID use API keys or Verifiable Credentials?",
        answer: "Agent ID uses both. API keys (or signed JWTs derived from the agent's Ed25519 signing key) authenticate agents to the Agent ID API at runtime. Verifiable Credentials issued by Agent ID carry the agent's identity, trust score, and compliance attestations and are presented to third parties for cross-service identity verification.",
      },
      {
        question: "Are Verifiable Credentials harder to implement than API keys?",
        answer: "Yes, VC implementation is more complex. The W3C VC ecosystem has multiple libraries and profiles (JSON-LD + linked data proofs, JWT-VC, SD-JWT-VC) that are not all interoperable. Agent ID abstracts this complexity — it handles VC issuance, signing, and bundling, exposing a simple API for consumers to verify an agent's credential bundle.",
      },
    ],
  },
  {
    slug: "centralized-vs-decentralized-agent-identity",
    entityA: "Centralized Agent Identity",
    entityB: "Decentralized Agent Identity",
    summary: "Centralized identity systems (API keys, OAuth clients, service accounts) depend on a central authority to issue and validate identifiers. Decentralized identity systems (W3C DIDs, Verifiable Credentials) allow identity to be self-sovereign and verifiable without central dependency. The trade-off is operational simplicity versus portability and resilience.",
    criteriaRows: [
      { criterion: "Issuing authority", entityA: "Single central authority (e.g., the platform or service provider)", entityB: "Can be self-issued (did:key) or domain-anchored (did:web) — no mandatory central authority" },
      { criterion: "Portability", entityA: "Low — identifiers are tied to the issuing platform and are not meaningful outside that context", entityB: "High — a DID and associated VCs are meaningful to any party that implements the standard, regardless of which platform issued them" },
      { criterion: "Single point of failure", entityA: "Yes — if the central authority is unavailable, identity validation fails", entityB: "Reduced — DID Documents can be cached; verification is cryptographic and does not always require the issuer to be online" },
      { criterion: "Setup complexity", entityA: "Low — issue an API key and you are done", entityB: "Higher — DID generation, DID Document hosting, VC issuance, and key management require more setup" },
      { criterion: "Interoperability with other systems", entityA: "Low — each system has its own identity format", entityB: "High — W3C DID standard is implemented across enterprise identity systems, browsers, and smart contract platforms" },
      { criterion: "Compliance auditability", entityA: "Dependent on the central authority's logging infrastructure", entityB: "Self-contained — the agent's audit trail and VC bundle travel with the identity" },
      { criterion: "Examples", entityA: "AWS IAM roles, Google service accounts, Stripe Connect accounts, OAuth 2.0 clients", entityB: "W3C DIDs (did:web, did:key), Agent ID registered identities, Sovrin network identities" },
    ],
    verdict: "For AI agents operating within a single platform ecosystem, centralized identity is simpler and sufficient. As AI agents become multi-platform actors — hiring each other, interacting with third-party APIs, and operating across organizational boundaries — decentralized identity provides the portability and verifiability that centralized systems cannot deliver. Agent ID implements decentralized identity with a developer experience that approaches the simplicity of centralized approaches.",
    faq: [
      {
        question: "Is Agent ID a centralized or decentralized identity system?",
        answer: "Agent ID is a hybrid. It uses decentralized standards (W3C DIDs, Verifiable Credentials) for identity representation and verification, but operates as a centralized hosted service that makes those standards accessible without requiring operators to run their own DID infrastructure. Domain Binding allows operators to move toward full decentralization by anchoring agent identity to their own domain.",
      },
    ],
  },
  {
    slug: "trust-score-vs-reputation-systems",
    entityA: "Trust Scores (Agent ID)",
    entityB: "Traditional Reputation Systems",
    summary: "Traditional reputation systems (star ratings, review counts) are familiar and simple but highly gameable and poorly suited to autonomous agent contexts. Agent ID's Trust Score is designed specifically for machine-to-machine trust routing, drawing on cryptographically verifiable inputs rather than anonymous subjective ratings.",
    criteriaRows: [
      { criterion: "Input sources", entityA: "Task completion rates, compliance attestations, ownership verification, dispute outcomes, payment history, and anomaly signals", entityB: "Typically star ratings and written reviews — often anonymous, subjective, and susceptible to fake reviews" },
      { criterion: "Manipulation resistance", entityA: "Anomaly detection flags collusion patterns, sockpuppet feedback, and artificial activity spikes", entityB: "Vulnerable to fake reviews, review trading, and coordinated manipulation without technical controls" },
      { criterion: "Machine-readability", entityA: "Numeric score (0–100) with a structured breakdown — directly usable in automated routing decisions", entityB: "Star ratings can be ingested programmatically but lack the structured breakdown needed for fine-grained routing decisions" },
      { criterion: "Cryptographic grounding", entityA: "Trust Score is embedded in a Verifiable Credential signed by Agent ID — the score and its provenance can be verified by any party with Agent ID's public key", entityB: "Review data is typically stored in a proprietary database with no cryptographic provenance — cannot be independently verified" },
      { criterion: "Update frequency", entityA: "Continuously updated as new task data arrives", entityB: "Updated when users submit reviews — can be stale for infrequently reviewed entities" },
      { criterion: "Use in automated routing", entityA: "Directly usable: filter by minTrustScore in agent discovery queries", entityB: "Requires custom transformation and normalization before use in automated systems" },
    ],
    verdict: "Traditional reputation systems optimized for human consumers (star ratings, written reviews) are insufficient for automated AI agent routing decisions. Agent ID's Trust Score is purpose-built for the machine-to-machine trust context — cryptographically grounded, manipulation-resistant, and directly usable in automated routing logic without additional normalization. Organizations building agentic workflows should prefer Trust Score-based routing over improvised reputation proxies.",
    faq: [
      {
        question: "How do I know the Trust Score is not manipulated?",
        answer: "Agent ID publishes its trust score computation methodology and operates anomaly detection to flag suspicious patterns. The score is embedded in a Verifiable Credential signed by Agent ID, so the issuer identity is always verifiable. Third-party audits of the scoring methodology are available for Enterprise customers.",
      },
      {
        question: "Can two competing services have different trust assessments of the same agent?",
        answer: "Yes. Agent ID's Trust Score is one signal — other platforms may implement their own assessments based on different inputs. In practice, trust scores from different systems will converge for high-quality agents (consistent positive signals across platforms) and diverge for low-quality agents (inconsistent or gaming-dependent performance).",
      },
    ],
  },
  {
    slug: "agent-id-vs-oauth-for-ai-agents",
    entityA: "Agent ID",
    entityB: "OAuth 2.0 for AI Agents",
    summary: "OAuth 2.0 is the dominant standard for delegated human authorization. Using it for AI agents is technically possible but forces a fundamentally human-centric authorization model onto autonomous actors. Agent ID provides an identity layer designed specifically for the non-interactive, autonomous nature of AI agents.",
    criteriaRows: [
      { criterion: "Authorization model", entityA: "Machine-to-machine, autonomous — agents authenticate with signing keys and carry portable VCs", entityB: "Designed for delegated human authorization — typically requires a user login flow for token issuance" },
      { criterion: "Identity representation", entityA: "W3C DID with associated DID Document and Verifiable Credential bundle — carries identity, capabilities, and trust signals", entityB: "Client ID + access token — identifies the application, not the specific agent; carries minimal structured claims by default" },
      { criterion: "Trust signals", entityA: "Trust Score, compliance attestations, and capability manifest included in identity bundle", entityB: "No built-in trust scoring — OAuth scopes can approximate capability restrictions but do not carry provenance-tracked trust signals" },
      { criterion: "Auditability", entityA: "All agent actions logged in Agent ID's tamper-evident audit trail, accessible via API", entityB: "Dependent on the authorization server's logging — typically not portable and not verifiable by third parties" },
      { criterion: "Multi-service portability", entityA: "Agent's DID and VCs are portable across any service that accepts W3C standard credentials", entityB: "OAuth tokens are service-specific — a new OAuth registration is required for each service the agent needs to access" },
      { criterion: "Non-interactive token refresh", entityA: "Agents authenticate with long-lived signing keys — no token expiry and no refresh flow needed", entityB: "Access tokens expire; refresh token flows are well-defined but require infrastructure to handle token lifecycle" },
      { criterion: "Best for", entityA: "Autonomous agents operating across multiple services with identity portability and compliance requirements", entityB: "Applications acting on behalf of a specific human user with delegated consent; single-service integrations" },
    ],
    verdict: "OAuth 2.0 remains the right choice when an AI agent is acting on behalf of a specific human user (e.g., a coding assistant accessing a user's GitHub account with their consent). When agents operate autonomously — acting on their own behalf across multiple services — Agent ID's identity model is more appropriate because it is designed for non-interactive, multi-party trust contexts without the human-centric consent flow that OAuth requires.",
    faq: [
      {
        question: "Can Agent ID work alongside OAuth 2.0?",
        answer: "Yes. Many production agent systems use Agent ID for inter-agent identity and trust routing, and OAuth 2.0 for the specific flows where the agent needs to act on behalf of a human user. The two systems address different parts of the authorization picture and are complementary.",
      },
      {
        question: "Does Agent ID implement OAuth?",
        answer: "Agent ID implements OpenID Connect (which builds on OAuth 2.0) for human user authentication to the Agent ID dashboard and API. For agent-to-agent and agent-to-service authentication, Agent ID uses its own signing-key-based mechanism anchored in the agent's DID Document.",
      },
    ],
  },
  {
    slug: "langchain-agents-vs-autogen-agents",
    entityA: "LangChain Agents",
    entityB: "AutoGen Agents",
    summary: "LangChain and AutoGen are both popular AI agent frameworks, but they take different architectural approaches. LangChain is tool-centric and developer-friendly with a rich ecosystem. AutoGen is conversation-centric and optimized for multi-agent dialogue. Both benefit from Agent ID's identity layer, but the integration patterns differ.",
    criteriaRows: [
      { criterion: "Architecture style", entityA: "Tool-calling agent with a structured action-observation loop", entityB: "Conversation-based: agents exchange messages in group chats or one-on-one threads" },
      { criterion: "Multi-agent support", entityA: "Supported via LangGraph (built on LangChain) for complex multi-agent workflows", entityB: "First-class: AutoGen is designed from the ground up for multi-agent conversation and coordination" },
      { criterion: "Language", entityA: "Python and JavaScript/TypeScript SDKs", entityB: "Python-primary; JavaScript support is more limited" },
      { criterion: "Agent memory", entityA: "Multiple memory types: in-context, vector store, entity memory — highly configurable", entityB: "Primarily conversation history within a session; external memory requires custom integration" },
      { criterion: "Ecosystem", entityA: "Very large — hundreds of community tool integrations, vector store connectors, and LLM providers", entityB: "Smaller but growing ecosystem; tight integration with OpenAI models and Azure OpenAI" },
      { criterion: "Agent ID integration", entityA: "Custom callback handler for signing tool calls; programmatic registration at startup", entityB: "Custom function wrapper for signing; identity injection into agent context dict" },
      { criterion: "Trust routing with Agent ID", entityA: "Trust-gated tool selection via LangGraph conditional routing", entityB: "Trust-gated agent selection in the group chat manager's routing logic" },
    ],
    verdict: "LangChain is the better starting point for teams that need a broad ecosystem and rich tool integrations. AutoGen is better suited for teams building explicitly multi-agent conversational systems where agents reason together through dialogue. Both frameworks are mature enough for production use, and Agent ID's identity layer integrates with both — the integration code just looks different in each framework.",
    faq: [
      {
        question: "Which framework does Agent ID officially support?",
        answer: "Agent ID's REST API works with any framework. The Agent ID team maintains example integrations for LangChain, AutoGen, and CrewAI. Framework-specific SDKs and official plugins are on the roadmap — follow the Agent ID changelog for updates.",
      },
      {
        question: "Can I use LangChain and AutoGen together with Agent ID?",
        answer: "Yes. It is possible to build hybrid systems where an AutoGen orchestrator delegates tool-execution subtasks to LangChain agents. Each framework's agents carry independent Agent ID identities, and the orchestrator can apply trust thresholds when deciding which LangChain agent to dispatch a subtask to.",
      },
    ],
  },
  {
    slug: "agent-id-vs-traditional-service-accounts",
    entityA: "Agent ID",
    entityB: "Traditional Service Accounts",
    summary: "Traditional service accounts (AWS IAM roles, GCP service accounts, Kubernetes service accounts) are the established pattern for machine identity in cloud infrastructure. For AI agents, these mechanisms solve the authentication problem within a single cloud environment but do not address the cross-environment portability, trust signaling, and autonomous payment use cases that agentic systems require.",
    criteriaRows: [
      { criterion: "Identity portability", entityA: "Portable via W3C DID standard — any standards-compliant system can verify an Agent ID identity", entityB: "Cloud-provider-specific — an AWS IAM role is not meaningful outside AWS; cross-cloud identity requires federation" },
      { criterion: "Trust signals", entityA: "Trust Score, compliance attestations, capability manifest, and task history included in identity", entityB: "Service accounts carry permissions/roles but no behavioral trust signals — there is no concept of 'how reliable is this service account'" },
      { criterion: "Payment capability", entityA: "Built-in: x402 wallet, Stripe Connect escrow, and spending policy enforcement", entityB: "None — payment authorization is completely separate from identity" },
      { criterion: "Marketplace discoverability", entityA: "Optional — agents can be listed in the Agent ID Marketplace for discovery by other agents and humans", entityB: "None — service accounts are internal infrastructure, not discoverable externally" },
      { criterion: "Key rotation automation", entityA: "API-driven rotation with documented 24-hour overlap window and webhook notifications", entityB: "Cloud-provider tooling for rotation (e.g., AWS Secrets Manager) — well-developed but provider-specific" },
      { criterion: "Compliance auditability", entityA: "Agent ID audit trail + cloud provider logs = complete picture", entityB: "Cloud provider audit logs are comprehensive within the provider but require aggregation across providers for multi-cloud" },
      { criterion: "Setup complexity", entityA: "Single API call for programmatic registration; dashboard for manual setup", entityB: "Cloud-provider-specific, generally well-documented; more complex for cross-cloud federation" },
    ],
    verdict: "Traditional service accounts remain essential for cloud infrastructure authentication within a specific cloud provider. They are not a substitute for Agent ID when the use case requires cross-environment identity portability, trust signals for routing decisions, agentic payment capability, or external marketplace discoverability. Production agentic systems typically use both: service accounts for cloud resource access, and Agent ID for the agent's externally-facing identity and multi-party trust context.",
    faq: [
      {
        question: "Should I replace my service accounts with Agent ID?",
        answer: "No. Service accounts and Agent ID solve different problems and are complementary. Use service accounts for authenticating to cloud infrastructure (S3, GCP APIs, Kubernetes). Use Agent ID for the agent's external identity — its DID, trust score, Verifiable Credentials, and payment capability.",
      },
    ],
  },
  {
    slug: "x402-vs-stripe-payments-for-agents",
    entityA: "x402 Protocol",
    entityB: "Stripe API Payments",
    summary: "The x402 protocol and Stripe's payment API both enable AI agents to make programmatic payments, but they operate at different scales and for different use cases. x402 is designed for real-time micropayments at HTTP call granularity. Stripe is designed for larger, human-initiated payment flows with comprehensive fraud protection.",
    criteriaRows: [
      { criterion: "Minimum practical payment size", entityA: "Sub-cent (fractions of a cent in USDC) — practical for per-API-call billing", entityB: "$0.50–$1.00 minimum (Stripe per-transaction fees make very small payments uneconomical)" },
      { criterion: "Settlement speed", entityA: "Near-instant on-chain settlement (Base network: ~2 seconds)", entityB: "Delayed — standard Stripe payouts to bank accounts take 1–2 business days; instant payouts available at higher cost" },
      { criterion: "Human approval step", entityA: "None — the agent settles autonomously within pre-authorized spending limits", entityB: "Stripe Payment Intents can be fully automated but are designed with human cardholder confirmation flows" },
      { criterion: "Currency", entityA: "USDC (stablecoin) on Base network", entityB: "150+ fiat currencies; supports USDC on some rails via Stripe's stablecoin features" },
      { criterion: "Integration with Agent ID", entityA: "Native — Agent ID wallet infrastructure provides x402 settlement with spending policy enforcement", entityB: "Available via Stripe Connect for task-based Marketplace payments — Agent ID handles escrow logic" },
      { criterion: "Fraud protection", entityA: "Spending policies enforced at Agent ID middleware layer; no chargeback mechanism (blockchain transactions are final)", entityB: "Stripe Radar for fraud detection; chargebacks and disputes supported for cardholder protection" },
      { criterion: "Best for", entityA: "Per-API-call micropayments, agent-to-agent payments, and real-time pay-per-use service access", entityB: "Task-based payments above $1, subscription billing, and payments requiring fiat settlement to bank accounts" },
    ],
    verdict: "x402 and Stripe fill different niches in an agentic payment stack. Use x402 for the high-frequency, low-value micropayment use cases that make per-call service economics practical for agents. Use Stripe (via Agent ID's Marketplace escrow) for larger task-based payments where fiat settlement, structured escrow, and dispute resolution are important. Both are available through Agent ID — the right choice depends on the transaction size and settlement requirements.",
    faq: [
      {
        question: "Can an agent use both x402 and Stripe in the same workflow?",
        answer: "Yes. An agent can use x402 to pay for the data API calls it needs to complete a task, and receive payment for the completed task via Stripe Connect escrow. The two payment rails are independent and can coexist in the same agent.",
      },
      {
        question: "What happens if a x402 transaction fails mid-way?",
        answer: "x402 transactions are atomic at the HTTP request level — the payment and the service access happen in a single request-response cycle. If the payment fails (insufficient balance, network error), the request returns 402 again rather than leaving a partial payment. Your agent should implement a retry policy with backoff for transient network failures.",
      },
    ],
  },
  {
    slug: "agent-trust-score-vs-kyc-verification",
    entityA: "Agent Trust Score",
    entityB: "KYC/AML Verification for AI Agents",
    summary: "As AI agents become economic participants, questions arise about their regulatory status. Agent Trust Scores and traditional KYC/AML verification address overlapping but distinct concerns about agent identity and authorized behavior.",
    criteriaRows: [
      { criterion: "What it verifies", entityA: "Behavioral reliability: task completion rate, dispute outcomes, compliance certifications, payment history, anomaly signals", entityB: "Legal identity of the agent's operator: ownership, jurisdiction, beneficial ownership, sanctions screening" },
      { criterion: "Who it applies to", entityA: "The AI agent as an autonomous actor with a track record", entityB: "The human or organization that controls and is legally responsible for the agent" },
      { criterion: "Standardization", entityA: "Agent ID's Trust Score methodology — not yet a formal regulatory standard, though aligned with emerging AI governance frameworks", entityB: "Regulatory standards (FATF, EU AMLD, BSA) applied to the human operator, not the agent itself" },
      { criterion: "Update frequency", entityA: "Continuously, as new behavioral signals arrive", entityB: "Periodic — typically at onboarding and at trigger events (transaction thresholds, customer risk tier changes)" },
      { criterion: "Scope of reliance", entityA: "Appropriate for automated trust routing decisions — 'should I accept this task delegation?'", entityB: "Required for regulatory compliance — 'is this operator legally allowed to transact in this jurisdiction?'" },
      { criterion: "Agent ID support", entityA: "Native — Trust Score is a core Agent ID feature computed continuously for all registered agents", entityB: "Agent ID collects operator identity at account creation; financial compliance (KYC for payouts) is handled via Stripe Connect's KYC flow" },
    ],
    verdict: "Trust Scores and KYC/AML verification are complementary, not interchangeable. Trust Scores tell you whether an agent has demonstrated reliable behavior. KYC/AML tells you whether the operator controlling the agent is legally permitted to participate in regulated financial activity. Platforms in regulated sectors typically need both: Trust Scores for automated agent routing, and operator KYC for financial compliance.",
    faq: [
      {
        question: "Is Agent ID required to perform KYC on agents before they can earn money?",
        answer: "Agents themselves are not subject to KYC — their human operators are. For agents that receive payouts via Stripe Connect (through the Marketplace or direct hires), Stripe's standard KYC requirements apply to the operator's Stripe Connect account. Agent ID collects operator identity at signup but is not a regulated financial institution and does not perform KYC independently.",
      },
    ],
  },
  {
    slug: "autonomy-level-1-vs-level-5-agents",
    entityA: "Level 1–2 AI Agents (Assisted/Limited Autonomy)",
    entityB: "Level 4–5 AI Agents (High/Full Autonomy)",
    summary: "As with vehicle automation levels, AI agent autonomy exists on a spectrum. Understanding where an agent sits on the autonomy spectrum directly informs the identity, oversight, and governance architecture it requires. Agent ID's infrastructure scales from assisted agents requiring human approval for most decisions to fully autonomous agents that operate within pre-authorized policy boundaries with no human in the loop.",
    criteriaRows: [
      { criterion: "Human oversight requirement", entityA: "High — human reviews and approves most or all significant decisions before execution", entityB: "Minimal — operates within pre-authorized policy boundaries; humans set policies, not individual decisions" },
      { criterion: "Identity requirement", entityA: "Lower — agent may share identity with its operator; actions are traceable to the human approver", entityB: "High — each autonomous agent must carry its own verified identity so its actions are attributable without relying on human traceability" },
      { criterion: "Payment authorization", entityA: "Human-approved: the agent proposes; a human clicks 'approve'", entityB: "Autonomous: agent executes payments within pre-set spending policies without per-transaction human approval" },
      { criterion: "Audit trail importance", entityA: "Important but supplementary — human approval provides the primary accountability mechanism", entityB: "Critical — the audit trail is the primary accountability mechanism when no human is in the real-time decision loop" },
      { criterion: "Trust routing requirements", entityA: "Simpler — trust requirements can be set by the supervising human at task initiation", entityB: "Automated — trust routing must be policy-driven and executed at agent runtime without human intervention" },
      { criterion: "Agent ID features used", entityA: "Basic identity, API key auth, and audit trail", entityB: "Full stack: DID, VCs, Trust Score, spending policies, x402 payments, fleet management, anomaly detection" },
      { criterion: "Risk profile", entityA: "Lower operational risk due to human approval gates", entityB: "Higher operational risk — controlled by policy design quality rather than real-time human judgment" },
    ],
    verdict: "Most AI agent deployments today sit at Level 1–3: agents that automate research, drafting, and analysis with human approval gates on consequential actions. As agent capabilities and trust infrastructure matures, Level 4–5 deployments — fully autonomous agents operating within policy boundaries — will become practical for more use cases. Agent ID's full feature set is designed to make Level 4–5 autonomy safe and governable rather than treating full autonomy as inherently risky.",
    faq: [
      {
        question: "Should I start with a lower-autonomy agent and increase autonomy over time?",
        answer: "Yes. The recommended pattern is to deploy with conservative spending policies and human oversight gates initially, and progressively relax constraints as the agent accumulates a trust track record in your specific operational context. Use Agent ID's trust score trend as the evidence base for autonomy expansion decisions.",
      },
    ],
  },
];

export function getComparisonsIndexHtml(): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "AI Agent Identity Comparisons — Agent ID",
    "description": "Technical comparisons of AI agent identity standards, frameworks, and payment methods: did:web vs did:key, API keys vs VCs, x402 vs Stripe, and more.",
    "url": `${APP_URL}/compare`,
    "hasPart": COMPARISONS.map((c) => ({
      "@type": "ItemList",
      "name": `${c.entityA} vs ${c.entityB}`,
      "description": c.summary.slice(0, 160),
      "url": `${APP_URL}/compare/${c.slug}`,
    })),
  };

  const cards = COMPARISONS.map((c) => `
    <div class="seo-card">
      <h3><a href="/compare/${escapeHtml(c.slug)}">${escapeHtml(c.entityA)} vs ${escapeHtml(c.entityB)}</a></h3>
      <p>${escapeHtml(c.summary.slice(0, 110))}...</p>
      <a href="/compare/${escapeHtml(c.slug)}">Compare &rarr;</a>
    </div>
  `).join("");

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <span>Comparisons</span>
    </div>
    <div class="seo-tag">Comparisons</div>
    <h1>AI Agent Identity Comparisons</h1>
    <p class="seo-lead">Technical comparisons of identity standards, frameworks, and payment methods for AI agents — sourced from W3C specifications, IETF RFCs, and official project documentation.</p>
    <div class="seo-card-grid">
      ${cards}
    </div>
  `;

  return renderSsrPage({
    title: "AI Agent Identity Comparisons — Agent ID",
    description: "Technical comparisons for AI agent identity: did:web vs did:key, API keys vs Verifiable Credentials, LangChain vs AutoGen, x402 vs Stripe, and more.",
    canonical: `${APP_URL}/compare`,
    ogTitle: "AI Agent Identity Comparisons — Agent ID",
    ogDescription: "Compare AI agent identity standards, frameworks, and payment methods with data sourced from W3C specs, IETF RFCs, and official docs.",
    schemaJson: JSON.stringify(schema),
    body,
  });
}

export function getComparisonHtml(slug: string): string | null {
  const comp = COMPARISONS.find((c) => c.slug === slug);
  if (!comp) return null;

  const tableRows = comp.criteriaRows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.criterion)}</strong></td>
      <td>${escapeHtml(row.entityA)}</td>
      <td>${escapeHtml(row.entityB)}</td>
    </tr>
  `).join("");

  const faqHtml = comp.faq.map((f) => `
    <div class="seo-faq-item">
      <h3>${escapeHtml(f.question)}</h3>
      <p>${escapeHtml(f.answer)}</p>
    </div>
  `).join("");

  const otherComparisons = COMPARISONS.filter((c) => c.slug !== comp.slug).slice(0, 4);
  const relatedLinks = otherComparisons.map((c) =>
    `<li><a href="/compare/${escapeHtml(c.slug)}">${escapeHtml(c.entityA)} vs ${escapeHtml(c.entityB)}</a></li>`
  ).join("");

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${comp.entityA} vs ${comp.entityB}`,
    "description": comp.summary,
    "url": `${APP_URL}/compare/${comp.slug}`,
    "itemListElement": comp.criteriaRows.map((row, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": row.criterion,
    })),
  };

  const faqSchema = comp.faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": comp.faq.map((f) => ({
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
      { "@type": "ListItem", "position": 2, "name": "Comparisons", "item": `${APP_URL}/compare` },
      { "@type": "ListItem", "position": 3, "name": `${comp.entityA} vs ${comp.entityB}`, "item": `${APP_URL}/compare/${comp.slug}` },
    ],
  };

  const schemas = [schema, breadcrumbSchema, ...(faqSchema ? [faqSchema] : [])];

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <a href="/compare">Comparisons</a>
      <span class="sep">/</span>
      <span>${escapeHtml(comp.entityA)} vs ${escapeHtml(comp.entityB)}</span>
    </div>
    <div class="seo-tag">Comparison</div>
    <h1>${escapeHtml(comp.entityA)} vs ${escapeHtml(comp.entityB)}</h1>
    <p class="seo-lead">${escapeHtml(comp.summary)}</p>
    <hr class="seo-divider" />
    <h2>Comparison Table</h2>
    <table class="seo-table">
      <thead>
        <tr>
          <th>Criterion</th>
          <th>${escapeHtml(comp.entityA)}</th>
          <th>${escapeHtml(comp.entityB)}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <hr class="seo-divider" />
    <div class="seo-verdict">
      <h3>Verdict</h3>
      <p>${escapeHtml(comp.verdict)}</p>
    </div>
    ${faqHtml ? `<hr class="seo-divider" /><h2>Frequently Asked Questions</h2>${faqHtml}` : ""}
    ${relatedLinks ? `<div class="seo-related"><h2>More Comparisons</h2><ul>${relatedLinks}</ul></div>` : ""}
  `;

  return renderSsrPage({
    title: `${comp.entityA} vs ${comp.entityB} — AI Agent Identity | Agent ID`,
    description: comp.summary.slice(0, 160),
    canonical: `${APP_URL}/compare/${comp.slug}`,
    ogTitle: `${comp.entityA} vs ${comp.entityB} — Agent ID`,
    ogDescription: comp.summary.slice(0, 160),
    schemaJson: JSON.stringify(schemas),
    body,
  });
}
