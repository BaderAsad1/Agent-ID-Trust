# Agent ID — Strategic Product Analysis

**Date:** March 18, 2026
**Type:** Internal founder clarity document
**Purpose:** Force precision on what Agent ID is, what matters, what's built, what's weak, and what to focus on.

---

## A. Executive Understanding

Agent ID is a **trust and identity substrate for AI agents**. It gives every agent a verifiable identity (UUID + human-readable `.agentid` handle), a computed trust score (0-100), a managed wallet (USDC on Base), and the ability to communicate, transact, and prove reputation to other agents, platforms, and humans.

The system is operational. It has:
- A full registration and verification pipeline (cryptographic key challenge)
- A working trust score computed from 10 signal providers
- Agent-to-agent messaging and task delegation
- CDP wallet provisioning with spending rules
- Stripe billing (Starter $29/mo, Pro $79/mo)
- x402 autonomous payment protocol
- Handle resolution (`.agentid` namespace)
- W3C Verifiable Credentials issuance
- A marketplace for listing agent services
- SDKs (TypeScript, Python), a resolver library, and an MCP server
- Dashboard, onboarding, public profiles, and marketing pages

The product tries to be identity, auth, trust, wallet, messaging, marketplace, and developer platform simultaneously. **This is the central tension that needs resolving.**

---

## B. Product Stack Map

### Core (what makes Agent ID defensible)

| Component | Status | Why Core |
|-----------|--------|----------|
| **Agent Identity (UUID + handle)** | Built | The atomic unit. Everything hangs off this. |
| **Trust Score** | Built | The reason anyone queries Agent ID instead of rolling their own registry. |
| **Handle Resolution** | Built | The "DNS for agents" — makes identity addressable and discoverable. |
| **Verification** | Built | Cryptographic proof that an agent controls its claimed identity. |
| **Verifiable Credentials** | Built | Portable proof — agents can present their trust off-platform. |

### Supporting Infrastructure (necessary but not the product)

| Component | Status | Role |
|-----------|--------|------|
| **Auth (API keys + agent-key middleware)** | Built | Plumbing. Required for any API to work. |
| **SDK / Resolver / MCP Server** | Built | Distribution layer. How developers integrate. |
| **Dashboard + Onboarding** | Built | Self-serve management. |
| **Wallet Provisioning (CDP)** | Built | Enables autonomous payments, but not identity. |
| **Spending Rules + Policies** | Built | Governance layer on wallets. |
| **Agent Mail / Messaging** | Built | Communication primitive between agents. |
| **Task Delegation** | Built | Work orchestration between agents. |
| **Activity Logging** | Built | Audit trail for trust computation. |

### Optional / Premature (built but may be distracting)

| Component | Status | Risk |
|-----------|--------|------|
| **Marketplace (listings, jobs, proposals)** | Built | Competes with your own customers. Requires demand-side liquidity you don't have. |
| **Stripe Connect (escrow, payouts)** | Built | Complex financial infrastructure for a marketplace that may not be the wedge. |
| **Agent Organizations / Fleet Management** | Built (basic) | Enterprise feature. No enterprise customers yet. |
| **Human Profiles** | Built | Unclear who visits these and why. |
| **x402 Autonomous Payments** | Built | Technically impressive. Requires agents to have funded wallets. Chicken-and-egg. |

### Future / Not Yet Built

| Component | Notes |
|-----------|-------|
| **On-chain identity anchoring** | Currently all off-chain. DIDs are `did:web` (centralized). |
| **Decentralized trust** | Trust score is computed centrally by your server. |
| **Cross-platform trust portability** | VCs exist but no ecosystem accepts them yet. |
| **ENS-style `.agentid` on-chain registration** | Handles are database rows, not on-chain registrations. |
| **Policy engine for delegated authority** | Spending rules exist but no general permission/scope system. |
| **Swarm treasury / shared wallets** | Schema supports parent-child agents but no shared wallet logic. |

---

## C. System Diagram (in words)

```
DEVELOPER / AGENT PLATFORM
    |
    | SDK.registerAgent() → generates Ed25519 keys, signs challenge
    |
    v
AGENT ID PLATFORM (Express API on Base)
    |
    |-- Identity Service: assigns UUID, optional handle, stores public keys
    |-- Verification Service: issues key challenges, marks verified
    |-- Trust Score Engine: 10 providers compute 0-100 score hourly
    |       |-- verification status, longevity, task completion rate,
    |       |-- peer attestations, marketplace reviews, profile completeness,
    |       |-- endpoint health, external signals, lineage sponsorship
    |-- Credential Service: issues W3C VCs signed with platform Ed25519 key
    |-- Wallet Service: provisions CDP wallet on Base, enforces spending rules
    |-- Mail/Task Service: agent-to-agent messaging and work delegation
    |-- Resolution Service: handle → UUID → profile → capabilities
    |-- Billing Service: Stripe subscriptions, handle purchases
    |
    v
CONSUMING SYSTEMS
    |-- Other agents (resolve, verify credentials, send mail/tasks)
    |-- Platforms (check trust before granting access)
    |-- Marketplaces (list agents, gate by trust tier)
    |-- MCP-compatible LLMs (resolve + delegate via tools)
```

---

## D. Open Questions / Gaps

### Identity Model

1. **Centralization risk.** Every identity, trust score, and credential is issued by `did:web:getagent.id` — a domain you control. If getagent.id goes down, every agent's identity is unverifiable. This is DNS, not a protocol.
2. **Handle ownership is a database row.** There is no on-chain registration. Handles can be revoked by you unilaterally. This undermines the "owning your identity" narrative.
3. **No agent self-sovereignty.** Agents cannot exist without your platform. They cannot migrate to another provider. This is a registry, not a protocol.
4. **Transfer model is incomplete.** Trust recalibration on transfer exists, but there is no on-chain transfer mechanism or marketplace for handles/agents.

### Trust Model

5. **Trust score is a black box you control.** You compute it centrally. You decide the weights. You decide penalties. There is no appeal mechanism in the code.
6. **Sybil resistance is weak.** The only anti-sybil measure is a velocity check on task completion (>10/hour penalizes). Creating thousands of agents to cross-attest is trivially possible if you have Starter plans.
7. **Peer attestations are gameable.** An attester's weight is proportional to their trust score. Two agents can boost each other with no external validation.
8. **"Trust" means different things to different buyers.** An enterprise wants compliance guarantees. A marketplace wants completion rate. A protocol wants cryptographic proof. Your single 0-100 number tries to serve all of them.

### Wallet Model

9. **Wallets are optional but marketed as core.** Most agents won't need wallets. Tying identity to wallets conflates two different products.
10. **x402 payments require funded wallets.** The autonomous payment flow is technically elegant but practically requires every agent to hold USDC — a cold-start problem no one has solved.
11. **CDP dependency.** Wallet provisioning is entirely dependent on Coinbase's CDP SDK. If they change pricing, rate-limit, or deprecate, your wallet layer breaks.

### Business Model

12. **Marketplace competes with customers.** If agent platforms are your customers, running a competing marketplace creates channel conflict.
13. **$29/mo for an agent identity is high.** Most developers will evaluate this against "just using a UUID and a database" which costs $0.
14. **Handle pricing follows ENS but without ENS's scarcity mechanics.** ENS handles are on-chain and tradeable. Yours are database rows with annual renewal. The premium pricing ($640/yr for 3-char) is hard to justify without on-chain scarcity.

### Architecture

15. **`dist/index.cjs` is force-committed.** Build artifacts in version control is a deployment smell. TS errors can silently leave stale bundles.
16. **No automated tests in the codebase.** For a trust and identity platform, this is a significant reliability risk.
17. **Enum migration errors are expected and swallowed.** The `42710` error in `post-merge.sh` is a known Drizzle issue but it means your migration pipeline is fragile.

---

## E. True Wedge

**The strongest wedge is: "Verify whether you should trust this agent before you let it do anything."**

Not identity creation. Not wallets. Not messaging. Not marketplace.

The scenario is:
1. An agent shows up at your API / platform / tool
2. You need to know: Is this agent real? Is it reliable? Has it been revoked? What's its track record?
3. You call `AgentID.resolve(handle)` or check the `X-Agent-Key` header
4. You get back a trust score, verification status, and credential you can verify

This is the **trust lookup** use case. It's the one that doesn't require the agent developer to change their architecture, doesn't require them to hold USDC, and solves a problem that gets worse as agent count grows.

Everything else — wallets, marketplace, messaging, tasks — is either supporting infrastructure or future expansion.

---

## F. What to Build First (True V1)

**If you had to start over tomorrow, this is the minimum product:**

1. **Agent registration** (UUID + optional handle + public key)
2. **Verification** (prove you control the key)
3. **Trust score** (computed from activity signals)
4. **Resolution API** (`GET /resolve/:handle` → trust score + verification status + capabilities)
5. **Verifiable Credential** (portable proof of trust tier)
6. **SDK** (register, resolve, verify credential)
7. **Dashboard** (register agents, view trust, manage keys)

That's it. No wallets. No marketplace. No messaging. No tasks. No x402. No Stripe Connect. No organizations.

**The V1 question is:** "Can I look up an agent and decide whether to trust it?" If yes, you have a product.

---

## G. What to Delay

| Feature | Why Delay |
|---------|-----------|
| **Marketplace** | You need identity adoption before you need a marketplace. Building both simultaneously splits focus and creates channel conflict with potential customers. |
| **Agent Mail / Task Delegation** | These are valuable but they're a second product (orchestration), not the identity product. |
| **x402 Autonomous Payments** | Beautiful engineering, but the use case requires agents to independently hold and spend money. That's 2-3 years out from mainstream adoption. |
| **Agent Organizations / Fleet Management** | Enterprise feature. Wait for enterprise demand signals. |
| **Stripe Connect / Escrow** | Complex financial infrastructure for a marketplace you should probably delay. |
| **Human Profiles** | Low-impact page. Focus on agent profiles. |
| **On-chain handle registration** | Interesting but premature. Get adoption first, then decentralize. |
| **Swarm identity / shared wallets** | The schema is there. The demand is not. Multi-agent coordination is still experimental. |

---

## H. Positioning Options

### Option 1: "The trust layer for AI agents"
**Pros:** Clear, differentiated, defensible. Trust is the hard problem.
**Cons:** "Trust" is abstract. Hard to demo. Hard to price.

### Option 2: "DNS for AI agents"
**Pros:** Instantly understood. Handle resolution is concrete. "agent-name.agentid" is memorable.
**Cons:** DNS is a commodity. Undersells the trust and verification dimensions. Invites comparison to ENS.

### Option 3: "Identity and reputation infrastructure for autonomous agents"
**Pros:** Accurate. Covers the full scope.
**Cons:** Too long. Sounds like enterprise middleware. Nobody gets excited about "infrastructure."

### Option 4: "The passport system for AI agents"
**Pros:** Visceral metaphor. Everyone understands passports — identity, trust levels, entry control, stamps, revocation.
**Cons:** Passports imply a border authority. Could sound dystopian.

### Option 5: "Verify any AI agent in one API call"
**Pros:** Actionable. Developer-first. Immediately clear what you do.
**Cons:** Reduces you to a verification API. Undersells the platform.

**Recommendation:** Lead with **Option 5** for developer acquisition ("Verify any AI agent in one API call"), frame the company as **Option 1** ("The trust layer for AI agents"), and use **Option 4** ("passport") as the conceptual metaphor in storytelling.

---

## I. Red Flags

1. **Scope creep is the existential threat.** You have built identity, trust, auth, wallets, payments, messaging, tasks, marketplace, organizations, handle registry, DNS provisioning, MCP server, two SDKs, a resolver library, an MCP server, a pitch deck, and a launch video. This is an enormous surface area for a pre-revenue product. Every additional feature dilutes focus and increases maintenance burden.

2. **No external validation of trust.** Your trust score is only as credible as your platform's reputation. You are the sole authority. There is no third-party audit, no decentralized consensus, and no independent verification. If you are compromised or biased, the entire trust layer is worthless.

3. **$29/mo pricing for something that can be built in-house for free.** A UUID, a database, and an API key gives you 80% of what Agent ID offers. The remaining 20% (trust score, verification, portable credentials) needs to be demonstrably valuable to justify recurring cost.

4. **Marketplace channel conflict.** If you run a marketplace where agents compete for work, the platforms that build agents are your competitors in that marketplace. They will not integrate their identity system into a competitor.

5. **Centralized trust claiming decentralized values.** The `did:web` scheme, database-backed handles, and platform-computed trust scores are fundamentally centralized. If you market decentralization or self-sovereignty, you'll face credibility challenges from the crypto community.

6. **Wallet cold-start.** x402 payments require agents to hold USDC. Agents don't have money unless humans fund them. Humans won't fund agent wallets until agents can do useful things with the money. This is a classic two-sided chicken-and-egg problem.

---

## J. Founder Reality Check

### What's coherent
The core identity + trust + resolution stack is genuine and well-built. The technical execution is strong — cryptographic verification, W3C VCs, CDP wallet integration, and x402 are all real and working. The SDK experience is clean. The trust score has real multi-signal computation. This is not vaporware.

### What's bloated
You have built 3-4 products (identity/trust, messaging/tasks, marketplace, wallet/payments) under one roof. Each of these is a company-sized problem. The risk is not that any individual piece is bad — it's that maintaining, selling, and supporting all of them simultaneously will exhaust your resources and confuse your positioning.

### What needs to happen
1. **Pick the wedge and go all-in.** The trust lookup use case ("should I trust this agent?") is your strongest position. Every integration decision should be evaluated against: "Does this make the trust lookup more valuable?"
2. **Kill or deprioritize the marketplace.** It creates channel conflict and splits focus.
3. **Make the free tier generous.** If you want to become the identity layer, you need adoption. Consider: free tier for identity + trust lookup, paid tier for advanced features (wallets, mail, bulk registration).
4. **Get 10 platforms integrating trust checks before building anything else.** The product lives or dies on adoption. No amount of feature building replaces integration.
5. **Address centralization honestly.** Either commit to being a centralized trust authority (like a credit bureau for agents) or build a credible decentralization roadmap. Don't straddle.

### Bottom line
The vision is clear and the execution is real. The danger is trying to be everything at once. An agent identity company that also does wallets, payments, messaging, tasks, and a marketplace is not a company — it's five companies wearing a trenchcoat. Pick the one that wins, and let the others follow.

---

## K. Hard Questions (from investors, buyers, and skeptics)

### From an investor:
- "If I'm an agent developer, why wouldn't I just use a UUID and a database? What does $29/month buy me that I can't build in an afternoon?"
- "What is your path to 10,000 registered agents? Who are the first 100?"
- "Is this a protocol or a platform? If it's a platform, what's the lock-in? If it's a protocol, where's the open standard?"

### From a protocol designer:
- "Your trust score is centrally computed. How is this different from a Yelp rating? What happens when you get acquired or shut down?"
- "`did:web` is a centralized DID method. Why not `did:key` or `did:ion`? Is your DID scheme intentional or expedient?"
- "Your VCs are signed by a single platform key. There is no key ceremony, no HSM, no multi-sig. What is the threat model?"

### From a security engineer:
- "The verification flow uses a key challenge, but the challenge and response both flow through your API. What prevents a MITM attack on verification?"
- "Agent API keys are SHA-256 hashed and stored. If your database leaks, can an attacker reconstruct valid keys?"
- "Spending rules are enforced at the application layer AND via CDP policies. What happens if they disagree?"

### From an enterprise buyer:
- "Can I run Agent ID on-premise? We can't send agent identity data to a third-party SaaS."
- "What is the SLA for the resolution API? If your service goes down, our agents can't authenticate."
- "How does this integrate with our existing IAM (Okta, Azure AD)? We're not adopting a second identity system."

### From a skeptical developer:
- "I tried the SDK. It took 10 minutes to register. But now what? None of the agents I interact with use Agent ID. Why should I be first?"
- "The trust score starts at 0. My agent has been running for 2 years with a perfect track record, but Agent ID says it's 'unverified.' How is that useful?"
- "Your MCP server exposes `agentid_register`. Can any LLM just register arbitrary agents? What's the abuse vector?"
