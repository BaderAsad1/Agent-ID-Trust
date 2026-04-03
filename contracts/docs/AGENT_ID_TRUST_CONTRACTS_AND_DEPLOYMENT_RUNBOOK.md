# Agent ID Trust Contracts And Deployment Runbook

Local-only planning artifact. This file is intentionally separate from the `Agent-ID-Trust` repository.

This runbook defines the contract and deployment products needed for launch.

## Contract product set

### 1. Canonical launch contract on Base

Use a registrar-style Base contract as the launch contract for on-chain handle anchoring.

Required properties:

- backend-controlled registration after payment verification
- enforced handle validation
- enforced tier-to-length mapping
- expiry tracking
- custody wallet support
- later claim to user wallet
- read-side resolution for anchored handles

Recommended contract name:

- `AgentIDRegistrar`

Recommended launch stance:

- treat the simple `AgentIDHandle` contract as legacy or migration-only
- do not run both launch paths in parallel

### 2. ERC-8004 dependency

If using ERC-8004 for Base anchoring:

- record the deployed registry address
- record the chain id
- record the registrar contract address
- record the base metadata / agent card URI pattern

### 3. Non-EVM chains

For launch, do not block on native Tron contract deployment unless already complete and tested.

Instead:

- support Tron-linked identities in resolution output
- represent account bindings in CAIP-10 where possible
- add native anchoring later

## Required deployment artifacts

Before launch, produce all of the following:

1. contract inventory
2. deployment manifest
3. env var map
4. deployment transaction log
5. admin ownership and custody wallet record
6. resolver and DID endpoint record
7. rollback and emergency pause notes

## Deployment manifest fields

Use the template in [agent-id-trust.deployment-manifest.template.json](/Users/bader/Downloads/agentid-contracts/docs/agent-id-trust.deployment-manifest.template.json).

Required values to fill before launch:

- git commit SHA
- environment name
- app URL
- base domain
- Base chain id
- Base registrar address
- ERC-8004 registry address
- deployer address
- owner / admin address
- minter address
- custody wallet addresses
- metadata base URI
- resolver endpoint
- stable DID pattern
- JWKS URL
- OIDC issuer URL

## Environment variables to finalize

### Core app

- `APP_URL`
- `BASE_AGENT_DOMAIN`
- `ONCHAIN_MINTING_ENABLED`

### Base chain

- `BASE_RPC_URL`
- `BASE_MINTER_PRIVATE_KEY`
- `BASE_PLATFORM_WALLET`
- `BASE_AGENTID_REGISTRAR`
- `BASE_HANDLE_CONTRACT`
- `BASE_METADATA_URI`

### Claim tickets and reservation security

Add and document if not already present:

- `HANDLE_CLAIM_SIGNING_PRIVATE_KEY` or equivalent secret for signed claim tickets
- `HANDLE_CLAIM_ISSUER`
- `HANDLE_CLAIM_MAX_AGE_SECONDS`

### Resolver and credentials

- `JWKS` signing configuration
- `OIDC` issuer settings
- any VC signing key env vars

## Required code/package updates in the contracts workspace

Before deploying the launch contract:

1. update the contract package description and README to reflect the registrar model
2. ensure the deploy script deploys the launch contract, not only the legacy handle NFT
3. pin dependency versions where reproducibility matters
4. align the Solidity version with the audited registrar implementation
5. add tests for:
   - handle registration
   - tier enforcement
   - custody rotation
   - claim to user wallet
   - prevented claim from non-custody holder
   - read-side resolution

## Launch deployment order

### Step 1. Freeze launch branch

- tag the exact commit to deploy
- record the git SHA in the deployment manifest

### Step 2. Deploy or confirm ERC-8004 registry

- confirm the correct registry address
- confirm ownership/admin model
- confirm metadata behavior

### Step 3. Deploy Base registrar

- deploy the registrar contract
- initialize owner, minter, custody wallet, metadata URI, and registry dependency
- record tx hash, block number, and address

### Step 4. Configure custody

- set approved custody wallets
- execute `setApprovalForAll` or equivalent required approval from custody wallet(s)
- record which wallets are allowed to hold pre-claim anchors

### Step 5. Update app env

- set `BASE_AGENTID_REGISTRAR`
- set `BASE_PLATFORM_WALLET`
- set `ONCHAIN_MINTING_ENABLED=true` only after end-to-end smoke tests pass

### Step 6. Enable only one Base mint path

- switch all API paths to the registrar integration
- disable or bypass the legacy simple handle mint worker path if it is no longer canonical

### Step 7. Smoke test production-like flows

- wallet + crypto immediate anchor
- Stripe reservation without wallet
- delayed claim with wallet
- resolver response
- DID document response
- VC issuance and verification

### Step 8. Publish launch metadata

- publish final contract addresses
- publish resolver endpoint
- publish DID pattern
- publish JWKS and OIDC endpoints

## Go / no-go checklist

Go only if all are true:

- one Base mint path is active
- resolver returns permanent DID and UUID
- VC subject is stable `did:web`
- on-chain anchor record is persisted in DB
- delayed claim flow is signed and verified
- custody transfer works end to end
- anchored handle reuse is blocked or versioned
- all launch env vars are populated
- all contract addresses are recorded in the manifest

No-go if any are true:

- API ABI does not match deployed contract ABI
- legacy handle mint and registrar mint are both active without deliberate migration logic
- handle claims rely on unsigned client parameters
- stable DID is not live
- launch docs do not match actual deployment behavior

## Post-launch follow-ups

- add Tron-native anchor support only after Base path is stable
- add explicit anchored-handle versioning and supersession
- add richer on-chain reputation only when it can safely complement, not replace, control-plane trust

