# Discovery Document Contract Audit

**Task**: #197 — Discovery Document Contract Audit & Fix
**Date**: 2025-04-04
**Auditor**: Agent (automated)

---

## Summary

Audited the `/.well-known/agent-registration` discovery document against the real backend routes mounted in `v1/index.ts` and its imported routers. Found and fixed four categories of issues: broken/fictional endpoint references, missing HTTP method documentation, misleading pricing copy, and improved structure for machine readability.

---

## Field-by-Field Audit Results

| Field | Advertised Path | Real Path | Status | Action |
|-------|-----------------|-----------|--------|--------|
| `register` | `/api/v1/programmatic/agents/register` | `POST /api/v1/programmatic/agents/register` | ✅ Path correct, method undocumented | Added `method: "POST"` to structured object |
| `verify` | `/api/v1/programmatic/agents/verify` | `POST /api/v1/programmatic/agents/verify` | ✅ Path correct, method undocumented | Added `method: "POST"` to structured object |
| `resolve` | `/api/v1/resolve/{handle}` | `GET /api/v1/resolve/{handle}` | ✅ Path correct, method undocumented | Added `method: "GET"` to structured object |
| `discovery` | `/api/v1/resolve` | `GET /api/v1/resolve` (with `?q=...` params) | ✅ Path correct, method undocumented | Added `method: "GET"` to structured object |
| `reverseResolve` | `/api/v1/resolve/reverse` | `POST /api/v1/resolve/reverse` | ❌ Method missing | Fixed: now `{ url, method: "POST" }` |
| `handleCheck` | `/api/v1/handles/check` | `GET /api/v1/handles/check` | ✅ Path correct, method undocumented | Added `method: "GET"` to structured object |
| `handlePricing` | `/api/v1/handles/pricing` | `GET /api/v1/handles/pricing` | ✅ Path correct, method undocumented | Added `method: "GET"` to structured object |
| `agentProfile` | `/api/v1/agents/{handle}` | `GET /api/v1/p/{handle}` (no auth) | ❌ Wrong path, requires auth | Fixed: now points to real public route |
| `agentTrust` | `/api/v1/agents/{handle}/trust` | **Does not exist** | ❌ Fictional endpoint | Removed entirely |
| `marketplaceListings` | `/api/v1/marketplace/listings` | `GET /api/v1/marketplace/listings` | ✅ Correct | Added `method: "GET"` to structured object |
| `jobs` | `/api/v1/jobs` | `GET /api/v1/jobs` | ✅ Correct | Added `method: "GET"` to structured object |
| `healthCheck` | `/api/healthz` | `GET /api/healthz` | ✅ Correct | Added `method: "GET"` to structured object |
| `llmsTxt` | `/api/llms.txt` | `GET /api/llms.txt` | ✅ Correct | Added `method: "GET"` to structured object |

---

## Changes Made

### 1. Endpoints Block Restructured (`well-known.ts`)

Changed all endpoint values from bare URL strings to structured `{ url, method }` objects. This makes the document machine-readable and self-describing for HTTP clients and automated tooling.

**Before:**
```json
"reverseResolve": "https://getagent.id/api/v1/resolve/reverse"
```

**After:**
```json
"reverseResolve": { "url": "https://getagent.id/api/v1/resolve/reverse", "method": "POST" }
```

### 2. `agentProfile` Fixed

The old `agentProfile` field pointed to `/api/v1/agents/{handle}` which is a **protected route** requiring authentication. The real public-facing profile route is `/api/v1/p/{handle}` (mounted via `publicProfilesRouter` in `v1/index.ts`).

Split into two separate fields:
- `agentProfile` → `GET /api/v1/p/{handle}` (human-readable public profile, no auth)
- `agentIdentity` → `GET /api/v1/public/agents/{agentIdOrHandle}` (machine-readable identity document, no auth)

### 3. `agentTrust` Removed

The `agentTrust` field referenced `/api/v1/agents/{handle}/trust` which does not exist as a route anywhere in the codebase. A search of `agents.ts`, `agent-identity.ts`, and all v1 router files confirmed no such route. Removed without replacement (the trust score data is available via `agentProfile` and `agentIdentity` endpoints).

### 4. Pricing Copy Fixed

Changed the 5+ character handle tier description from:
> `"Standard handle — 1 included automatically with Starter or Pro plan..."`

To:
> `"Standard handle — 1 included with Starter or Pro plan (choose and register one from your dashboard; no additional payment required)..."`

The word "automatically" was misleading — handles are included in the plan price but the user must actively choose and register a specific handle. This same fix was applied to `llms-txt.ts`.

### 5. `llms.txt` API Reference Corrected

The "Agent Profiles" section in `llms-txt.ts` previously advertised:
- `GET /api/v1/agents/:handle` — labeled as "Retrieve an agent's public profile" (WRONG: no such route by handle; the agentId route requires auth)
- `GET /api/v1/agents/:handle/trust` — "Retrieve trust score breakdown" (WRONG: does not exist)
- `GET /api/v1/agents/:handle/trust/history` — "Trust score over time" (WRONG: does not exist)

Updated to accurately document:
- `GET /api/v1/agents/:agentId` — owner-authenticated route by UUID
- `PUT /api/v1/agents/:agentId` — owner-authenticated update
- `GET /api/v1/agents/:agentId/activity` — owner-authenticated activity log
- Added note: Trust data is available via the public profile endpoints (`/api/v1/p/:handle` and `/api/v1/public/agents/:agentIdOrHandle`), no separate trust endpoint needed.

---

## Canonical Endpoints Post-Fix

```
POST /api/v1/programmatic/agents/register    — Register new agent identity
POST /api/v1/programmatic/agents/verify      — Verify agent via Ed25519 key-signing
GET  /api/v1/resolve/{handle}               — Resolve handle to Agent ID Object
GET  /api/v1/resolve                        — Discover agents (query params)
POST /api/v1/resolve/reverse                — Reverse lookup by endpoint URL
GET  /api/v1/handles/check                  — Check handle availability + pricing
GET  /api/v1/handles/pricing               — Get all pricing tiers
GET  /api/v1/p/{handle}                    — Public agent profile (no auth)
GET  /api/v1/public/agents/{agentIdOrHandle} — Machine-readable identity doc (no auth)
GET  /api/v1/marketplace/listings          — Browse marketplace
GET  /api/v1/jobs                          — Browse job board
GET  /api/healthz                          — Health check
GET  /api/llms.txt                         — Machine-readable platform description
```

---

## Cross-Document Consistency

Checked against:
1. `/.well-known/agentid-configuration` — Consistent: `resolverEndpoint` and `registrationEndpoint` match the values in `agent-registration`.
2. `/api/llms.txt` — Consistent after both the pricing copy fix and the Agent Profiles section correction. The "Trust" section (fictional routes) and "Agent Profiles" section (wrong path by handle, wrong auth labeling) were corrected to remove references to `/api/v1/agents/:handle/trust` and to clearly label authenticated-only routes.

No contradictions remain between the three documents after the llms.txt corrections.

---

## Tests Added

**File**: `src/__tests__/discovery-contract.unit.test.ts`

34 tests across 7 describe blocks:

- **DC-1**: Shape tests — live HTTP 200, required top-level fields, structured endpoint objects
- **DC-2**: Path accuracy — every listed endpoint path matches a real mounted route; no broken references
- **DC-3**: reverseResolve method — POST documented, canonical `/resolve/reverse` path confirmed, backed by source assertions on both `resolve.ts` and `v1/index.ts`
- **DC-4**: No broken agentTrust or old agentProfile — agentTrust absent; real public routes confirmed present
- **DC-5**: Pricing copy — "automatically" absent from 5+ tier; "choose and register" present in both well-known.ts and llms-txt.ts
- **DC-6**: Smoke-test — endpoint paths are a subset of known real routes; structured `{ url, method }` format verified
- **DC-7**: Cross-document consistency — agentid-configuration and llms.txt alignment checked; fictional trust routes absent from llms.txt; authenticated vs public route distinction verified

All 34 tests pass.

---

## Residual Risks

1. **`reverseResolve` alias at `/api/v1/reverse`** — `v1/index.ts` also mounts `handleReverse` at `router.post("/reverse", ...)` creating a second alias at `/api/v1/reverse`. This alias was not advertised in the discovery document (intentionally, per task spec). Developers relying on the alias will still find it works but should prefer the canonical path `/api/v1/resolve/reverse`.

2. **TypeScript errors in `public-profiles.ts`** — Pre-existing (18 `'agent' is possibly 'null'` errors). Not caused by this task and not in scope.

3. **`llms.txt` broader API reference** — The developer documentation in `llms-txt.ts` is extensive (500+ lines) and may contain other stale or imprecise entries beyond what was audited here. The critical fictional routes (trust endpoints, public handle-based profile) have been corrected. A comprehensive audit of the entire llms.txt content is out of scope for this task.
