# Onboarding Architecture Audit — Findings & Changes

**Date:** 2026-04-04  
**Task:** Onboarding Architecture Overhaul (#194)

---

## Findings

### 1. Conflicting Onboarding Routes (`/start` vs `/get-started`)

Two separate onboarding wizards existed simultaneously:

- `/start` (`Start.tsx`): An older wizard that included a fake "Verify / Authenticate" step offering GitHub Gist, Wallet Signature, and Manual Key Signing options.
- `/get-started` (`GetStarted.tsx`): A newer, cleaner wizard aligned with the real backend (draft → bootstrap → activate).

The `DashboardRoute` guard in `App.tsx` was redirecting zero-agent users to `/start` (the broken old wizard), not `/get-started`. The `OnboardingPlan.tsx` plan selection page also navigated to `/start` after plan selection.

### 2. Fake Verification Step in `Start.tsx`

`Start.tsx` contained a `selectedAuthMethod` state accepting `'github' | 'wallet' | 'manual'` and made calls to:
- `api.agents.verify.initiate(agentId, method)` — where `method` was one of `'github' | 'wallet' | 'manual'`
- `api.agents.verify.complete(agentId, { challenge })` — with an empty/bogus challenge

The backend `agent-verification.ts` only accepts `method: "key_challenge"` and requires a real `signature` + `kid`. The verify calls in `Start.tsx` would always fail silently (caught and swallowed), with the wizard proceeding to the success state regardless of whether verification succeeded.

### 3. Handle-less Success State (Cosmetic Bug)

In `Start.tsx`'s success screen, `handle.agentid` and `https://${handle}.getagent.id` would render as `.agentid` and `https://.getagent.id` when no handle was entered. The QR code would encode an invalid URL.

In `GetStarted.tsx`'s `token-display` step, the description text was `(handle.agentid)` which would show `(.agentid)` for handleless agents.

### 4. Claim-Existing Polling Logic Bug

The `startClaimPolling` function in `GetStarted.tsx` resolved "success" when the user had **any agents** (not specifically the agent that was just linked via the owner token):

```ts
// Bug: resolves immediately for users with pre-existing agents
if (result.agents && result.agents.length > 0) {
  setStep('complete');
}
```

A second, partial fix improved this to count-based comparison but that still false-positived for users with pre-existing agents when comparing against a fallback count of 0 if the baseline fetch failed.

### 5. Incorrect Code Snippets in Claim-Existing Flow

The `claim-existing` step showed code snippets with `Authorization: Bearer ${ownerToken}` as an HTTP header. The backend (`programmatic.ts`) actually reads `ownerToken` from the **JSON request body** (not the Authorization header). The header-based approach would silently fail to link the agent to the user's account.

### 6. Internal Navigation Still Pointing to `/start`

Six other files contained internal navigations/links to `/start`:
- `Dashboard.tsx` — "Register your first agent" card
- `Pricing.tsx` — CTA buttons after plan selection
- `Jobs.tsx` — "Register Agent" button
- `ForAgents.tsx` — "Use the wizard instead" button
- `A2AMarketplace.tsx` — "Register an agent first" link
- `IssuanceFilmV2.tsx` — CTA link in landing page

---

## Changes Made

### `artifacts/agent-id/src/App.tsx`
- Removed `import { Start }` (no longer needed directly)
- Changed `DashboardRoute`: zero-agent users now redirect to `/get-started` (was `/start`)
- Changed `/start` route: now a `<Navigate to="/get-started" replace />` redirect instead of rendering `<Start />`

### `artifacts/agent-id/src/pages/Start.tsx` — **DELETED**
- The 791-line fake-verification wizard (GitHub/Wallet/Manual Key Signing) has been fully removed.
- The `/start` route in `App.tsx` redirects to `/get-started` so no user-visible path is broken.

### `artifacts/agent-id/src/pages/OnboardingPlan.tsx`
- `handleSelect()` now navigates to `/get-started` (was `/start`)

### `artifacts/agent-id/src/pages/GetStarted.tsx`
1. **Polling fix (startClaimPolling)**: Now takes a `preExistingIds: Set<string>` parameter (was `preExistingCount: number`). The poll resolves as successful only when `result.agents.some(a => !preExistingIds.has(a.id))` is true — i.e., a genuinely new agent ID has appeared that wasn't in the baseline snapshot. This prevents false-positive success if any pre-existing agents are already in the account.
2. **handleLoadOwnerToken fix**: Now fetches the current agent list in parallel with token generation. If the baseline agent-list fetch fails, polling does not start until a retry succeeds (preventing polling from starting with an empty baseline that would immediately false-positive). The baseline ID set is always populated from a verified successful fetch before polling begins.
3. **Handle-less copy fix**: The `token-display` step description now conditionally shows `(handle.agentid)` only when a handle was specified.
4. **Claim-existing code snippets fix**: All three tabs (Chat Prompt, SDK, API/cURL) now show `ownerToken` in the JSON body instead of an `Authorization: Bearer` header. The cURL snippet now shows the two-step registration + verification flow.
5. **Copy updates**:
   - "Register a new agent" card: "Create a draft identity for your agent. It connects during setup and self-activates."
   - "Link an existing agent" card: More accurate description of the owner-token self-registration flow.
   - Token-display page description: "it will connect to this identity during setup and self-activate."
   - Claim-existing heading: More accurate description of the link flow.

### `artifacts/agent-id/src/__tests__/onboarding.test.ts` — **NEW**
16 tests added covering:
- `Start.tsx` has been deleted (file-system assertion)
- `GetStarted.tsx` has no GitHub/wallet/manual-signing content or `verify.initiate`/`verify.complete` calls
- Claim polling uses Set-based ID correlation (not count-only) — validated by unit tests of the delta-detection logic
- Handle-less success UI does not produce `.agentid` or `https://.getagent.id` output
- `/start` route redirects to `/get-started` (not a standalone wizard)
- `ownerToken` appears in JSON body, not Authorization header

### Other files (navigation cleanup)
- `Dashboard.tsx`, `Pricing.tsx`, `Jobs.tsx`, `ForAgents.tsx`, `A2AMarketplace.tsx`, `IssuanceFilmV2.tsx`: All internal `/start` links updated to `/get-started`.

---

## Files Changed
- `artifacts/agent-id/src/App.tsx`
- `artifacts/agent-id/src/pages/Start.tsx` — **DELETED**
- `artifacts/agent-id/src/pages/OnboardingPlan.tsx`
- `artifacts/agent-id/src/pages/GetStarted.tsx`
- `artifacts/agent-id/src/pages/Dashboard.tsx`
- `artifacts/agent-id/src/pages/Pricing.tsx`
- `artifacts/agent-id/src/pages/Jobs.tsx`
- `artifacts/agent-id/src/pages/ForAgents.tsx`
- `artifacts/agent-id/src/pages/A2AMarketplace.tsx`
- `artifacts/agent-id/src/components/IssuanceFilmV2.tsx`
- `artifacts/agent-id/src/__tests__/onboarding.test.ts` — **NEW**
- `artifacts/agent-id/vitest.config.ts` — **NEW**

## Files NOT Changed (out of scope)
- `artifacts/api-server/src/routes/v1/agent-verification.ts` — Backend unchanged (out of scope).
- `artifacts/api-server/src/routes/v1/bootstrap.ts` — Backend unchanged (out of scope).
- `artifacts/api-server/src/routes/v1/programmatic.ts` — Backend unchanged (out of scope).

---

## Tests Run

### Frontend Unit Tests
- `cd artifacts/agent-id && npx vitest run --config vitest.config.ts` — **PASSED** (16/16 tests)

### Frontend TypeScript
- `cd artifacts/agent-id && npx tsc --noEmit` — **PASSED** (0 errors)

### Backend Integration Tests
- `verification-flow.integration.test.ts` — **ALL PASSED** (8/8)
- `programmatic-registration.integration.test.ts` — **ALL PASSED** (10/10)
- `bootstrap-flow.integration.test.ts` — Pre-existing failure (DB constraint: test inserts claim token without required `expires_at`). Not related to this PR.
- `agent-lifecycle.integration.test.ts` — Core lifecycle tests pass; admin revocation tests fail due to pre-existing `X-Admin-Key` setup issue. Not related to this PR.

---

## Residual Risks & Follow-ups

1. **Polling precision limit**: The ID-set approach detects any new agent appearing since the baseline snapshot. In the highly unlikely event two separate owner-token registrations complete simultaneously in the same user session, only the first new agent ID would be surfaced. A more precise fix would require the backend to return the agent ID at registration time so the frontend could poll for a specific agent ID. This is acceptable for current usage volume.

2. **`bootstrap-flow` test fix**: The test `beforeAll` inserts a claim token without providing an `expires_at`, violating a DB constraint. This should be fixed in the test factory (out of scope for this PR).

3. **`api.ts` verify methods**: The `api.agents.verify.initiate` and `api.agents.verify.complete` functions remain in `api.ts`. They are no longer called from any onboarding flow, but they remain available for potential future use. Consider removing or marking them internal-only if they should not be surfaced.
