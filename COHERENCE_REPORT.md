# Agent ID Platform — Coherence Audit Report

**Date**: 2026-03-18
**Scope**: Full system wiring & coherence audit across ~20 subsystems
**Status**: All critical drift issues identified and fixed

---

## 1. Subsystem Classification

| Subsystem | Classification | Notes |
|-----------|---------------|-------|
| Agent CRUD (agents, handle, registration) | CORE | Central entity lifecycle |
| Authentication (session, API key, agent key) | CORE | Identity & access control |
| Verification (challenge, domain, DNS) | CORE | Trust establishment |
| Trust Score (trust-score, attestations) | CORE | Trust computation & propagation |
| Credentials (HMAC + JWT VC) | CORE | Agent identity proofs |
| Resolution (resolve routes, resolution cache) | CORE | Agent discovery & lookup |
| Admin (admin routes, audit) | CORE | Platform governance |
| Handle Lifecycle (expiry, renewal, auction) | CORE | Namespace management |
| Agent Transfer (handoff, readiness) | SUPPORTING | Ownership transfer |
| Billing / Stripe (billing, subscription) | SUPPORTING | Monetization |
| Email (verification, credential issuance) | SUPPORTING | Notifications |
| Activity Logger | SUPPORTING | Observability |
| Operator History | SUPPORTING | Audit trail |
| MCP Server (tools, discovery) | SUPPORTING | AI tool integration |
| SDK (client lib) | SUPPORTING | Developer experience |
| Resolver Library | SUPPORTING | Client-side resolution |
| Mail (inbox provisioning) | OPTIONAL | Agent mail |
| Wallet / x402 / MPP | EXPERIMENTAL | Payment protocols, gated |
| Landing Page (agent-id artifact) | OPTIONAL | Marketing site |

---

## 2. Canonical Sources of Truth

| Data | Source of Truth | Cache Layer | TTL |
|------|----------------|-------------|-----|
| Agent state | `agentsTable` (PostgreSQL) | Redis `resolve:handle:{h}` | 60s |
| Agent keys | `agentKeysTable` | None | — |
| Credentials (HMAC) | `agentCredentialsTable` | None | — |
| Verifiable Credentials (JWT) | Generated on-the-fly | In-memory `vcCache` map | Until `clearVcCache()` |
| Trust score | `agentTrustScoresTable` | None (recomputed) | — |
| Resolution | `resolve` route → DB → cache | Redis | 60s |
| Handle reservation | `RESERVED_HANDLES` in `handle.ts` | None | — |
| Sessions | `agentidSessionsTable` | None | — |

---

## 3. Critical State Transitions & Required Propagation

### 3.1 Agent Revocation (admin or system)
**Trigger**: `POST /api/v1/admin/agents/:id/revoke`
**Required cascade** (all now implemented):
1. ✅ Set `agents.status = "revoked"`, `revokedAt`, reason, statement
2. ✅ Revoke all active agent keys (`agentKeysTable.status = "revoked"`)
3. ✅ Deactivate all active credentials (`agentCredentialsTable.isActive = false`)
4. ✅ Clear VC cache (`clearVcCache(agentId)`)
5. ✅ Invalidate resolution cache (`deleteResolutionCache(handle)`)
6. ✅ Revoke outbound attestations and recompute trust for attested agents (async)
7. ✅ Write audit event

### 3.2 Agent Key Revocation
**Trigger**: `revokeAgentKey(agentId, keyId)`
**Required cascade** (all now implemented):
1. ✅ Set key `status = "revoked"`, `revokedAt`
2. ✅ Reissue credential (`reissueCredential(agentId)`)
3. ✅ Clear VC cache (`clearVcCache(agentId)`)
4. ✅ Invalidate resolution cache

### 3.3 Handle Expiry
**Trigger**: `expireHandles()` worker
**Required cascade** (now implemented):
1. ✅ Rename handle to `_expired_{id}_{handle}`
2. ✅ Invalidate resolution cache for old handle
3. ✅ Create handle auction

### 3.4 Handle Assignment
**Trigger**: `assignHandleToAgent(agentId, handle, options)`
**Required cascade** (now implemented):
1. ✅ Update agent handle in DB
2. ✅ Invalidate resolution cache for handle

### 3.5 Handle Release to Auction
**Trigger**: `releaseHandleToAuction(agentId)`
**Required cascade** (now implemented):
1. ✅ Clear agent handle fields
2. ✅ Invalidate resolution cache for old handle
3. ✅ Create auction listing

### 3.6 Transfer Completion (Handoff)
**Trigger**: `completeHandoff(transferId, buyerId)`
**Required cascade** (all now implemented):
1. ✅ Change owner userId
2. ✅ Revoke active keys
3. ✅ Recalibrate trust
4. ✅ Reissue credential
5. ✅ Clear VC cache
6. ✅ Invalidate resolution cache

### 3.7 Verification Completion (already correct, no changes needed)
**Trigger**: `verifyChallenge()`
**Cascade**: Reissue credential → clear resolution cache → send email ✅

### 3.8 Trust Recomputation (already correct, no changes needed)
**Trigger**: `recomputeAndStore(agentId)`
**Cascade**: Clear VC cache → reissue credential → deliver webhook → clear resolution cache ✅

### 3.9 Agent Deletion (already correct, no changes needed)
**Trigger**: `deleteAgent(agentId)`
**Cascade**: Revoke attestations → recompute trust → clear resolution cache → clear VC cache ✅

---

## 4. Drift Issues Found & Fixed

### 4.1 State Drift (Fixed)

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| SD-1 | `routes/v1/admin.ts` revoke route | Only set DB status — no key revocation, no credential deactivation, no VC cache clear, no resolution cache invalidation, no attestation revocation | Added full cascade: revoke keys, deactivate credentials, clear VC cache, invalidate resolution cache, revoke attestations + recompute trust (async) |
| SD-2 | `services/agent-keys.ts` `revokeAgentKey()` | No credential reissue, no VC cache clear, no resolution cache invalidation after key revocation | Added `reissueCredential()`, `clearVcCache()`, `deleteResolutionCache()` |
| SD-3 | `workers/handle-lifecycle.ts` `expireHandles()` | Handle renamed but resolution cache not invalidated (stale cache serves expired agent for up to 60s) | Added `deleteResolutionCache(oldHandle)` |
| SD-4 | `services/handle.ts` `assignHandleToAgent()` | Handle assigned but resolution cache not invalidated | Added `deleteResolutionCache(handle)` |
| SD-5 | `services/handle.ts` `releaseHandleToAuction()` | Handle released but resolution cache not invalidated | Added `deleteResolutionCache(handle)` |
| SD-6 | `services/agent-transfer.ts` `completeHandoff()` | Owner changed, keys revoked, trust recalibrated — but no credential reissue, no VC cache clear, no resolution cache invalidation | Added `reissueCredential()`, `clearVcCache()`, `deleteResolutionCache()` |

### 4.2 Concept Drift (Fixed)

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| CD-1 | `services/agents.ts` vs `services/handle.ts` | Duplicate `RESERVED_HANDLES` with different entries and normalization | Consolidated to single canonical source in `handle.ts`; `agents.ts` re-exports from `handle.ts` |
| CD-2 | `lib/sdk/src/client.ts` | `handle` getter returns `${h}.agentID` (capital ID) | Fixed to `.agentid` (lowercase) |
| CD-3 | `mcp-server/src/tools/index.ts` | Trust tier names `untrusted/low/moderate/high/verified` don't match DB tiers `unverified/basic/verified/trusted/elite` | Fixed to match DB tier names |

### 4.3 Surface Drift (Fixed)

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| SU-1 | `lib/resolver/src/index.ts` `ResolvedAgent` type | Missing `machineIdentity`, `handleIdentity`, `did`, `resolverUrl`, `walletAddress`, `walletNetwork`, `erc8004Uri` fields | Added all missing fields and interfaces |
| SU-2 | `lib/resolver/src/index.ts` `ResolvedAgent.status` | Only `"draft" \| "active" \| "inactive"` — missing `"suspended"`, `"pending_verification"`, `"revoked"` | Added all missing status values |
| SU-3 | `lib/resolver/src/index.ts` `ResolvedAgent.verificationStatus` | Only `"unverified" \| "pending" \| "verified"` — missing `"failed"`, `"pending_verification"` | Added missing values |
| SU-4 | `lib/resolver/src/index.ts` `ResolvedAgent.handle` | Non-nullable `string` but API can return `null` for handleless agents | Changed to `string \| null` |

### 4.4 Product Drift (Acceptable — No Fix Required)

| ID | Location | Issue | Status |
|----|----------|-------|--------|
| PD-1 | `services/agent-transfer.ts` | `listTransfer()` / `fundHold()` throw `NOT_AVAILABLE` | Intentionally unimplemented escrow/marketplace — correctly blocked at route level (501) |
| PD-2 | Wallet / x402 / MPP subsystems | Experimental payment protocols | Gated by wallet provisioning state — correct |

---

## 5. Subsystems Already Correctly Wired (No Changes Needed)

These subsystems were audited and confirmed to have correct state propagation:

- **`verifyChallenge()`**: Correctly reissues credential, clears resolution cache, sends email
- **`recomputeAndStore()`**: Correctly clears VC cache, reissues credential, delivers webhook, clears resolution cache
- **`deleteAgent()`**: Correctly revokes attestations, recomputes trust, clears resolution cache, clears VC cache
- **Admin route auth**: Uses timing-safe comparison, fail-closed if `ADMIN_SECRET_KEY` not set

---

## 6. Integration Test Coverage

New test file: `artifacts/api-server/src/__tests__/cross-system-coherence.integration.test.ts`

| Test Suite | What It Verifies |
|-----------|-----------------|
| Admin Revocation Propagation | Keys revoked, credentials deactivated, VC cache cleared, resolution cache invalidated, resolver returns 410 |
| Key Revocation Propagation | `revokeAgentKey()` triggers credential reissue, VC cache clear, resolution cache invalidation |
| RESERVED_HANDLES Consistency | `agents.ts` and `handle.ts` export the same set and function (no duplication) |
| MCP Trust Tier Alignment | MCP discover tool tier names match DB tier names |

---

## 7. Architecture Notes

- **Resolution cache**: Redis key `resolve:handle:${handle}`, 60s TTL. Exported from both `routes/v1/resolve.ts` and `lib/resolution-cache.ts` (canonical: `lib/resolution-cache.ts`).
- **VC cache**: In-memory Map in `verifiable-credential.ts`, cleared per-agent via `clearVcCache(agentId)`.
- **Dual credential system**: HMAC-signed JSON-LD (`credentials.ts`) and JWT VCs (`verifiable-credential.ts`) — both must be invalidated/reissued on state changes.
- **Handle normalization**: Canonical form is lowercase. `RESERVED_HANDLES` checks use normalized form.
- **Async cleanup pattern**: Heavy operations (attestation revocation, trust recomputation for downstream agents) use `setImmediate()` to avoid blocking the request path.

---

## 8. Files Modified

| File | Changes |
|------|---------|
| `artifacts/api-server/src/routes/v1/admin.ts` | Added key revocation, credential deactivation, VC cache clear, resolution cache invalidation, attestation revocation cascade to admin revoke route |
| `artifacts/api-server/src/services/agent-keys.ts` | Added credential reissue, VC cache clear, resolution cache invalidation after key revocation |
| `artifacts/api-server/src/workers/handle-lifecycle.ts` | Added resolution cache invalidation after handle expiry |
| `artifacts/api-server/src/services/handle.ts` | Added resolution cache invalidation after handle assignment and release; unified RESERVED_HANDLES with all tech company names |
| `artifacts/api-server/src/services/agent-transfer.ts` | Added credential reissue, VC cache clear, resolution cache invalidation after transfer handoff |
| `artifacts/api-server/src/services/agents.ts` | Replaced duplicate RESERVED_HANDLES with re-export from handle.ts |
| `lib/sdk/src/client.ts` | Fixed handle casing from `.agentID` to `.agentid` |
| `artifacts/mcp-server/src/tools/index.ts` | Fixed trust tier names to match DB tiers |
| `lib/resolver/src/index.ts` | Added MachineIdentity/HandleIdentity interfaces; expanded ResolvedAgent type with all missing fields and status values |
| `artifacts/api-server/src/__tests__/cross-system-coherence.integration.test.ts` | New integration tests for cross-system coherence |
