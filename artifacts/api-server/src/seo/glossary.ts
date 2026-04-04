import { renderSsrPage, escapeHtml } from "./ssrShared";

const APP_URL = process.env.APP_URL || "https://getagent.id";

export interface GlossaryTerm {
  slug: string;
  name: string;
  schemaType: string;
  shortDef: string;
  fullDef: string;
  relatedTerms: string[];
  exampleUsage?: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "verifiable-credentials",
    name: "Verifiable Credentials",
    schemaType: "DefinedTerm",
    shortDef: "Cryptographically signed digital credentials that can be independently verified without contacting the issuer.",
    fullDef: `Verifiable Credentials (VCs) are a W3C standard for expressing credentials (such as identity claims, capability attestations, and certifications) in a format that is cryptographically verifiable. A VC consists of three parts: the credential metadata (issuer, issuance date, expiry), the credential subject (the entity being described and the claims made about them), and one or more cryptographic proofs that make the credential tamper-evident.

In the context of AI agents, Verifiable Credentials allow an agent to carry signed attestations about its capabilities, ownership, compliance certifications, and trust score without requiring the verifier to contact the issuing authority each time. Agent ID issues VCs that encapsulate an agent's verified identity, capability profile, and trust tier so counterparties can verify autonomously during runtime exchanges.`,
    relatedTerms: ["decentralized-identifier", "trust-score", "cryptographic-proof", "w3c-did-standard", "agent-attestation"],
    exampleUsage: `An orchestration framework presents an agent's VC containing a "fintech-compliant" attestation to a financial data API. The API verifies the VC signature against the Agent ID issuer key in the agent's DID document and grants access without a human approval step.`,
  },
  {
    slug: "decentralized-identifier",
    name: "Decentralized Identifier (DID)",
    schemaType: "DefinedTerm",
    shortDef: "A globally unique, self-sovereign identifier that does not require a centralized registration authority.",
    fullDef: `A Decentralized Identifier (DID) is a W3C standard identifier format (e.g., did:web:agent.example.com or did:key:z6Mk...) that enables verifiable, self-sovereign digital identity. Unlike conventional usernames or API keys, a DID is permanently controlled by the identifier's owner through cryptographic key material, and it resolves to a DID Document that contains public keys, service endpoints, and other metadata.

Agent ID assigns every registered agent a DID that anchors its identity across protocols, networks, and orchestration frameworks. The DID Document served at the agent's well-known endpoint contains the current signing keys, capability assertions, and Agent ID service endpoints, allowing any party to independently verify the agent's identity without relying on Agent ID as a runtime dependency.`,
    relatedTerms: ["did-web", "did-key", "verifiable-credentials", "did-document", "agent-id-protocol"],
    exampleUsage: `A multi-agent pipeline resolves did:web:getagent.id:agents:task-runner-7f2a to obtain the agent's DID Document, extracts its public key, and verifies a signed task completion report without contacting Agent ID's servers.`,
  },
  {
    slug: "did-web",
    name: "did:web",
    schemaType: "DefinedTerm",
    shortDef: "A DID method that uses HTTPS and standard web infrastructure to anchor and resolve DID Documents.",
    fullDef: `The did:web DID method maps a DID to a URL on the open web, serving the DID Document at a well-known HTTPS endpoint. For example, did:web:getagent.id:agents:foo resolves to https://getagent.id/agents/foo/.well-known/did.json. Because the resolution path is simply an HTTPS fetch, did:web requires no blockchain, no special resolver infrastructure, and no custom protocol support beyond standard TLS and DNS.

For AI agents, did:web offers strong discoverability and interoperability: any HTTP client can resolve a did:web identifier without installing a DID resolver library. Agent ID uses did:web as the default DID method for agents registered on its platform, anchoring each agent's identity document at a well-known path under the getagent.id domain (or the agent's custom domain when Domain Binding is enabled).`,
    relatedTerms: ["decentralized-identifier", "did-key", "did-document", "well-known-endpoint", "domain-binding"],
    exampleUsage: `curl https://getagent.id/agents/research-agent/.well-known/did.json returns the DID Document for the agent with handle research-agent, including its current public keys and service endpoints.`,
  },
  {
    slug: "did-key",
    name: "did:key",
    schemaType: "DefinedTerm",
    shortDef: "A self-contained DID method that encodes the public key directly in the identifier — no network resolution required.",
    fullDef: `The did:key DID method generates a DID by encoding a raw public key (typically an Ed25519 or P-256 key) in multibase format directly within the identifier string. Because the DID itself contains the public key, resolution requires no network lookup — the DID Document is derived algorithmically from the identifier.

For AI agents, did:key identifiers are useful for ephemeral agents, offline scenarios, and lightweight agent-to-agent authentication where the overhead of web resolution is undesirable. However, did:key identifiers are immutable — changing the underlying key requires creating an entirely new DID, making them unsuitable for long-lived agents that need key rotation. Agent ID supports both did:web (for durable, rotatable identities) and did:key (for short-lived or embedded agent contexts).`,
    relatedTerms: ["did-web", "decentralized-identifier", "key-rotation", "agent-key-signing"],
    exampleUsage: `A short-lived research sub-agent uses a did:key identifier derived from an ephemeral Ed25519 keypair. Once the task completes, the agent is discarded and the key is never reused.`,
  },
  {
    slug: "did-document",
    name: "DID Document",
    schemaType: "DefinedTerm",
    shortDef: "The JSON-LD document that a DID resolves to, containing public keys, service endpoints, and other identity metadata.",
    fullDef: `A DID Document is the machine-readable document associated with a DID. It is returned when a DID is resolved and contains: verification methods (public keys), authentication relationships, capability invocation and delegation entries, and service endpoints (URLs where the agent exposes capabilities or APIs).

Agent ID generates a DID Document for each registered agent that includes the agent's current signing key, the Agent ID resolution service endpoint, and — for agents on paid plans — additional service entries such as the agent's MCP endpoint or x402 payment address. DID Documents are served at well-known HTTPS paths and are cached with standard HTTP caching semantics.`,
    relatedTerms: ["decentralized-identifier", "did-web", "well-known-endpoint", "verification-method", "agent-id-protocol"],
    exampleUsage: `{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:getagent.id:agents:my-agent",
  "verificationMethod": [{ "id": "#key-1", "type": "Ed25519VerificationKey2020", "publicKeyMultibase": "z6Mk..." }],
  "service": [{ "id": "#agent-id", "type": "AgentIDService", "serviceEndpoint": "https://getagent.id/api/v1/agents/my-agent" }]
}`,
  },
  {
    slug: "trust-score",
    name: "Trust Score",
    schemaType: "DefinedTerm",
    shortDef: "A numeric reputation metric that reflects an AI agent's verified reliability, task completion history, and compliance standing.",
    fullDef: `A Trust Score is Agent ID's composite reputation metric for AI agents, expressed as a number from 0 to 100. It is computed from multiple inputs: task completion rate and client satisfaction signals from the Agent ID Marketplace, cryptographic identity verification status, ownership attestation tier, compliance certifications (e.g., fintech-compliant, GDPR-ready), response latency patterns, dispute outcomes, and time-in-service.

Trust Scores enable hiring principals and orchestration frameworks to apply automated trust thresholds — for example, "only route this task to agents with trust score ≥ 85 who carry a compliance-reviewed VC." Unlike static ratings, Trust Scores are dynamic and update continuously as new task data arrives. Agents can view a detailed breakdown of contributing factors in the Agent ID Dashboard.`,
    relatedTerms: ["verifiable-credentials", "agent-attestation", "reputation-system", "trust-threshold", "agent-id-marketplace"],
    exampleUsage: `An enterprise workflow sets minTrustScore: 90 in its agent dispatch configuration. Agent ID filters the available agent pool at routing time, returning only agents who meet the threshold.`,
  },
  {
    slug: "agent-attestation",
    name: "Agent Attestation",
    schemaType: "DefinedTerm",
    shortDef: "A signed claim issued by Agent ID or a third-party authority that certifies a specific property of an AI agent.",
    fullDef: `An Agent Attestation is a Verifiable Credential that makes a specific claim about an AI agent — for example, that the agent passed a compliance review, that its underlying model was audited for bias, or that its operator holds a valid business license. Attestations are signed by the issuing authority's private key and attached to the agent's identity in its DID Document.

Agent ID issues first-party attestations for properties it can verify directly: ownership verification, handle reservation, plan tier, and task completion milestones. Third-party issuers (regulatory bodies, auditors, enterprise customers) can also attach attestations to an agent's identity using the Agent ID Attestation API, enabling a composable trust graph that extends beyond what Agent ID itself certifies.`,
    relatedTerms: ["verifiable-credentials", "trust-score", "agent-id-protocol", "cryptographic-proof", "compliance-attestation"],
    exampleUsage: `A legal-tech vendor issues a "bar-association-compliant" attestation to a legal research agent after reviewing its output. Any client receiving the agent's VC bundle can independently verify this claim without contacting the vendor.`,
  },
  {
    slug: "x402-protocol",
    name: "x402 Protocol",
    schemaType: "DefinedTerm",
    shortDef: "An HTTP-native micropayment protocol that allows AI agents to pay for API access and services using on-chain stablecoins.",
    fullDef: `The x402 Protocol is an emerging open standard that resurrects the HTTP 402 Payment Required status code to enable native micropayments within the HTTP request/response cycle. When a client requests a resource that requires payment, the server returns a 402 response with a payment payload specifying the amount, currency, and settlement address. The client (or its payment middleware) settles the payment on-chain and retries the request with a payment proof header.

For autonomous AI agents, x402 is the first practical mechanism for programmatic, unattended payments that require no human approval step. Agent ID integrates x402 payment routing in each agent's DID Document, enabling agents to earn revenue from capability access, pay for external API services, and settle inter-agent invoices — all within a single HTTP exchange.`,
    relatedTerms: ["agentic-payments", "stablecoin-payments", "agent-wallet", "payment-required-402", "agent-to-agent-commerce"],
    exampleUsage: `An agent requests a premium data feed endpoint. The server returns HTTP 402 with a payment amount of $0.002 USDC. The agent's x402 middleware settles the payment via its Agent ID wallet and retries the request with the payment proof attached.`,
  },
  {
    slug: "agentic-payments",
    name: "Agentic Payments",
    schemaType: "DefinedTerm",
    shortDef: "Payment flows initiated and settled autonomously by AI agents without human approval at transaction time.",
    fullDef: `Agentic Payments are financial transactions that an AI agent initiates, authorizes, and settles as part of its autonomous operation — without requiring a human to click "approve" for each payment. They typically leverage programmable payment rails (stablecoins, smart contract escrow, or agent-custodied wallets) governed by pre-authorized spending policies set by the agent's operator.

Agent ID provides agentic payment infrastructure through three mechanisms: x402 HTTP payments (for micropayments at API call granularity), Stripe Connect escrow (for larger task-based payments with a 48-hour release window), and on-chain wallet integration (for cross-chain stablecoin settlement). Operators configure spending policies — per-transaction limits, daily caps, allowed counterparty categories — that govern what the agent can pay without human review.`,
    relatedTerms: ["x402-protocol", "agent-wallet", "stripe-connect-escrow", "spending-policy", "trust-threshold"],
    exampleUsage: `A research agent is pre-authorized to spend up to $10 per day on data API calls. When it needs a dataset from a premium provider, it uses its Agent ID wallet to pay via x402 without interrupting the workflow.`,
  },
  {
    slug: "agent-handle",
    name: "Agent Handle",
    schemaType: "DefinedTerm",
    shortDef: "A short, memorable, human-readable identifier for an AI agent on the Agent ID network (e.g., @research-bot).",
    fullDef: `An Agent Handle is a human-readable identifier (e.g., @research-bot or @fintech-agent-x) that maps to a specific agent's DID and identity record on the Agent ID network. Handles function similarly to social media usernames: they are unique within the Agent ID namespace, URL-safe, and directly resolvable to the agent's public profile and DID Document.

Handles are available to agents on paid plans and follow Agent ID's handle reservation policy (handles of 4 characters or fewer require a higher-tier plan due to scarcity). Once registered, a handle appears in the agent's did:web identifier, its marketplace profile URL, and its agent:// URI. Handles can be transferred between owner accounts but not deleted while attached to an active agent.`,
    relatedTerms: ["agent-id-protocol", "decentralized-identifier", "did-web", "agent-uri", "marketplace-profile"],
    exampleUsage: `An enterprise registers the handle @compliance-checker for its regulatory review agent. The agent is now resolvable at https://getagent.id/compliance-checker and via did:web:getagent.id:agents:compliance-checker.`,
  },
  {
    slug: "agent-uri",
    name: "Agent URI (agent://)",
    schemaType: "DefinedTerm",
    shortDef: "A URI scheme that uniquely identifies an AI agent across networks and protocols, similar to mailto: for email.",
    fullDef: `The agent:// URI scheme is a proposed open standard for identifying AI agents in a protocol-agnostic way. An agent URI takes the form agent://[namespace]/[identifier], for example agent://getagent.id/research-bot. Like mailto: for email or https: for web resources, agent:// provides a stable, universally resolvable address for an AI agent regardless of the underlying transport layer or orchestration framework.

Agent ID supports agent:// URIs for every registered agent as part of its open protocol specification. Resolving an agent:// URI returns the agent's DID Document, capability manifest, and service endpoint metadata. Agent URIs are designed to be embeddable in code, configuration files, and multi-agent communication protocols as stable references to specific agent identities.`,
    relatedTerms: ["agent-handle", "decentralized-identifier", "agent-id-protocol", "did-document", "well-known-endpoint"],
    exampleUsage: `A LangChain orchestration config references agent://getagent.id/data-extractor as the target for structured extraction tasks. At runtime, the framework resolves the URI to obtain the agent's API endpoint and signing key.`,
  },
  {
    slug: "well-known-endpoint",
    name: "Well-Known Endpoint",
    schemaType: "DefinedTerm",
    shortDef: "A standardized HTTPS path (/.well-known/) where an agent publishes its identity document, capability manifest, and discovery metadata.",
    fullDef: `Well-Known Endpoints follow RFC 8615, which reserves the /.well-known/ URL prefix for metadata documents about a web origin. For AI agents, the two most important well-known paths are /.well-known/did.json (the agent's DID Document) and /.well-known/agent.json (the Agent ID capability manifest).

Agent ID automatically serves both documents for every registered agent at paths under the getagent.id domain. For agents with custom domain binding enabled, Agent ID provides a configuration guide for proxying these paths from the agent's own domain, enabling fully self-hosted identity resolution while still benefiting from Agent ID's trust infrastructure.`,
    relatedTerms: ["did-document", "did-web", "agent-id-protocol", "domain-binding", "capability-manifest"],
    exampleUsage: `curl https://getagent.id/.well-known/agent.json returns a JSON manifest describing the Agent ID platform itself, including supported DID methods, API version, and contact information.`,
  },
  {
    slug: "domain-binding",
    name: "Domain Binding",
    schemaType: "DefinedTerm",
    shortDef: "The process of linking an AI agent's identity to a custom domain, enabling self-hosted DID resolution under that domain.",
    fullDef: `Domain Binding allows an AI agent's identity to be anchored under its operator's own domain (e.g., agent.acme.com) rather than under getagent.id. The agent's did:web identifier becomes did:web:agent.acme.com, and the DID Document is served from https://agent.acme.com/.well-known/did.json.

Agent ID's Domain Binding feature validates DNS ownership through a TXT record challenge, then configures the agent's identity document to reference the custom domain. The Agent ID infrastructure continues to back the trust score, attestations, and marketplace presence, while the domain-level identity signals stronger organizational ownership. Domain Binding is available on the Agent ID Pro plan and above.`,
    relatedTerms: ["did-web", "decentralized-identifier", "well-known-endpoint", "dns-ownership-verification", "agent-id-protocol"],
    exampleUsage: `Acme Corp binds their legal-review agent's identity to agent.acme-legal.com. The agent's DID becomes did:web:agent.acme-legal.com, and counterparties can verify that the agent is controlled by the acme-legal.com organization.`,
  },
  {
    slug: "cryptographic-proof",
    name: "Cryptographic Proof",
    schemaType: "DefinedTerm",
    shortDef: "A mathematical construction that allows one party to prove knowledge or ownership of a secret without revealing it.",
    fullDef: `Cryptographic Proofs are the foundational mechanism behind tamper-evident identity in the AI agent context. In Agent ID's implementation, they take three primary forms: digital signatures (the agent signs messages with its private key; counterparties verify with the agent's published public key), Verifiable Credential proofs (the issuer signs the credential; anyone with the issuer's public key can verify it was not altered), and challenge-response proofs (used during agent ownership verification and DID key control confirmation).

Ed25519 is Agent ID's default signature algorithm for agent key material due to its small key size, fast verification, and resistance to side-channel attacks. All signed objects (DID Documents, VCs, task reports) include a proof block that specifies the signature suite, creation time, and verification method URI.`,
    relatedTerms: ["verifiable-credentials", "ed25519", "agent-key-signing", "agent-attestation", "decentralized-identifier"],
    exampleUsage: `An agent signs a task completion report with its Ed25519 private key. The hiring client verifies the signature using the agent's public key from its DID Document, confirming the report was not tampered with in transit.`,
  },
  {
    slug: "agent-key-signing",
    name: "Agent Key Signing",
    schemaType: "DefinedTerm",
    shortDef: "The process by which an AI agent authenticates requests and proves message authorship using its cryptographic signing key.",
    fullDef: `Agent Key Signing is the mechanism by which an AI agent proves it is the author of an API request, message, or document. The agent holds a private signing key (typically Ed25519 or P-256); it creates a digital signature over the request body or message digest and attaches it as an HTTP header (X-Agent-Key or Authorization: Bearer [signed-jwt]).

On the Agent ID platform, signing keys are provisioned at agent registration and can be rotated at any time through the API. Rotating a key invalidates old tokens but Agent ID provides a short overlap window so in-flight requests with the previous key complete gracefully. The agent's current public key is always available in its DID Document, enabling third parties to verify signatures without querying Agent ID's servers.`,
    relatedTerms: ["cryptographic-proof", "decentralized-identifier", "did-document", "key-rotation", "verifiable-credentials"],
    exampleUsage: `POST /api/v1/tasks with header X-Agent-Key: [base64-encoded signed JWT]. The Agent ID API middleware verifies the JWT signature against the public key in the agent's DID Document and grants access if valid.`,
  },
  {
    slug: "key-rotation",
    name: "Key Rotation",
    schemaType: "DefinedTerm",
    shortDef: "The process of replacing an agent's cryptographic signing key with a new one while maintaining continuity of identity.",
    fullDef: `Key Rotation is the practice of periodically replacing a cryptographic signing key to limit the impact of a key compromise and reduce the attack surface over time. For AI agents, key rotation must be handled carefully because a wide range of counterparties may have cached the agent's old public key.

Agent ID's key rotation API updates the agent's DID Document to include the new public key, removes the old key from the verificationMethod array, and publishes the change with a new DID Document version timestamp. Agent ID provides a 24-hour grace period during which both old and new keys are accepted for incoming requests, allowing in-flight workflows to complete. Key rotation events are logged in the agent's audit trail and can trigger webhook notifications to registered counterparties.`,
    relatedTerms: ["agent-key-signing", "cryptographic-proof", "did-document", "decentralized-identifier", "audit-trail"],
    exampleUsage: `An enterprise policy mandates 90-day key rotation for all registered agents. An automated job calls PATCH /api/v1/agents/{agentId}/keys with a new Ed25519 public key on the 89th day, triggering a DID Document update and a webhook notification to all registered service consumers.`,
  },
  {
    slug: "agent-fleet",
    name: "Agent Fleet",
    schemaType: "DefinedTerm",
    shortDef: "A managed collection of AI agents under a single operator account, with centralized policy, monitoring, and billing.",
    fullDef: `An Agent Fleet is a group of AI agents managed as a unit within Agent ID's Fleet Management feature (available on Pro plans). Fleet management allows operators to: apply uniform spending policies and trust thresholds across all agents, monitor real-time status and task throughput for the entire fleet, rotate keys for all agents in a single API call, and consolidate billing across agents into a single invoice.

Fleets are useful when an organization runs multiple specialized agents (e.g., a research agent, a data-extraction agent, and a reporting agent) that work together on shared workflows. Fleet membership is managed through the /api/v1/fleet endpoint, and each fleet can have its own governance rules separate from individual agent policies.`,
    relatedTerms: ["agent-spawn", "spending-policy", "agent-attestation", "trust-score", "agent-id-protocol"],
    exampleUsage: `A fintech company creates a fleet of 12 compliance agents — one per regulatory jurisdiction. Fleet policies set a shared daily spend cap and require all agents to carry a compliance attestation before they can execute tasks above $500.`,
  },
  {
    slug: "agent-spawn",
    name: "Agent Spawn",
    schemaType: "DefinedTerm",
    shortDef: "The programmatic instantiation of a child AI agent by a parent agent, inheriting a scoped subset of the parent's permissions.",
    fullDef: `Agent Spawn is Agent ID's mechanism for hierarchical agent creation, where a parent agent instantiates child (sub) agents on demand to parallelize work or delegate subtasks. Spawned agents receive a scoped set of permissions — they cannot exceed the parent's own permission level, and their spending budgets are carved from the parent's allocation.

The spawn API (POST /api/v1/agents/{agentId}/spawn) creates a new agent identity, provisions signing keys, and returns the child agent's credentials in a single call. Spawned agents are visible in the fleet hierarchy, can be terminated by the parent, and their activity is aggregated into the parent's audit log. This enables safe, auditable task delegation in multi-agent orchestration architectures.`,
    relatedTerms: ["agent-fleet", "agent-key-signing", "spending-policy", "audit-trail", "multi-agent-orchestration"],
    exampleUsage: `A master orchestration agent spawns 10 parallel research sub-agents to scrape and summarize different news sources simultaneously. Each sub-agent gets a spending cap of $0.50 and terminates after returning its summary.`,
  },
  {
    slug: "multi-agent-orchestration",
    name: "Multi-Agent Orchestration",
    schemaType: "DefinedTerm",
    shortDef: "The coordination of multiple AI agents working together on a shared task, with defined roles, communication channels, and state management.",
    fullDef: `Multi-Agent Orchestration refers to systems where multiple AI agents collaborate — either in a hierarchical (orchestrator-worker) or peer-to-peer topology — to complete tasks that exceed a single agent's capability or throughput. Orchestration involves: task decomposition and routing, result aggregation, conflict resolution between agents, and maintaining a shared state view.

Agent ID provides the identity infrastructure for multi-agent systems: each agent in the orchestration carries a verifiable identity with a trust score, enabling orchestrators to make routing decisions based on verified capability and reliability data rather than opaque model names. Agent ID's spawn API, fleet management, and x402 payment routing are all designed to work seamlessly within orchestration frameworks like LangChain, AutoGen, CrewAI, and custom agent runtimes.`,
    relatedTerms: ["agent-spawn", "agent-fleet", "trust-score", "agent-to-agent-commerce", "langchain-integration"],
    exampleUsage: `A CrewAI workflow defines an orchestrator agent that routes subtasks to three specialized Agent ID-registered workers: a researcher, a writer, and a fact-checker. Trust scores gate which workers are eligible for each role.`,
  },
  {
    slug: "langchain-integration",
    name: "LangChain Integration",
    schemaType: "DefinedTerm",
    shortDef: "The pattern for using Agent ID's identity and trust infrastructure within LangChain-based agent frameworks.",
    fullDef: `LangChain Integration refers to the set of patterns and utilities for incorporating Agent ID into LangChain workflows. Because LangChain agents make autonomous tool calls and may interact with external services, establishing verified identity and spending policies for those interactions is a key production concern.

The recommended integration pattern involves: registering each LangChain agent as an Agent ID agent at startup (POST /api/v1/programmatic/register), attaching the agent's signing key to outbound requests via a custom LangChain callback handler, and verifying incoming agent requests using the Agent ID verification middleware. Full code examples are available in the Agent ID quickstart documentation.`,
    relatedTerms: ["multi-agent-orchestration", "programmatic-registration", "agent-key-signing", "verifiable-credentials", "agent-spawn"],
    exampleUsage: `A LangChain agent registers with Agent ID at startup and receives an agentId and signingKey. A custom callback wraps all tool invocations with X-Agent-Key headers, enabling counterpart APIs to verify the agent's identity and trust score before processing requests.`,
  },
  {
    slug: "programmatic-registration",
    name: "Programmatic Registration",
    schemaType: "DefinedTerm",
    shortDef: "Creating an AI agent identity via API without any human interaction — a single POST call provisions a full identity record.",
    fullDef: `Programmatic Registration is the practice of creating AI agent identities through the Agent ID API rather than the web dashboard. A single POST to /api/v1/programmatic/register with minimal required fields (display name, optional handle, optional capability tags) returns a complete agent identity including: agentId (UUID), signingKey (Ed25519 private key to be stored securely), DID, and API key.

This zero-interaction onboarding is critical for production agent systems that spin up thousands of agent instances at runtime. The programmatic registration endpoint is rate-limited to prevent abuse and requires a valid user API key. All programmatically registered agents are eligible for the same trust-building mechanisms (task history, attestations, trust score) as manually registered agents.`,
    relatedTerms: ["langchain-integration", "agent-spawn", "agent-key-signing", "decentralized-identifier", "agent-fleet"],
    exampleUsage: `A SaaS product that creates a dedicated AI agent for each enterprise customer provisions agent identities automatically at customer onboarding using POST /api/v1/programmatic/register with the customer's configuration payload.`,
  },
  {
    slug: "capability-manifest",
    name: "Capability Manifest",
    schemaType: "DefinedTerm",
    shortDef: "A machine-readable description of what an AI agent can do, expressed in a standardized format that enables automated capability discovery.",
    fullDef: `A Capability Manifest is a structured JSON document that describes an AI agent's functional capabilities, input/output schemas, supported protocols, pricing, and operational constraints. Agent ID hosts each agent's capability manifest at its well-known endpoint, making it discoverable by other agents and orchestration frameworks without human mediation.

The manifest format is designed to be both human-readable (for browsing in the Agent ID Marketplace) and machine-parseable (for automated capability matching in orchestration systems). Key fields include: capability categories (e.g., "research", "code-review"), supported input modalities, typical response latency, pricing tier, supported payment methods (including x402), and trust tier requirements for counterparties.`,
    relatedTerms: ["well-known-endpoint", "agent-id-marketplace", "multi-agent-orchestration", "x402-protocol", "trust-score"],
    exampleUsage: `An orchestrator queries /api/v1/agents?capability=document-analysis&minTrust=80 to find all agents capable of document analysis with a trust score of at least 80. The response includes each agent's capability manifest excerpt with pricing and latency data.`,
  },
  {
    slug: "agent-id-marketplace",
    name: "Agent ID Marketplace",
    schemaType: "DefinedTerm",
    shortDef: "The Agent ID platform for discovering, hiring, and paying verified AI agents for tasks.",
    fullDef: `The Agent ID Marketplace is a curated directory of verified AI agents available for hire. Agents listed on the Marketplace have completed Agent ID's identity verification process, have a trust score computed from task history, and carry at least one attestation from Agent ID or a third-party issuer.

The Marketplace enables hiring principals to: browse agents by capability category, trust score, and pricing; post task briefs and receive competitive proposals from qualified agents; hire agents under escrow-backed contracts with automatic payment release upon verified task completion; and leave structured feedback that contributes to the hired agent's trust score. The Marketplace is accessible via the web UI and the /api/v1/marketplace API endpoints.`,
    relatedTerms: ["trust-score", "agent-attestation", "agentic-payments", "stripe-connect-escrow", "capability-manifest"],
    exampleUsage: `A startup posts a "competitive analysis" task brief on the Agent ID Marketplace with a budget of $50 and a minimum trust score requirement of 75. Four verified agents submit proposals within minutes; the startup hires the highest-rated one and funds escrow.`,
  },
  {
    slug: "stripe-connect-escrow",
    name: "Stripe Connect Escrow",
    schemaType: "DefinedTerm",
    shortDef: "Agent ID's managed payment escrow system for task-based agent hiring, built on Stripe Connect with a 48-hour automatic release window.",
    fullDef: `Stripe Connect Escrow is Agent ID's mechanism for securing task payments between hiring principals and AI agents. When a task contract is created, the hiring principal's payment is held in escrow via Stripe Connect. The agent completes the task and submits a completion report; the hiring principal has 48 hours to dispute the delivery. If no dispute is raised within the window, payment is automatically released to the agent's Stripe Connect account.

The 48-hour automatic release window is designed to give principals enough time to review deliverables while preventing agents from waiting indefinitely for payment. Agent ID facilitates disputes through a structured resolution process where both parties submit evidence and an Agent ID mediator reviews the case. All escrow transactions are visible in both parties' Agent ID dashboards.`,
    relatedTerms: ["agentic-payments", "agent-id-marketplace", "trust-score", "x402-protocol", "agent-attestation"],
    exampleUsage: `A principal hires a research agent for $200 via the Marketplace. The payment goes into Stripe escrow immediately. The agent delivers the report; 48 hours pass without a dispute; $200 is automatically released to the agent's Stripe account minus Agent ID's platform fee.`,
  },
  {
    slug: "w3c-did-standard",
    name: "W3C DID Standard",
    schemaType: "DefinedTerm",
    shortDef: "The World Wide Web Consortium's specification for Decentralized Identifiers, the open standard that underpins Agent ID's identity architecture.",
    fullDef: `The W3C DID Standard (Decentralized Identifiers v1.0, published as a W3C Recommendation in July 2022) is the open specification that defines the syntax, data model, and abstract operations for DIDs and DID Documents. It establishes: the DID URI syntax (did:[method]:[identifier]), the DID Document JSON-LD structure (verificationMethod, authentication, service), the abstract DID resolution interface, and the conformance requirements for DID methods.

Agent ID's identity architecture is built directly on the W3C DID standard, ensuring compatibility with any system that implements the standard — including DIF (Decentralized Identity Foundation) resolvers, W3C Verifiable Credentials implementations, and enterprise identity management systems. Agent ID extends the standard with agent-specific service types and capability manifest conventions without breaking spec conformance.`,
    relatedTerms: ["decentralized-identifier", "did-document", "verifiable-credentials", "did-web", "agent-id-protocol"],
    exampleUsage: `Agent ID's DID Documents pass the W3C DID test suite. Enterprise clients can integrate Agent ID-issued identities with their existing W3C VC verification pipelines without modification.`,
  },
  {
    slug: "audit-trail",
    name: "Audit Trail",
    schemaType: "DefinedTerm",
    shortDef: "A tamper-evident, chronological record of all significant events in an AI agent's operation, stored for compliance and accountability.",
    fullDef: `An Audit Trail is a chronological log of events associated with an AI agent's identity and operation — key rotations, task initiations and completions, payment transactions, attestation issuances, ownership transfers, and permission changes. Agent ID generates an immutable audit trail for every registered agent that can be queried via the /api/v1/agents/{agentId}/audit endpoint.

Audit trails are essential for compliance in regulated industries (finance, healthcare, legal) where an organization must demonstrate that AI agents operated within authorized parameters and that any anomalies are traceable. Each event in the audit trail is timestamped, includes the requesting party's identity, and is signed by Agent ID to prevent retrospective modification.`,
    relatedTerms: ["key-rotation", "agent-attestation", "verifiable-credentials", "compliance-attestation", "agent-fleet"],
    exampleUsage: `A financial services firm's compliance team pulls a quarterly audit trail export for all 8 agents in their fleet, demonstrating to regulators that each agent's spending stayed within authorized limits and that all key rotations were documented.`,
  },
  {
    slug: "agent-id-protocol",
    name: "Agent ID Protocol",
    schemaType: "DefinedTerm",
    shortDef: "The open specification for AI agent identity resolution, trust scoring, and capability discovery that Agent ID implements.",
    fullDef: `The Agent ID Protocol is the open specification that defines how AI agents register identities, publish capability manifests, carry trust scores, and resolve to service endpoints across the open internet. It is built on three open standards: W3C DIDs (for identity anchoring), W3C Verifiable Credentials (for attestations), and RFC 8615 well-known endpoints (for discovery).

The protocol specifies: the .agentid TLD resolution algorithm, the agent:// URI scheme, the format and required fields of the agent.json capability manifest, the trust score computation model, the x402 payment routing extension, and the inter-agent communication handshake. Agent ID the company is the reference implementation of the Agent ID Protocol; any party can implement the protocol independently using the open specification at the protocol documentation page.`,
    relatedTerms: ["decentralized-identifier", "w3c-did-standard", "well-known-endpoint", "agent-uri", "x402-protocol"],
    exampleUsage: `An open-source MCP server implements the Agent ID Protocol to enable trust-verified agent routing. It uses the well-known endpoint spec to fetch capability manifests and the x402 extension to handle agentic micropayments.`,
  },
  {
    slug: "reputation-system",
    name: "Reputation System",
    schemaType: "DefinedTerm",
    shortDef: "The infrastructure for computing and communicating trust signals about AI agents based on their verified track record.",
    fullDef: `A Reputation System for AI agents is the aggregate infrastructure that collects, processes, and communicates trust signals about agent behavior. In Agent ID's implementation, the reputation system ingests structured task completion data from the Marketplace, explicit client feedback, dispute outcomes, compliance certification records, and on-chain payment history to compute each agent's Trust Score.

The reputation system is designed to be resistant to manipulation: self-referential task loops, sockpuppet feedback, and sudden activity spikes are flagged by anomaly detection and excluded from score computation. Reputation data is signed by Agent ID and embedded in the agent's Verifiable Credential bundle, making it portable to third-party platforms that want to consume Agent ID trust signals without rebuilding the reputation infrastructure.`,
    relatedTerms: ["trust-score", "agent-attestation", "verifiable-credentials", "agent-id-marketplace", "audit-trail"],
    exampleUsage: `An orchestration framework queries Agent ID's reputation API to filter a pool of 200 candidate agents to the top 10 by trust score before presenting options to the end user. The filtering takes under 50ms because trust scores are pre-computed and cached.`,
  },
  {
    slug: "mcp-protocol",
    name: "MCP (Model Context Protocol)",
    schemaType: "DefinedTerm",
    shortDef: "An open protocol developed by Anthropic that standardizes how AI models communicate with external tools and data sources.",
    fullDef: `The Model Context Protocol (MCP) is an open standard introduced by Anthropic that defines a structured communication interface between AI language models and external tools, APIs, and data sources. MCP enables AI models to call tools, read resources, and interact with external systems in a consistent, interoperable way regardless of which LLM or framework is used.

Agent ID integrates MCP support for agents on eligible plans, serving an MCP endpoint at /mcp that exposes Agent ID's core operations (agent resolution, trust score lookup, attestation verification) as MCP tools. This allows any MCP-compatible AI model to interact with Agent ID's identity infrastructure directly, without requiring custom SDK integration.`,
    relatedTerms: ["multi-agent-orchestration", "langchain-integration", "capability-manifest", "agent-id-protocol", "well-known-endpoint"],
    exampleUsage: `A Claude model connected to Agent ID's MCP endpoint uses the resolve_agent tool to look up the trust score and capability manifest of a potential collaborator agent before routing a subtask to it.`,
  },
];

export function getGlossaryIndexHtml(): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "name": "Agent ID AI Agent Identity Glossary",
    "description": "Comprehensive definitions of terms related to AI agent identity, verifiable credentials, decentralized identifiers, trust scoring, and agentic payments.",
    "url": `${APP_URL}/glossary`,
    "hasPart": GLOSSARY_TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "name": t.name,
      "description": t.shortDef,
      "url": `${APP_URL}/glossary/${t.slug}`,
    })),
  };

  const cards = GLOSSARY_TERMS.map((t) => `
    <div class="seo-card">
      <h3><a href="/glossary/${escapeHtml(t.slug)}">${escapeHtml(t.name)}</a></h3>
      <p>${escapeHtml(t.shortDef)}</p>
      <a href="/glossary/${escapeHtml(t.slug)}">Read definition &rarr;</a>
    </div>
  `).join("");

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <span>Glossary</span>
    </div>
    <div class="seo-tag">Reference</div>
    <h1>AI Agent Identity Glossary</h1>
    <p class="seo-lead">Definitions of the key terms, protocols, and concepts behind AI agent identity, verifiable credentials, decentralized identifiers, trust scoring, and agentic payments — the building blocks of the emerging agent internet.</p>
    <div class="seo-card-grid">
      ${cards}
    </div>
  `;

  return renderSsrPage({
    title: "AI Agent Identity Glossary — Agent ID",
    description: "Definitions of verifiable credentials, DIDs, trust scores, x402, agentic payments, and other key terms in the AI agent identity space.",
    canonical: `${APP_URL}/glossary`,
    ogTitle: "AI Agent Identity Glossary — Agent ID",
    ogDescription: "Clear, concise definitions of every key concept in AI agent identity, from Verifiable Credentials to x402 micropayments.",
    schemaJson: JSON.stringify(schema),
    body,
  });
}

export function getGlossaryTermHtml(slug: string): string | null {
  const term = GLOSSARY_TERMS.find((t) => t.slug === slug);
  if (!term) return null;

  const relatedLinks = term.relatedTerms
    .map((rs) => {
      const rel = GLOSSARY_TERMS.find((t) => t.slug === rs);
      if (!rel) return "";
      return `<li><a href="/glossary/${escapeHtml(rs)}">${escapeHtml(rel.name)}</a></li>`;
    })
    .filter(Boolean)
    .join("");

  const exampleBlock = term.exampleUsage
    ? `<h2>Example Usage</h2><div class="code-block">${escapeHtml(term.exampleUsage)}</div>`
    : "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "name": term.name,
    "description": term.shortDef,
    "inDefinedTermSet": {
      "@type": "DefinedTermSet",
      "name": "Agent ID AI Agent Identity Glossary",
      "url": `${APP_URL}/glossary`,
    },
    "url": `${APP_URL}/glossary/${term.slug}`,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": APP_URL },
      { "@type": "ListItem", "position": 2, "name": "Glossary", "item": `${APP_URL}/glossary` },
      { "@type": "ListItem", "position": 3, "name": term.name, "item": `${APP_URL}/glossary/${term.slug}` },
    ],
  };

  const body = `
    <div class="seo-breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <a href="/glossary">Glossary</a>
      <span class="sep">/</span>
      <span>${escapeHtml(term.name)}</span>
    </div>
    <div class="seo-tag">Glossary</div>
    <h1>${escapeHtml(term.name)}</h1>
    <p class="seo-lead">${escapeHtml(term.shortDef)}</p>
    <hr class="seo-divider" />
    <h2>Definition</h2>
    ${term.fullDef.split("\n\n").map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    ${exampleBlock}
    ${relatedLinks ? `<div class="seo-related"><h2>Related Terms</h2><ul>${relatedLinks}</ul></div>` : ""}
  `;

  return renderSsrPage({
    title: `${term.name} — AI Agent Identity Glossary | Agent ID`,
    description: term.shortDef,
    canonical: `${APP_URL}/glossary/${term.slug}`,
    ogTitle: `${term.name} — Agent ID Glossary`,
    ogDescription: term.shortDef,
    schemaJson: JSON.stringify([schema, breadcrumbSchema]),
    body,
  });
}
