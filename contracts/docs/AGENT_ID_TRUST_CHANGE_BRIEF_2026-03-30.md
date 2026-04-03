# Agent ID Trust Launch Change Brief

Local-only planning artifact. This file is intentionally separate from the `Agent-ID-Trust` repository.

Date: March 30, 2026

This brief captures the launch architecture decisions that supersede the current mixed model.

## Executive summary

Agent ID should launch as a single global identity and trust system with optional chain anchors, not as a chain-native identity system with duplicated truth across networks.

The control plane remains the canonical source of:

- identity
- verification
- trust
- revocation
- handle lifecycle

The blockchain layer provides:

- portability
- discoverability
- ownership evidence
- anchor records

## What changed

### Before

- The product mixed a DB-first identity model with partially separate on-chain flows.
- Base integration was split between:
  - a simple ERC-721 handle NFT path
  - an unfinished registrar path
- Public identity outputs mixed `did:agentid:*` and `did:web:*`.
- Off-chain Stripe reservations and later on-chain claims were not formalized as a single signed claim flow.
- Handle expiry and reuse logic was acceptable for a DB alias model but risky for anchored identity if reused without versioning.

### Now

- Canonical trust and identity remain API + DB first.
- One permanent machine identity becomes the primary external identity.
- `did:web` becomes the launch-grade interoperable DID.
- Handles are paid aliases, not the permanent identity primitive.
- Base becomes the first anchor chain using the registrar model.
- Tron and other chains resolve through linked accounts and chain presence.
- Stripe / no-wallet users reserve handles off-chain and claim later through a signed claim ticket.
- Crypto users can reserve and anchor immediately.
- One namespace serves all chains.
- One launch on-chain path replaces the split Base integration.

## Launch architecture

### Canonical identity

- Permanent UUID identity
- Stable `did:web`
- Public identity document
- Signed VC subject based on the stable DID

### Handle model

- Human-readable alias
- Expiring and renewable
- Can be reserved before anchoring
- Must not be silently reused once anchored unless explicit versioning exists

### Chain model

- Base:
  - primary anchor chain
  - registrar contract
  - custody and claim support
- Tron:
  - linked-account resolution on day one
  - optional native anchoring later
- Other chains:
  - same identity object, additional bindings

## Why this is the correct enterprise approach

This preserves:

- interoperability
- stable machine identity
- cross-chain portability
- centralized safety controls for trust and revocation
- future decentralization options

without forcing launch-day trust, payments, and handle lifecycle to depend entirely on smart contracts.

## Required engineering moves

1. Standardize external identity on stable `did:web`.
2. Unify Base integration to the registrar path.
3. Remove or deactivate the legacy simple handle mint path as the primary launch flow.
4. Implement signed reservation claim tickets.
5. Prevent ambiguous handle reuse for anchored identities.
6. Update resolver, well-known routes, and VC issuance to reflect the permanent DID plus alias model.

## Non-goals for launch

- Full native handle minting on every chain
- On-chain reputation as the canonical trust score
- A brand-new custom DID method as the primary public DID
- Decentralized canonical resolution replacing the API before launch

## Go-live statement

At launch, Agent ID should truthfully present itself as:

"A global identity and trust control plane for agents, with interoperable `did:web` identity, verifiable credentials, multi-chain account resolution, and optional on-chain handle anchoring starting on Base."

