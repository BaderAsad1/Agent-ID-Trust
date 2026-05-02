# Audit 08 — On-Chain Anchoring, Credentials, and Smart Contract Surface

**Audit ID:** 08
**Date:** 2026-05-02
**Scope:** Off-chain components of the credential and on-chain anchoring system for Agent ID — trust model, key custody, mint/anchor lifecycle, gas accounting, ERC-8004 compliance surface, and recovery paths.
**Out of scope:** Solidity contract audit (`AgentIDRegistrar.sol`, `AgentIDHandle.sol`, ERC-8004 registry); implementing fixes.
**Auditor:** Task #249

---

## 1. Executive Summary

Agent ID anchors handles on Base via a custodial registrar proxy (`AgentIDRegistrar`) and a separate ERC-8004 registry. Identity is dual-rooted: a permanent UUID-based DID (`did:web:getagent.id:agents:<uuid>`) plus an optional, expiring on-chain handle alias. The off-chain portion has been built out to a usable v1.2 surface, but several **systemic risks** make it unfit for production hand-off without remediation:

| # | Severity | Theme | Summary |
|---|----------|-------|---------|
| F1 | **Critical** | Credentials | Two parallel credential systems coexist; the legacy HMAC-signed credential is symmetric (anyone with `CREDENTIAL_SIGNING_SECRET` can forge a "valid" credential), is still emitted, and is verifiable by anyone with the secret. It is not externally verifiable. |
| F2 | **Critical** | Key custody | The on-chain minter (`BASE_MINTER_PRIVATE_KEY`) is a single hot key with no multisig, no rotation procedure, and no documented break-glass. Compromise → unilateral handle issuance, transfer, and release across the entire registrar. |
| F3 | **High** | Anchor worker | Attempt counter increment and `writeContract` are not atomic. A crash between the two writes either skips a retry or, more dangerously, allows a duplicate `registerHandle` submission on the next poll once the in-flight tx has confirmed but the DB has not yet been updated. |
| F4 | **High** | Worker resilience | `nft-transfer-detector` keeps `lastCheckedBlock` only in process memory. A restart resets the cursor to `currentBlock - 1000` and silently skips any HandleTransferred events that occurred in the gap. Secondary sales can be missed → handles never enter dispute window → wrong owner is served on the public profile. |
| F5 | **High** | Gas / funding | No balance monitoring, no low-balance alerting, no automated top-up of the minter wallet. Worker failure mode on empty wallet is a generic revert that consumes attempts and ends in `anchor_failed` after 3 polls (~3 minutes). |
| F6 | **Medium** | Reconciliation | No reconciliation job compares on-chain `resolveHandle` state against `agentsTable.nftStatus`. Drift is permanent unless the agent re-verifies. |
| F7 | **Medium** | Chain selection | Production gating relies entirely on env-var precedence (`BASE_CHAIN_ID` → `IS_TESTNET` → mainnet default). A misconfigured deploy can transparently flip mainnet on with no startup assertion. |
| F8 | **Medium** | ERC-8004 surface | `erc8004Registry` is populated from `BASE_ERC8004_REGISTRY` env at write time only — if the env value changes, historical rows are not updated and the public ERC-8004 URI may point at the wrong registry. |
| F9 | **Low** | Recovery | Claim tokens (`CLAIM_TOKEN_SECRET`) use the same symmetric-HMAC pattern as F1; secret compromise allows minting valid claim URLs for any agent. Tokens are stored hashed and single-use, which limits but does not eliminate impact. |
| F10 | **Low** | VC cache | `vcCache` is a 1-hour in-memory map. Revocation events (`clearVcCache`) only affect the local process; multi-instance deploys will continue serving the stale JWT until expiry. |

The W3C VC JWT path (`vc-signer.ts` / `verifiable-credential.ts`) is well-architected and KMS-ready — it is the recommended path forward. The HMAC credential path (F1) should be deprecated and removed once external consumers cut over.

---

## 2. Surface Inventory

### 2.1 Credential systems (two coexisting)

| System | Source | Algorithm | Key | Verifier requirements | Status |
|--------|--------|-----------|-----|-----------------------|--------|
| **Legacy HMAC credential** | `services/credentials.ts` | HMAC-SHA256 over canonical JSON, embedded in a VC envelope as `proof.signatureValue` with `proof.type = "AgentIDHmacCredential2024"` | `CREDENTIAL_SIGNING_SECRET` (symmetric, env var) | Must hold the shared secret | **Live**; emitted on every `issueCredential` / `reissueCredential` call (e.g. on verify, on key rotation) |
| **W3C VC JWT** | `services/verifiable-credential.ts` + `vc-signer.ts` | EdDSA (Ed25519) compact JWS | `VC_SIGNING_KEY` / `VC_PUBLIC_KEY` (asymmetric JWK, env var; KMS-migration path documented in `vc-signer.ts`) | Public key from JWKS endpoint | **Live**; JWKS published; cached 1h in-memory per agent |

**Risk (F1).** The HMAC system is symmetric. Any party in possession of `CREDENTIAL_SIGNING_SECRET` (every API instance, every backup, every env dump) can mint a valid credential for any agent. It is not externally verifiable — relying parties cannot check it without being given the secret, which would itself defeat the security boundary. The `proof.type` `AgentIDHmacCredential2024` is also not a registered VC proof suite, so any compliant W3C VC verifier will reject these credentials anyway.

**Recommendation.** Mark the HMAC credential as deprecated in API responses, dual-emit during a transition window, then remove. All external integrations should consume the VC JWT (which is asymmetric, cacheable via JWKS, and complies with the W3C VC Data Model 1.1 envelope shape).

### 2.2 Key custody summary

| Key | Purpose | Storage | Rotation | Recovery |
|-----|---------|---------|----------|----------|
| `BASE_MINTER_PRIVATE_KEY` | On-chain signer for `registerHandle`, `reserveHandles`, `transferToUser`, `unreserveHandle`, `releaseHandle` | Plaintext env var, loaded into viem `privateKeyToAccount` on every call (`makeClients` in `chains/base.ts`) | **None documented**; no on-chain `setMinter` flow visible from this codebase | None — single-key hot wallet; loss = unable to anchor or transfer; compromise = full registrar control |
| `VC_SIGNING_KEY` / `VC_PUBLIC_KEY` | Sign/verify Verifiable Credential JWTs | Env var; private key imported transiently per signing call (no module-scope retention); KMS migration documented inline | None implemented; `kid` is read from `VC_KEY_ID` so rotation is feasible by adding a new key + serving multiple JWKS entries, but no operator runbook exists | Falls back to ephemeral key in dev only; production refuses to start without it (`env.ts validateEnv`) |
| `CREDENTIAL_SIGNING_SECRET` | HMAC for legacy credentials (F1) | Env var; cached in module-scope `signingSecret` after first read | None | None — symmetric, no external trust anchor |
| `CLAIM_TOKEN_SECRET` | HMAC over `agentId:apiKeyPrefix:nonce` for one-time claim URLs | Env var | None | Tokens are single-use (DB `isUsed` flag), 7-day expiry, stored hashed |
| Per-agent OWS wallets | Self-custodial agent wallets registered to the agent | CAIP-10 strings in `agentOwsWalletsTable` + JSON blob in `agent_ows_wallet_accounts` | Out of scope — keys are user-held | Out of scope |
| Agent signing keys (`agentKeysTable`) | Per-agent ed25519 (enforced — `agent-keys.ts` rejects all other key types at both create and rotate sites), used for A2A auth | DB column `publicKey` / `jwk`; private key never held by Agent ID | Implemented (`rotateAgentKey`, `initiateKeyRotation` with 24h grace, `verifyKeyRotation`); rotation log table records every transition | `revokeAgentKey` revokes + reissues credential + clears VC cache + invalidates resolution cache |

**Risk (F2).** The minter is a single EOA with no multisig, no signer-rotation runbook, no on-chain quorum. Key compromise gives the attacker the full registrar surface until someone notices and the contract owner re-keys (the `OnlyMinter` custom error in the ABI implies the contract supports a setMinter call, but there is no off-chain plumbing for it).

### 2.3 Smart contract surface (the system *uses*; not audited here)

- **`AgentIDRegistrar` proxy** — `BASE_AGENTID_REGISTRAR`. Testnet proxy `0x1D592A07dF4aFd897D25d348e90389C494034110`. Functions actually called:
  - Writes (minter-only): `registerHandle(string, uint8 tier, uint256 expiresAt)`, `reserveHandles(string[])`, `unreserveHandle(string)`, `transferToUser(string, address)`, `renewHandle(string, uint256)`, `releaseHandle(string)` *(owner-only — see note in `releaseHandleOnChain`)*.
  - Reads: `resolveHandle`, `isHandleAvailable`, `handleActive`, `handleTier`, `handleExpiry`, `handleToAgentId`, `handleRegistered`.
  - Custom errors decoded by viem: `HandleNotRegistered`, `HandleAlreadyRegistered`, `HandleRetired`, `HandleIsReserved`, `HandleTooShort/TooLong/InvalidChars`, `OnlyMinter`, `GracePeriodActive`, `HandleNotInCustody`, `InvalidTier`, `ExpiryMustIncrease`, `ExpiryMustBeInFuture`, `PlatformWalletMustRemainCustodyWallet`, `ZeroAddress`.
- **ERC-8004 registry** — `BASE_ERC8004_REGISTRY`, separate address (testnet `0x8004A818BFB912233c491871b3d84c89A494BD9e`, mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`). Stored on `agentsTable.erc8004Registry` for reference; **not called for any read or write from this codebase**.
- **Legacy `AgentIDHandle.sol` ABI** — kept in `chains/base.ts` for historical reference, but `AGENT_ID_HANDLE_ABI` is exported and re-imported by `nft-transfer-detector.ts`. The detector itself listens on the `AgentIDRegistrar` event signature `HandleTransferred(string, uint256, address, address)` — the legacy ABI import is dead weight that should be removed to reduce confusion.

---

## 3. Trust Model

### 3.1 Identity roots

```
                       ┌──────────────────────────────────────────┐
                       │   Permanent machine identity (always)    │
                       │   did:web:getagent.id:agents:<uuid>      │
                       │   Resolution: HTTPS @ getagent.id        │
                       │   Trust anchor: TLS + JWKS @ getagent.id │
                       └──────────────────────────────────────────┘
                                          │
                                          │ optional alias
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │   Handle alias (paid, expiring)          │
                       │   did:agentid:<handle>                   │
                       │   On-chain: AgentIDRegistrar on Base     │
                       │   Trust anchor: contract owner + minter  │
                       └──────────────────────────────────────────┘
```

The UUID DID is the canonical identifier. The handle is an **alias**, not a replacement, and is explicitly modelled like an ENS name (paid, time-limited, transferrable). The codebase enforces this by always emitting the UUID DID first in bundles and by routing `did:agentid:<handle>` through alias-resolution paths back to the UUID. This is the right call.

### 3.2 Trust dependencies

A relying party verifying an Agent ID claim today depends on, in order of authority:

1. **`getagent.id` TLS + JWKS** (`/.well-known/jwks.json`) — sole asymmetric trust root for VC JWTs. Compromise = arbitrary credential issuance.
2. **`AgentIDRegistrar` contract owner + minter EOA** — sole authority over which on-chain identity holds a handle. Compromise of either = full handle reassignment.
3. **`agentsTable` integrity in the platform DB** — non-anchored agents and trust scores live only in DB. SQL access = full identity rewrite.
4. **`CREDENTIAL_SIGNING_SECRET`** (legacy HMAC; F1) — anyone holding this can issue credentials that the platform's own verifier (`verifyCredentialSignature`) will accept as valid. Not a public trust anchor, but a *platform-wide* one.

There is no mechanism for an agent to revoke or re-anchor itself without operator action, and no way for a relying party to cryptographically distinguish a handle "minted by the registrar" from a handle "merely recorded in the platform DB" without making an on-chain call to `resolveHandle`.

---

## 4. Anchor Lifecycle (full diagram)

```
┌────────────────────┐
│  agent registers   │
│  via bootstrap or  │
│  programmatic API  │
└─────────┬──────────┘
          │ POST /api/v1/agents (or /bootstrap/activate)
          ▼
┌────────────────────────────────┐
│  agentsTable row created       │
│  status = pending_verification │
│  nftStatus = null              │
└─────────┬──────────────────────┘
          │
          │ verification flow completes
          │ (DNS, well-known, programmatic, etc. — services/verification.ts)
          ▼
┌──────────────────────────────────────┐
│  verifyAgent() succeeds              │
│  → status = active                   │
│  → reissueCredential() (HMAC + VC)   │
│  → if (ONCHAIN_MINTING_ENABLED       │
│      && handle != null               │
│      && nftStatus ∈ {null,'none'}):  │
│      nftStatus = pending_anchor      │
│      nftCustodian = platform         │
│      audit: queue_mint                │
└─────────┬────────────────────────────┘
          │
          │           (poll every 60s — workers/nft-mint.ts)
          ▼
┌──────────────────────────────────────┐
│  processPendingAnchors() worker      │
│  SELECT WHERE nftStatus =            │
│         'pending_anchor' LIMIT 10    │
│                                      │
│  for each agent:                     │
│    attempts = metadata.anchorAttempts│
│    if attempts >= 3:                 │
│       → nftStatus = anchor_failed    │
│       → record anchorFailedAt        │
│       continue                       │
│                                      │
│    UPDATE metadata.anchorAttempts++  │ ◀── F3: not atomic with writeContract
│                                      │
│    registerOnChain(handle, tier,     │
│                    expiresAt)        │
└─────────┬────────────────────────────┘
          │
          │ services/chains/base.ts → registerOnChain()
          ▼
┌──────────────────────────────────────┐
│  viem writeContract                  │
│  → AgentIDRegistrar.registerHandle(  │
│       handle, tierCode, expiresAt)   │
│  signed by BASE_MINTER_PRIVATE_KEY   │
│  RPC: BASE_RPC_URL                   │
│  10s connect timeout, retryCount: 0  │
└─────────┬────────────────────────────┘
          │ tx submitted, txHash returned
          ▼
┌──────────────────────────────────────┐
│  publicClient.waitForTransaction     │
│      Receipt(txHash, timeout 120s)   │
│  → if receipt.status !== 'success':  │
│       throw BaseChainError           │
│         REGISTER_FAILED              │
│  → readContract resolveHandle()      │
│    to fetch the assigned agentId     │
│    (ERC-8004 tokenId)                │
└─────────┬────────────────────────────┘
          │ confirmed
          ▼
┌────────────────────────────────────────────────────────┐
│  agentsTable update (single transaction):              │
│    nftStatus = 'active'                                │
│    status = 'active'                                   │
│    nftCustodian = 'platform'                           │
│    erc8004AgentId = result.agentId                     │
│    erc8004Chain = 'base' | 'base-sepolia'              │
│    erc8004Registry = BASE_ERC8004_REGISTRY env value   │
│    chainRegistrations = [{ chain, agentId, txHash,     │
│                           contractAddress,             │
│                           registeredAt, custodian }]   │
│  nftAuditLogTable insert: action=register, success     │
└─────────┬──────────────────────────────────────────────┘
          │
          ├────────────────────────────────────────────┐
          │                                            │
          ▼                                            ▼
┌────────────────────────────┐     ┌──────────────────────────────────┐
│  Public surfaces (read)    │     │  Secondary transfer detection    │
│  derive state via          │     │  workers/nft-transfer-detector.ts│
│  lib/anchor-state.ts:      │     │  (only if NFT_TRANSFER_DETECTOR_ │
│    deriveAnchorState(      │     │   ENABLED=true)                  │
│      chainRegistrations,   │     │                                  │
│      nftStatus)            │     │  Polls registrar logs every 60s. │
│  → anchored | pending |    │     │  HandleTransferred(handle,       │
│    off-chain               │     │    indexed agentId, indexed from,│
│  Used by:                  │     │    indexed to)                   │
│   - identity.ts bootstrap  │     │                                  │
│     bundle                 │     │  if from != platformWallet:      │
│   - resolve route          │     │    if to is a known user:        │
│   - public profile/ERC8004 │     │      nftStatus = 'minted'        │
│     URI                    │     │      onChainOwner = to           │
│                            │     │    else:                         │
│                            │     │      nftStatus = 'pending_claim' │
│                            │     │      disputeWindowEnd = now + 7d │
└────────────────────────────┘     └──────────────────────────────────┘
                                                    │
                                                    │ 7-day dispute window
                                                    ▼
                                       ┌────────────────────────────┐
                                       │  After window: ownership   │
                                       │  settles to onChainOwner.  │
                                       │  No automated transition   │
                                       │  job exists in this code-  │
                                       │  base — settlement appears │
                                       │  to be triggered via the   │
                                       │  agent-transfer service /  │
                                       │  admin path (out of scope  │
                                       │  for this audit).          │
                                       └────────────────────────────┘
```

### 4.1 State machine (`agentsTable.nftStatus`)

```
   null / "none"
        │ verification + handle + ONCHAIN_MINTING_ENABLED
        ▼
   "pending_anchor"  ◀──── (worker retries up to 3, exponential? — no, fixed 60s)
        │           ╲
        │ success    ╲ 3rd failure
        ▼             ▼
   "active"       "anchor_failed"  (terminal — no automatic recovery; re-verify needed)
        │
        │ HandleTransferred to known user
        ▼
   "minted"
        │
        │ HandleTransferred to unknown wallet
        ▼
   "pending_claim"  (7-day dispute window; anchor-state derives this as "pending")
```

**Notes.**
- `"active"` and `"minted"` are both treated as confirmed-anchored by `lib/anchor-state.ts`. The distinction encodes *who custodies the NFT* (platform vs. user wallet), which feeds the dispute model.
- `"anchor_failed"` is terminal in the worker — a retry requires manual reset of `nftStatus` back to `pending_anchor` (or another verify event resetting it, but the verification path explicitly refuses to overwrite `anchor_failed` to avoid loops).
- The verification path ensures `pending_claim`, `active`, `minted`, `anchor_failed`, and `pending_anchor` are all preserved; only `null` / `"none"` are upgradeable to `pending_anchor`. This is correct.

### 4.2 Idempotency / atomicity (F3)

The worker performs:
1. `UPDATE agents SET metadata.anchorAttempts = anchorAttempts + 1` (own transaction)
2. `walletClient.writeContract(...)` — submits tx
3. `publicClient.waitForTransactionReceipt(...)` — blocks up to 120s
4. `UPDATE agents SET nftStatus='active', chainRegistrations=[…]`

If the process crashes between step 2 and step 4, the next poll cycle (60s later) will see `nftStatus='pending_anchor'` and `anchorAttempts < 3` and **submit a second `registerHandle` transaction**. The on-chain contract will revert the second call with `HandleAlreadyRegistered`, but:

- the second tx still consumes gas (revert costs are non-trivial on Base),
- the worker counts the revert as a failure and increments attempts again,
- with bad luck a handle in flight can hit `anchor_failed` even though the *first* tx confirmed successfully.

There is no nonce reservation, no submit-tx audit row created **before** `writeContract`, and no read-back of `handleRegistered(handle)` before submitting. A defensive pattern would be:

1. Read `handleRegistered(handle)` first; if true, jump straight to step 4 with the existing on-chain agentId.
2. Persist `pending_tx` row with `expectedNonce`/`submittedAt` *before* `writeContract`.
3. On restart, look up unresolved `pending_tx` rows and `getTransactionReceipt` directly instead of resubmitting.

### 4.3 Worker resilience (F4)

`nft-transfer-detector.ts` keeps `lastCheckedBlock` only as a module-scope `let`. Every restart resets to `currentBlock - 1000`. A 1000-block lookback at Base's ~2s block time is ~33 minutes — any HandleTransferred event older than that is silently lost on the next restart, and the resulting `pending_claim` / ownership update never fires. This means:

- Public profile keeps showing the platform as custodian.
- The 7-day dispute window never starts.
- ERC-8004 read paths still report the wrong owner until the next time someone manually re-syncs.

Persisting `lastCheckedBlock` in a small `worker_cursors` table keyed by worker name would close the gap. The detector also currently hard-codes `chain: base` (mainnet) when constructing its publicClient — if the server is configured for `base-sepolia` (which is the default per `chains/base.ts` `getViemChain`), the detector queries the wrong chain entirely.

---

## 5. Gas Accounting

| Concern | Status | Notes |
|---------|--------|-------|
| Per-call gas estimation | Not implemented | viem auto-estimates. No min-gas guard, no fee cap. A spike on Base could submit at any price. |
| Minter wallet balance monitoring | **None** | No periodic balance check, no alert threshold, no Prometheus/log gauge. |
| Top-up automation | None | Manual only. |
| Per-handle cost accounting | Not tracked | `nftAuditLogTable` records `txHash` and tier but no `gasUsed` / `effectiveGasPrice`. Cannot reconcile registrar spend per handle. |
| Cost surfaced in pricing | Implicit | Handle pricing tiers (`HANDLE_PRICING_TIERS`) bake gas into the annual fee. There is no codepath that recomputes tier prices when gas spikes. |
| Failed-tx accounting | Charged but not counted | Reverted txs still consume gas; not surfaced in any audit row. |

**Risk (F5).** The most likely failure mode in production is a quiet wallet drain (legitimate or otherwise) causing every anchor to fail with `insufficient funds for gas`. The worker treats this as a generic registration failure: 3 polls (~3 minutes), then `anchor_failed`. By the time an operator notices, every `pending_anchor` agent in the queue is permanently in the failed state and needs manual intervention to retry.

**Recommendation.**
- Add a balance check at worker start: if `balanceOf(minter) < threshold`, skip the cycle and emit a single warning per N minutes.
- Record `gasUsed * effectiveGasPrice` per successful tx in `nftAuditLogTable.metadata`.
- Distinguish `INSUFFICIENT_FUNDS` from `REGISTER_FAILED` so the worker can hold (not consume retries) when the wallet is empty.

---

## 6. ERC-8004 Compliance Surface

### 6.1 What we expose

The platform exposes ERC-8004 in two ways:

1. **`/api/v1/p/<handle>/erc8004`** — JSON document built by `services/credentials.ts buildErc8004(handle)`. Includes the canonical UUID-rooted DID, handle alias DID (`did:agentid:<handle>`), all active agent keys (ed25519, public-key only), active domains, OWS wallets in CAIP-10 form, services, and a `chainRegistrations` array.
2. **`agentsTable.erc8004AgentId` / `erc8004Chain` / `erc8004Registry`** — written by the mint worker on success. The agentId (registrar tokenId) and chain label are correct; the registry address is **read from the env at write time** (F8). If the operator changes `BASE_ERC8004_REGISTRY` (e.g. registry contract upgrade), historical rows still point at the old address.

### 6.2 Gaps vs. spec intent

- **No on-chain ERC-8004 write path.** Despite the column name, the platform does not call any function on `BASE_ERC8004_REGISTRY` — anchoring goes through `AgentIDRegistrar` only. Whether the registrar internally mirrors the relationship to the ERC-8004 registry is a Solidity question and out of scope. The off-chain implication: the `erc8004Registry` field is a *display value*, not a verifiable claim.
- **`erc8004_uri` is null until handle is set.** Agents without a handle have `erc8004_uri: null` in the bootstrap bundle, even though their UUID DID is fully resolvable. This is intentional (the URI is handle-keyed) but means relying parties cannot link a UUID-only agent to an ERC-8004 record.
- **`buildErc8004` requires `agent.isPublic && status === 'active'`.** Suspended or private agents return `null`, which is correct for privacy but should be clearly documented as a 404-equivalent rather than an error.

The HMAC credential's `proof.type = "AgentIDHmacCredential2024"` is a custom suite name not registered in any W3C VC spec or DIF context registry; F1 again.

---

## 7. Recovery Paths

### 7.1 Claim tokens

`utils/claim-token.ts` issues `base64url(agentId:apiKeyPrefix:nonce:hmacSig)` URLs.

- Single-use: enforced by `agentClaimTokensTable.isUsed` flag.
- Bound to `agentId + apiKeyPrefix`: the token is tied to the API key prefix used at issuance, mitigating reuse if leaked.
- 7-day expiry (set by issuing route).
- Stored hashed in the DB (raw token never persisted).
- Symmetric HMAC over `CLAIM_TOKEN_SECRET` (**F9**). Compromise of the secret allows minting valid claim URLs for any `(agentId, apiKeyPrefix)` pair the attacker can guess. The DB-side `isUsed` and 7-day expiry limit the blast radius but do not eliminate it.

### 7.2 Key rotation

`services/agent-keys.ts` is well-structured:

- `createAgentKey` and `rotateAgentKey` enforce ed25519 at the service layer (belt-and-suspenders behind route validation).
- `initiateKeyRotation` supports a 24-hour `rotating` grace window and an `immediateRevoke` short-circuit for `reason === "compromise"`.
- `verifyKeyRotation` finalises the rotation by revoking the old key.
- Every rotation is logged to `agentKeyRotationLogTable`.
- Revocation triggers `reissueCredential`, `clearVcCache`, and `deleteResolutionCache` to flush downstream caches. **However** (F10) `clearVcCache` is in-memory only — multi-instance deploys will continue serving the stale JWT until the 1-hour TTL.

### 7.3 Handle recovery

| Scenario | Path | Notes |
|----------|------|-------|
| Handle expired (registrar lapsed) | `processHandleExpiry` → `startHandleGracePeriod` (30 days standard, 90 for premium_3/4) → `processSuspendedHandles` after grace | DB only; no on-chain `releaseHandle` call observed in the lapse path. The on-chain handle remains until someone calls `releaseHandle` (owner-only on the contract). |
| Handle released to auction | `releaseHandleToAuction` (off-chain auction table) | Off-chain only. The on-chain registrar may still consider the handle live. |
| Handle transferred secondary | `nft-transfer-detector` — if to known user → `minted`; else → `pending_claim` for 7d | F4 caveats apply; missed events = wrong owner. |
| Anchor failed (`anchor_failed`) | **No automated recovery.** Operator must reset `nftStatus` to `pending_anchor`. | Documented gap. |
| Minter key compromised | **No runbook.** Out of band: pause worker (`stopNftMintWorker` is process-local), rotate `BASE_MINTER_PRIVATE_KEY`, owner re-keys the contract. | F2. |
| VC signing key compromised | Stop process, rotate `VC_SIGNING_KEY` / `VC_PUBLIC_KEY` / `VC_KEY_ID`, redeploy. JWKS will serve new key. Old JWTs valid for ≤1h until cache TTL. | Acceptable but undocumented. |

---

## 8. Detailed Findings

### F1 — HMAC credential is symmetric and not externally verifiable  *(Critical)*
**Source.** `services/credentials.ts:62-66, 134-142, 247-289`.
The legacy credential uses HMAC-SHA256 with `CREDENTIAL_SIGNING_SECRET`. Anyone holding the secret can forge a credential the platform itself will accept. The proof suite name is non-standard. The W3C VC JWT (`verifiable-credential.ts`) already provides a proper asymmetric replacement. Recommend deprecating dual-emit, then removing.

### F2 — Single hot key for on-chain operations  *(Critical)*
**Source.** `services/chains/base.ts:169-176` (`makeClients`); env var `BASE_MINTER_PRIVATE_KEY`.
No multisig, no signer rotation runbook, no break-glass procedure, no balance/health monitoring. Compromise → adversary can register, transfer, or release any handle (subject to contract `onlyMinter` / `onlyOwner` modifiers).

### F3 — Anchor-attempt counter and tx submission are non-atomic  *(High)*
**Source.** `workers/nft-mint.ts:99-156`.
A crash between `UPDATE metadata.anchorAttempts++` and the post-confirmation update can cause duplicate `registerHandle` submissions on the next poll. Defensive read of `handleRegistered(handle)` before submission, or a `pending_tx` row written before `writeContract`, would close this.

### F4 — Transfer detector loses event cursor on restart  *(High)*
**Source.** `workers/nft-transfer-detector.ts:34, 56-62, 84`.
`lastCheckedBlock` is in-process; restart resets to `currentBlock - 1000`. Events older than ~33 minutes can be missed. Additionally, the detector hard-codes `base` (mainnet) when constructing its public client (line 49-54), conflicting with `getViemChain()`'s testnet selection elsewhere — on testnet deploys the detector will silently query the wrong chain.

### F5 — No funding monitoring or alerting on minter wallet  *(High)*
**Source.** `workers/nft-mint.ts`, `services/chains/base.ts`.
No balance check, no low-balance alert, no automated top-up. `insufficient funds` is treated like any other revert and consumes the 3 retries, ending in terminal `anchor_failed`.

### F6 — No on-chain reconciliation against DB state  *(Medium)*
**Source.** None — gap.
There is no periodic job that calls `resolveHandle` for active rows and reconciles `nftStatus` / `chainRegistrations` against on-chain truth. Drift (e.g. operator-side manual contract calls, contract upgrades, or missed events from F4) is permanent.

### F7 — Production chain selection has no startup assertion  *(Medium)*
**Source.** `services/chains/base.ts:113-118`.
Precedence is `BASE_CHAIN_ID=84532` → `IS_TESTNET=true` → mainnet default. A misconfigured production deploy that omits both will silently target Base mainnet. Suggest a startup assertion: in production, require `BASE_CHAIN_ID` to be explicitly set and to match an allowlist.

### F8 — `erc8004Registry` is captured by value, not reference  *(Medium)*
**Source.** `workers/nft-mint.ts:142-152`.
The env value is read at write-time and persisted on the row. If the operator changes `BASE_ERC8004_REGISTRY`, historical rows point at the old address and surfaces showing the registry will be inconsistent. Either (a) drop the column and read-through env, or (b) document that this is a snapshot.

### F9 — Claim tokens use the same symmetric-HMAC pattern  *(Low)*
**Source.** `utils/claim-token.ts`.
Same class of issue as F1 but materially less severe due to single-use, 7-day expiry, hashed storage, and binding to `apiKeyPrefix`.

### F10 — VC cache is per-process, no cross-instance invalidation  *(Low)*
**Source.** `services/verifiable-credential.ts:64-72, 204-210`.
`vcCache` and `clearVcCache` are local. A revoked-key event in one API instance leaves stale JWTs served by other instances for up to 1h. Acceptable if the JWT TTL itself is short (it is, 1h matches the cache TTL), but worth documenting.

### Additional observations (informational)

- **Dead ABI import.** `nft-transfer-detector.ts` imports `AGENT_ID_HANDLE_ABI` from `chains/base.ts` but never uses it (it constructs its event signature inline). The legacy ABI re-export should be removed.
- **`releaseHandleOnChain` is owner-only on the contract** (per the inline comment at `chains/base.ts:464`). The platform calls it with `BASE_MINTER_PRIVATE_KEY`, which will revert with `OnlyMinter` / `Ownable: caller is not the owner` unless the minter and owner happen to be the same EOA. The off-chain code does not gate this — it will simply log a failure.
- **Two `chainRegistrations` shapes coexist.** `lib/anchor-state.ts` and `nft-transfer-detector.ts` both ship a `normaliseChainRegs` that handles both array form and `{ base: { ... } }` object form. The mint worker writes the array form. Consider documenting that the object form is legacy-read-only and adding a one-shot migration to the canonical array shape.
- **No replay-protection on credential JWT consumers.** The VC JWT carries `iat`/`exp` but no `jti` or `nonce`. For high-assurance verifiers this is fine because the JWT is bearer-equivalent for a 1-hour window, but if it is ever used in a non-TLS-pinned channel, an interceptor can replay.

---

## 9. Recommendations (priority order)

1. **Deprecate the HMAC credential (F1).** Mark the field as deprecated in API responses, document the cutover, dual-emit for one release cycle, then delete `signCredential`/`verifyCredentialSignature`. All external integrations should consume the VC JWT via JWKS.
2. **Plan and implement minter custody hardening (F2).** Move from a single EOA hot key to either (a) a 2-of-N multisig (Safe) on the registrar's `setMinter`, with a documented rotation runbook and rotation drill, or (b) a KMS-backed signer for the minter EOA so the raw key never lives on disk. Document a break-glass.
3. **Make the anchor worker atomic and resumable (F3).** Persist a `pending_tx` row before `writeContract`; on restart, look up by `txHash` rather than resubmitting. Read `handleRegistered(handle)` first as cheap idempotency.
4. **Persist worker cursors and fix the chain mismatch (F4).** Add a `worker_cursors` table; replace the hard-coded `base` import in the transfer detector with `getViemChain()`.
5. **Add minter-balance monitoring (F5).** Balance check at worker start; a metric, a log, an `INSUFFICIENT_FUNDS` short-circuit that does not consume retries.
6. **Build a reconciliation job (F6).** Daily: for every `active` / `minted` agent with a handle, call `resolveHandle` and compare; raise an audit log entry on drift.
7. **Add a production chain-selection assertion (F7).** Require `BASE_CHAIN_ID` to be set explicitly in production; refuse to start otherwise.
8. **Decide on `erc8004Registry` semantics (F8).** Either drop the column or document the snapshot semantics.
9. **Add cross-instance VC cache invalidation (F10).** Use the existing resolution-cache (Redis) channel for `clearVcCache`, or accept the 1h staleness explicitly and document it.
10. **Operational documentation.** Write runbooks for: minter key compromise, VC key rotation, anchor_failed recovery, registrar contract upgrade.

---

## 10. Out of Scope (Explicit)

- **Solidity audit** of `AgentIDRegistrar.sol`, the ERC-8004 registry, or any associated proxy/ownership contracts. The off-chain code calls these as black-box dependencies.
- **Implementing fixes** for any finding above.
- **Browser-facing wallet flows** (OWS wallet creation, x402 payments) beyond their interaction with the credential / anchor surface.
- **Trust-score computation** semantics — only the credential surface that includes the score is in scope.
- **Email and notification deliverability** for credential / rotation events.

---

*End of audit.*
