# Agent ID Trust Launch Super Prompt

Local-only planning artifact. This file is intentionally separate from the `Agent-ID-Trust` repository.

Use this prompt with a coding agent to implement the April 1, 2026 launch changes in the Agent ID Trust codebase.

## Prompt

You are a senior staff engineer implementing the final launch architecture for Agent ID in the target repository. Work directly in that repo, make the code changes, add tests, and update docs. Do not produce a design-only answer. Ship the implementation.

### Mission

Implement Agent ID as:

- one global Agent ID namespace
- one canonical control plane for trust and identity
- one permanent machine identity per agent
- one paid handle alias that can be claimed later
- one interoperable resolution layer across Base, Tron, and other chains
- Base-first on-chain anchoring using the registrar model
- optional off-chain reservation and delayed claim for Stripe / no-wallet users

### Hard product rules

1. Canonical trust and identity live in the API + database control plane, not on-chain.
2. Handles are aliases. The permanent machine identity is the stable programmatic identity.
3. `did:web` is the primary interoperable DID for launch.
4. `did:agentid:<uuid>` may remain an internal or platform-native identifier, but external VC subjects and public identity docs must standardize on stable `did:web`.
5. On-chain state is an anchor and portability layer, not the only source of truth.
6. There must be a single handle lifecycle across all payment flows.
7. There must be one launch on-chain path, not a split between the simple NFT path and the registrar path.
8. Base launches first as the anchor chain. Tron and other chains resolve through linked accounts and chain presence, even if they do not mint native handle contracts on day one.
9. Anchored handles must not be silently reusable without explicit versioning or supersession logic. For launch, freeze reuse of anchored handles if versioning is not implemented.

### Current repo reality you must preserve where correct

- The repo is already API and DB first.
- `GET /api/v1/resolve/:handle` is currently the authoritative resolution path.
- The repo already exposes `.well-known` discovery, JWKS, OIDC metadata, VCs, and a resolver SDK.
- The repo already distinguishes permanent UUID identity from expiring handle identity in the docs and `llms.txt`.

### Current repo problems you must fix

1. The Base integration is split:
   - billing and crypto payment flows call the registrar path
   - the NFT mint worker still uses the legacy simple `AgentIDHandle` mint flow
2. The registrar ABI expected by the API server does not match the audited registrar contract interface.
3. Public identity and VC subject formats are inconsistent between `did:agentid:*` and `did:web:*`.
4. Off-chain reservation and later claim are not formalized as a first-class signed claim-ticket flow.
5. Handle expiry / rename / reuse behavior is acceptable for a DB-only alias, but unsafe for anchored identity if reused without versioning.

### Required architecture to implement

#### 1. Canonical identity model

Implement a two-layer identity model:

- Permanent machine identity:
  - UUID
  - stable `did:web`
  - never expires
  - used for VC subject, trust, auth, and machine integrations
- Handle alias:
  - human-readable
  - paid
  - expiring
  - can map to the same machine identity while active
  - may be shown in public UX and resolver responses

Where possible, standardize on a path-based `did:web` such as:

- `did:web:getagent.id:agents:<uuid>`
- document location: `https://getagent.id/agents/<uuid>/did.json`

You may support handle-based presentation aliases later, but launch must have a stable DID that does not break when the handle changes or expires.

#### 2. Handle resolution model

Resolution responses must return:

- permanent DID
- UUID
- active handle alias if present
- verification and revocation status
- trust score and tier
- service endpoints
- linked chain accounts in CAIP-10 format
- chain presence and anchor records by chain

The canonical resolver remains the API. On-chain data augments the response and must never overwrite database truth for trust state.

#### 3. Payment and claim flows

Implement two supported paths:

- Wallet + crypto payment:
  - reserve handle
  - perform Base on-chain registration immediately
  - persist returned chain registration data
- Stripe / no wallet:
  - reserve handle off-chain immediately
  - create a signed claim ticket
  - allow later wallet connect and claim
  - user pays gas later
  - backend validates claim ticket and anchors the same reserved handle on Base

Add an explicit reservation status model if needed, for example:

- `available`
- `reserved_offchain`
- `pending_anchor`
- `anchored`
- `active`
- `grace_period`
- `suspended`
- `revoked`

Claim tickets must include:

- reservation id
- agent UUID
- handle
- normalized handle
- expiry / deadline
- nonce
- intended chain
- intended claimant wallet if already known, or support wallet binding at claim time
- signature by server-side signing key

Do not trust unsigned client input for delayed claims.

#### 4. Base contract model

Adopt a single Base-first registrar model.

- Replace the launch-critical reliance on the simple `AgentIDHandle.sol` path.
- Port in the audited registrar-style implementation as the primary Base launch contract.
- Preserve the audited fixes:
  - file-scope metadata structs/interfaces
  - correct storage slot handling
  - enforced tier-to-length mapping
  - custody-wallet allowlist
  - safe `transferToUser()` behavior using current custody owner
  - tests for custody rotation and transfer safety

Implement the correct API adapter for the deployed contract. Do not keep fake ABI compatibility.

If needed, update the contract package to:

- `AgentIDRegistrar.sol`
- matching deploy script
- matching tests
- updated README

The legacy `AgentIDHandle.sol` may be kept only for migration/reference, but it must not remain the active launch flow if the registrar path is the official launch contract.

#### 5. Multi-chain interoperability

For launch:

- Base:
  - full anchor path
  - registrar integration
  - chain presence in resolver output
- Tron:
  - linked accounts and resolution support
  - no need to block launch on Tron-native handle minting
- Other chains:
  - resolve linked accounts and chain metadata through the same canonical identity object

Represent wallet/account bindings in CAIP-10 where possible.

#### 6. DID, VC, and well-known outputs

Make launch outputs standards-clean:

- stable `did:web` identity documents
- JWKS remains live
- VCs use the stable `did:web` subject
- handle aliases may appear as additional claims, not as the sole permanent subject
- keep `.well-known/openid-configuration`
- keep `.well-known/jwks.json`
- keep `.well-known/agentid-configuration`

If existing routes currently return a custom `AgentIdentity` document, ensure a real DID document path also exists and resolves consistently.

#### 7. Handle reuse guardrail

For launch, if a handle was previously anchored on-chain and versioning is not fully implemented, do one of:

- disallow re-registration of anchored handles, or
- mark them non-reusable until explicit supersession/version support exists

Do not launch a state where raw historical on-chain data can plausibly conflict with current identity ownership without a mitigation.

### Files and areas to change

At minimum inspect and update:

- `contracts/AgentIDHandle.sol`
- `contracts/script/deploy.ts`
- `contracts/README.md`
- `contracts/package.json`
- `artifacts/api-server/src/services/chains/base.ts`
- `artifacts/api-server/src/workers/nft-mint.ts`
- `artifacts/api-server/src/services/billing.ts`
- `artifacts/api-server/src/services/reputation.ts`
- `artifacts/api-server/src/routes/well-known.ts`
- `artifacts/api-server/src/services/verifiable-credential.ts`
- `artifacts/api-server/src/services/credentials.ts`
- `artifacts/api-server/src/utils/handle.ts`
- `artifacts/api-server/src/routes/v1/resolve.ts`
- `artifacts/api-server/src/routes/v1/handles.ts`
- `artifacts/api-server/src/workers/handle-lifecycle.ts`
- `.env.example`
- top-level docs that describe launch behavior

### Required outputs

1. Code changes implementing the architecture above.
2. Tests proving:
   - crypto immediate anchor flow works
   - Stripe reservation + delayed claim flow works
   - Base registrar integration ABI matches the deployed contract
   - VC subject is stable `did:web`
   - resolver returns canonical UUID and DID plus chain bindings
   - custody transfer / claim is safe
   - anchored handles are not silently reusable
3. Updated docs:
   - architecture
   - contracts
   - launch and deployment runbook
   - env var documentation
4. A deployment manifest template with placeholders for production values.

### Acceptance criteria

- There is only one active Base on-chain integration path.
- Off-chain and on-chain purchase paths converge to the same identity object and handle state.
- A stable `did:web` exists per agent and is the primary external DID.
- Handle aliases can change or expire without destroying permanent machine identity.
- Resolver output is chain-agnostic and includes CAIP-10-compatible bindings.
- Base anchoring is operational.
- Tron resolution support still works.
- No major contract/API ABI mismatch remains.
- Docs are launch-ready.

### Final response format

When done, provide:

1. summary of implemented changes
2. list of files changed
3. tests run and results
4. deployment steps
5. remaining launch risks

